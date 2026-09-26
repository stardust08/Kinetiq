import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisType } from '../../types/consultation';
import type { UseVideoCallResult } from '../../hooks/useVideoCall';
import CallChat from './CallChat';
import CallControls from './CallControls';
import ScreeningLauncher from './ScreeningLauncher';
import VideoTile from './VideoTile';
import WaitingRoom from './WaitingRoom';

export interface VideoCallRoomProps {
  call: UseVideoCallResult;
  onEnableScreening: (type: AnalysisType) => Promise<void>;
  onRevokeScreening: () => Promise<void>;
  onEndForAll: () => Promise<void>;
  onLeave: () => void;
  /**
   * Called when the patient's browser has an authorisation and should begin a capture.
   * The consultation page navigates to the capture route, carrying the one-shot token.
   */
  onBeginScreening?: (type: AnalysisType, token: string) => void;
  busy?: boolean;
}

/**
 * The consultation room.
 *
 * Layout follows who is talking rather than who joined first: the remote participant
 * gets the large tile and the local preview sits beside it, because in a two-person
 * consultation nobody needs to watch themselves at full size.
 *
 * The screening panel is the part worth reading twice. Staff see controls to unlock a
 * capture; the patient sees a prompt to begin only once staff have unlocked one and
 * their browser holds the token. Neither side can reach the capture any other way.
 */
