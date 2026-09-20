/**
 * Tests for usePostureAnalysis hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePostureAnalysis } from './usePostureAnalysis';
import * as postureApi from '../api/posture';
import { createQueryWrapper } from '../test/queryWrapper';

// Mock the posture API
vi.mock('../api/posture');

describe('usePostureAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with idle state', () => {
      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.step).toBe('idle');
      expect(result.current.sessionId).toBeNull();
      expect(result.current.bookingId).toBeNull();
      expect(result.current.progress).toBe(0);
      expect(result.current.frameCount).toBe(0);
      expect(result.current.error).toBeNull();
      expect(result.current.analysisResult).toBeNull();
      expect(result.current.isProcessing).toBe(false);
    });
  });

  describe('startAnalysis', () => {
    it('should validate booking and start analysis successfully', async () => {
      const mockValidation = {
        valid: true,
        remainingCount: 5,
        totalCount: 10,
        usedCount: 5,
      };

      const mockStartResponse = {
        sessionId: 'session-123',
        bookingId: 'booking-456',
        remainingCount: 5,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('capturing');
      });

      expect(result.current.sessionId).toBe('session-123');
      expect(result.current.bookingId).toBe('booking-456');
      expect(result.current.error).toBeNull();
      expect(postureApi.validateBooking).toHaveBeenCalledWith('booking-456');
      // Check that startAnalysis was called with the correct first argument
      expect(postureApi.startAnalysis).toHaveBeenCalled();
      const callArgs = vi.mocked(postureApi.startAnalysis).mock.calls[0];
      expect(callArgs[0]).toEqual({ bookingId: 'booking-456' });
    });

    it('should handle invalid booking', async () => {
      const mockValidation = {
        valid: false,
        remainingCount: 0,
        totalCount: 10,
        usedCount: 10,
        message: 'No remaining screening counts',
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('error');
      });

      expect(result.current.error).toBe('No remaining screening counts');
      expect(postureApi.startAnalysis).not.toHaveBeenCalled();
    });

    it('should handle missing booking ID', async () => {
      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      await act(async () => {
        await result.current.startAnalysis('');
      });

      expect(result.current.step).toBe('error');
      expect(result.current.error).toBe('Booking ID is required');
    });

    it('should handle API errors', async () => {
      vi.mocked(postureApi.validateBooking).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      // startAnalysis records the error in state AND rethrows, so the caller can
      // react. Awaiting it bare therefore rejects and fails the test before the
      // assertions run - the caller has to catch, and so does this.
      await act(async () => {
        await expect(result.current.startAnalysis('booking-456')).rejects.toThrow(
          'Network error',
        );
      });

      await waitFor(() => {
        expect(result.current.step).toBe('error');
      });

      expect(result.current.error).toContain('Network error');
    });
  });


  describe('finalizeAnalysis', () => {
    it('should finalize analysis successfully', async () => {
      const mockAnalysisResult = {
        id: 'analysis-789',
        userId: 'user-123',
        bookingId: 'booking-456',
        analysisDate: new Date().toISOString(),
        status: 'completed',
        fhdPixels: 45.2,
        cervicalAngle: 32.1,
        // ... other metrics
      } as any;

      const mockValidation = {
        valid: true,
        remainingCount: 5,
        totalCount: 10,
        usedCount: 5,
      };

      const mockStartResponse = {
        sessionId: 'session-123',
        bookingId: 'booking-456',
        remainingCount: 5,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      const mockFrameResponse = {
        landmarks: { pose: {} },
        visibility: 0.95,
        progress: 0.002,
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);
      vi.mocked(postureApi.finalizeAnalysis).mockResolvedValue(
        mockAnalysisResult
      );

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      // Start analysis
      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('capturing');
      });

      // No per-frame round trip any more: pose estimation runs in the browser
      // and the landmarks are posted once, by finalizeAnalysis.


      // Finalize
      let finalResult: any;
      await act(async () => {
        finalResult = await result.current.finalizeAnalysis(
            'session-123',
            'booking-456',
            { samples: [] },
          );
      });

      await waitFor(() => {
        expect(result.current.step).toBe('complete');
      });

      expect(result.current.analysisResult).toEqual(mockAnalysisResult);
      expect(finalResult).toEqual(mockAnalysisResult);
      expect(postureApi.finalizeAnalysis).toHaveBeenCalled();
      const callArgs = vi.mocked(postureApi.finalizeAnalysis).mock.calls[0];
      expect(callArgs[0]).toMatchObject({
        sessionId: 'session-123',
        bookingId: 'booking-456',
        landmarksData: expect.objectContaining({
          samples: expect.any(Array),
        }),
      });
    });

    it('should handle insufficient frames', async () => {
      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      // Finalising without a session. The guard is `!sessionId || !bookingId`, so
      // handing it a real session id - which an earlier edit did - meant the branch
      // under test was never reached.
      let finalResult: any;
      await act(async () => {
        finalResult = await result.current.finalizeAnalysis('', '', { samples: [] });
      });

      expect(result.current.step).toBe('error');
      expect(result.current.error).toContain('No active session');
      expect(finalResult).toBeNull();
    });

    it('should handle finalization errors', async () => {
      const mockValidation = {
        valid: true,
        remainingCount: 5,
        totalCount: 10,
        usedCount: 5,
      };

      const mockStartResponse = {
        sessionId: 'session-123',
        bookingId: 'booking-456',
        remainingCount: 5,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      const mockFrameResponse = {
        landmarks: { pose: {} },
        visibility: 0.95,
        progress: 0.002,
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);
      vi.mocked(postureApi.finalizeAnalysis).mockRejectedValue(
        new Error('Failed to save analysis')
      );

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      // Start and collect frames
      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('capturing');
      });

      // No per-frame round trip any more: pose estimation runs in the browser
      // and the landmarks are posted once, by finalizeAnalysis.

      // Try to finalize
      await act(async () => {
        await result.current.finalizeAnalysis('session-123', 'booking-456', { samples: [] });
      });

      await waitFor(() => {
        expect(result.current.step).toBe('error');
      });

      expect(result.current.error).toContain('Failed to save analysis');
    });
  });

  describe('cancelAnalysis', () => {
    it('should cancel analysis and reset state', async () => {
      vi.mocked(postureApi.cancelAnalysis).mockResolvedValue({
        message: 'Analysis cancelled',
      });

      const mockValidation = {
        valid: true,
        remainingCount: 5,
        totalCount: 10,
        usedCount: 5,
      };

      const mockStartResponse = {
        sessionId: 'session-123',
        bookingId: 'booking-456',
        remainingCount: 5,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      // Start analysis
      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('capturing');
      });

      // Cancel
      await act(async () => {
        await result.current.cancelAnalysis();
      });

      await waitFor(() => {
        expect(result.current.step).toBe('idle');
      });

      expect(result.current.sessionId).toBeNull();
      expect(result.current.bookingId).toBeNull();
      expect(postureApi.cancelAnalysis).toHaveBeenCalled();
    });

    it('should reset even if cancel API fails', async () => {
      vi.mocked(postureApi.cancelAnalysis).mockRejectedValue(
        new Error('Cancel failed')
      );

      const mockValidation = {
        valid: true,
        remainingCount: 5,
        totalCount: 10,
        usedCount: 5,
      };

      const mockStartResponse = {
        sessionId: 'session-123',
        bookingId: 'booking-456',
        remainingCount: 5,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      // Start analysis
      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('capturing');
      });

      // Cancel (should reset even on error)
      await act(async () => {
        await result.current.cancelAnalysis();
      });

      await waitFor(() => {
        expect(result.current.step).toBe('idle');
      });

      expect(result.current.sessionId).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset to initial state', async () => {
      const mockValidation = {
        valid: true,
        remainingCount: 5,
        totalCount: 10,
        usedCount: 5,
      };

      const mockStartResponse = {
        sessionId: 'session-123',
        bookingId: 'booking-456',
        remainingCount: 5,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      // Start analysis
      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('capturing');
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.step).toBe('idle');
      expect(result.current.sessionId).toBeNull();
      expect(result.current.progress).toBe(0);
      expect(result.current.frameCount).toBe(0);
    });
  });

  describe('Status Flags', () => {
    it('should correctly report isCapturing', async () => {
      const mockValidation = {
        valid: true,
        remainingCount: 5,
        totalCount: 10,
        usedCount: 5,
      };

      const mockStartResponse = {
        sessionId: 'session-123',
        bookingId: 'booking-456',
        remainingCount: 5,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.isCapturing).toBe(false);

      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.isCapturing).toBe(true);
      });
    });

    it('should correctly report isComplete', async () => {
      const mockAnalysisResult = {
        id: 'analysis-789',
        userId: 'user-123',
        bookingId: 'booking-456',
        analysisDate: new Date().toISOString(),
        status: 'completed',
      } as any;

      const mockValidation = {
        valid: true,
        remainingCount: 5,
        totalCount: 10,
        usedCount: 5,
      };

      const mockStartResponse = {
        sessionId: 'session-123',
        bookingId: 'booking-456',
        remainingCount: 5,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      const mockFrameResponse = {
        landmarks: { pose: {} },
        visibility: 0.95,
        progress: 0.002,
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);
      vi.mocked(postureApi.finalizeAnalysis).mockResolvedValue(mockAnalysisResult);

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.isComplete).toBe(false);

      // Start, collect frames, and finalize
      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('capturing');
      });


      await act(async () => {
        await result.current.finalizeAnalysis('session-123', 'booking-456', { samples: [] });
      });

      await waitFor(() => {
        expect(result.current.isComplete).toBe(true);
      });
    });

    it('should correctly report hasError', async () => {
      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      expect(result.current.hasError).toBe(false);

      await act(async () => {
        await result.current.startAnalysis(''); // Invalid booking ID
      });

      expect(result.current.hasError).toBe(true);
    });
  });
});
