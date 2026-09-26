import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ExerciseCard from '../components/exercise/ExerciseCard';
import { getAdherence, getPlan, getPlans, logCompletion } from '../api/exercises';
import type { ExercisePlan, ExercisePlanItem } from '../types/consultation';

/**
 * The patient's exercise programme.
 *
 * Only ever shows plans a clinician has prescribed. Drafts are filtered out server-side
 * (see plan_scope_filter), so there is no state here in which a patient is looking at an
 * unreviewed machine suggestion and believing it is their programme.
 */
export default function MyExercisePlanPage() {
  const { planId } = useParams<{ planId?: string }>();
  const queryClient = useQueryClient();

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['exercise-plans', 'mine'],
    queryFn: () => getPlans({ limit: 25 }),
    enabled: !planId,
  });

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['exercise-plan', planId],
    queryFn: () => getPlan(planId as string),
    enabled: Boolean(planId),
  });

  // Pick the active plan when no id was given. A patient arriving from the nav wants
  // "what am I doing today", not a list to choose from.
  const activePlan = useMemo<ExercisePlan | null>(() => {
    if (plan) return plan;
    if (!plans?.length) return null;
    return plans.find((candidate) => candidate.status === 'ACTIVE') ?? plans[0];
  }, [plan, plans]);

  const { data: adherenceSummary } = useQuery({
    queryKey: ['adherence', activePlan?.id],
    queryFn: () => getAdherence(activePlan!.id),
    enabled: Boolean(activePlan?.id),
  });

  const shell = (children: React.ReactNode) => (
    <main
      style={{
        maxWidth: 820,
        margin: '0 auto',
        padding: '24px 16px 56px',
        display: 'grid',
        gap: 18,
      }}
    >
      <header style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>My exercise plan</h1>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          Prescribed by your clinician after reviewing your screening.
        </p>
      </header>
      {children}
    </main>
  );

  if (plansLoading || planLoading) {
    return shell(<p style={{ color: '#64748b', fontSize: 14 }}>Loading your plan…</p>);
  }

  if (!activePlan) {
    return shell(
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 24,
          textAlign: 'center',
          display: 'grid',
          gap: 8,
        }}
      >
        <h2 style={{ fontSize: 17, margin: 0 }}>No plan yet</h2>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          A plan appears here once you have had a screening and your clinician has
          reviewed the results. That review is deliberate - nothing reaches you
          automatically.
        </p>
        <Link
          to="/bookings"
          style={{ color: '#0e7490', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
        >
          View my bookings
        </Link>
      </div>,
    );
  }

  const liveItems = activePlan.items.filter((item) => !item.isRemoved);

  return shell(
    <>
      <section
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 18,
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ fontSize: 17, margin: 0 }}>
              {activePlan.title ?? 'Exercise programme'}
            </h2>
            {activePlan.reviewedBy?.name && (
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
                Prescribed by {activePlan.reviewedBy.name}
                {activePlan.activatedAt
                  ? ` on ${new Date(activePlan.activatedAt).toLocaleDateString()}`
                  : ''}
              </p>
            )}
          </div>
          <span
            style={{
              background: activePlan.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9',
              color: activePlan.status === 'ACTIVE' ? '#166534' : '#475569',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 10px',
            }}
          >
            {activePlan.status === 'ACTIVE' ? 'Active' : activePlan.status}
          </span>
        </div>

        {activePlan.summary && (
          <p style={{ color: '#475569', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            {activePlan.summary}
          </p>
        )}

        {activePlan.clinicianNotes && (
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <strong style={{ color: '#1e40af', fontSize: 12 }}>
              From your clinician
            </strong>
            <p style={{ color: '#1e3a8a', fontSize: 13, margin: '4px 0 0' }}>
              {activePlan.clinicianNotes}
            </p>
          </div>
        )}

        {adherenceSummary && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ color: '#475569', fontSize: 13 }}>
                Done so far: {adherenceSummary.totalCompleted} of{' '}
                {adherenceSummary.totalExpected} expected sessions
              </span>
              <strong style={{ color: '#0f172a', fontSize: 13 }}>
                {adherenceSummary.overallAdherencePercent}%
              </strong>
            </div>
            <div
              style={{
                background: '#e2e8f0',
                borderRadius: 999,
                height: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  background: '#0e7490',
                  height: '100%',
                  width: `${adherenceSummary.overallAdherencePercent}%`,
                }}
              />
            </div>
          </div>
        )}
      </section>

      {activePlan.findings && activePlan.findings.length > 0 && (
        <section
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 18,
            display: 'grid',
            gap: 8,
          }}
        >
          <h3 style={{ fontSize: 15, margin: 0 }}>What your screening found</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {activePlan.findings.map((finding) => (
              <li
                key={finding.metricKey}
                style={{ color: '#475569', fontSize: 13, lineHeight: 1.5 }}
              >
                {finding.statement}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>
          Your exercises ({liveItems.length})
        </h3>
        {liveItems.map((item) => (
          <PlanItemCard
            key={item.id}
            item={item}
            planActive={activePlan.status === 'ACTIVE'}
            onLogged={() => {
              void queryClient.invalidateQueries({ queryKey: ['adherence', activePlan.id] });
            }}
          />
        ))}
      </section>

      {plans && plans.length > 1 && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>Other plans</h3>
          {plans
            .filter((candidate) => candidate.id !== activePlan.id)
            .map((candidate) => (
              <Link
                key={candidate.id}
                to={`/my-plan/${candidate.id}`}
                style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  color: '#0f172a',
                  display: 'flex',
                  fontSize: 13,
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  textDecoration: 'none',
                }}
              >
                <span>{candidate.title ?? candidate.analysisType}</span>
                <span style={{ color: '#64748b' }}>
                  {new Date(candidate.createdAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
        </section>
      )}
    </>,
  );
}

/**
 * One exercise, plus the form to log having done it.
 *
 * Pain and difficulty are optional and worth collecting: a patient reporting 7/10 pain on
 * an exercise is the signal that it was progressed too fast, and without it the clinician
 * finds out at the next appointment.
 */
function PlanItemCard({
  item,
  planActive,
  onLogged,
}: {
  item: ExercisePlanItem;
  planActive: boolean;
  onLogged: () => void;
}) {
  const [painScore, setPainScore] = useState<number | ''>('');
  const [difficulty, setDifficulty] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [justLogged, setJustLogged] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      logCompletion(item.id, {
        setsDone: item.sets,
        repsDone: item.reps ?? undefined,
        painScore: painScore === '' ? undefined : Number(painScore),
        difficultyRating: difficulty === '' ? undefined : Number(difficulty),
        notes: note.trim() || undefined,
      }),
    onSuccess: () => {
      setJustLogged(true);
      setPainScore('');
      setDifficulty('');
      setNote('');
      onLogged();
    },
  });

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
      actions={
        planActive ? (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              display: 'grid',
              gap: 8,
              padding: 12,
            }}
          >
            <strong style={{ color: '#334155', fontSize: 12 }}>
              Log today's session
            </strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <label style={{ color: '#475569', fontSize: 12, display: 'grid', gap: 4 }}>
                Pain (0-10)
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={painScore}
                  onChange={(event) =>
                    setPainScore(event.target.value === '' ? '' : Number(event.target.value))
                  }
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 13,
                    padding: '6px 8px',
                    width: 76,
                  }}
                />
              </label>
              <label style={{ color: '#475569', fontSize: 12, display: 'grid', gap: 4 }}>
                How hard (1-5)
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={difficulty}
                  onChange={(event) =>
                    setDifficulty(event.target.value === '' ? '' : Number(event.target.value))
                  }
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 13,
                    padding: '6px 8px',
                    width: 90,
                  }}
                />
              </label>
              <label
                style={{
                  color: '#475569',
                  fontSize: 12,
                  display: 'grid',
                  gap: 4,
                  flex: 1,
                  minWidth: 160,
                }}
              >
                Note (optional)
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Anything you noticed"
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 13,
                    padding: '6px 8px',
                    width: '100%',
                  }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                style={{
                  background: '#0e7490',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  cursor: mutation.isPending ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '8px 14px',
                }}
              >
                {mutation.isPending ? 'Saving…' : 'Mark as done'}
              </button>
              {justLogged && (
                <span style={{ color: '#047857', fontSize: 13 }}>Logged. Well done.</span>
              )}
              {mutation.isError && (
                <span style={{ color: '#b91c1c', fontSize: 13 }}>
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : 'Could not save that.'}
                </span>
              )}
            </div>
          </div>
        ) : null
      }
    />
  );
}
