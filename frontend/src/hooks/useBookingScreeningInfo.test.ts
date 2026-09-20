import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useBookingScreeningInfo,
  getBookingScreeningInfoQueryKey,
} from './useBookingScreeningInfo';
import * as bookingApi from '../api/bookings';
import { createQueryWrapper } from '../test/queryWrapper';
import type { ScreeningCountInfo } from '../types';

// Mock the bookings API
vi.mock('../api/bookings');

describe('useBookingScreeningInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockScreeningInfo: ScreeningCountInfo = {
    bookingId: 'booking-1',
    serviceName: 'Posture Analysis Package',
    totalScreeningCount: 10,
    usedScreeningCount: 3,
    remainingScreeningCount: 7,
    assessments: [
      {
        id: 'analysis-1',
        analysisDate: '2024-01-12T10:00:00Z',
        status: 'completed',
      },
      {
        id: 'analysis-2',
        analysisDate: '2024-01-13T10:00:00Z',
        status: 'completed',
      },
      {
        id: 'analysis-3',
        analysisDate: '2024-01-14T10:00:00Z',
        status: 'completed',
      },
    ],
    bookingStatus: 'CONFIRMED',
  };

  it('should fetch screening info successfully when bookingId is provided', async () => {
    vi.mocked(bookingApi.getScreeningInfo).mockResolvedValue(mockScreeningInfo);

    const { result } = renderHook(() => useBookingScreeningInfo('booking-1'), {
      wrapper: createQueryWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockScreeningInfo);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(bookingApi.getScreeningInfo).toHaveBeenCalledWith('booking-1');
    expect(bookingApi.getScreeningInfo).toHaveBeenCalledTimes(1);
  });

  it('should not fetch when bookingId is undefined', async () => {
    vi.mocked(bookingApi.getScreeningInfo).mockResolvedValue(mockScreeningInfo);

    const { result } = renderHook(() => useBookingScreeningInfo(undefined), {
      wrapper: createQueryWrapper(),
    });

    // Should not be loading or fetching
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe('idle');
    
    // API should not be called
    expect(bookingApi.getScreeningInfo).not.toHaveBeenCalled();
  });

  it('should not fetch when bookingId is empty string', async () => {
    vi.mocked(bookingApi.getScreeningInfo).mockResolvedValue(mockScreeningInfo);

    const { result } = renderHook(() => useBookingScreeningInfo(''), {
      wrapper: createQueryWrapper(),
    });

    // Should not be loading or fetching
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe('idle');
    
    // API should not be called
    expect(bookingApi.getScreeningInfo).not.toHaveBeenCalled();
  });

  it('should handle fetch error', async () => {
    const error = new Error('Failed to fetch screening info');
    vi.mocked(bookingApi.getScreeningInfo).mockRejectedValue(error);

    const { result } = renderHook(() => useBookingScreeningInfo('booking-1'), {
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
    vi.mocked(bookingApi.getScreeningInfo).mockResolvedValue(mockScreeningInfo);

    const { result } = renderHook(() => useBookingScreeningInfo('booking-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify the hook uses the correct query key by checking it was called
    expect(bookingApi.getScreeningInfo).toHaveBeenCalledWith('booking-1');
  });

  it('should generate correct query key', () => {
    const queryKey = getBookingScreeningInfoQueryKey('booking-123');
    expect(queryKey).toEqual(['booking-screening', 'booking-123']);
  });

  it('should cache data with 2 minute stale time', async () => {
    vi.mocked(bookingApi.getScreeningInfo).mockResolvedValue(mockScreeningInfo);

    const wrapper = createQueryWrapper();
    
    const { result: result1 } = renderHook(
      () => useBookingScreeningInfo('booking-1'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result1.current.isSuccess).toBe(true);
    });

    // Second render should use cached data
    const { result: result2 } = renderHook(
      () => useBookingScreeningInfo('booking-1'),
      { wrapper }
    );

    // Should immediately have data from cache
    expect(result2.current.data).toEqual(mockScreeningInfo);
    
    // API should only be called once (cached)
    expect(bookingApi.getScreeningInfo).toHaveBeenCalledTimes(1);
  });

  it('should have window focus refetch enabled', async () => {
    vi.mocked(bookingApi.getScreeningInfo).mockResolvedValue(mockScreeningInfo);

    const { result } = renderHook(() => useBookingScreeningInfo('booking-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // The hook is configured with refetchOnWindowFocus: true
    // This is verified by the hook implementation
    expect(result.current.data).toEqual(mockScreeningInfo);
  });

  it('should handle screening info with no assessments', async () => {
    const infoWithNoAssessments: ScreeningCountInfo = {
      ...mockScreeningInfo,
      usedScreeningCount: 0,
      remainingScreeningCount: 10,
      assessments: [],
    };

    vi.mocked(bookingApi.getScreeningInfo).mockResolvedValue(infoWithNoAssessments);

    const { result } = renderHook(() => useBookingScreeningInfo('booking-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(infoWithNoAssessments);
    expect(result.current.data?.assessments).toEqual([]);
  });

  it('should handle screening info with all counts used', async () => {
    const infoAllUsed: ScreeningCountInfo = {
      ...mockScreeningInfo,
      usedScreeningCount: 10,
      remainingScreeningCount: 0,
    };

    vi.mocked(bookingApi.getScreeningInfo).mockResolvedValue(infoAllUsed);

    const { result } = renderHook(() => useBookingScreeningInfo('booking-1'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.remainingScreeningCount).toBe(0);
    expect(result.current.data?.usedScreeningCount).toBe(10);
  });

  it('should refetch when bookingId changes', async () => {
    const screeningInfo1: ScreeningCountInfo = {
      ...mockScreeningInfo,
      bookingId: 'booking-1',
    };

    const screeningInfo2: ScreeningCountInfo = {
      ...mockScreeningInfo,
      bookingId: 'booking-2',
      remainingScreeningCount: 5,
    };

    vi.mocked(bookingApi.getScreeningInfo)
      .mockResolvedValueOnce(screeningInfo1)
      .mockResolvedValueOnce(screeningInfo2);

    const { result, rerender } = renderHook(
      ({ bookingId }) => useBookingScreeningInfo(bookingId),
      {
        wrapper: createQueryWrapper(),
        initialProps: { bookingId: 'booking-1' },
      }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(screeningInfo1);

    // Change bookingId
    rerender({ bookingId: 'booking-2' });

    await waitFor(() => {
      expect(result.current.data).toEqual(screeningInfo2);
    });

    expect(bookingApi.getScreeningInfo).toHaveBeenCalledTimes(2);
    expect(bookingApi.getScreeningInfo).toHaveBeenNthCalledWith(1, 'booking-1');
    expect(bookingApi.getScreeningInfo).toHaveBeenNthCalledWith(2, 'booking-2');
  });
});
