import type { VideoSession } from '../../types/consultation';

export interface WaitingRoomProps {
  session: VideoSession | null;
  /** True when this viewer is the patient, which changes what they are told to expect. */
  isPatient: boolean;
  onRetry?: () => void;
}

/**
 * What a patient sees before the clinician arrives.
 *
 * Deliberately explicit about the one thing patients ask at this point: whether they are
 * supposed to be doing something. They are not - the clinician starts the call and
 * unlocks the screening, and saying so here saves a support message.
 */
export function WaitingRoom({ session, isPatient, onRetry }: WaitingRoomProps) {
  const clinicianName = session?.clinician?.name ?? 'your clinician';
  const appointment = session?.booking?.time
    ? new Date(session.booking.time).toLocaleString()
    : null;

  return (
    <div
      style={{
        display: 'grid',
        gap: 14,
        placeItems: 'center',
        textAlign: 'center',
        padding: '48px 20px',
        color: '#e2e8f0',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: '3px solid #1e293b',
          borderTopColor: '#0e7490',
          animation: 'spin 1s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <h2 style={{ fontSize: 18, margin: 0 }}>
        {isPatient ? `Waiting for ${clinicianName}` : 'Waiting for the patient to join'}
      </h2>

      <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 460, margin: 0 }}>
        {isPatient ? (
          <>
            You are in the waiting room and your camera is ready. There is nothing to do
            yet - {clinicianName} will join shortly and will start any screening for you.
          </>
        ) : (
          <>
            The consultation is open. The patient will appear here as soon as they join.
          </>
        )}
      </p>

      {appointment && (
        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
          Appointment: {appointment}
        </p>
      )}

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            color: '#e2e8f0',
            padding: '8px 14px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Check again
        </button>
      )}
    </div>
  );
}

export default WaitingRoom;
