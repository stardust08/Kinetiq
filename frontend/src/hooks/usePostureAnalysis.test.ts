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

      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('error');
      });

      expect(result.current.error).toContain('Network error');
    });
  });

  describe('processFrame', () => {
    it('should process frames and update progress', async () => {
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
        landmarks: { pose: { 0: [100, 200, 0, 0.95] } },
        visibility: 0.95,
        progress: 0.002,
        message: 'Frame processed',
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);
      vi.mocked(postureApi.processFrame).mockResolvedValue(mockFrameResponse);

      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      // Start analysis first
      await act(async () => {
        await result.current.startAnalysis('booking-456');
      });

      await waitFor(() => {
        expect(result.current.step).toBe('capturing');
      });

      // Now process a frame
      await act(async () => {
        await result.current.processFrame('base64-frame-data', 0);
      });

      await waitFor(() => {
        expect(result.current.frameCount).toBe(1);
      });

      expect(result.current.progress).toBeGreaterThan(0);
      expect(postureApi.processFrame).toHaveBeenCalled();
      const callArgs = vi.mocked(postureApi.processFrame).mock.calls[0];
      expect(callArgs[0]).toMatchObject({
        sessionId: 'session-123',
        frameData: 'base64-frame-data',
        frameNumber: 0,
      });
    });

    it('should auto-transition to processing after 450 frames', async () => {
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
        progress: 1.0,
      };

      vi.mocked(postureApi.validateBooking).mockResolvedValue(mockValidation);
      vi.mocked(postureApi.startAnalysis).mockResolvedValue(mockStartResponse);
      vi.mocked(postureApi.processFrame).mockResolvedValue(mockFrameResponse);

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

      // Process frame 449 (450th frame, 0-indexed)
      await act(async () => {
        await result.current.processFrame('base64-frame-data', 449);
      });

      await waitFor(() => {
        expect(result.current.step).toBe('processing');
      });

      expect(result.current.frameCount).toBe(450);
      expect(result.current.progress).toBe(1.0);
    });

    it('should handle frame processing errors gracefully', async () => {
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
      vi.mocked(postureApi.processFrame).mockRejectedValue(
        new Error('Frame processing failed')
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

      // Should not throw or change to error state
      await act(async () => {
        await result.current.processFrame('base64-frame-data', 0);
      });

      // Should still be in capturing state (errors are logged but don't fail analysis)
      expect(result.current.step).toBe('capturing');
    });

    it('should not process frame without active session', async () => {
      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      await act(async () => {
        await result.current.processFrame('base64-frame-data', 0);
      });

      // Should not call API without session
      expect(postureApi.processFrame).not.toHaveBeenCalled();
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
      vi.mocked(postureApi.processFrame).mockResolvedValue(mockFrameResponse);
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

      // Process 450 frames
      for (let i = 0; i < 450; i++) {
        await act(async () => {
          await result.current.processFrame('base64-data', i);
        });
      }

      await waitFor(() => {
        expect(result.current.frameCount).toBe(450);
      });

      // Finalize
      let finalResult: any;
      await act(async () => {
        finalResult = await result.current.finalizeAnalysis();
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
          frameCount: 450,
        }),
      });
    });

    it('should handle insufficient frames', async () => {
      const { result } = renderHook(() => usePostureAnalysis(), {
        wrapper: createQueryWrapper(),
      });

      // Try to finalize without starting analysis
      let finalResult: any;
      await act(async () => {
        finalResult = await result.current.finalizeAnalysis();
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
      vi.mocked(postureApi.processFrame).mockResolvedValue(mockFrameResponse);
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

      // Process 450 frames
      for (let i = 0; i < 450; i++) {
        await act(async () => {
          await result.current.processFrame('base64-data', i);
        });
      }

      // Try to finalize
      await act(async () => {
        await result.current.finalizeAnalysis();
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
      vi.mocked(postureApi.processFrame).mockResolvedValue(mockFrameResponse);
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

      for (let i = 0; i < 450; i++) {
        await act(async () => {
          await result.current.processFrame('base64-data', i);
        });
      }

      await act(async () => {
        await result.current.finalizeAnalysis();
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
