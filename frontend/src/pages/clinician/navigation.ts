import type { DashboardNavItem } from '../../components/dashboard/DashboardShell';

/**
 * The clinician area's navigation.
 *
 * Shared so every page highlights the same tab and a new page cannot be added to one
 * page's nav and forgotten in the others.
 *
 * `reviewCount` is passed in rather than fetched here: it is the number of patients
 * waiting on a prescription, which is the one piece of work a clinician must not miss.
 */
export const clinicianNav = (reviewCount = 0): DashboardNavItem[] => [
  { to: '/clinician', label: 'Overview' },
  { to: '/clinician/schedule', label: 'Schedule' },
  { to: '/clinician/patients', label: 'Patients' },
  { to: '/clinician/availability', label: 'My hours' },
  { to: '/clinician?queue=1', label: 'To review', badge: reviewCount },
];
