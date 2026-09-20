import { useQuery, UseQueryResult } from '@tanstack/react-query';
import * as bookingApi from '../api/bookings';
import { ScreeningCountInfo } from '../types';

/**
 * Query key factory for booking screening info
 * @param bookingId - The booking ID to create a query key for
 */
export const getBookingScreeningInfoQueryKey = (bookingId: string) => [
  'booking-screening',
  bookingId,
];

/**
 * Custom hook for fetching detailed screening info for a specific booking
 * 
 * Features:
 * - Fetches screening count details (total, used, remaining)
 * - Includes assessment history for the booking
 * - Automatically caches results with React Query
 * - Only fetches when bookingId is provided (enabled: !!bookingId)
 * - Handles loading and error states
 * 
 * @param bookingId - UUID of the booking to fetch screening info for
 * @returns Query result with screening info, loading state, and error
 * 
 * @example
 * ```tsx
 * const { data: screeningInfo, isLoading, error } = useBookingScreeningInfo(bookingId);
 * 
 * if (isLoading) return <Spinner />;
 * if (error) return <ErrorMessage error={error} />;
 * 
 * return (
 *   <div>
 *     <p>Remaining: {screeningInfo.remainingScreeningCount}</p>
 *     <p>Total: {screeningInfo.totalScreeningCount}</p>
 *   </div>
 * );
 * ```
 */
export const useBookingScreeningInfo = (
  bookingId: string | undefined
): UseQueryResult<ScreeningCountInfo, Error> => {
  return useQuery<ScreeningCountInfo, Error>({
    queryKey: getBookingScreeningInfoQueryKey(bookingId || ''),
    queryFn: () => {
      if (!bookingId) {
        throw new Error('Booking ID is required');
      }
      return bookingApi.getScreeningInfo(bookingId);
    },
    enabled: !!bookingId, // Only fetch when bookingId is provided
    staleTime: 1000 * 60 * 2, // 2 minutes - shorter than bookings since counts change
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });
};