export function VideoCallRoom({
  call,
  onEnableScreening,
  onRevokeScreening,
  onEndForAll,
  onLeave,
  onBeginScreening,
  busy = false,
}: VideoCallRoomProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [readChatCount, setReadChatCount] = useState(0);
  const selfConnectionIdRef = useRef<string | null>(null);

  const {
    status,
    error,
    session,
    role,
    permissions,
    localStream,
    participants,
    chat,
    screening,
    isAudioMuted,
    isVideoMuted,
    isSharingScreen,
    hasMediaPermission,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    sendChat,
  } = call;

  const isPatient = role === 'PATIENT';
  const isStaff = role === 'CLINICIAN' || role === 'ADMIN';
  const patientPresent = useMemo(
    () => participants.some((p) => p.role === 'PATIENT'),
    [participants],
  );

  // Unread counting. Resetting on open rather than tracking per-message read state is
  // enough here: the badge exists to say "something arrived while you were not looking".
  useEffect(() => {
    if (isChatOpen) setReadChatCount(chat.length);
  }, [isChatOpen, chat.length]);
  const unreadChatCount = Math.max(chat.length - readChatCount, 0);

  const primary = participants[0] ?? null;
  const others = participants.slice(1);

  if (status === 'ended') {
    return (
      <div
        style={{
          display: 'grid',
          gap: 12,
          placeItems: 'center',
          padding: '64px 20px',
          textAlign: 'center',
          color: '#e2e8f0',
          background: '#020617',
          borderRadius: 14,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>The consultation has ended</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, margin: 0, maxWidth: 420 }}>
          {isPatient
            ? 'Your clinician will add any notes and your exercise programme will appear under "My plan" once they have reviewed it.'
            : 'Any screening taken in this consultation is saved against the booking.'}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        background: '#020617',
        borderRadius: 14,
        overflow: 'hidden',
        minHeight: 520,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {error && (
          <div
            style={{
              background: '#422006',
              borderBottom: '1px solid #b45309',
              color: '#fed7aa',
              fontSize: 13,
              padding: '10px 14px',
            }}
          >
            {error}
          </div>
        )}

        {status === 'reconnecting' && (
          <div
            style={{
              background: '#1e293b',
              color: '#cbd5e1',
              fontSize: 13,
              padding: '8px 14px',
              textAlign: 'center',
            }}
          >
            Reconnecting…
          </div>
        )}

        <div style={{ flex: 1, padding: 16, display: 'grid', gap: 14 }}>
          {participants.length === 0 ? (
            <>
              <WaitingRoom session={session} isPatient={isPatient} />
              {/* The local preview stays visible while waiting, so the patient can
                  check their framing and lighting before anybody sees them. */}
              <div style={{ maxWidth: 320, margin: '0 auto', width: '100%' }}>
                <VideoTile
                  stream={localStream}
                  label="You"
                  role="SELF"
                  isLocal
                  isMuted={isAudioMuted}
                  isVideoOff={isVideoMuted}
                  isSharingScreen={isSharingScreen}
                />
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {primary && (
                <VideoTile
                  stream={primary.stream}
                  label={primary.userName}
                  role={primary.role}
                  isMuted={primary.isAudioMuted}
                  isVideoOff={primary.isVideoMuted}
                  isSharingScreen={primary.isSharingScreen}
                  connectionState={primary.connectionState}
                  isPrimary
                />
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                <VideoTile
                  stream={localStream}
                  label="You"
                  role="SELF"
                  isLocal
                  isMuted={isAudioMuted}
                  isVideoOff={isVideoMuted}
                  isSharingScreen={isSharingScreen}
                />
                {others.map((participant) => (
                  <VideoTile
                    key={participant.connectionId}
                    stream={participant.stream}
                    label={participant.userName}
                    role={participant.role}
                    isMuted={participant.isAudioMuted}
                    isVideoOff={participant.isVideoMuted}
                    isSharingScreen={participant.isSharingScreen}
                    connectionState={participant.connectionState}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ---- Screening ------------------------------------------------ */}
          {isStaff && (
            <ScreeningLauncher
              session={session}
              canStart={permissions?.canStartScreening ?? false}
              isPatientPresent={patientPresent}
              busy={busy}
              onEnable={onEnableScreening}
              onRevoke={onRevokeScreening}
            />
          )}

          {isPatient && screening.enabled && screening.token && screening.type && (
            <section
              style={{
                background: '#052e2b',
                border: '1px solid #047857',
                borderRadius: 12,
                padding: 16,
                display: 'grid',
                gap: 10,
              }}
            >
              <div>
                <strong style={{ color: '#6ee7b7', fontSize: 14 }}>
                  Your clinician has started your screening
                </strong>
                <p style={{ color: '#a7f3d0', fontSize: 13, margin: '6px 0 0' }}>
                  Stay on the call while you do it - your clinician is watching and will
                  guide you. Follow the on-screen instructions.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onBeginScreening?.(screening.type as AnalysisType, screening.token as string)
                }
                style={{
                  justifySelf: 'start',
                  background: '#047857',
                  border: 'none',
                  borderRadius: 8,
                  color: '#ecfdf5',
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Begin{' '}
                {screening.type === 'ROM'
                  ? 'joint range'
                  : screening.type === 'GAIT'
                    ? 'walking'
                    : 'posture'}{' '}
                screening
              </button>
            </section>
          )}

          {isPatient && !screening.enabled && participants.length > 0 && (
            <p
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 10,
                color: '#94a3b8',
                fontSize: 13,
                margin: 0,
                padding: '10px 12px',
              }}
            >
              If a screening is needed, your clinician will start it from their side.
            </p>
          )}
        </div>

        <CallControls
          isAudioMuted={isAudioMuted}
          isVideoMuted={isVideoMuted}
          isSharingScreen={isSharingScreen}
          hasMediaPermission={hasMediaPermission}
          permissions={permissions}
          isChatOpen={isChatOpen}
          unreadChatCount={unreadChatCount}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={() =>
            isSharingScreen ? void stopScreenShare() : void startScreenShare()
          }
          onToggleChat={() => setIsChatOpen((open) => !open)}
          onLeave={onLeave}
          onEndForAll={() => void onEndForAll()}
        />
      </div>

      {isChatOpen && (
        <CallChat
          messages={chat}
          selfConnectionId={selfConnectionIdRef.current}
          onSend={sendChat}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  );
}

export default VideoCallRoom;
