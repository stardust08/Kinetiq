import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DashboardShell, { card, tableStyle, tdStyle, thStyle } from '../../components/dashboard/DashboardShell';
import { getPatients, getStats } from '../../api/admin';
import { adminNav } from './navigation';

/**
 * Every patient, with counts.
 *
 * Counts only. The measurements live behind the individual record, so scanning this list
 * does not hand an admin every patient's clinical data on the way past.
 */
export default function AdminPatientsPage() {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'patients', search, offset],
    queryFn: () => getPatients({ search: search || undefined, limit, offset }),
  });
  const { data: stats } = useQuery({ queryKey: ['admin', 'stats'], queryFn: getStats });

  return (
    <DashboardShell
      title="Patients"
      subtitle={data ? `${data.total} registered` : undefined}
      nav={adminNav(stats?.bookings.unassigned ?? 0)}
      actions={
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          placeholder="Search name, email or phone"
          style={{ border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, minWidth: 240, padding: '8px 10px' }}
        />
      }
    >
      <section style={{ ...card, overflowX: 'auto' }}>
        {isLoading ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Loading…</p>
        ) : !data?.patients.length ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>No patients match that.</p>
        ) : (
          <>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Patient</th>
                  <th style={thStyle}>Contact</th>
                  <th style={thStyle}>Bookings</th>
                  <th style={thStyle}>Screenings</th>
                  <th style={thStyle}>Active plans</th>
                  <th style={thStyle}>Joined</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {data.patients.map((patient) => (
                  <tr key={patient.id}>
                    <td style={tdStyle}>
                      <strong>{patient.name ?? 'Unnamed'}</strong>
                      {patient.status !== 'ACTIVE' && (
                        <span style={{ color: '#b91c1c', fontSize: 11, marginLeft: 6 }}>
                          {patient.status}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {patient.phone}
                      {patient.email && (
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>{patient.email}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{patient.stats.bookings}</td>
                    <td style={tdStyle}>
                      {patient.stats.postureAnalyses +
                        patient.stats.gaitAnalyses +
                        patient.stats.romAnalyses}
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>
                        {patient.stats.postureAnalyses}p · {patient.stats.gaitAnalyses}g ·{' '}
                        {patient.stats.romAnalyses}r
                      </div>
                    </td>
                    <td style={tdStyle}>{patient.stats.activePlans}</td>
                    <td style={tdStyle}>{new Date(patient.createdAt).toLocaleDateString()}</td>
                    <td style={tdStyle}>
                      <Link
                        to={`/admin/patients/${patient.id}`}
                        style={{ color: '#0e7490', fontWeight: 600, textDecoration: 'none' }}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ alignItems: 'center', display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 12 }}>
              <span style={{ color: '#64748b', fontSize: 12 }}>
                {offset + 1}–{Math.min(offset + limit, data.total)} of {data.total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  style={{
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    color: '#334155',
                    cursor: offset === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    opacity: offset === 0 ? 0.5 : 1,
                    padding: '6px 12px',
                  }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={offset + limit >= data.total}
                  onClick={() => setOffset(offset + limit)}
                  style={{
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    color: '#334155',
                    cursor: offset + limit >= data.total ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    opacity: offset + limit >= data.total ? 0.5 : 1,
                    padding: '6px 12px',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </DashboardShell>
  );
}
