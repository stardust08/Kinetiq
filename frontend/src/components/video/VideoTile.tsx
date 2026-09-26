import { useEffect, useRef } from 'react';
import type { ParticipantRole } from '../../types/consultation';

export interface VideoTileProps {
  stream: MediaStream | null;
  label: string;
  role: ParticipantRole | 'SELF';
  isMuted?: boolean;
  isVideoOff?: boolean;
  isSharingScreen?: boolean;
  /** True for the local preview, which must be mirrored and silenced. */
  isLocal?: boolean;
  connectionState?: RTCPeerConnectionState;
  isPrimary?: boolean;
}

const ROLE_BADGE: Record<string, { text: string; background: string }> = {
  CLINICIAN: { text: 'Clinician', background: '#0e7490' },
  ADMIN: { text: 'Supervising', background: '#7c3aed' },
  PATIENT: { text: 'Patient', background: '#334155' },
  OBSERVER: { text: 'Observer', background: '#475569' },
  SELF: { text: 'You', background: '#1e293b' },
};

/**
 * One participant's video.
 *
 * `srcObject` is set through a ref because it takes a MediaStream object, which cannot
 * be expressed as a React prop - there is no attribute for it, and setting `src` to a
 * blob URL is the deprecated path that leaks the URL.
 */
export function VideoTile({
  stream,
  label,
  role,
  isMuted = false,
  isVideoOff = false,
  isSharingScreen = false,
  isLocal = false,
  connectionState,
  isPrimary = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }
  }, [stream]);

  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.PATIENT;
  const connecting =
    !isLocal && connectionState !== undefined && connectionState !== 'connected';

  return (
    <div
      style={{
        position: 'relative',
        background: '#0f172a',
        borderRadius: 12,
        overflow: 'hidden',
        aspectRatio: '16 / 9',
        width: '100%',
        border: isPrimary ? '2px solid #0e7490' : '1px solid #1e293b',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        // Muting the local preview is not cosmetic: without it the microphone feeds
        // back into the speakers and the patient hears themselves howl.
        muted={isLocal}
        style={{
          width: '100%',
          height: '100%',
          objectFit: isSharingScreen ? 'contain' : 'cover',
          // Mirrored so the local preview behaves like a mirror, which is what people
          // expect of themselves. A shared screen must never be mirrored.
          transform: isLocal && !isSharingScreen ? 'scaleX(-1)' : undefined,
          display: isVideoOff || !stream ? 'none' : 'block',
          background: '#0f172a',
        }}
      />

      {(isVideoOff || !stream) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#94a3b8',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 600,
              color: '#e2e8f0',
            }}
          >
            {label.trim().charAt(0).toUpperCase() || '?'}
          </div>
          <span style={{ fontSize: 13 }}>
            {connecting ? 'Connecting…' : 'Camera off'}
          </span>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: 10,
          bottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            background: 'rgba(15,23,42,0.82)',
            color: '#f1f5f9',
            fontSize: 12,
            padding: '3px 8px',
            borderRadius: 6,
          }}
        >
          {label}
        </span>
        <span
          style={{
            background: badge.background,
            color: '#fff',
            fontSize: 11,
            padding: '3px 7px',
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {badge.text}
        </span>
        {isMuted && (
          <span
            title="Microphone muted"
            style={{
              background: '#b91c1c',
              color: '#fff',
              fontSize: 11,
              padding: '3px 7px',
              borderRadius: 6,
            }}
          >
            Muted
          </span>
        )}
        {isSharingScreen && (
          <span
            style={{
              background: '#047857',
              color: '#fff',
              fontSize: 11,
              padding: '3px 7px',
              borderRadius: 6,
            }}
          >
            Sharing screen
          </span>
        )}
      </div>
    </div>
  );
}

export default VideoTile;
