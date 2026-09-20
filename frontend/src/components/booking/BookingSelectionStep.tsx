import { useState } from 'react';
import { isScreenable, screenableBookings } from '../../lib/screenableBooking';
import { useBookings } from '../../hooks/useBookings';
import BookingSelector from './BookingSelector';
import NoBookingsState from './NoBookingsState';
import NoCountsState from './NoCountsState';
import { Button } from '../../app/components/ui/button';
import { Loader2 } from 'lucide-react';

interface BookingSelectionStepProps {
  onBookingSelected: (bookingId: string) => void;
  preSelectedBookingId?: string;
}

/**
 * BookingSelectionStep Component
 * 
 * Step 1 of the posture analysis flow - allows users to select a booking
 * with remaining screening counts before starting their assessment.
 * 
 * Features:
 * - Fetches user bookings with screening count information
 * - Displays loading state while fetching data
 * - Handles error states with retry functionality
 * - Shows appropriate empty states (no bookings or no counts)
 * - Integrates BookingSelector for booking selection
 * - Provides "Continue" button to proceed to next step
 * 
 * @param onBookingSelected - Callback when user confirms booking selection
 * @param preSelectedBookingId - Optional pre-selected booking ID from URL
 */
export default function BookingSelectionStep({
  onBookingSelected,
  preSelectedBookingId,
}: BookingSelectionStepProps) {
  const { data: bookings, isLoading, error, refetch } = useBookings();
  const [selectedBookingId, setSelectedBookingId] = useState<string | undefined>(
    preSelectedBookingId
  );

  // Handle booking selection
  const handleSelectBooking = (bookingId: string) => {
    setSelectedBookingId(bookingId);
  };

  // Handle continue button click
  const handleContinue = () => {
    if (selectedBookingId) {
      onBookingSelected(selectedBookingId);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-slate-400">Loading your bookings...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-lg p-6 text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
        <div className="mb-4">
          <svg
            className="h-12 w-12 mx-auto text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-red-400 mb-2">
          Failed to Load Bookings
        </h3>
        <p className="text-red-400/80 mb-4">
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  // No bookings state
  if (!bookings || bookings.length === 0) {
    return <NoBookingsState />;
  }

  // Check if any bookings have remaining counts
  const hasBookingsWithCounts = bookings.some(
    (booking) => isScreenable(booking)
  );

  // No counts remaining state
  if (!hasBookingsWithCounts) {
    return <NoCountsState bookings={bookings} />;
  }

  // Main booking selection UI
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Select a Booking
        </h2>
        <p className="text-slate-400">
          Choose which booking to use for this posture assessment. One screening count will be deducted upon successful completion.
        </p>
      </div>

      {/* Booking Selector */}
      <BookingSelector
        bookings={bookings}
        selectedBookingId={selectedBookingId}
        onSelectBooking={handleSelectBooking}
      />

      {/* Continue Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleContinue}
          disabled={!selectedBookingId}
          size="lg"
          className="min-w-[200px]"
        >
          Continue to Instructions
        </Button>
      </div>
    </div>
  );
}
