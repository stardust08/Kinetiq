/**
 * A WebRTC consultation, as one hook.
 *
 * Full mesh: every participant holds one RTCPeerConnection per other participant. A
 * consultation is two or three people, where mesh is the simplest thing that works and
 * needs no media server. It does not survive a dozen participants and is not meant to.
 *
 * Three things here are easy to get wrong and expensive to debug, so each is handled
 * explicitly rather than left to chance:
 *
 *   1. **Offer glare.** If both peers offer at once, both connections stall in
 *      `have-local-offer` and the call silently never connects. The server decides who
 *      offers - the joining peer offers to everybody already present - and this hook
 *      only ever offers to connection ids listed in `shouldOffer`.
 *
 *   2. **Candidates arriving before the answer.** ICE candidates routinely arrive before
 *      the remote description is set, and `addIceCandidate` throws if it has no remote
 *      description to attach them to. They are queued per peer and flushed once the
 *      description lands.
 *
 *   3. **Tracks added after the connection is up.** Screen sharing replaces the outgoing
 *      video track rather than adding a second one, so no renegotiation is needed -
 *      `RTCRtpSender.replaceTrack` swaps the source underneath a live connection.
 *
 * Nothing here records the call. There is no MediaRecorder, no upload, and no server in
 * the media path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalysisType,
  ChatMessage,
  ConsultationPermissions,
  ParticipantRole,
  RemotePeer,
  SignalMessage,
  VideoSession,
} from '../types/consultation';
import { joinSession, signallingUrl } from '../api/video';

export interface RemoteParticipant extends RemotePeer {
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  isSharingScreen: boolean;
}

export type CallStatus =
  | 'idle'
  | 'joining'
  | 'waiting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'error';

export interface ScreeningState {
  enabled: boolean;
  type: AnalysisType | null;
  /** Present only in the authorised patient's browser. */
  token: string | null;
  enabledBy: string | null;
}

export interface UseVideoCallResult {
  status: CallStatus;
  error: string | null;
  session: VideoSession | null;
  role: ParticipantRole | null;
  permissions: ConsultationPermissions | null;
  localStream: MediaStream | null;
  participants: RemoteParticipant[];
  chat: ChatMessage[];
  screening: ScreeningState;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isSharingScreen: boolean;
  hasMediaPermission: boolean;
  join: () => Promise<void>;
  leave: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  sendChat: (text: string) => void;
  reportScreeningProgress: (
    stage: 'started' | 'progress' | 'finished',
    payload?: Record<string, unknown>,
  ) => void;
}

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * How long to wait for the camera before joining without it.
 *
 * getUserMedia does not reliably reject - see the call site. Ten seconds is long enough
 * for a real permission prompt to be answered and short enough that a stalled device
 * does not hold the whole consultation hostage.
 */
const MEDIA_REQUEST_TIMEOUT_MS = 10_000;

