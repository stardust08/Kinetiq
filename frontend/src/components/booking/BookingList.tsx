import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBookings, BOOKINGS_QUERY_KEY } from '../../hooks/useBookings';
import { Booking, BookingStatus } from '../../types';
import { Button } from '../../app/components/ui/button';
import { Card, CardContent } from '../../app/components/ui/card';
import { toast } from 'sonner';
import { Package, RefreshCw, AlertCircle } from 'lucide-react';
import BookingCard from './BookingCard';
import { BookingSkeletonList } from '../skeletons/BookingSkeleton';
import { cancelBooking } from '../../api/bookings';

type StatusFilter = 'all' | BookingStatus;

interface BookingListProps {
  onPayRemaining?: (paymentId: string, bookingId: string) => void;
  payingRemaining?: string | null;
  onViewDetails?: (booking: Booking) => void;
  onCompletePayment?: (paymentId: string, bookingId: string) => void;
  completingPayment?: string | null;
}

export default function BookingList({
  onPayRemaining,
  payingRemaining,
  onViewDetails,
  onCompletePayment,
  completingPayment,
}: BookingListProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: bookings, isLoading, error, refetch, isRefetching } = useBookings();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onMutate: (bookingId) => {
      setCancellingBookingId(bookingId);
    },
    onSuccess: () => {
      toast.success('Booking cancelled successfully');
      queryClient.invalidateQueries({ queryKey: BOOKINGS_QUERY_KEY });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to cancel booking');
    },
    onSettled: () => {
      setCancellingBookingId(null);
    },
  });

  const handleRefresh = () => {
    refetch();
    toast.info('Refreshing bookings...');
  };

  const handleStartAssessment = useCallback((bookingId: string) => {
    navigate(`/posture-analysis?bookingId=${bookingId}`);
  }, [navigate]);

  const filteredBookings = statusFilter === 'all'
    ? bookings || []
    : (bookings || []).filter(b => b.status?.toUpperCase() === statusFilter.toUpperCase());

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All Bookings' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'CONFIRMED', label: 'Confirmed' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between flex-wrap gap-4 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="space-y-2">
            <div className="h-8 w-48 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="h-4 w-32 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
          <Button variant="outline" size="sm" disabled>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Filter Skeleton */}
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <Button
              key={option.value}
              variant="outline"
              size="sm"
              disabled
            >
              {option.label}
            </Button>
          ))}
        </div>

        {/* Bookings Skeleton */}
        <BookingSkeletonList count={3} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="py-12 text-center rounded-2xl" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
        <AlertCircle className="h-16 w-16 mx-auto text-red-400 mb-4" />
        <p className="text-red-400 text-lg mb-2 font-semibold">
          Failed to load bookings
        </p>
        <p className="text-slate-400 mb-4">
          {error.message || 'An error occurred while fetching your bookings'}
        </p>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  // Empty state
  if (!bookings || bookings.length === 0) {
    return (
      <div className="py-12 text-center rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <Package className="h-16 w-16 mx-auto text-slate-600 mb-4" />
        <p className="text-slate-300 text-lg mb-2 font-semibold">
          No bookings found
        </p>
        <p className="text-slate-500 mb-4">
          You haven't made any bookings yet. Browse our services to get started.
        </p>
        <Button onClick={() => navigate('/')}>Browse Services</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-4 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-sm text-slate-400">
          {statusFilter === 'all'
            ? `${bookings?.length || 0} ${bookings?.length === 1 ? 'booking' : 'bookings'} found`
            : `${filteredBookings.length} of ${bookings?.length || 0} bookings`}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2">
        {statusOptions.map((option) => (
          <Button
            key={option.value}
            variant={statusFilter === option.value ? 'default' : 'outline'}
            onClick={() => setStatusFilter(option.value)}
            size="sm"
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Filtered Bookings List */}
      {filteredBookings.length === 0 ? (
        <div className="py-12 text-center rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Package className="h-16 w-16 mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 text-lg mb-4">
            No {statusFilter.toLowerCase()} bookings found
          </p>
          <Button
            variant="outline"
            onClick={() => setStatusFilter('all')}
          >
            View All Bookings
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 items-stretch">
          {filteredBookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onPayRemaining={onPayRemaining}
              payingRemaining={payingRemaining === booking.id}
              onViewDetails={onViewDetails}
              onStartAssessment={handleStartAssessment}
              onCancelBooking={(id) => cancelMutation.mutate(id)}
              cancellingBooking={cancellingBookingId === booking.id}
              onCompletePayment={onCompletePayment}
              completingPayment={completingPayment === booking.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
