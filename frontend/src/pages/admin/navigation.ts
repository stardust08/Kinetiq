import type { DashboardNavItem } from '../../components/dashboard/DashboardShell';

/**
 * The admin area's navigation.
 *
 * `unassignedCount` is the queue that has to be kept empty: a paid, upcoming booking
 * with no clinician on it cannot host a consultation, so nobody can deliver it.
 */
export const adminNav = (unassignedCount = 0): DashboardNavItem[] => [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/patients', label: 'Patients' },
  { to: '/admin/clinicians', label: 'Clinicians' },
  { to: '/admin/bookings', label: 'Bookings', badge: unassignedCount },
  { to: '/admin/exercises', label: 'Exercise library' },
];
