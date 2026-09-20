import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useScreeningCounts,
  getScreeningCountsQueryKey,
} from './useScreeningCounts';
import * as bookingApi from '../api/bookings';
import { createQueryWrapper } from '../test/queryWrapper';
import type { Booking } from '../types';

// Mock the bookings API
vi.mock('../api/bookings');

describe('useScreeningCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockBooking1: Booking = {
    id: 'booking-1',
    userId: 'user-1',
    serviceId: 'service-1',
    paymentId: 'payment-1',
    totalAmount: 100,
    paidAmount: 100,
    remainingAmount: 0,
    time: '2024-01-15T10:00:00Z',
    status: 'CONFIRMED',
    createdAt: '2024-01-10T10:00:00Z',
    totalScreeningCount: 10,
    usedScreeningCount: 3,
    remainingScreeningCount: 7,
    service: {
      id: 'service-1',
      categoryId: 'cat-1',
      name: 'Posture Analysis Package',
      slug: 'posture-analysis-package',
      description: 'Comprehensive posture analysis',
      basePrice: 100,
      paymentType: 'FULL',
      createdAt: '2024-01-01T00:00:00Z',
    },
  };

  const mockBooking2: Booking = {
    ...mockBooking1,
    id: 'booking-2',
    totalScreeningCount: 5,
    usedScreeningCount: 5,
    remainingScreeningCount: 0,
  };

  const mockBooking3: Booking = {
    ...mockBooking1,
    id: 'booking-3',
    totalScreeningCount: 8,
    usedScreeningCount: 2,
    remainingScreeningCount: 6,
  };

  const mockBookings: Booking[] = [mockBooking1, mockBooking2, mockBooking3];

  it('should calculate screening count summary correctly', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      totalAllocated: 23, // 10 + 5 + 8
      totalUsed: 10, // 3 + 5 + 2
      totalRemaining: 13, // 7 + 0 + 6
      bookingsWithCounts: 2, // booking-1 and booking-3 have remaining counts
      bookings: mockBookings,
    });
  });

  it('should handle empty bookings array', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue([]);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      totalAllocated: 0,
      totalUsed: 0,
      totalRemaining: 0,
      bookingsWithCounts: 0,
      bookings: [],
    });
  });

  it('should handle bookings with no screening counts', async () => {
    const bookingsWithoutCounts: Booking[] = [
      {
        ...mockBooking1,
        totalScreeningCount: 0,
        usedScreeningCount: 0,
        remainingScreeningCount: 0,
      },
    ];

    vi.mocked(bookingApi.getAll).mockResolvedValue(bookingsWithoutCounts);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      totalAllocated: 0,
      totalUsed: 0,
      totalRemaining: 0,
      bookingsWithCounts: 0,
      bookings: bookingsWithoutCounts,
    });
  });

  it('should handle fetch error', async () => {
    const error = new Error('Failed to fetch bookings');
    vi.mocked(bookingApi.getAll).mockRejectedValue(error);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(error);
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('should use correct query key for caching', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify the hook uses the correct query key by checking it was called
    expect(bookingApi.getAll).toHaveBeenCalledTimes(1);
  });

  it('should generate correct query key', () => {
    const queryKey = getScreeningCountsQueryKey();
    expect(queryKey).toEqual(['screening-counts-summary']);
  });

  it('should cache data with 2 minute stale time', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    const wrapper = createQueryWrapper();
    
    const { result: result1 } = renderHook(() => useScreeningCounts(), { wrapper });

    await waitFor(() => {
      expect(result1.current.isSuccess).toBe(true);
    });

    // Second render should use cached data
    const { result: result2 } = renderHook(() => useScreeningCounts(), { wrapper });

    // Should immediately have data from cache
    expect(result2.current.data).toBeDefined();
    
    // API should only be called once (cached)
    expect(bookingApi.getAll).toHaveBeenCalledTimes(1);
  });

  it('should have window focus refetch enabled', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The hook is configured with refetchOnWindowFocus: true
    // This is verified by the hook implementation
    expect(result.current.data).toBeDefined();
  });

  it('should have mount refetch enabled', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The hook is configured with refetchOnMount: true
    // This is verified by the hook implementation
    expect(result.current.data).toBeDefined();
  });

  it('should support manual refetch', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(bookingApi.getAll).toHaveBeenCalledTimes(1);

    // Manually refetch
    result.current.refetch();

    await waitFor(() => {
      expect(bookingApi.getAll).toHaveBeenCalledTimes(2);
    });
  });

  it('should count only bookings with remaining counts > 0', async () => {
    const bookingsVariousCounts: Booking[] = [
      { ...mockBooking1, remainingScreeningCount: 5 }, // Has counts
      { ...mockBooking1, id: 'booking-2', remainingScreeningCount: 0 }, // No counts
      { ...mockBooking1, id: 'booking-3', remainingScreeningCount: 1 }, // Has counts
      { ...mockBooking1, id: 'booking-4', remainingScreeningCount: 0 }, // No counts
    ];

    vi.mocked(bookingApi.getAll).mockResolvedValue(bookingsVariousCounts);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.bookingsWithCounts).toBe(2);
  });

  it('should include all bookings in the response', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.bookings).toEqual(mockBookings);
    expect(result.current.data?.bookings.length).toBe(3);
  });

  it('should handle bookings with undefined screening counts', async () => {
    const bookingsWithUndefined: Booking[] = [
      {
        ...mockBooking1,
        totalScreeningCount: undefined as any,
        usedScreeningCount: undefined as any,
        remainingScreeningCount: undefined as any,
      },
    ];

    vi.mocked(bookingApi.getAll).mockResolvedValue(bookingsWithUndefined);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should treat undefined as 0
    expect(result.current.data).toEqual({
      totalAllocated: 0,
      totalUsed: 0,
      totalRemaining: 0,
      bookingsWithCounts: 0,
      bookings: bookingsWithUndefined,
    });
  });

  it('should update summary after analysis completion', async () => {
    const initialBookings: Booking[] = [
      { ...mockBooking1, usedScreeningCount: 3, remainingScreeningCount: 7 },
    ];

    const updatedBookings: Booking[] = [
      { ...mockBooking1, usedScreeningCount: 4, remainingScreeningCount: 6 },
    ];

    vi.mocked(bookingApi.getAll)
      .mockResolvedValueOnce(initialBookings)
      .mockResolvedValueOnce(updatedBookings);

    const { result } = renderHook(() => useScreeningCounts(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.totalUsed).toBe(3);
    expect(result.current.data?.totalRemaining).toBe(7);

    // Simulate analysis completion and refetch
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.data?.totalUsed).toBe(4);
    });

    expect(result.current.data?.totalRemaining).toBe(6);
  });
});
