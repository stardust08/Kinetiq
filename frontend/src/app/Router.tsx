import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import HomePage from '../pages/HomePage';
import CheckoutPage from '../pages/CheckoutPage';
import BookingsPage from '../pages/BookingsPage';
import ProfilePage from '../pages/ProfilePage';
import PostureAnalysisPage from '../pages/PostureAnalysisPage';
import AssessmentHistoryPage from '../pages/AssessmentHistoryPage';
import AssessmentDetailPage from '../pages/AssessmentDetailPage';
import BookingAssessmentsPage from '../pages/BookingAssessmentsPage';
import NotFoundPage from '../pages/NotFoundPage';
import GaitAnalysisPage from '../pages/GaitAnalysisPage';

/**
 * ProtectedRoute component that redirects to home if user is not authenticated
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

/**
 * Main application router with BrowserRouter
 * Defines all routes including protected routes and 404 handling
 */
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        
        {/* Protected routes - require authentication */}
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
        
        <Route
          path="/gait-analysis"
          element={
            <ProtectedRoute>
              <GaitAnalysisPage />
            </ProtectedRoute>
          }
        />

        {/* 404 route - catch all unmatched routes */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
