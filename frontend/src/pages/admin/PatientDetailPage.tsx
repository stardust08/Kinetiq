import ClinicianPatientDetailPage from '../clinician/PatientDetailPage';

/**
 * The admin view of a patient record.
 *
 * Deliberately the same component. The two views differ only in scope - an admin sees
 * every booking, a clinician only their own - and that difference is enforced by the
 * server, not by the page. Two near-identical components would drift apart within a
 * release, and the one nobody was looking at would be the one that stopped showing a
 * section.
 */
export default ClinicianPatientDetailPage;
