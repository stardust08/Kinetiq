import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ExerciseCard from '../../components/exercise/ExerciseCard';
import {
  activatePlan,
  addPlanItem,
  getCatalogue,
  getPlan,
  removePlanItem,
  updatePlan,
  updatePlanItem,
} from '../../api/exercises';
import type { ExercisePlanItem } from '../../types/consultation';

/**
 * Where a machine suggestion becomes a prescription.
 *
 * The clinician reads what the screening found, strikes off anything wrong for this
 * patient, adjusts the dose, adds their own exercises, and activates. Only then can the
 * patient see any of it.
 *
 * This page is the whole justification for PlanStatus.DRAFT. The engine works from
 * measurements, and measurements can be right while the conclusion is wrong: a patient
 * who could not lift their arm because of a fresh fracture produces the same low
 * shoulder-flexion reading as one with a stiff joint, and the exercise that helps the
 * second would harm the first. Nothing gets past here unread.
 */
export default function PlanReviewPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState('');
  const [durationWeeks, setDurationWeeks] = useState<number | ''>('');
  const [addingSlug, setAddingSlug] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: plan, isLoading, isError, error } = useQuery({
    queryKey: ['exercise-plan', planId],
    queryFn: () => getPlan(planId as string),
    enabled: Boolean(planId),
  });

  const { data: catalogue } = useQuery({
    queryKey: ['exercise-catalogue'],
    queryFn: () => getCatalogue({ limit: 200 }),
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (plan) {
      setNotes(plan.clinicianNotes ?? '');
      setDurationWeeks(plan.durationWeeks);
    }
  }, [plan]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['exercise-plan', planId] });
    void queryClient.invalidateQueries({ queryKey: ['clinician', 'review-queue'] });
  };

  const saveDetails = useMutation({
    mutationFn: () =>
      updatePlan(planId as string, {
        clinicianNotes: notes || undefined,
        durationWeeks: durationWeeks === '' ? undefined : Number(durationWeeks),
      }),
    onSuccess: () => {
      setFeedback('Saved.');
      invalidate();
    },
  });

  const activate = useMutation({
    mutationFn: () => activatePlan(planId as string, notes || undefined),
    onSuccess: () => {
      setFeedback('Prescribed. The patient can now see this plan.');
      invalidate();
    },
  });

  const strike = useMutation({
    mutationFn: (itemId: string) => removePlanItem(planId as string, itemId),
    onSuccess: invalidate,
  });

  const restore = useMutation({
    mutationFn: (itemId: string) =>
      updatePlanItem(planId as string, itemId, { isRemoved: false }),
    onSuccess: invalidate,
  });

  const adjust = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: Record<string, number> }) =>
      updatePlanItem(planId as string, itemId, patch),
    onSuccess: invalidate,
  });

  const add = useMutation({
    mutationFn: (slug: string) => addPlanItem(planId as string, { exerciseSlug: slug }),
    onSuccess: () => {
      setAddingSlug('');
      invalidate();
    },
  });

  const liveItems = useMemo(
    () => plan?.items.filter((item) => !item.isRemoved) ?? [],
    [plan],
  );
  const struckItems = useMemo(
    () => plan?.items.filter((item) => item.isRemoved) ?? [],
    [plan],
  );

  const shell = (children: React.ReactNode) => (
    <main
      style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: '24px 16px 56px',
        display: 'grid',
        gap: 18,
      }}
    >
      <Link
        to="/clinician"
        style={{ color: '#0e7490', fontSize: 13, textDecoration: 'none' }}
      >
        ← Back to dashboard
      </Link>
      {children}
    </main>
  );

  if (isLoading) return shell(<p style={{ color: '#64748b' }}>Loading plan…</p>);
  if (isError || !plan) {
    return shell(
      <p style={{ color: '#b91c1c', fontSize: 14 }}>
        {error instanceof Error ? error.message : 'Could not load this plan.'}
      </p>,
    );
  }

  const isDraft = plan.status === 'DRAFT';
  const borderline = (plan.findings ?? []).filter((finding) => !finding.actionable);
  const actionable = (plan.findings ?? []).filter((finding) => finding.actionable);

  return shell(
    <>
      <header style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 21, margin: 0 }}>
            {plan.title ?? 'Exercise programme'}
          </h1>
          <span
            style={{
              background: isDraft ? '#fef9c3' : '#dcfce7',
              color: isDraft ? '#854d0e' : '#166534',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 10px',
            }}
          >
            {isDraft ? 'Draft — not visible to the patient' : plan.status}
          </span>
        </div>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          {plan.patient?.name ? `${plan.patient.name} · ` : ''}
          {plan.analysisType === 'ROM'
            ? 'Joint range'
            : plan.analysisType === 'GAIT'
              ? 'Walking'
              : 'Posture'}{' '}
          screening on {new Date(plan.createdAt).toLocaleDateString()}
        </p>
      </header>

      {feedback && (
        <p
          style={{
            background: '#ecfdf5',
            border: '1px solid #6ee7b7',
            borderRadius: 8,
            color: '#065f46',
            fontSize: 13,
            margin: 0,
            padding: '9px 12px',
          }}
        >
          {feedback}
        </p>
      )}

      {/* ---- Findings ---------------------------------------------------- */}
      <section
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          display: 'grid',
          gap: 10,
          padding: 18,
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0 }}>What the screening measured</h2>
        {plan.summary && (
          <p style={{ color: '#475569', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            {plan.summary}
          </p>
        )}

        {actionable.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {actionable.map((finding) => (
              <li key={finding.metricKey} style={{ color: '#334155', fontSize: 13 }}>
                {finding.statement}{' '}
                <span style={{ color: '#64748b' }}>
                  ({finding.severity}
                  {finding.mdc95 !== null ? `, MDC95 ±${finding.mdc95}` : ''})
                </span>
              </li>
            ))}
          </ul>
        )}

        {borderline.length > 0 && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <strong style={{ color: '#334155', fontSize: 12 }}>
              Borderline — not acted on ({borderline.length})
            </strong>
            <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 8px' }}>
              These landed outside their range by less than the repeat-measurement error
              for that metric, so the engine prescribed nothing for them. Your call.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
              {borderline.map((finding) => (
                <li key={finding.metricKey} style={{ color: '#64748b', fontSize: 12 }}>
                  {finding.clinicalName}: {finding.value}
                  {finding.unit === 'degrees' ? '°' : ''} (expected{' '}
                  {finding.normalRange[0]}–{finding.normalRange[1]}, MDC95 ±
                  {finding.mdc95 ?? '?'})
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---- Items ------------------------------------------------------- */}
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>
          Suggested exercises ({liveItems.length})
        </h2>
        {liveItems.length === 0 && (
          <p
            style={{
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: 8,
              color: '#78350f',
              fontSize: 13,
              margin: 0,
              padding: '10px 12px',
            }}
          >
            Nothing on this plan. Add at least one exercise before prescribing it.
          </p>
        )}
        {liveItems.map((item) => (
          <ReviewItem
            key={item.id}
            item={item}
            onStrike={() => strike.mutate(item.id)}
            onAdjust={(patch) => adjust.mutate({ itemId: item.id, patch })}
            busy={strike.isPending || adjust.isPending}
          />
        ))}

        {struckItems.length > 0 && (
          <details style={{ color: '#475569', fontSize: 13 }}>
            <summary style={{ cursor: 'pointer' }}>
              Removed by you ({struckItems.length})
            </summary>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {struckItems.map((item) => (
                <ReviewItem
                  key={item.id}
                  item={item}
                  onRestore={() => restore.mutate(item.id)}
                  busy={restore.isPending}
                />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* ---- Add ---------------------------------------------------------- */}
      <section
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          display: 'grid',
          gap: 10,
          padding: 18,
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0 }}>Add an exercise</h2>
        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
          Anything you add is marked as yours and survives a regeneration of the
          suggestions.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={addingSlug}
            onChange={(event) => setAddingSlug(event.target.value)}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              flex: 1,
              fontSize: 13,
              minWidth: 220,
              padding: '8px 10px',
            }}
          >
            <option value="">Choose an exercise…</option>
            {(catalogue ?? []).map((exercise) => (
              <option key={exercise.slug} value={exercise.slug}>
                {exercise.bodyRegion.replace('_', ' ')} — {exercise.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => addingSlug && add.mutate(addingSlug)}
            disabled={!addingSlug || add.isPending}
            style={{
              background: addingSlug ? '#0e7490' : '#cbd5e1',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              cursor: addingSlug ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 600,
              padding: '9px 16px',
            }}
          >
            Add
          </button>
        </div>
      </section>

      {/* ---- Prescribe ---------------------------------------------------- */}
      <section
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          display: 'grid',
          gap: 12,
          padding: 18,
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0 }}>
          {isDraft ? 'Prescribe this plan' : 'Plan details'}
        </h2>

        <label style={{ color: '#334155', display: 'grid', fontSize: 13, gap: 4 }}>
          Note for the patient
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="Anything you want them to read alongside the exercises."
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontFamily: 'inherit',
              fontSize: 13,
              padding: 10,
              resize: 'vertical',
            }}
          />
        </label>

        <label
          style={{
            alignItems: 'center',
            color: '#334155',
            display: 'flex',
            fontSize: 13,
            gap: 8,
          }}
        >
          Run for
          <input
            type="number"
            min={1}
            max={52}
            value={durationWeeks}
            onChange={(event) =>
              setDurationWeeks(event.target.value === '' ? '' : Number(event.target.value))
            }
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              fontSize: 13,
              padding: '6px 8px',
              width: 70,
            }}
          />
          weeks
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            onClick={() => saveDetails.mutate()}
            disabled={saveDetails.isPending}
            style={{
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              color: '#334155',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              padding: '9px 16px',
            }}
          >
            Save without prescribing
          </button>

          {isDraft && (
            <button
              type="button"
              onClick={() => activate.mutate()}
              disabled={activate.isPending || liveItems.length === 0}
              style={{
                background: liveItems.length === 0 ? '#cbd5e1' : '#047857',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: liveItems.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 700,
                padding: '9px 18px',
              }}
            >
              {activate.isPending ? 'Prescribing…' : 'Prescribe to patient'}
            </button>
          )}

          {!isDraft && plan.patientId && (
            <button
              type="button"
              onClick={() => navigate(`/clinician/patients/${plan.patientId}`)}
              style={{
                background: '#0e7490',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                padding: '9px 16px',
              }}
            >
              Open patient record
            </button>
          )}
        </div>

        {isDraft && (
          <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>
            Until you prescribe it, the patient cannot see this plan at all.
          </p>
        )}

        {(activate.isError || saveDetails.isError) && (
          <p style={{ color: '#b91c1c', fontSize: 13, margin: 0 }}>
            {(activate.error ?? saveDetails.error) instanceof Error
              ? ((activate.error ?? saveDetails.error) as Error).message
              : 'Something went wrong.'}
          </p>
        )}
      </section>
    </>,
  );
}

