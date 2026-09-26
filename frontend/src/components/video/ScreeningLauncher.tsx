import { useState } from 'react';
import type { AnalysisType, VideoSession } from '../../types/consultation';

export interface ScreeningLauncherProps {
  session: VideoSession | null;
  /** True only for a clinician or admin. The server checks again regardless. */
  canStart: boolean;
  isPatientPresent: boolean;
  busy?: boolean;
  onEnable: (type: AnalysisType) => Promise<void> | void;
  onRevoke: () => Promise<void> | void;
}

const SCREENINGS: Array<{
  type: AnalysisType;
  name: string;
  description: string;
  minutes: string;
}> = [
  {
    type: 'POSTURE',
    name: 'Posture',
    description: 'Four standing holds. Measures spinal alignment and symmetry.',
    minutes: '~3 min',
  },
  {
    type: 'GAIT',
    name: 'Walking',
    description: 'Walks across the frame. Measures step timing and length.',
    minutes: '~4 min',
  },
  {
    type: 'ROM',
    name: 'Joint range',
    description: 'End-range holds, one joint at a time.',
    minutes: '~6 min',
  },
];

/**
 * The staff-only control that unlocks a screening for the patient in the room.
 *
 * This component is the visible half of the product's central safety rule: a patient
 * cannot start a capture on their own. They are the subject of the measurement, not its
 * operator - they cannot see whether they are square to the camera or whether the frame
 * has cut off their feet, and both of those produce numbers that look fine and are wrong.
 *
 * `canStart` only decides whether this renders. The authorisation itself is minted
 * server-side as a one-shot, short-lived token; see app/core/screening_gate.py.
 */
export function ScreeningLauncher({
  session,
  canStart,
  isPatientPresent,
  busy = false,
  onEnable,
  onRevoke,
}: ScreeningLauncherProps) {
  const [pending, setPending] = useState<AnalysisType | null>(null);

  if (!canStart) return null;

  const screening = session?.screening;
  const remaining = session?.booking?.remainingScreeningCount ?? 0;
  const isLive = session?.status === 'LIVE' || session?.status === 'WAITING';

  const handleEnable = async (type: AnalysisType) => {
    setPending(type);
    try {
      await onEnable(type);
    } finally {
      setPending(null);
    }
  };

  if (screening?.enabled) {
    return (
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
            {screening.type === 'ROM'
              ? 'Joint range'
              : screening.type === 'GAIT'
                ? 'Walking'
                : 'Posture'}{' '}
            screening unlocked
          </strong>
          <p style={{ color: '#a7f3d0', fontSize: 13, margin: '6px 0 0' }}>
            The patient can now begin. Stay on the call and watch the capture - the
            numbers it produces are recorded under your supervision.
          </p>
          {screening.expiresAt && (
            <p style={{ color: '#5eead4', fontSize: 12, margin: '6px 0 0' }}>
              This authorisation expires at{' '}
              {new Date(screening.expiresAt).toLocaleTimeString()} and can be used once.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void onRevoke()}
          disabled={busy}
          style={{
            justifySelf: 'start',
            background: 'transparent',
            border: '1px solid #047857',
            borderRadius: 8,
            color: '#6ee7b7',
            padding: '7px 12px',
            fontSize: 13,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          Withdraw
        </button>
      </section>
    );
  }

  return (
    <section
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
        padding: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      <div>
        <strong style={{ color: '#e2e8f0', fontSize: 14 }}>Start a screening</strong>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 0 0' }}>
          The patient cannot start a capture themselves. Unlock one here and it runs
          while you watch.
        </p>
      </div>

      {remaining <= 0 && (
        <p
          style={{
            background: '#450a0a',
            border: '1px solid #b91c1c',
            borderRadius: 8,
            color: '#fecaca',
            fontSize: 13,
            margin: 0,
            padding: '8px 10px',
          }}
        >
          This booking has no screenings remaining.
        </p>
      )}

      {remaining > 0 && !isPatientPresent && (
        <p
          style={{
            background: '#422006',
            border: '1px solid #b45309',
            borderRadius: 8,
            color: '#fed7aa',
            fontSize: 13,
            margin: 0,
            padding: '8px 10px',
          }}
        >
          Waiting for the patient to join. You can unlock a screening now, but they
          cannot begin until they are in the room.
        </p>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {SCREENINGS.map((item) => {
          const disabled = busy || remaining <= 0 || !isLive;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => void handleEnable(item.type)}
              disabled={disabled}
              style={{
                textAlign: 'left',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 10,
                padding: '10px 12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.55 : 1,
                color: '#f1f5f9',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  {pending === item.type ? 'Unlocking…' : item.minutes}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                {item.description}
              </div>
            </button>
          );
        })}
      </div>

      <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>
        {remaining} screening{remaining === 1 ? '' : 's'} left on this booking.
      </p>
    </section>
  );
}

export default ScreeningLauncher;
