import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DashboardShell, { StatTile, card, tileGrid } from '../../components/dashboard/DashboardShell';
import { getBookings, getStats } from '../../api/admin';
import { adminNav } from './navigation';

/**
 * Platform overview.
 *
 * The two numbers that are actually work rather than trivia are highlighted:
 * unassigned bookings (nobody can deliver them, and they cannot host a consultation)
 * and plans awaiting review (each is a patient who cannot see their programme).
 */
export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getStats,
    refetchInterval: 60_000,
  });

  const { data: unassigned } = useQuery({
    queryKey: ['admin', 'bookings', 'unassigned'],
    queryFn: () => getBookings({ unassignedOnly: true, limit: 8 }),
  });

  return (
    <DashboardShell
      title="Platform overview"
      subtitle="Everything across patients, clinicians and screenings."
      nav={adminNav(stats?.bookings.unassigned ?? 0)}
    >
      {isLoading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>}

      {stats && (
        <>
          <section style={{ display: 'grid', gap: 10 }}>
            <h2 style={{ fontSize: 15, margin: 0, color: '#475569' }}>Needs attention</h2>
            <div style={tileGrid}>
              <StatTile
                label="Unassigned bookings"
                value={stats.bookings.unassigned}
                hint="Paid, upcoming, no clinician"
                emphasis={stats.bookings.unassigned ? 'attention' : 'good'}
              />
              <StatTile
                label="Plans awaiting review"
                value={stats.exercisePlans.awaitingReview}
                hint="Patients cannot see these yet"
                emphasis={stats.exercisePlans.awaitingReview ? 'attention' : 'good'}
              />
              <StatTile
                label="Consultations live"
                value={stats.consultations.live}
                hint="Running right now"
                emphasis={stats.consultations.live ? 'good' : 'neutral'}
              />
            </div>
          </section>

          <section style={{ display: 'grid', gap: 10 }}>
            <h2 style={{ fontSize: 15, margin: 0, color: '#475569' }}>People</h2>
            <div style={tileGrid}>
              <StatTile label="Patients" value={stats.users.patients} />
              <StatTile label="Clinicians" value={stats.users.clinicians} />
              <StatTile label="Administrators" value={stats.users.admins} />
              <StatTile label="New this week" value={stats.users.newThisWeek} />
            </div>
          </section>

          <section style={{ display: 'grid', gap: 10 }}>
            <h2 style={{ fontSize: 15, margin: 0, color: '#475569' }}>Bookings</h2>
            <div style={tileGrid}>
              <StatTile label="Today" value={stats.bookings.today} />
              <StatTile label="Upcoming" value={stats.bookings.upcoming} />
              <StatTile label="Confirmed" value={stats.bookings.confirmed} />
              <StatTile label="Completed" value={stats.bookings.completed} />
              <StatTile label="Cancelled" value={stats.bookings.cancelled} />
            </div>
          </section>

          <section style={{ display: 'grid', gap: 10 }}>
            <h2 style={{ fontSize: 15, margin: 0, color: '#475569' }}>Screenings</h2>
            <div style={tileGrid}>
              <StatTile label="Posture" value={stats.screenings.posture} />
              <StatTile label="Walking" value={stats.screenings.gait} />
              <StatTile label="Joint range" value={stats.screenings.rom} />
              <StatTile label="This week" value={stats.screenings.thisWeek} />
            </div>
          </section>

          <section style={{ ...card, display: 'grid', gap: 10 }}>
            <div style={{ alignItems: 'baseline', display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>Bookings needing a clinician</h2>
              <Link to="/admin/bookings" style={{ color: '#0e7490', fontSize: 13, textDecoration: 'none' }}>
                All bookings →
              </Link>
            </div>
            {!unassigned?.bookings.length ? (
              <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
                Every upcoming booking has a clinician assigned.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {unassigned.bookings.map((booking) => (
                  <div
                    key={booking.id}
                    style={{
                      alignItems: 'center',
                      border: '1px solid #fcd34d',
                      background: '#fffbeb',
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
                        {booking.patient?.name ?? booking.patient?.phone ?? 'Patient'}
                      </strong>
                      <p style={{ color: '#78350f', fontSize: 13, margin: '2px 0 0' }}>
                        {new Date(booking.time).toLocaleString()} · {booking.service?.name}
                      </p>
                    </div>
                    <Link
                      to="/admin/bookings?unassigned=1"
                      style={{
                        background: '#b45309',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '7px 12px',
                        textDecoration: 'none',
                      }}
                    >
                      Assign
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </DashboardShell>
  );
}
