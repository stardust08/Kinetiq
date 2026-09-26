import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DashboardShell, {
  StatTile,
  card,
  tileGrid,
} from '../../components/dashboard/DashboardShell';
import { getMyPatients, getMySchedule, getReviewQueue } from '../../api/clinician';
import { clinicianNav } from './navigation';

/**
 * The clinician's front door.
 *
 * Ordered by urgency rather than by category. Two things are genuinely time-critical and
 * both are at the top:
 *
 *   - a patient sitting in a waiting room right now, which nobody else will notice;
 *   - draft plans awaiting review, each one a patient who finished a screening and
 *     cannot see their programme until a clinician reads it.
 */
export default function ClinicianDashboardPage() {
  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const { data: schedule } = useQuery({
    queryKey: ['clinician', 'schedule', 'today'],
    queryFn: () => getMySchedule({ dateFrom: today.from, dateTo: today.to }),
    // The waiting-room flag has to be fresh or it is worse than not showing it.
    refetchInterval: 20_000,
  });

  const { data: upcoming } = useQuery({
    queryKey: ['clinician', 'schedule', 'upcoming'],
    queryFn: () => getMySchedule({ dateFrom: new Date().toISOString(), limit: 50 }),
  });

  const { data: reviewQueue } = useQuery({
    queryKey: ['clinician', 'review-queue'],
    queryFn: getReviewQueue,
  });

  const { data: patients } = useQuery({
    queryKey: ['clinician', 'patients'],
    queryFn: () => getMyPatients(),
  });

  const waiting = (schedule ?? []).filter(
    (entry) => entry.consultation?.patientWaiting,
  );
  const live = (schedule ?? []).filter(
    (entry) => entry.consultation?.status === 'LIVE',
  );

  return (
    <DashboardShell
      title="Your clinic"
      subtitle="Appointments today, and the work waiting on you."
      nav={clinicianNav(reviewQueue?.length ?? 0)}
    >
      <div style={tileGrid}>
        <StatTile
          label="Waiting now"
          value={waiting.length}
          hint={waiting.length ? 'A patient is in the room' : 'Nobody waiting'}
          emphasis={waiting.length ? 'attention' : 'neutral'}
        />
        <StatTile label="Today" value={schedule?.length ?? 0} hint="Appointments" />
        <StatTile
          label="To review"
          value={reviewQueue?.length ?? 0}
          hint="Draft plans the patient cannot see yet"
          emphasis={reviewQueue?.length ? 'attention' : 'good'}
        />
        <StatTile label="Patients" value={patients?.length ?? 0} hint="On your caseload" />
        <StatTile
          label="In call"
          value={live.length}
          hint="Consultations running"
          emphasis={live.length ? 'good' : 'neutral'}
        />
      </div>

      {/* ---- Waiting room ------------------------------------------------ */}
      {waiting.length > 0 && (
        <section
          style={{
            ...card,
            background: '#fffbeb',
            borderColor: '#fcd34d',
            display: 'grid',
            gap: 10,
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0, color: '#78350f' }}>
            {waiting.length === 1
              ? 'A patient is waiting for you'
              : `${waiting.length} patients are waiting`}
          </h2>
          {waiting.map((entry) => (
            <div
              key={entry.id}
              style={{
                alignItems: 'center',
                background: '#fff',
                border: '1px solid #fcd34d',
                borderRadius: 10,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                justifyContent: 'space-between',
                padding: '10px 12px',
              }}
            >
              <div>
                <strong style={{ fontSize: 14 }}>
                  {entry.patient?.name ?? 'Patient'}
                </strong>
                <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0' }}>
                  {entry.service?.name} · {new Date(entry.time).toLocaleTimeString()}
                </p>
              </div>
              <Link
                to={`/consultation/${entry.consultation?.id}`}
                style={{
                  background: '#047857',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '9px 16px',
                  textDecoration: 'none',
                }}
              >
                Join now
              </Link>
            </div>
          ))}
        </section>
      )}

      {/* ---- Review queue ------------------------------------------------ */}
      <section style={{ ...card, display: 'grid', gap: 10 }}>
        <div
          style={{
            alignItems: 'baseline',
            display: 'flex',
            gap: 10,
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0 }}>Plans awaiting your review</h2>
          <span style={{ color: '#64748b', fontSize: 12 }}>
            A draft is invisible to the patient until you prescribe it
          </span>
        </div>

        {!reviewQueue?.length ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            Nothing waiting. Every screening you have taken has been reviewed.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {reviewQueue.map((entry) => (
              <Link
                key={entry.id}
                to={`/clinician/plans/${entry.id}`}
                style={{
                  alignItems: 'center',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  color: '#0f172a',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  textDecoration: 'none',
                }}
              >
                <div>
                  <strong style={{ fontSize: 14 }}>
                    {entry.patient?.name ?? 'Patient'}
                  </strong>
                  <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0' }}>
                    {entry.analysisType === 'ROM'
                      ? 'Joint range'
                      : entry.analysisType === 'GAIT'
                        ? 'Walking'
                        : 'Posture'}{' '}
                    · {entry.findingCount} finding
                    {entry.findingCount === 1 ? '' : 's'} · {entry.itemCount} exercise
                    {entry.itemCount === 1 ? '' : 's'} suggested
                  </p>
                </div>
                <span
                  style={{
                    background: '#fef9c3',
                    borderRadius: 6,
                    color: '#854d0e',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '4px 9px',
                  }}
                >
                  Review
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---- Next appointments ------------------------------------------- */}
      <section style={{ ...card, display: 'grid', gap: 10 }}>
        <div
          style={{
            alignItems: 'baseline',
            display: 'flex',
            gap: 10,
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0 }}>Next appointments</h2>
          <Link
            to="/clinician/schedule"
            style={{ color: '#0e7490', fontSize: 13, textDecoration: 'none' }}
          >
            Full schedule →
          </Link>
        </div>

        {!upcoming?.length ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            Nothing booked. Patients can book into the hours you set under{' '}
            <Link to="/clinician/availability" style={{ color: '#0e7490' }}>
              My hours
            </Link>
            .
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {upcoming.slice(0, 6).map((entry) => (
              <div
                key={entry.id}
                style={{
                  alignItems: 'center',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                }}
              >
                <div>
                  <strong style={{ fontSize: 14 }}>
                    {entry.patient?.name ?? 'Patient'}
                  </strong>
                  <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0' }}>
                    {new Date(entry.time).toLocaleString()} · {entry.service?.name}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {entry.patient && (
                    <Link
                      to={`/clinician/patients/${entry.patient.id}`}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: 8,
                        color: '#334155',
                        fontSize: 13,
                        padding: '8px 12px',
                        textDecoration: 'none',
                      }}
                    >
                      Record
                    </Link>
                  )}
                  <Link
                    to={`/consultation/booking/${entry.id}`}
                    style={{
                      background: '#0e7490',
                      borderRadius: 8,
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      padding: '8px 12px',
                      textDecoration: 'none',
                    }}
                  >
                    {entry.consultation ? 'Rejoin' : 'Start call'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
