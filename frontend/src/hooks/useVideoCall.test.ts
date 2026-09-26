/**
 * Tests for the WebRTC consultation hook.
 *
 * This is the riskiest code in the frontend: none of it can be checked by reading, most
 * of its failure modes are silent (a call that connects and shows a black frame), and
 * jsdom has no WebRTC at all. So RTCPeerConnection, WebSocket and getUserMedia are
 * replaced with doubles that record what the hook did to them.
 *
 * The four properties worth this much setup:
 *
 *   1. Only the peer the SERVER nominates receives an offer. If both sides offer at once
 *      both connections stall in `have-local-offer` and the call silently never connects.
 *   2. ICE candidates arriving before the remote description are queued, not dropped.
 *      Dropping them produces calls that work on a LAN and fail across NAT.
 *   3. The screening token reaches state only for the patient it was minted for, and is
 *      cleared when the clinician withdraws it.
 *   4. Unmounting stops the camera. Leaving it running keeps the camera light on after
 *      the user navigates away, which patients reasonably find alarming.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoCall } from './useVideoCall';

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

class FakeTrack {
  enabled = true;
  kind: string;
  readonly stopped: boolean[] = [];
  onended: (() => void) | null = null;

  constructor(kind: string) {
    this.kind = kind;
  }

  stop() {
    this.stopped.push(true);
  }
}

class FakeStream {
  tracks: FakeTrack[];

  constructor(kinds: string[] = ['video', 'audio']) {
    this.tracks = kinds.map((kind) => new FakeTrack(kind));
  }

  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
}

class FakeSender {
  track: FakeTrack | null;
  replaced: (FakeTrack | null)[] = [];

  constructor(track: FakeTrack | null) {
    this.track = track;
  }

  async replaceTrack(track: FakeTrack | null) {
    this.replaced.push(track);
    this.track = track;
  }
}

/** Records every SDP and candidate operation so the test can assert on ordering. */
class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  connectionState = 'new';
  remoteDescription: unknown = null;
  localDescription: unknown = null;
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  ontrack: ((event: { streams: unknown[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  readonly added: unknown[] = [];
  readonly candidates: unknown[] = [];
  readonly createdOffers: number[] = [];
  readonly createdAnswers: number[] = [];
  closed = false;
  restarted = 0;
  private senders: FakeSender[] = [];

  constructor(public config: unknown) {
    FakePeerConnection.instances.push(this);
  }

  addTrack(track: FakeTrack) {
    this.added.push(track);
    this.senders.push(new FakeSender(track));
  }

  getSenders() {
    return this.senders;
  }

  async createOffer() {
    this.createdOffers.push(Date.now());
    return { type: 'offer', sdp: 'local-offer' };
  }

  async createAnswer() {
    this.createdAnswers.push(Date.now());
    return { type: 'answer', sdp: 'local-answer' };
  }

  async setLocalDescription(description: unknown) {
    this.localDescription = description;
  }

  async setRemoteDescription(description: unknown) {
    this.remoteDescription = description;
  }

  async addIceCandidate(candidate: unknown) {
    if (!this.remoteDescription) {
      // Mirrors the browser: adding a candidate with no remote description throws.
      throw new Error('no remote description');
    }
    this.candidates.push(candidate);
  }

  restartIce() {
    this.restarted += 1;
  }

  close() {
    this.closed = true;
  }
}

/** A WebSocket the test can drive from the server side. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;

  readyState = 1;
  url: string;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }

  /** Deliver a server message to the hook. */
  deliver(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  /** Messages of one type that the hook sent. */
  sentOfType(type: string) {
    return this.sent.filter((m) => m.type === type);
  }
}

const JOIN_RESULT = {
  session: {
    id: 'sess_1',
    bookingId: 'bk_1',
    roomName: 'neura-abc',
    status: 'WAITING',
    scheduledAt: null,
    startedAt: null,
    endedAt: null,
    screening: {
      enabled: false,
      type: null,
      enabledAt: null,
      expiresAt: null,
      consumedAt: null,
    },
    patient: { id: 'patient_1', name: 'Sam' },
    clinician: { id: 'clin_1', name: 'Dr Reed' },
    booking: null,
    clinicalNotes: null,
    activeParticipants: [],
    createdAt: null,
  },
  iceServers: [{ urls: ['stun:example:3478'] }],
  role: 'PATIENT',
  permissions: {
    canStartScreening: false,
    canEndSession: false,
    canWriteClinicalNotes: false,
    canInviteParticipants: false,
    canShareScreen: true,
    canChat: true,
    canPerformScreening: true,
  },
};

const joinSession = vi.fn();

vi.mock('../api/video', () => ({
  joinSession: (...args: unknown[]) => joinSession(...args),
  signallingUrl: (sessionId: string) => `ws://test/api/video/ws/${sessionId}?token=t`,
}));

let mediaStream: FakeStream;

beforeEach(() => {
  FakePeerConnection.instances = [];
  FakeWebSocket.instances = [];
  joinSession.mockReset();
  joinSession.mockResolvedValue(JSON.parse(JSON.stringify(JOIN_RESULT)));

  mediaStream = new FakeStream();

  (globalThis as any).RTCPeerConnection = FakePeerConnection;
  (globalThis as any).WebSocket = FakeWebSocket;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mediaStream),
      getDisplayMedia: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const socket = () => FakeWebSocket.instances[0];

/** Join, and wait until the signalling socket has been opened. */
async function joined(sessionId = 'sess_1') {
  const hook = renderHook(() => useVideoCall(sessionId));
  await act(async () => {
    await hook.result.current.join();
  });
  await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
  return hook;
}

const PEER = {
  connectionId: 'conn_clin',
  userId: 'clin_1',
  userName: 'Dr Reed',
  role: 'CLINICIAN' as const,
  isAudioMuted: false,
  isVideoMuted: false,
  joinedAt: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------

describe('joining a consultation', () => {
  it('asks for camera and microphone and opens the signalling socket', async () => {
    const { result } = await joined();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(result.current.localStream).not.toBeNull();
    expect(result.current.hasMediaPermission).toBe(true);
    expect(socket().url).toContain('/api/video/ws/sess_1');
    expect(result.current.role).toBe('PATIENT');
    expect(result.current.permissions?.canStartScreening).toBe(false);
  });

  it('joins without a camera rather than locking the user out', async () => {
    // An admin supervising does not need a camera, and a patient with a broken one
    // should still be able to hear their clinician.
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(
      new Error('NotAllowedError'),
    );

    const { result } = await joined();

    expect(result.current.hasMediaPermission).toBe(false);
    expect(result.current.error).toMatch(/camera or microphone/i);
    // Still connected.
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('joins anyway when the camera never responds', async () => {
    // Found by driving a real browser: getUserMedia does not always reject. It can hang
    // forever - a camera held by another app, a stalled driver, an unanswered prompt.
    // Awaiting it bare meant the signalling socket was never opened, so the consultation
    // never connected at all and the user saw "Camera off" with no explanation.
    vi.useFakeTimers();
    try {
      (navigator.mediaDevices.getUserMedia as any).mockReturnValue(
        new Promise(() => {}), // never settles
      );

      const hook = renderHook(() => useVideoCall('sess_1'));
      const joining = hook.result.current.join();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
        await joining;
      });

      expect(hook.result.current.hasMediaPermission).toBe(false);
      expect(hook.result.current.error).toMatch(/camera did not respond/i);
      // The call still connects - that is the whole point.
      expect(FakeWebSocket.instances.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports an error when the session cannot be joined', async () => {
    joinSession.mockRejectedValue(new Error('Consultation not found'));

    const hook = renderHook(() => useVideoCall('sess_1'));
    await act(async () => {
      await hook.result.current.join();
    });

    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.error).toBe('Consultation not found');
    expect(FakeWebSocket.instances.length).toBe(0);
  });

  it('does nothing without a session id', async () => {
    const hook = renderHook(() => useVideoCall(null));
    await act(async () => {
      await hook.result.current.join();
    });
    expect(joinSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The mesh
// ---------------------------------------------------------------------------

describe('peer negotiation', () => {
  it('offers only to the peers the server nominates', async () => {
    const { result } = await joined();

    await act(async () => {
      socket().deliver({
        type: 'room-state',
        connectionId: 'conn_me',
        self: { ...PEER, connectionId: 'conn_me', role: 'PATIENT' },
        peers: [PEER],
        shouldOffer: [PEER.connectionId],
        chat: [],
        at: 'now',
      });
    });

    await waitFor(() => expect(FakePeerConnection.instances.length).toBe(1));
    const offers = socket().sentOfType('offer');
    expect(offers).toHaveLength(1);
    expect(offers[0].to).toBe(PEER.connectionId);
    expect(result.current.participants).toHaveLength(1);
  });

  it('does NOT offer to a peer the server did not nominate', async () => {
    // The whole point of the server deciding: if both sides offer at once, both
    // connections stall and the call silently never connects.
    await joined();

    await act(async () => {
      socket().deliver({
        type: 'room-state',
        connectionId: 'conn_me',
        self: { ...PEER, connectionId: 'conn_me' },
        peers: [PEER],
        shouldOffer: [],
        chat: [],
        at: 'now',
      });
    });

    expect(socket().sentOfType('offer')).toHaveLength(0);
  });

  it('adds local tracks before creating the offer', async () => {
    await joined();

    await act(async () => {
      socket().deliver({
        type: 'room-state',
        connectionId: 'conn_me',
        self: { ...PEER, connectionId: 'conn_me' },
        peers: [PEER],
        shouldOffer: [PEER.connectionId],
        chat: [],
        at: 'now',
      });
    });

    await waitFor(() => expect(FakePeerConnection.instances.length).toBe(1));
    const connection = FakePeerConnection.instances[0];
    // Both tracks described in the very first SDP, so no renegotiation is needed.
    expect(connection.added).toHaveLength(2);
    expect(connection.createdOffers).toHaveLength(1);
    // And the ICE configuration came from the server.
    expect((connection.config as any).iceServers).toEqual(JOIN_RESULT.iceServers);
  });

  it('answers an incoming offer', async () => {
    await joined();

    await act(async () => {
      socket().deliver({
        type: 'offer',
        from: PEER.connectionId,
        fromUserId: PEER.userId,
        payload: { type: 'offer', sdp: 'remote-offer' },
        at: 'now',
      });
    });

    await waitFor(() => expect(socket().sentOfType('answer')).toHaveLength(1));
    const connection = FakePeerConnection.instances[0];
    expect(connection.remoteDescription).toEqual({ type: 'offer', sdp: 'remote-offer' });
    expect(connection.createdAnswers).toHaveLength(1);
    expect(socket().sentOfType('answer')[0].to).toBe(PEER.connectionId);
  });

  it('queues ICE candidates that arrive before the remote description', async () => {
    // Dropping early candidates is a classic cause of calls that connect on a LAN and
    // fail across NAT, because the host candidates arrive first and the relay ones are
    // exactly the ones that get lost.
    await joined();

    // Create the peer without giving it a remote description.
    await act(async () => {
      socket().deliver({
        type: 'room-state',
        connectionId: 'conn_me',
        self: { ...PEER, connectionId: 'conn_me' },
        peers: [PEER],
        shouldOffer: [PEER.connectionId],
        chat: [],
        at: 'now',
      });
    });
    await waitFor(() => expect(FakePeerConnection.instances.length).toBe(1));
    const connection = FakePeerConnection.instances[0];
    expect(connection.remoteDescription).toBeNull();

    await act(async () => {
      socket().deliver({
        type: 'ice-candidate',
        from: PEER.connectionId,
        fromUserId: PEER.userId,
        payload: { candidate: 'early-candidate' },
        at: 'now',
      });
    });

    // Not added yet - there was nowhere to put it.
    expect(connection.candidates).toHaveLength(0);

    // The answer arrives, and the queued candidate is flushed.
    await act(async () => {
      socket().deliver({
        type: 'answer',
        from: PEER.connectionId,
        fromUserId: PEER.userId,
        payload: { type: 'answer', sdp: 'remote-answer' },
        at: 'now',
      });
    });

    await waitFor(() => expect(connection.candidates).toHaveLength(1));
    expect(connection.candidates[0]).toEqual({ candidate: 'early-candidate' });
  });

  it('drops a peer that left and stops showing its tile', async () => {
    const { result } = await joined();

    await act(async () => {
      socket().deliver({
        type: 'room-state',
        connectionId: 'conn_me',
        self: { ...PEER, connectionId: 'conn_me' },
        peers: [PEER],
        shouldOffer: [PEER.connectionId],
        chat: [],
        at: 'now',
      });
    });
    await waitFor(() => expect(result.current.participants).toHaveLength(1));

    await act(async () => {
      socket().deliver({
        type: 'peer-left',
        connectionId: PEER.connectionId,
        userId: PEER.userId,
        at: 'now',
      });
    });

    expect(result.current.participants).toHaveLength(0);
    expect(FakePeerConnection.instances[0].closed).toBe(true);
  });

  it('drops a half-built connection when the target turns out to be gone', async () => {
    // Otherwise the UI shows a tile with a spinner that will never resolve.
    const { result } = await joined();

    await act(async () => {
      socket().deliver({
        type: 'room-state',
        connectionId: 'conn_me',
        self: { ...PEER, connectionId: 'conn_me' },
        peers: [PEER],
        shouldOffer: [PEER.connectionId],
        chat: [],
        at: 'now',
      });
    });
    await waitFor(() => expect(result.current.participants).toHaveLength(1));

    await act(async () => {
      socket().deliver({
        type: 'peer-unavailable',
        connectionId: PEER.connectionId,
        at: 'now',
      });
    });

    expect(result.current.participants).toHaveLength(0);
  });

  it('puts the clinician in the primary tile', async () => {
    // In a two-person call the patient should see their clinician without having to
    // work out which tile is which.
    const { result } = await joined();

    await act(async () => {
      socket().deliver({
        type: 'room-state',
        connectionId: 'conn_me',
        self: { ...PEER, connectionId: 'conn_me' },
        peers: [
          { ...PEER, connectionId: 'conn_observer', role: 'OBSERVER', userId: 'obs' },
          PEER,
        ],
        shouldOffer: [],
        chat: [],
        at: 'now',
      });
    });

    await waitFor(() => expect(result.current.participants).toHaveLength(2));
    expect(result.current.participants[0].role).toBe('CLINICIAN');
  });
});

// ---------------------------------------------------------------------------
// The screening authorisation
// ---------------------------------------------------------------------------

describe('the screening authorisation', () => {
  it('records the token pushed to the authorised patient', async () => {
    const { result } = await joined();

    await act(async () => {
      socket().deliver({
        type: 'screening-authorisation',
        enabled: true,
        screeningType: 'ROM',
        enabledBy: 'clin_1',
        at: 'now',
      });
      socket().deliver({
        type: 'screening-token',
        token: 'one-shot-token',
        screeningType: 'ROM',
        at: 'now',
      });
    });

    expect(result.current.screening.enabled).toBe(true);
    expect(result.current.screening.type).toBe('ROM');
    expect(result.current.screening.token).toBe('one-shot-token');
  });

  it('clears the token when the clinician withdraws the authorisation', async () => {
    // Without this the patient's browser keeps a usable token after permission was
    // withdrawn, which is the one thing the one-shot design exists to prevent.
    const { result } = await joined();

    await act(async () => {
      socket().deliver({
        type: 'screening-token',
        token: 'one-shot-token',
        screeningType: 'ROM',
        at: 'now',
      });
    });
    expect(result.current.screening.token).toBe('one-shot-token');

    await act(async () => {
      socket().deliver({
        type: 'screening-authorisation',
        enabled: false,
        screeningType: null,
        enabledBy: 'clin_1',
        at: 'now',
      });
    });

    expect(result.current.screening.enabled).toBe(false);
    expect(result.current.screening.token).toBeNull();
  });

  it('reports capture progress to the room', async () => {
    const { result } = await joined();

    act(() => {
      result.current.reportScreeningProgress('progress', { pose: 2, of: 4 });
    });

    const sent = socket().sentOfType('screening-progress');
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toEqual({ pose: 2, of: 4 });
  });
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

describe('controls', () => {
  it('muting disables the track and tells the room', async () => {
    const { result } = await joined();

    act(() => {
      result.current.toggleAudio();
    });

    expect(result.current.isAudioMuted).toBe(true);
    expect(mediaStream.getAudioTracks()[0].enabled).toBe(false);
    const sent = socket().sentOfType('media-state');
    expect(sent[0].payload).toEqual({ isAudioMuted: true, isVideoMuted: false });

    act(() => {
      result.current.toggleAudio();
    });
    expect(result.current.isAudioMuted).toBe(false);
    expect(mediaStream.getAudioTracks()[0].enabled).toBe(true);
  });

  it('stopping the camera disables the video track', async () => {
    const { result } = await joined();

    act(() => {
      result.current.toggleVideo();
    });

    expect(result.current.isVideoMuted).toBe(true);
    expect(mediaStream.getVideoTracks()[0].enabled).toBe(false);
  });

  it('records a remote peer going muted', async () => {
    const { result } = await joined();

    await act(async () => {
      socket().deliver({
        type: 'room-state',
        connectionId: 'conn_me',
        self: { ...PEER, connectionId: 'conn_me' },
        peers: [PEER],
        shouldOffer: [],
        chat: [],
        at: 'now',
      });
      socket().deliver({
        type: 'peer-media-state',
        connectionId: PEER.connectionId,
        isAudioMuted: true,
        isVideoMuted: false,
        at: 'now',
      });
    });

    await waitFor(() =>
      expect(result.current.participants[0].isAudioMuted).toBe(true),
    );
  });

  it('screen sharing replaces the outgoing video track rather than adding one', async () => {
    // replaceTrack swaps the source on a live connection with no renegotiation, which
    // is why sharing does not interrupt the call.
    const screenTrack = new FakeTrack('video');
    const screenStream = { getVideoTracks: () => [screenTrack], getTracks: () => [screenTrack] };
    (navigator.mediaDevices as any).getDisplayMedia = vi
      .fn()
      .mockResolvedValue(screenStream);

    const { result } = await joined();
    await act(async () => {
      socket().deliver({
        type: 'room-state',
        connectionId: 'conn_me',
        self: { ...PEER, connectionId: 'conn_me' },
        peers: [PEER],
        shouldOffer: [PEER.connectionId],
        chat: [],
        at: 'now',
      });
    });
    await waitFor(() => expect(FakePeerConnection.instances.length).toBe(1));

    await act(async () => {
      await result.current.startScreenShare();
    });

    expect(result.current.isSharingScreen).toBe(true);
    const sender = FakePeerConnection.instances[0].getSenders()[0];
    expect(sender.replaced).toContain(screenTrack);
    expect(socket().sentOfType('screen-share')[0].payload.isSharing).toBe(true);

    // Stopping puts the camera back.
    await act(async () => {
      await result.current.stopScreenShare();
    });
    expect(result.current.isSharingScreen).toBe(false);
    expect(sender.replaced[sender.replaced.length - 1]).toBe(
      mediaStream.getVideoTracks()[0],
    );
  });

  it('a dismissed screen-share picker is not an error', async () => {
    (navigator.mediaDevices as any).getDisplayMedia = vi
      .fn()
      .mockRejectedValue(new Error('NotAllowedError'));

    const { result } = await joined();
    await act(async () => {
      await result.current.startScreenShare();
    });

    expect(result.current.isSharingScreen).toBe(false);
    // The user simply changed their mind; nothing to report.
    expect(result.current.error).toBeNull();
  });

  it('sends chat and ignores an empty message', async () => {
    const { result } = await joined();

    act(() => {
      result.current.sendChat('  hello  ');
      result.current.sendChat('   ');
    });

    const sent = socket().sentOfType('chat');
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.text).toBe('hello');
  });

  it('appends chat the server echoes back', async () => {
    const { result } = await joined();

    await act(async () => {
      socket().deliver({
        type: 'chat',
        connectionId: PEER.connectionId,
        userId: PEER.userId,
        userName: PEER.userName,
        role: 'CLINICIAN',
        text: 'can you step back a little',
        at: 'now',
      });
    });

    expect(result.current.chat).toHaveLength(1);
    expect(result.current.chat[0].text).toBe('can you step back a little');
  });
});

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

describe('leaving and teardown', () => {
  it('leaving stops every track and closes the socket', async () => {
    const { result } = await joined();

    act(() => {
      result.current.leave();
    });

    expect(result.current.status).toBe('ended');
    expect(socket().closed).toBe(true);
    for (const track of mediaStream.getTracks()) {
      expect(track.stopped.length).toBeGreaterThan(0);
    }
  });

  it('unmounting stops the camera', async () => {
    // Otherwise the camera light stays on after the user navigates away, which patients
    // reasonably find alarming.
    const hook = await joined();

    hook.unmount();

    for (const track of mediaStream.getTracks()) {
      expect(track.stopped.length).toBeGreaterThan(0);
    }
    expect(socket().closed).toBe(true);
  });

  it('a server-ended session closes the call down', async () => {
    const { result } = await joined();

    await act(async () => {
      socket().deliver({ type: 'session-ended', endedBy: 'clin_1', at: 'now' });
    });

    expect(result.current.status).toBe('ended');
    expect(socket().closed).toBe(true);
  });

  it('does not reconnect after a deliberate leave', async () => {
    const { result } = await joined();

    act(() => {
      result.current.leave();
    });

    // leave() closes the socket, which fires onclose. If that were treated as a dropped
    // connection the hook would immediately dial back into a call the user hung up.
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(result.current.status).toBe('ended');
  });

  it('reconnects when the connection drops on its own', async () => {
    vi.useFakeTimers();
    try {
      const hook = renderHook(() => useVideoCall('sess_1'));
      await act(async () => {
        await hook.result.current.join();
      });
      expect(FakeWebSocket.instances).toHaveLength(1);

      // A lost network, not a hang-up.
      await act(async () => {
        FakeWebSocket.instances[0].onclose?.();
      });
      expect(hook.result.current.status).toBe('reconnecting');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(FakeWebSocket.instances.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a server error message', async () => {
    const { result } = await joined();

    await act(async () => {
      socket().deliver({
        type: 'error',
        code: 'forbidden',
        message: 'Only a clinician or administrator can do that.',
        at: 'now',
      });
    });

    expect(result.current.error).toMatch(/clinician or administrator/);
  });
});
