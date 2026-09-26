import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuthStore } from '../store/authStore';
import type { UserRole } from '../types';
import { ROLE, homePathForRole, roleLabel } from '../types/roles';
import HomePage from '../pages/HomePage';
import CheckoutPage from '../pages/CheckoutPage';
import BookingsPage from '../pages/BookingsPage';
import ProfilePage from '../pages/ProfilePage';
import PostureAnalysisPage from '../pages/PostureAnalysisPage';
import AssessmentHistoryPage from '../pages/AssessmentHistoryPage';
import AssessmentDetailPage from '../pages/AssessmentDetailPage';
import BookingAssessmentsPage from '../pages/BookingAssessmentsPage';
import NotFoundPage from '../pages/NotFoundPage';
import ROMAnalysisPage from '../pages/ROMAnalysisPage';
import GaitAnalysisPage from '../pages/GaitAnalysisPage';

// The staff areas are split out of the main bundle. A patient - most of the traffic -
// never opens them, and the admin dashboard pulls in tables and charts a patient has no
// use for downloading.
const ConsultationPage = lazy(() => import('../pages/ConsultationPage'));
const MyExercisePlanPage = lazy(() => import('../pages/MyExercisePlanPage'));
const ClinicianDashboardPage = lazy(() => import('../pages/clinician/DashboardPage'));
const ClinicianSchedulePage = lazy(() => import('../pages/clinician/SchedulePage'));
const ClinicianPatientsPage = lazy(() => import('../pages/clinician/PatientsPage'));
const ClinicianPatientDetailPage = lazy(
  () => import('../pages/clinician/PatientDetailPage'),
);
const ClinicianAvailabilityPage = lazy(
  () => import('../pages/clinician/AvailabilityPage'),
);
const PlanReviewPage = lazy(() => import('../pages/clinician/PlanReviewPage'));
const AdminDashboardPage = lazy(() => import('../pages/admin/DashboardPage'));
const AdminPatientsPage = lazy(() => import('../pages/admin/PatientsPage'));
const AdminPatientDetailPage = lazy(() => import('../pages/admin/PatientDetailPage'));
const AdminCliniciansPage = lazy(() => import('../pages/admin/CliniciansPage'));
const AdminBookingsPage = lazy(() => import('../pages/admin/BookingsPage'));
const AdminExercisesPage = lazy(() => import('../pages/admin/ExercisesPage'));

/**
 * Requires a signed-in user of any role.
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

/**
 * Requires one of the listed roles.
 *
 * Three distinct outcomes, and conflating any two of them produces a confusing app:
 *
 *   - not signed in     -> the landing page, where they can sign in
 *   - signed in, wrong role -> their OWN home, not a dead end. A patient who follows a
 *     link to /admin has done nothing wrong and should land somewhere useful.
 *   - right role        -> through
 *
 * This is a convenience, not a security boundary. Every endpoint behind these pages
 * re-checks the role server-side; a user who edits their stored role in devtools gets a
 * dashboard shell that answers 403 to every request it makes.
 */
const RoleRoute = ({
  allow,
  children,
}: {
  allow: readonly UserRole[];
  children: React.ReactNode;
}) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role ?? null);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  if (!role || !allow.includes(role)) {
    return <Navigate to={homePathForRole(role)} replace />;
  }
  return <>{children}</>;
};

const STAFF = [ROLE.CLINICIAN, ROLE.ADMIN] as const;

const RouteFallback = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      color: '#64748b',
      fontSize: 14,
    }}
  >
    Loading…
  </div>
);

/**
 * Sends a signed-in user to the front door for their role.
 *
 * Mounted at `/dashboard` so that anything needing to bounce a user "home" - the
 * RoleRoute above, a post-login redirect - has one place to send them rather than each
 * working out the role themselves.
 */