export function useVideoCall(sessionId: string | null): UseVideoCallResult {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<VideoSession | null>(null);
  const [role, setRole] = useState<ParticipantRole | null>(null);
  const [permissions, setPermissions] = useState<ConsultationPermissions | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participants, setParticipants] = useState<RemoteParticipant[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [screening, setScreening] = useState<ScreeningState>({
    enabled: false,
    type: null,
    token: null,
    enabledBy: null,
  });
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [hasMediaPermission, setHasMediaPermission] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // ICE candidates that arrived before their peer had a remote description.
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const selfConnectionIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  // Set when the user leaves deliberately, so the socket's close handler does not try
  // to reconnect a call that was hung up on purpose.
  const intentionalCloseRef = useRef(false);

  // -----------------------------------------------------------------------
  // Signalling
  // -----------------------------------------------------------------------

  const send = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  const updateParticipant = useCallback(
    (connectionId: string, patch: Partial<RemoteParticipant>) => {
      setParticipants((current) =>
        current.map((p) => (p.connectionId === connectionId ? { ...p, ...patch } : p)),
      );
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Peer connections
  // -----------------------------------------------------------------------

  const createPeer = useCallback(
    (peer: RemotePeer): RTCPeerConnection => {
      const existing = peersRef.current.get(peer.connectionId);
      if (existing) return existing;

      const connection = new RTCPeerConnection({
        iceServers: iceServersRef.current,
      });

      // Our own tracks, added before any offer or answer is created so they are
      // described in the very first SDP. Adding them afterwards would need a
      // renegotiation round-trip for no reason.
      localStreamRef.current?.getTracks().forEach((track) => {
        connection.addTrack(track, localStreamRef.current as MediaStream);
      });

      connection.onicecandidate = (event) => {
        if (event.candidate) {
          send({
            type: 'ice-candidate',
            to: peer.connectionId,
            payload: event.candidate.toJSON(),
          });
        }
      };

      connection.ontrack = (event) => {
        // `event.streams[0]` is the remote stream; it arrives before the connection
        // reports 'connected', which is what lets the tile render as soon as the first
        // frame is available rather than after the handshake completes.
        const [stream] = event.streams;
        updateParticipant(peer.connectionId, { stream: stream ?? null });
      };

      connection.onconnectionstatechange = () => {
        updateParticipant(peer.connectionId, {
          connectionState: connection.connectionState,
        });
        if (connection.connectionState === 'failed') {
          // ICE found no path. Restarting ICE is the documented recovery and is far
          // cheaper than tearing the peer down and renegotiating from scratch.
          try {
            connection.restartIce();
          } catch {
            /* older browsers: nothing to do but wait for the peer to reconnect */
          }
        }
      };

      peersRef.current.set(peer.connectionId, connection);
      return connection;
    },
    [send, updateParticipant],
  );

  const flushPendingCandidates = useCallback(async (connectionId: string) => {
    const connection = peersRef.current.get(connectionId);
    const queued = pendingCandidatesRef.current.get(connectionId);
    if (!connection || !queued?.length) return;
    for (const candidate of queued) {
      try {
        await connection.addIceCandidate(candidate);
      } catch {
        // A candidate that cannot be added is one path out of many; the connection
        // still has the others. Failing the call over it would be wrong.
      }
    }
    pendingCandidatesRef.current.delete(connectionId);
  }, []);

  const offerTo = useCallback(
    async (peer: RemotePeer) => {
      const connection = createPeer(peer);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      send({ type: 'offer', to: peer.connectionId, payload: offer });
    },
    [createPeer, send],
  );

  const closePeer = useCallback((connectionId: string) => {
    const connection = peersRef.current.get(connectionId);
    if (connection) {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.onconnectionstatechange = null;
      connection.close();
      peersRef.current.delete(connectionId);
    }
    pendingCandidatesRef.current.delete(connectionId);
    setParticipants((current) => current.filter((p) => p.connectionId !== connectionId));
  }, []);

  const closeAllPeers = useCallback(() => {
    Array.from(peersRef.current.keys()).forEach(closePeer);
  }, [closePeer]);

  // -----------------------------------------------------------------------
  // Message handling
  // -----------------------------------------------------------------------

  const handleMessage = useCallback(
    async (message: SignalMessage) => {
      switch (message.type) {
        case 'room-state': {
          selfConnectionIdRef.current = message.connectionId;
          setChat(message.chat ?? []);
          setParticipants(
            message.peers.map((peer) => ({
              ...peer,
              stream: null,
              connectionState: 'new' as RTCPeerConnectionState,
              isSharingScreen: false,
            })),
          );
          setStatus(message.peers.length ? 'connected' : 'waiting');
          // We are the newcomer, so we offer. The server names who - fixing the
          // offerer by arrival order is what prevents glare.
          for (const peer of message.peers) {
            if (message.shouldOffer.includes(peer.connectionId)) {
              await offerTo(peer);
            }
          }
          break;
        }

        case 'peer-joined': {
          setParticipants((current) =>
            current.some((p) => p.connectionId === message.peer.connectionId)
              ? current
              : [
                  ...current,
                  {
                    ...message.peer,
                    stream: null,
                    connectionState: 'new' as RTCPeerConnectionState,
                    isSharingScreen: false,
                  },
                ],
          );
          // They offer to us, so there is nothing to do but be ready.
          setStatus('connected');
          break;
        }

        case 'peer-left': {
          closePeer(message.connectionId);
          setStatus((current) => (current === 'ended' ? current : 'waiting'));
          break;
        }

        case 'peer-unavailable': {
          // The peer left between our offer being made and arriving. Dropping the
          // half-built connection stops the UI showing a tile that will never fill.
          closePeer(message.connectionId);
          break;
        }

        case 'offer': {
          const from = message.from;
          const known =
            participants.find((p) => p.connectionId === from) ??
            ({
              connectionId: from,
              userId: message.fromUserId,
              userName: 'Participant',
              role: 'PATIENT' as ParticipantRole,
              isAudioMuted: false,
              isVideoMuted: false,
              joinedAt: message.at,
            } as RemotePeer);

          const connection = createPeer(known);
          await connection.setRemoteDescription(message.payload);
          await flushPendingCandidates(from);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          send({ type: 'answer', to: from, payload: answer });
          break;
        }

        case 'answer': {
          const connection = peersRef.current.get(message.from);
          if (connection) {
            await connection.setRemoteDescription(message.payload);
            await flushPendingCandidates(message.from);
          }
          break;
        }

        case 'ice-candidate': {
          const connection = peersRef.current.get(message.from);
          if (connection?.remoteDescription) {
            try {
              await connection.addIceCandidate(message.payload);
            } catch {
              /* one path of several; see flushPendingCandidates */
            }
          } else {
            // Arrived before the description. Queue rather than drop: dropping early
            // candidates is a classic cause of calls that connect only on a LAN.
            const queue = pendingCandidatesRef.current.get(message.from) ?? [];
            queue.push(message.payload);
            pendingCandidatesRef.current.set(message.from, queue);
          }
          break;
        }

        case 'peer-media-state': {
          updateParticipant(message.connectionId, {
            isAudioMuted: message.isAudioMuted,
            isVideoMuted: message.isVideoMuted,
          });
          break;
        }

        case 'peer-screen-share': {
          updateParticipant(message.connectionId, {
            isSharingScreen: message.isSharing,
          });
          break;
        }

        case 'chat': {
          setChat((current) => [...current, message]);
          break;
        }

        case 'screening-authorisation': {
          setScreening((current) => ({
            enabled: message.enabled,
            type: message.screeningType,
            // A revocation must clear the token, or the patient's browser would keep a
            // usable one after the clinician withdrew permission.
            token: message.enabled ? current.token : null,
            enabledBy: message.enabledBy,
          }));
          setSession((current) =>
            current
              ? {
                  ...current,
                  screening: {
                    ...current.screening,
                    enabled: message.enabled,
                    type: message.screeningType,
                  },
                }
              : current,
          );
          break;
        }

        case 'screening-token': {
          // Sent only to the patient the authorisation was minted for.
          setScreening((current) => ({
            ...current,
            enabled: true,
            type: message.screeningType,
            token: message.token,
          }));
          break;
        }

        case 'session-ended': {
          intentionalCloseRef.current = true;
          setStatus('ended');
          closeAllPeers();
          socketRef.current?.close();
          break;
        }

        case 'error': {
          setError(message.message);
          break;
        }

        default:
          break;
      }
    },
    [
      closeAllPeers,
      closePeer,
      createPeer,
      flushPendingCandidates,
      offerTo,
      participants,
      send,
      updateParticipant,
    ],
  );

  // A ref so the socket's `onmessage`, bound once, always calls the current handler.
  // Without it the closure captures the first render's `participants` and an offer from
  // a peer who joined later is answered with stale state.
  const handleMessageRef = useRef(handleMessage);
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  // -----------------------------------------------------------------------
  // Socket lifecycle
  // -----------------------------------------------------------------------

  const openSocket = useCallback(
    (id: string) => {
      const socket = new WebSocket(signallingUrl(id));
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setError(null);
      };

      socket.onmessage = (event) => {
        try {
          void handleMessageRef.current(JSON.parse(event.data) as SignalMessage);
        } catch {
          /* a frame we cannot parse is not worth failing the call over */
        }
      };

      socket.onclose = () => {
        if (intentionalCloseRef.current) return;

        // The connection dropped on its own - a lost network, a laptop lid. Retry with
        // a backoff rather than ending the consultation: a patient on a train should
        // rejoin, not be told the appointment is over.
        const attempt = reconnectAttemptRef.current;
        if (attempt >= RECONNECT_DELAYS_MS.length) {
          setStatus('error');
          setError(
            'Lost connection to the consultation. Check your network and rejoin.',
          );
          return;
        }
        setStatus('reconnecting');
        reconnectAttemptRef.current = attempt + 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          closeAllPeers();
          openSocket(id);
        }, RECONNECT_DELAYS_MS[attempt]);
      };

      socket.onerror = () => {
        // `onclose` always follows, and handles recovery. Setting an error here as well
        // would overwrite a more specific message with a generic one.
      };
    },
    [closeAllPeers],
  );

  // -----------------------------------------------------------------------
  // Join and leave
  // -----------------------------------------------------------------------

  const join = useCallback(async () => {
    if (!sessionId) return;
    setStatus('joining');
    setError(null);
    intentionalCloseRef.current = false;

    try {
      const result = await joinSession(sessionId);
      setSession(result.session);
      setRole(result.role);
      setPermissions(result.permissions);
      setScreening({
        enabled: result.session.screening.enabled,
        type: result.session.screening.type,
        token: null,
        enabledBy: null,
      });
      iceServersRef.current = result.iceServers;

      try {
        // Raced against a timeout, because getUserMedia can HANG rather than reject.
        //
        // It does not always settle: a camera held by another application, a stalled
        // driver, or a permission prompt nobody answers all leave the promise pending
        // indefinitely. Awaiting it bare means the signalling socket below is never
        // opened, so the consultation never connects at all - and the patient sees
        // "Camera off" with no message and no way forward, which reads as the product
        // being broken rather than as a camera problem.
        const stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true },
          }),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error('media-timeout')),
              MEDIA_REQUEST_TIMEOUT_MS,
            ),
          ),
        ]);
        localStreamRef.current = stream;
        setLocalStream(stream);
        setHasMediaPermission(true);
      } catch (mediaError) {
        // Joining without a camera is allowed and useful: an admin supervising a
        // consultation does not need one, and a patient with a broken camera should
        // still be able to hear their clinician rather than being locked out. The call
        // continues either way - only the local tile is missing.
        setHasMediaPermission(false);
        const timedOut =
          mediaError instanceof Error && mediaError.message === 'media-timeout';
        setError(
          timedOut
            ? 'Your camera did not respond. It may be in use by another app. You have ' +
              'joined without it - close any other app using the camera and rejoin to ' +
              'turn it on.'
            : 'Could not reach your camera or microphone. You can still see and hear others.',
        );
      }

      openSocket(sessionId);
    } catch (err) {
      setStatus('error');
      setError(
        err instanceof Error ? err.message : 'Could not join the consultation.',
      );
    }
  }, [openSocket, sessionId]);

  const leave = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    send({ type: 'leave' });
    closeAllPeers();
    socketRef.current?.close();
    socketRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setParticipants([]);
    setStatus('ended');
  }, [closeAllPeers, send]);

  // Stop the camera when the component goes away. Without this the camera light stays
  // on after the user navigates off the page, which patients reasonably find alarming.
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      peersRef.current.forEach((connection) => connection.close());
      peersRef.current.clear();
      socketRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // -----------------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------------

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !isAudioMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setIsAudioMuted(next);
    // Broadcast so the other side's tile shows a muted badge rather than leaving them
    // talking to somebody who cannot hear them.
    send({
      type: 'media-state',
      payload: { isAudioMuted: next, isVideoMuted },
    });
  }, [isAudioMuted, isVideoMuted, send]);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !isVideoMuted;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    setIsVideoMuted(next);
    send({
      type: 'media-state',
      payload: { isAudioMuted, isVideoMuted: next },
    });
  }, [isAudioMuted, isVideoMuted, send]);

  const replaceOutgoingVideo = useCallback(async (track: MediaStreamTrack | null) => {
    // `replaceTrack` swaps the source on a live connection with no renegotiation, which
    // is why screen sharing does not interrupt the call.
    const senders: Array<Promise<void>> = [];
    peersRef.current.forEach((connection) => {
      const sender = connection
        .getSenders()
        .find((candidate) => candidate.track?.kind === 'video');
      if (sender) senders.push(sender.replaceTrack(track));
    });
    await Promise.all(senders);
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      const [track] = stream.getVideoTracks();
      await replaceOutgoingVideo(track);
      setIsSharingScreen(true);
      send({ type: 'screen-share', payload: { isSharing: true } });

      // The browser's own "stop sharing" bar bypasses our button entirely, so the end
      // of the track is the only reliable signal that sharing has finished.
      track.onended = () => {
        void stopScreenShare();
      };
    } catch {
      // The user dismissed the picker. Not an error worth surfacing.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaceOutgoingVideo, send]);

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    await replaceOutgoingVideo(cameraTrack);
    setIsSharingScreen(false);
    send({ type: 'screen-share', payload: { isSharing: false } });
  }, [replaceOutgoingVideo, send]);

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      send({ type: 'chat', payload: { text: trimmed } });
    },
    [send],
  );

  const reportScreeningProgress = useCallback(
    (stage: 'started' | 'progress' | 'finished', payload?: Record<string, unknown>) => {
      // The patient's browser is the only thing that knows how far the capture has got,
      // so it reports and the clinician's view follows. None of this is stored as a
      // clinical fact - the analysis itself is the record.
      send({ type: `screening-${stage}`, payload: payload ?? {} });
    },
    [send],
  );

  const orderedParticipants = useMemo(
    () =>
      [...participants].sort((a, b) => {
        // The clinician goes first: in a two-person call the patient should see their
        // clinician in the main tile without having to work out which is which.
        const weight = (role: ParticipantRole) =>
          role === 'CLINICIAN' ? 0 : role === 'ADMIN' ? 1 : 2;
        return weight(a.role) - weight(b.role);
      }),
    [participants],
  );

  return {
    status,
    error,
    session,
    role,
    permissions,
    localStream,
    participants: orderedParticipants,
    chat,
    screening,
    isAudioMuted,
    isVideoMuted,
    isSharingScreen,
    hasMediaPermission,
    join,
    leave,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    sendChat,
    reportScreeningProgress,
  };
}
