import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardShell, { card, tableStyle, tdStyle, thStyle } from '../../components/dashboard/DashboardShell';
import { assignBooking, getBookings, getClinicians, getStats } from '../../api/admin';
import { adminNav } from './navigation';

/**
 * All bookings, and the one action that matters here: assigning a clinician.
 *
 * An unassigned booking cannot host a consultation, and without a consultation nobody
 * can start the patient's screening - so the unassigned filter is the queue to keep
 * empty, and it is the default when arrived at from the dashboard.
 */
export default function AdminBookingsPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [unassignedOnly, setUnassignedOnly] = useState(
    searchParams.get('unassigned') === '1',
  );
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'bookings', unassignedOnly, status],
    queryFn: () =>
      getBookings({
        unassignedOnly: unassignedOnly || undefined,
        status: status || undefined,
        limit: 100,
      }),
  });
  const { data: clinicians } = useQuery({
    queryKey: ['admin', 'clinicians', 'active'],
    queryFn: () => getClinicians(),
  });
  const { data: stats } = useQuery({ queryKey: ['admin', 'stats'], queryFn: getStats });

  const assign = useMutation({
    mutationFn: ({ bookingId, clinicianId }: { bookingId: string; clinicianId: string | null }) =>
      assignBooking(bookingId, clinicianId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  return (
    <DashboardShell
      title="Bookings"
      subtitle={data ? `${data.total} matching` : undefined}
      nav={adminNav(stats?.bookings.unassigned ?? 0)}
      actions={
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <label style={{ alignItems: 'center', color: '#334155', display: 'flex', fontSize: 13, gap: 6 }}>
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(event) => setUnassignedOnly(event.target.checked)}
            />
            Needs a clinician
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            style={{ border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, padding: '8px 10px' }}
          >
            <option value="">Any status</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      }
    >
      {assign.isError && (
        <p
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            color: '#991b1b',
            fontSize: 13,
            margin: 0,
            padding: '9px 12px',
          }}
        >
          {assign.error instanceof Error ? assign.error.message : 'Could not assign.'}
        </p>
      )}

      <section style={{ ...card, overflowX: 'auto' }}>
        {isLoading ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Loading…</p>
        ) : !data?.bookings.length ? (
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            {unassignedOnly
              ? 'Nothing waiting - every booking has a clinician.'
              : 'No bookings match these filters.'}
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>When</th>
                <th style={thStyle}>Patient</th>
                <th style={thStyle}>Service</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Paid</th>
                <th style={thStyle}>Screenings</th>
                <th style={thStyle}>Clinician</th>
              </tr>
            </thead>
            <tbody>
              {data.bookings.map((booking) => (
                <tr key={booking.id}>
                  <td style={tdStyle}>{new Date(booking.time).toLocaleString()}</td>
                  <td style={tdStyle}>
                    {booking.patient ? (
                      <Link
                        to={`/admin/patients/${booking.patient.id}`}
                        style={{ color: '#0e7490', textDecoration: 'none' }}
                      >
                        {booking.patient.name ?? booking.patient.phone}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={tdStyle}>{booking.service?.name ?? '—'}</td>
                  <td style={tdStyle}>{booking.status}</td>
                  <td style={tdStyle}>
                    {booking.paidAmount}
                    {booking.remainingAmount > 0 && (
                      <span style={{ color: '#b45309' }}> ({booking.remainingAmount} due)</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {booking.usedScreeningCount}/{booking.totalScreeningCount}
                  </td>
                  <td style={tdStyle}>
                    <select
                      value={booking.clinician?.id ?? ''}
                      onChange={(event) =>
                        assign.mutate({
                          bookingId: booking.id,
                          clinicianId: event.target.value || null,
                        })
                      }
                      style={{
                        border: '1px solid ' + (booking.clinician ? '#cbd5e1' : '#fcd34d'),
                        background: booking.clinician ? '#fff' : '#fffbeb',
                        borderRadius: 6,
                        fontSize: 12,
                        minWidth: 160,
                        padding: '5px 7px',
                      }}
                    >
                      <option value="">Unassigned</option>
                      {(clinicians ?? []).map((clinician) => (
                        <option key={clinician.id} value={clinician.id}>
                          {clinician.name ?? clinician.phone}
                        </option>
                      ))}
                    </select>
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
