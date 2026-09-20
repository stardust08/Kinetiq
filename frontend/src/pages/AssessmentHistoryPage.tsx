import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMyAssessments } from '../api/posture';
import { bookingAPI } from '../api/bookings';
import AssessmentHistory from '../components/posture/AssessmentHistory';
import { Breadcrumb } from '../components/layout/Breadcrumb';

/**
 * AssessmentHistoryPage
 * 
 * Page component for viewing all posture assessments across all bookings.
 * Supports filtering by booking via URL query parameter.
 * 
 * URL: /assessments?bookingId=xxx (optional)
 */
export default function AssessmentHistoryPage() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('bookingId') || undefined;

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery({
    queryKey: ['posture-assessments', bookingId],
    queryFn: () => getMyAssessments({ bookingId }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => bookingAPI.getAll(),
    staleTime: 2 * 60 * 1000,
  });

  // Only block on assessments — bookings are just for the filter dropdown
  // and can populate in the background without delaying the main content.
  const isLoading = assessmentsLoading;

  return (
    <div className="min-h-screen bg-[#030712] py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { label: 'Assessments' }
          ]}
          className="mb-6"
        />
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            Assessment History
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            View and compare your posture analysis assessments
          </p>
        </div>

        <AssessmentHistory 
          assessments={assessments}
          bookings={bookings}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
