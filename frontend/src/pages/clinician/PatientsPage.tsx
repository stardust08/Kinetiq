import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DashboardShell, { card, tableStyle, tdStyle, thStyle } from '../../components/dashboard/DashboardShell';
import { getMyPatients, getReviewQueue } from '../../api/clinician';
import { clinicianNav } from './navigation';

/**
 * The clinician's caseload.
 *
 * Derived from booking assignments rather than stored, so it cannot drift out of step
 * with who is actually booked with them. Sorted by next appointment, so the clinic's day
 * is at the top.
 */
export default function ClinicianPatientsPage() {
  const [search, setSearch] = useState('');

  const { data: patients, isLoading } = useQuery({
    queryKey: ['clinician', 'patients', search],
    queryFn: () => getMyPatients(search || undefined),
  });
  const { data: reviewQueue } = useQuery({
    queryKey: ['clinician', 'review-queue'],
    queryFn: getReviewQueue,
  });

  return (
    <DashboardShell
      title="My patients"
      subtitle="Everyone with an appointment assigned to you."
      nav={clinicianNav(reviewQueue?.length ?? 0)}
      actions={
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or phone"
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            fontSize: 13,
            minWidth: 220,
            padding: '8px 10px',
          }}
        />
      }
    >
      <section style={{ ...card, overflowX: 'auto' }}>
        {isLoading ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Loading…</p>
        ) : !patients?.length ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            {search
              ? 'No patient on your caseload matches that.'
              : 'No patients assigned to you yet. An administrator assigns bookings from the admin area.'}
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Patient</th>
                <th style={thStyle}>Next appointment</th>
                <th style={thStyle}>Last seen</th>
                <th style={thStyle}>Screenings taken</th>
                <th style={thStyle}>Credits left</th>
                <th style={thStyle}>To review</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => {
                const taken =
                  patient.screeningCounts.posture +
                  patient.screeningCounts.gait +
                  patient.screeningCounts.rom;
                return (
                  <tr key={patient.id}>
                    <td style={tdStyle}>
                      <strong>{patient.name ?? 'Unnamed'}</strong>
                      <div style={{ color: '#94a3b8', fontSize: 12 }}>{patient.phone}</div>
                    </td>
                    <td style={tdStyle}>
                      {patient.nextAppointment
                        ? new Date(patient.nextAppointment).toLocaleString()
                        : '—'}
                    </td>
                    <td style={tdStyle}>
                      {patient.lastSeen
                        ? new Date(patient.lastSeen).toLocaleDateString()
                        : 'Not yet'}
                    </td>
                    <td style={tdStyle}>
                      {taken}
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>
                        {patient.screeningCounts.posture}p · {patient.screeningCounts.gait}g ·{' '}
                        {patient.screeningCounts.rom}r
                      </div>
                    </td>
                    <td style={tdStyle}>{patient.remainingScreenings}</td>
                    <td style={tdStyle}>
                      {patient.draftPlans > 0 ? (
                        <span
                          style={{
                            background: '#fef9c3',
                            borderRadius: 6,
                            color: '#854d0e',
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 8px',
                          }}
                        >
                          {patient.draftPlans}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <Link
                        to={`/clinician/patients/${patient.id}`}
                        style={{ color: '#0e7490', fontWeight: 600, textDecoration: 'none' }}
                      >
                        Open record
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </DashboardShell>
  );
}
