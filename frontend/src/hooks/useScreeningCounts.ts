import { useQuery, UseQueryResult } from '@tanstack/react-query';
import * as bookingApi from '../api/bookings';
import { Booking } from '../types';

/**
 * Screening count summary across all user bookings
 */
export interface ScreeningCountSummary {
  /** Total screening counts allocated across all bookings */
  totalAllocated: number;
  /** Total screening counts used across all bookings */
  totalUsed: number;
  /** Total screening counts remaining across all bookings */
  totalRemaining: number;
  /** Number of bookings with remaining counts > 0 */
  bookingsWithCounts: number;
  /** All bookings with screening count details */
  bookings: Booking[];
}

/**
 * Query key for screening counts summary
 */
export const getScreeningCountsQueryKey = () => ['screening-counts-summary'];

/**
 * Calculate screening count summary from bookings data
 * @param bookings - Array of bookings with screening count information
 * @returns Screening count summary object
 */
const calculateScreeningCountSummary = (bookings: Booking[]): ScreeningCountSummary => {
  const totalAllocated = bookings.reduce(
    (sum, booking) => sum + (booking.totalScreeningCount || 0),
    0
  );
  
  const totalUsed = bookings.reduce(
    (sum, booking) => sum + (booking.usedScreeningCount || 0),
    0
  );
  
  const totalRemaining = bookings.reduce(
    (sum, booking) => sum + (booking.remainingScreeningCount || 0),
    0
  );
  
  const bookingsWithCounts = bookings.filter(
    (booking) => (booking.remainingScreeningCount || 0) > 0
  ).length;
  
  return {
    totalAllocated,
    totalUsed,
    totalRemaining,
    bookingsWithCounts,
    bookings,
  };
};

/**
 * Custom hook for fetching screening count summary across all user bookings
 * 
 * Features:
 * - Fetches all user bookings with screening counts
 * - Calculates total allocated, used, and remaining counts
 * - Counts bookings with remaining screening counts
 * - Automatically caches results with React Query
 * - Handles loading and error states
 * - Updates automatically when bookings change
 * 
 * @returns Query result with screening count summary, loading state, and error
 * 
 * @example
 * ```tsx
 * const { data: summary, isLoading, error, refetch } = useScreeningCounts();
 * 
 * if (isLoading) return <Spinner />;
 * if (error) return <ErrorMessage error={error} />;
 * 
 * return (
 *   <div>
 *     <p>Total Remaining: {summary.totalRemaining}</p>
 *     <p>Total Used: {summary.totalUsed} / {summary.totalAllocated}</p>
 *     <p>Bookings with Counts: {summary.bookingsWithCounts}</p>
 *   </div>
 * );
 * ```
 * 
 * @example
 * ```tsx
 * // After completing an analysis, refetch to update counts
 * const { refetch } = useScreeningCounts();
 * 
 * const handleAnalysisComplete = async () => {
 *   await finalizeAnalysis();
 *   await refetch(); // Update counts after analysis
 * };
 * ```
 */
export const useScreeningCounts = (): UseQueryResult<ScreeningCountSummary, Error> => {
  return useQuery<ScreeningCountSummary, Error>({
    queryKey: getScreeningCountsQueryKey(),
    queryFn: async () => {
      const bookings = await bookingApi.getAll();
      return calculateScreeningCountSummary(bookings);
    },
    staleTime: 1000 * 60 * 2, // 2 minutes - shorter since counts change frequently
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnMount: true, // Refetch when component mounts
  });
};
