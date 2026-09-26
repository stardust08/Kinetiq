import type { ConsultationPermissions } from '../../types/consultation';

export interface CallControlsProps {
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isSharingScreen: boolean;
  hasMediaPermission: boolean;
  permissions: ConsultationPermissions | null;
  isChatOpen: boolean;
  unreadChatCount: number;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
  /** Staff only: ends the consultation for everybody, not just this browser. */
  onEndForAll?: () => void;
}

const buttonBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  borderRadius: 999,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  color: '#f1f5f9',
  background: '#334155',
};

const dangerButton: React.CSSProperties = {
  ...buttonBase,
  background: '#b91c1c',
};

const activeButton: React.CSSProperties = {
  ...buttonBase,
  background: '#0e7490',
};

/**
 * The control bar.
 *
 * Two separate ways out, which is a deliberate distinction rather than duplication:
 * "Leave" disconnects this browser, and "End consultation" closes the appointment for
 * everybody. A patient whose train goes through a tunnel should leave and rejoin; only
 * staff can end. Collapsing the two would let a dropped connection finish an
 * appointment.
 */
export function CallControls({
  isAudioMuted,
  isVideoMuted,
  isSharingScreen,
  hasMediaPermission,
  permissions,
  isChatOpen,
  unreadChatCount,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
  onEndForAll,
}: CallControlsProps) {
  const canShare = permissions?.canShareScreen ?? true;
  const canChat = permissions?.canChat ?? true;
  const canEnd = permissions?.canEndSession ?? false;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '14px 16px',
        background: '#0f172a',
        borderTop: '1px solid #1e293b',
      }}
    >
      <button
        type="button"
        onClick={onToggleAudio}
        disabled={!hasMediaPermission}
        title={hasMediaPermission ? undefined : 'No microphone available'}
        style={{
          ...(isAudioMuted ? dangerButton : buttonBase),
          opacity: hasMediaPermission ? 1 : 0.5,
          cursor: hasMediaPermission ? 'pointer' : 'not-allowed',
        }}
      >
        {isAudioMuted ? 'Unmute' : 'Mute'}
      </button>

      <button
        type="button"
        onClick={onToggleVideo}
        disabled={!hasMediaPermission}
        style={{
          ...(isVideoMuted ? dangerButton : buttonBase),
          opacity: hasMediaPermission ? 1 : 0.5,
          cursor: hasMediaPermission ? 'pointer' : 'not-allowed',
        }}
      >
        {isVideoMuted ? 'Start camera' : 'Stop camera'}
      </button>

      {canShare && (
        <button
          type="button"
          onClick={onToggleScreenShare}
          style={isSharingScreen ? activeButton : buttonBase}
        >
          {isSharingScreen ? 'Stop sharing' : 'Share screen'}
        </button>
      )}

      {canChat && (
        <button
          type="button"
          onClick={onToggleChat}
          style={isChatOpen ? activeButton : buttonBase}
        >
          Chat
          {unreadChatCount > 0 && !isChatOpen && (
            <span
              style={{
                background: '#f43f5e',
                borderRadius: 999,
                fontSize: 11,
                padding: '1px 6px',
              }}
            >
              {unreadChatCount}
            </span>
          )}
        </button>
      )}

      <div style={{ width: 1, height: 28, background: '#1e293b', margin: '0 4px' }} />

      <button type="button" onClick={onLeave} style={buttonBase}>
        Leave
      </button>

      {canEnd && onEndForAll && (
        <button type="button" onClick={onEndForAll} style={dangerButton}>
          End consultation
        </button>
      )}
    </div>
  );
}

export default CallControls;
