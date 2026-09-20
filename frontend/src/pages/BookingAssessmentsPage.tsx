import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bookingAPI } from '../api/bookings';
import { getMyAssessments } from '../api/posture';
import AssessmentHistory from '../components/posture/AssessmentHistory';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { BackButton } from '../components/layout/BackButton';

export default function BookingAssessmentsPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();

  const { data: booking, isLoading: bookingLoading, error } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => bookingAPI.getById(bookingId!),
    enabled: !!bookingId,
  });

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery({
    queryKey: ['posture-assessments', bookingId],
    queryFn: () => getMyAssessments({ bookingId }),
    enabled: !!bookingId,
  });

  const isLoading = bookingLoading || assessmentsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#030712] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-white/10" />
              <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-[#2F86C7] border-t-transparent animate-spin" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-[#030712] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl p-8 text-center"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <h2 className="text-xl font-semibold text-red-400 mb-2">Booking Not Found</h2>
            <p className="text-red-400/70 mb-6">
              {error instanceof Error ? error.message : 'Unable to load booking details'}
            </p>
            <button
              onClick={() => navigate('/bookings')}
              className="px-6 py-2.5 rounded-xl bg-[#2F86C7] text-white font-semibold hover:bg-[#2570a8] transition-colors"
            >
              Back to Bookings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { label: 'Bookings', href: '/bookings' },
            { label: booking.service?.name || 'Booking Assessments' }
          ]}
          className="mb-4"
        />
        <div className="mb-6">
          <BackButton to="/bookings" label="Back to Bookings" />

          <div className="rounded-2xl p-6 mt-4"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
            <h1 className="text-2xl font-bold text-white mb-3">
              {booking.service?.name || 'Booking'} — Assessments
            </h1>
            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-400">
              <div>
                <span className="font-medium text-slate-300">Booking Date:</span>{' '}
                {/* null for draft bookings; new Date(null) renders 1 Jan 1970 */}
                {booking.time
                  ? new Date(booking.time).toLocaleDateString()
                  : 'Not scheduled yet'}
              </div>
              <div>
                <span className="font-medium text-slate-300">Status:</span>{' '}
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  booking.status === 'CONFIRMED'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                    : booking.status === 'COMPLETED'
                    ? 'bg-[#2F86C7]/15 text-[#60b5e8] border border-[#2F86C7]/25'
                    : 'bg-white/5 text-slate-400 border border-white/10'
                }`}>
                  {booking.status}
                </span>
              </div>
              {booking.totalScreeningCount !== undefined && (
                <div>
                  <span className="font-medium text-slate-300">Screening Counts:</span>{' '}
                  <span className="text-[#60b5e8] font-semibold">
                    {booking.remainingScreeningCount} / {booking.totalScreeningCount}
                  </span>{' '}remaining
                </div>
              )}
            </div>
          </div>
        </div>

        <AssessmentHistory
          assessments={assessments}
          bookings={booking ? [booking] : []}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
