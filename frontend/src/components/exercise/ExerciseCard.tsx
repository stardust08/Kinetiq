import { useState } from 'react';
import type { Exercise, Severity } from '../../types/consultation';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';

export interface ExerciseDose {
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  frequencyPerWeek: number;
}

export interface ExerciseCardProps {
  exercise: Exercise;
  dose: ExerciseDose;
  /** Why this exercise is on the plan, naming the measurement that led to it. */
  reason?: string | null;
  severity?: Severity;
  sides?: Array<'left' | 'right'>;
  clinicianNote?: string | null;
  /** Set for a struck-off item, which only staff see. */
  isRemoved?: boolean;
  /** Rendered under the card - a log button for a patient, edit controls for staff. */
  actions?: React.ReactNode;
  defaultOpen?: boolean;
}

const SEVERITY_STYLE: Record<Severity, { label: string; colour: string; background: string }> = {
  marked: { label: 'Marked', colour: '#7f1d1d', background: '#fee2e2' },
  moderate: { label: 'Moderate', colour: '#9a3412', background: '#ffedd5' },
  mild: { label: 'Mild', colour: '#854d0e', background: '#fef9c3' },
  // A borderline finding is inside measurement noise and never prescribes on its own, so
  // it should never badge a card. Styled neutrally in case one ever reaches here.
  borderline: { label: 'Borderline', colour: '#334155', background: '#f1f5f9' },
};

/**
 * One exercise, with its dose, its reason, and its video.
 *
 * Collapsed by default. A programme of six exercises rendered fully open is a page of
 * scrolling with six video players on it, and the patient's first question is "what am I
 * doing today" rather than "what are the instructions for exercise four".
 */
export function ExerciseCard({
  exercise,
  dose,
  reason,
  severity,
  sides = [],
  clinicianNote,
  isRemoved = false,
  actions,
  defaultOpen = false,
}: ExerciseCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const badge = severity ? SEVERITY_STYLE[severity] : null;

  const doseText = [
    `${dose.sets} set${dose.sets === 1 ? '' : 's'}`,
    dose.reps ? `${dose.reps} rep${dose.reps === 1 ? '' : 's'}` : null,
    dose.holdSeconds ? `hold ${dose.holdSeconds}s` : null,
    `${dose.frequencyPerWeek}× a week`,
  ]
    .filter(Boolean)
    .join(' · ');

  const sideText =
    sides.length === 2
      ? 'Both sides'
      : sides.length === 1
        ? `${sides[0] === 'left' ? 'Left' : 'Right'} side`
        : null;

  return (
    <article
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        overflow: 'hidden',
        opacity: isRemoved ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 14,
          display: 'grid',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong
                style={{
                  fontSize: 15,
                  color: '#0f172a',
                  textDecoration: isRemoved ? 'line-through' : 'none',
                }}
              >
                {exercise.name}
              </strong>
              {badge && (
                <span
                  style={{
                    background: badge.background,
                    color: badge.colour,
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 7px',
                  }}
                >
                  {badge.label}
                </span>
              )}
              {sideText && (
                <span
                  style={{
                    background: '#e0f2fe',
                    color: '#075985',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 7px',
                  }}
                >
                  {sideText}
                </span>
              )}
              {isRemoved && (
                <span
                  style={{
                    background: '#f1f5f9',
                    color: '#475569',
                    borderRadius: 6,
                    fontSize: 11,
                    padding: '2px 7px',
                  }}
                >
                  Removed by clinician
                </span>
              )}
            </div>
            <span style={{ color: '#475569', fontSize: 13 }}>{doseText}</span>
          </div>
          <span aria-hidden style={{ color: '#94a3b8', fontSize: 18, lineHeight: 1 }}>
            {open ? '−' : '+'}
          </span>
        </div>

        {exercise.summary && !open && (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>{exercise.summary}</p>
        )}
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 12 }}>
          <ExerciseVideoPlayer exercise={exercise} compact />

          {exercise.instructions.length > 0 && (
            <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
              {exercise.instructions.map((step, index) => (
                <li key={index} style={{ color: '#334155', fontSize: 13, lineHeight: 1.5 }}>
                  {step}
                </li>
              ))}
            </ol>
          )}

          {exercise.equipment.length > 0 && (
            <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>
              <strong>You will need:</strong> {exercise.equipment.join(', ')}
            </p>
          )}

          {exercise.cautions && (
            <p
              style={{
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: 8,
                color: '#78350f',
                fontSize: 13,
                margin: 0,
                padding: '8px 10px',
              }}
            >
              <strong>Take care:</strong> {exercise.cautions}
            </p>
          )}

          {reason && (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <strong style={{ color: '#334155', fontSize: 12 }}>
                Why this is on your plan
              </strong>
              <p
                style={{
                  color: '#475569',
                  fontSize: 13,
                  margin: '4px 0 0',
                  whiteSpace: 'pre-line',
                }}
              >
                {reason}
              </p>
            </div>
          )}

          {clinicianNote && (
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <strong style={{ color: '#1e40af', fontSize: 12 }}>
                Note from your clinician
              </strong>
              <p style={{ color: '#1e3a8a', fontSize: 13, margin: '4px 0 0' }}>
                {clinicianNote}
              </p>
            </div>
          )}

          {exercise.reference && (
            <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>
              Reference: {exercise.reference}
            </p>
          )}

          {actions}
        </div>
      )}
    </article>
  );
}

export default ExerciseCard;