const RoleHomeRedirect = () => {
  const role = useAuthStore((state) => state.user?.role ?? null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <Navigate to={homePathForRole(role)} replace />;
};

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* ---- Public ------------------------------------------------- */}
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<RoleHomeRedirect />} />

          {/* ---- Patient ----------------------------------------------- */}
          <Route
            path="/checkout"
            element={
              <ProtectedRoute>
                <CheckoutPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <ProtectedRoute>
                <BookingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Screening capture pages.
              Open to every role: a patient performs the capture, and a clinician or
              admin may drive it themselves. Who may START the processing is decided by
              the server - see app/core/screening_gate.py - not by which page loaded. */}
          <Route
            path="/posture-analysis"
            element={
              <ProtectedRoute>
                <PostureAnalysisPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/posture-analysis/:analysisId"
            element={
              <ProtectedRoute>
                <AssessmentDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gait-analysis"
            element={
              <ProtectedRoute>
                <GaitAnalysisPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rom-analysis"
            element={
              <ProtectedRoute>
                <ROMAnalysisPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assessments"
            element={
              <ProtectedRoute>
                <AssessmentHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings/:bookingId/assessments"
            element={
              <ProtectedRoute>
                <BookingAssessmentsPage />
              </ProtectedRoute>
            }
          />

          {/* The exercise programme. Only ever shows plans a clinician has prescribed;
              drafts are filtered out server-side. */}
          <Route
            path="/my-plan"
            element={
              <ProtectedRoute>
                <MyExercisePlanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-plan/:planId"
            element={
              <ProtectedRoute>
                <MyExercisePlanPage />
              </ProtectedRoute>
            }
          />

          {/* ---- Consultation ------------------------------------------ */}
          {/* Every role uses the same room; the server decides what each may do in it.
              Reached by booking id for a patient (who waits for the call to open) and
              by session id for staff (who opened it). */}
          <Route
            path="/consultation/booking/:bookingId"
            element={
              <ProtectedRoute>
                <ConsultationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consultation/:sessionId"
            element={
              <ProtectedRoute>
                <ConsultationPage />
              </ProtectedRoute>
            }
          />

          {/* ---- Clinician --------------------------------------------- */}
          {/* Admins are admitted to the clinician area so they can supervise, except
              where a page writes to the caller's own calendar - availability is a
              clinician-only page because an admin has no calendar of their own. */}
          <Route
            path="/clinician"
            element={
              <RoleRoute allow={STAFF}>
                <ClinicianDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/clinician/schedule"
            element={
              <RoleRoute allow={[ROLE.CLINICIAN]}>
                <ClinicianSchedulePage />
              </RoleRoute>
            }
          />
          <Route
            path="/clinician/patients"
            element={
              <RoleRoute allow={[ROLE.CLINICIAN]}>
                <ClinicianPatientsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/clinician/patients/:patientId"
            element={
              <RoleRoute allow={STAFF}>
                <ClinicianPatientDetailPage />
              </RoleRoute>
            }
          />
          <Route
            path="/clinician/availability"
            element={
              <RoleRoute allow={[ROLE.CLINICIAN]}>
                <ClinicianAvailabilityPage />
              </RoleRoute>
            }
          />
          <Route
            path="/clinician/plans/:planId"
            element={
              <RoleRoute allow={STAFF}>
                <PlanReviewPage />
              </RoleRoute>
            }
          />

          {/* ---- Admin -------------------------------------------------- */}
          <Route
            path="/admin"
            element={
              <RoleRoute allow={[ROLE.ADMIN]}>
                <AdminDashboardPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/patients"
            element={
              <RoleRoute allow={[ROLE.ADMIN]}>
                <AdminPatientsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/patients/:patientId"
            element={
              <RoleRoute allow={[ROLE.ADMIN]}>
                <AdminPatientDetailPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/clinicians"
            element={
              <RoleRoute allow={[ROLE.ADMIN]}>
                <AdminCliniciansPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/bookings"
            element={
              <RoleRoute allow={[ROLE.ADMIN]}>
                <AdminBookingsPage />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/exercises"
            element={
              <RoleRoute allow={[ROLE.ADMIN]}>
                <AdminExercisesPage />
              </RoleRoute>
            }
          />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export { RoleRoute, ProtectedRoute, roleLabel };
