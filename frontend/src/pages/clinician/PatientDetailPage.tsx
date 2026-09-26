import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DashboardShell, { card, tableStyle, tdStyle, thStyle } from '../../components/dashboard/DashboardShell';
import { getPatientRecord, getReviewQueue } from '../../api/clinician';
import { useIsAdmin } from '../../store/authStore';
import { clinicianNav } from './navigation';
import { adminNav } from '../admin/navigation';

/**
 * One patient's record.
 *
 * For a clinician this is limited to the bookings assigned to them - a clinician who saw
 * a patient once does not thereby gain access to everything another clinician recorded.
 * An admin gets the unrestricted record from the same endpoint.
 */
export default function ClinicianPatientDetailPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const isAdmin = useIsAdmin();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['patient-record', patientId],
    queryFn: () => getPatientRecord(patientId as string),
    enabled: Boolean(patientId),
  });
  const { data: reviewQueue } = useQuery({
    queryKey: ['clinician', 'review-queue'],
    queryFn: getReviewQueue,
    enabled: !isAdmin,
  });

  const nav = isAdmin ? adminNav() : clinicianNav(reviewQueue?.length ?? 0);
  const allAnalyses = [
    ...(data?.analyses.posture ?? []),
    ...(data?.analyses.gait ?? []),
    ...(data?.analyses.rom ?? []),
  ].sort((a, b) => +new Date(b.analysisDate) - +new Date(a.analysisDate));

  return (
    <DashboardShell
      title={data?.patient?.name ?? 'Patient record'}
      subtitle={data?.patient?.phone ?? undefined}
      nav={nav}
    >
      {isLoading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading record…</p>}

      {isError && (
        <p style={{ color: '#b91c1c', fontSize: 13 }}>
          {error instanceof Error ? error.message : 'Could not load this patient.'}
        </p>
      )}

      {data && (
        <>
          <section style={{ ...card, display: 'grid', gap: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Appointments</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>When</th>
                    <th style={thStyle}>Service</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Screenings</th>
                    <th style={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td style={tdStyle}>{new Date(booking.time).toLocaleString()}</td>
                      <td style={tdStyle}>{booking.service?.name ?? '—'}</td>
                      <td style={tdStyle}>{booking.status}</td>
                      <td style={tdStyle}>
                        {booking.usedScreeningCount} used · {booking.remainingScreeningCount} left
                      </td>
                      <td style={tdStyle}>
                        <Link
                          to={`/consultation/booking/${booking.id}`}
                          style={{ color: '#0e7490', fontWeight: 600, textDecoration: 'none' }}
                        >
                          Consultation
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ ...card, display: 'grid', gap: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Screenings ({allAnalyses.length})</h2>
            {allAnalyses.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
                No screenings yet. Start one from inside a video consultation - a patient
                cannot begin a capture on their own.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {allAnalyses.map((analysis) => (
                  <div
                    key={`${analysis.type}-${analysis.id}`}
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
                        {analysis.type === 'ROM'
                          ? 'Joint range'
                          : analysis.type === 'GAIT'
                            ? 'Walking'
                            : 'Posture'}
                      </strong>
                      <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0' }}>
                        {new Date(analysis.analysisDate).toLocaleString()}
                      </p>
                    </div>
                    {analysis.type === 'POSTURE' && (
                      <Link
                        to={`/posture-analysis/${analysis.id}`}
                        style={{ color: '#0e7490', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                      >
                        Open report
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ ...card, display: 'grid', gap: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>
              Exercise plans ({data.exercisePlans.length})
            </h2>
            {data.exercisePlans.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
                No plans yet. One is drafted automatically when a screening finds
                something, and becomes visible to the patient once you prescribe it.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {data.exercisePlans.map((plan) => (
                  <Link
                    key={plan.id}
                    to={`/clinician/plans/${plan.id}`}
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
                      <strong style={{ fontSize: 14 }}>{plan.title ?? plan.analysisType}</strong>
                      <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0' }}>
                        {plan.itemCount} exercise{plan.itemCount === 1 ? '' : 's'} ·{' '}
                        {new Date(plan.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      style={{
                        background: plan.status === 'DRAFT' ? '#fef9c3' : '#dcfce7',
                        borderRadius: 6,
                        color: plan.status === 'DRAFT' ? '#854d0e' : '#166534',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '3px 9px',
                      }}
                    >
                      {plan.status === 'DRAFT' ? 'Awaiting review' : plan.status}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </DashboardShell>
  );
}
