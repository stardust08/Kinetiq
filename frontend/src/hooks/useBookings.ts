import { useQuery, UseQueryResult } from '@tanstack/react-query';
import * as bookingApi from '../api/bookings';
import { Booking } from '../types';

/**
 * Query key for bookings
 */
export const BOOKINGS_QUERY_KEY = ['bookings'];

/**
 * Custom hook for fetching user bookings with React Query
 * Provides automatic caching, refetching, and loading states
 */
export const useBookings = (): UseQueryResult<Booking[], Error> => {
  return useQuery<Booking[], Error>({
    queryKey: BOOKINGS_QUERY_KEY,
    queryFn: bookingApi.getAll,
    staleTime: 0,           // always refetch — bookings are derived from cart + DB state
    refetchOnMount: true,   // ensures fresh data every time My Bookings is opened
  });
};
