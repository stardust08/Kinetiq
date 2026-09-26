import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DashboardShell, { card, tableStyle, tdStyle, thStyle } from '../../components/dashboard/DashboardShell';
import { getMySchedule, getReviewQueue } from '../../api/clinician';
import { clinicianNav } from './navigation';

/** The clinician's appointments, with the consultation state for each. */
export default function ClinicianSchedulePage() {
  const [range, setRange] = useState<'today' | 'week' | 'all'>('week');

  const params = (() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    if (range === 'all') return { dateFrom: from.toISOString(), limit: 200 };
    const to = new Date(from);
    to.setDate(to.getDate() + (range === 'today' ? 1 : 7));
    return { dateFrom: from.toISOString(), dateTo: to.toISOString(), limit: 200 };
  })();

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['clinician', 'schedule', range],
    queryFn: () => getMySchedule(params),
    refetchInterval: 30_000,
  });
  const { data: reviewQueue } = useQuery({
    queryKey: ['clinician', 'review-queue'],
    queryFn: getReviewQueue,
  });

  return (
    <DashboardShell
      title="Schedule"
      subtitle="Your appointments and their consultations."
      nav={clinicianNav(reviewQueue?.length ?? 0)}
      actions={
        <div style={{ display: 'flex', gap: 6 }}>
          {(['today', 'week', 'all'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              style={{
                background: range === option ? '#0e7490' : '#fff',
                border: '1px solid ' + (range === option ? '#0e7490' : '#cbd5e1'),
                borderRadius: 8,
                color: range === option ? '#fff' : '#334155',
                cursor: 'pointer',
                fontSize: 13,
                padding: '7px 13px',
                textTransform: 'capitalize',
              }}
            >
              {option === 'all' ? 'Upcoming' : option}
            </button>
          ))}
        </div>
      }
    >
      <section style={{ ...card, overflowX: 'auto' }}>
        {isLoading ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Loading…</p>
        ) : !schedule?.length ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            Nothing booked in this period. Patients can only book into the hours you set
            under <Link to="/clinician/availability" style={{ color: '#0e7490' }}>My hours</Link>.
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Patient</th>
                <th style={thStyle}>Service</th>
                <th style={thStyle}>Screenings left</th>
                <th style={thStyle}>Consultation</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {schedule.map((entry) => (
                <tr key={entry.id}>
                  <td style={tdStyle}>{new Date(entry.time).toLocaleString()}</td>
                  <td style={tdStyle}>
                    {entry.patient ? (
                      <Link
                        to={`/clinician/patients/${entry.patient.id}`}
                        style={{ color: '#0e7490', textDecoration: 'none' }}
                      >
                        {entry.patient.name ?? entry.patient.phone}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={tdStyle}>{entry.service?.name ?? '—'}</td>
                  <td style={tdStyle}>
                    {entry.remainingScreeningCount} of{' '}
                    {entry.remainingScreeningCount + entry.usedScreeningCount}
                  </td>
                  <td style={tdStyle}>
                    {entry.consultation?.patientWaiting ? (
                      <span style={{ color: '#b45309', fontWeight: 700 }}>
                        Patient waiting
                      </span>
                    ) : entry.consultation?.status === 'LIVE' ? (
                      <span style={{ color: '#047857', fontWeight: 600 }}>Live</span>
                    ) : entry.consultation ? (
                      <span style={{ color: '#64748b' }}>Open</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Not started</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <Link
                      to={`/consultation/booking/${entry.id}`}
                      style={{
                        background: entry.consultation?.patientWaiting ? '#047857' : '#0e7490',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '7px 12px',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.consultation ? 'Join' : 'Start call'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </DashboardShell>
  );
}