/** One plan item, with dose controls and a strike-off. */
function ReviewItem({
  item,
  onStrike,
  onRestore,
  onAdjust,
  busy,
}: {
  item: ExercisePlanItem;
  onStrike?: () => void;
  onRestore?: () => void;
  onAdjust?: (patch: Record<string, number>) => void;
  busy?: boolean;
}) {
  if (!item.exercise) return null;

  return (
    <ExerciseCard
      exercise={item.exercise}
      dose={{
        sets: item.sets,
        reps: item.reps,
        holdSeconds: item.holdSeconds,
        frequencyPerWeek: item.frequencyPerWeek,
      }}
      reason={item.reason}
      clinicianNote={item.clinicianNote}
      isRemoved={item.isRemoved}
      actions={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {onAdjust && (
            <>
              <DoseField
                label="Sets"
                value={item.sets}
                min={1}
                max={10}
                onCommit={(value) => onAdjust({ sets: value })}
              />
              {item.reps !== null && (
                <DoseField
                  label="Reps"
                  value={item.reps}
                  min={1}
                  max={100}
                  onCommit={(value) => onAdjust({ reps: value })}
                />
              )}
              {item.holdSeconds !== null && (
                <DoseField
                  label="Hold (s)"
                  value={item.holdSeconds}
                  min={1}
                  max={600}
                  onCommit={(value) => onAdjust({ holdSeconds: value })}
                />
              )}
              <DoseField
                label="Per week"
                value={item.frequencyPerWeek}
                min={1}
                max={21}
                onCommit={(value) => onAdjust({ frequencyPerWeek: value })}
              />
            </>
          )}

          <span style={{ flex: 1 }} />

          {item.source === 'AUTO' ? (
            <span style={{ color: '#94a3b8', fontSize: 12 }}>Suggested by screening</span>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: 12 }}>Added by clinician</span>
          )}

          {onStrike && (
            <button
              type="button"
              onClick={onStrike}
              disabled={busy}
              style={{
                background: 'transparent',
                border: '1px solid #fca5a5',
                borderRadius: 8,
                color: '#b91c1c',
                cursor: 'pointer',
                fontSize: 12,
                padding: '6px 12px',
              }}
            >
              Remove
            </button>
          )}
          {onRestore && (
            <button
              type="button"
              onClick={onRestore}
              disabled={busy}
              style={{
                background: 'transparent',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                color: '#334155',
                cursor: 'pointer',
                fontSize: 12,
                padding: '6px 12px',
              }}
            >
              Put back
            </button>
          )}
        </div>
      }
    />
  );
}

/**
 * A number field that saves on blur rather than on every keystroke.
 *
 * Saving per keystroke would fire a request for each digit, and clearing the field to
 * type a new number would briefly send an empty value.
 */
function DoseField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <label style={{ color: '#475569', display: 'grid', fontSize: 11, gap: 2 }}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = Number(draft);
          if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
            setDraft(String(value));
            return;
          }
          if (parsed !== value) onCommit(parsed);
        }}
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          fontSize: 12,
          padding: '4px 6px',
          width: 66,
        }}
      />
    </label>
  );
}
