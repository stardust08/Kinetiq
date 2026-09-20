/**
 * usePostureAnalysis Hook
 * 
 * Custom React hook for managing posture analysis state and operations.
 * 
 * Features:
 * - Manages analysis session lifecycle (start → capture → process → finalize)
 * - Tracks progress through 450 frame collection
 * - Handles frame processing and landmark collection
 * - Manages error states and recovery
 * - Provides methods for starting, processing, finalizing, and canceling analysis
 * 
 * Usage:
 * ```tsx
 * const {
 *   startAnalysis,
 *   processFrame,
 *   finalizeAnalysis,
 *   cancelAnalysis,
 *   state,
 *   isProcessing,
 *   error
 * } = usePostureAnalysis();
 * 
 * // Start analysis with a booking
 * await startAnalysis('booking-id-123');
 * 
 * // Process each captured frame
 * await processFrame('base64-frame-data', frameNumber);
 * 
 * // Finalize when all frames collected
 * const result = await finalizeAnalysis();
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as postureApi from '../api/posture';
import type {
  AnalysisState,
  AnalysisStep,
  PostureAnalysis,
  ProcessFrameResponse,
} from '../types';
import { BOOKINGS_QUERY_KEY } from './useBookings';

const REQUIRED_FRAMES = 180; // 60 frames × 3 poses (Front, Side, Back)
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Initial state for analysis
 */
const initialState: AnalysisState = {
  step: 'idle',
  sessionId: null,
  bookingId: null,
  progress: 0,
  frameCount: 0,
  collectedFrames: [],
  error: null,
  analysisResult: null,
};

/**
 * Custom hook for posture analysis operations
 */
export const usePostureAnalysis = () => {
  const [state, setState] = useState<AnalysisState>(initialState);
  const queryClient = useQueryClient();
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Clear session timeout
   */
  const clearSessionTimeout = useCallback(() => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
  }, []);

  /**
   * Set session timeout to auto-cancel after 15 minutes
   */
  const setSessionTimeout = useCallback(() => {
    clearSessionTimeout();
    sessionTimeoutRef.current = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        step: 'error',
        error: 'Session expired. Please start a new analysis.',
      }));
    }, SESSION_TIMEOUT_MS);
  }, [clearSessionTimeout]);

  /**
   * Update analysis step
   */
  const updateStep = useCallback((step: AnalysisStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  /**
   * Set error state
   */
  const setError = useCallback((error: string) => {
    setState((prev) => ({
      ...prev,
      step: 'error',
      error,
    }));
    clearSessionTimeout();
  }, [clearSessionTimeout]);

  /**
   * Reset state to initial
   */
  const reset = useCallback(() => {
    clearSessionTimeout();
    setState(initialState);
  }, [clearSessionTimeout]);

  /**
   * Mutation for starting analysis
   */
  const startAnalysisMutation = useMutation({
    mutationFn: postureApi.startAnalysis,
    onSuccess: (response) => {
      setState((prev) => ({
        ...prev,
        step: 'capturing',
        sessionId: response.sessionId,
        bookingId: response.bookingId,
        error: null,
      }));
      setSessionTimeout();
    },
    onError: (error: Error) => {
      setError(error.message || 'Failed to start analysis');
    },
  });

  /**
   * Mutation for finalizing analysis
   */
  const finalizeAnalysisMutation = useMutation({
    mutationFn: postureApi.finalizeAnalysis,
    onSuccess: (result) => {
      setState((prev) => ({
        ...prev,
        step: 'complete',
        analysisResult: result,
        error: null,
      }));
      clearSessionTimeout();
      
      // Invalidate bookings query to refresh screening counts
      queryClient.invalidateQueries({ queryKey: BOOKINGS_QUERY_KEY });
    },
    onError: (error: Error) => {
      setError(error.message || 'Failed to finalize analysis');
    },
  });

  /**
   * Mutation for canceling analysis
   */
  const cancelAnalysisMutation = useMutation({
    mutationFn: postureApi.cancelAnalysis,
    onSuccess: () => {
      reset();
    },
    onError: (error: Error) => {
      console.error('Cancel analysis error:', error);
      // Still reset even if cancel fails
      reset();
    },
  });

  /**
   * Start a new posture analysis session
   * @param bookingId - UUID of the booking to use for this analysis
   */
  const startAnalysis = useCallback(
    async (bookingId: string) => {
      if (!bookingId) {
        setError('Booking ID is required');
        return;
      }

      updateStep('validating');

      try {
        // Validate booking first
        const validation = await postureApi.validateBooking(bookingId);
        
        if (!validation.valid) {
          setError(validation.message || 'Booking is not valid for analysis');
          return;
        }

        // Start analysis session
        const response = await startAnalysisMutation.mutateAsync({ bookingId });
        console.log('startAnalysis completed, response:', response);
        
        // Wait a bit for state to update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return response;
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to start analysis'
        );
        throw error;
      }
    },
    [startAnalysisMutation, updateStep, setError]
  );

  /**
   * Finalize analysis and save results
   * NOW RECEIVES PRE-PROCESSED LANDMARKS (no frame processing needed!)
   * @param sessionId - Session ID from startAnalysis
   * @param bookingId - Booking ID from startAnalysis
   * @param landmarksData - Pre-processed landmarks from frontend
   */
  const finalizeAnalysis = useCallback(
    async (
      sessionId: string,
      bookingId: string,
      landmarksData: Record<string, any>
    ) => {
      console.log('finalizeAnalysis called');
      console.log('sessionId:', sessionId);
      console.log('bookingId:', bookingId);
      console.log('landmarksData:', landmarksData);
      
      if (!sessionId || !bookingId) {
        const errorMsg = 'No active session';
        console.error(errorMsg);
        setError(errorMsg);
        return null;
      }

      updateStep('processing');

      try {
        console.log('📤 Sending aggregated landmarks to backend...');
        
        // ONE API CALL with all pre-processed data
        const result = await finalizeAnalysisMutation.mutateAsync({
          sessionId,
          bookingId,
          landmarksData
        });

        console.log('✅ Backend processed and saved analysis');
        
        setState((prev) => ({
          ...prev,
          analysisResult: result,
        }));

        updateStep('complete');
        return result;
      } catch (error) {
        console.error('Finalize analysis error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to finalize analysis';
        setError(errorMessage);
        updateStep('error');
        return null;
      }
    },
    [finalizeAnalysisMutation, updateStep, setError]
  );

  /**
   * Cancel the current analysis session
   * Does not deduct screening count
   */
  const cancelAnalysis = useCallback(async () => {
    if (!state.sessionId) {
      reset();
      return;
    }

    try {
      await cancelAnalysisMutation.mutateAsync({
        sessionId: state.sessionId,
      });
    } catch (error) {
      console.error('Cancel error:', error);
      // Reset anyway
      reset();
    }
  }, [state.sessionId, cancelAnalysisMutation, reset]);

  /**
   * Check if any operation is in progress
   */
  const isProcessing =
    startAnalysisMutation.isPending ||
    finalizeAnalysisMutation.isPending ||
    cancelAnalysisMutation.isPending;

  return {
    // State
    state,
    step: state.step,
    progress: state.progress,
    frameCount: state.frameCount,
    error: state.error,
    analysisResult: state.analysisResult,
    sessionId: state.sessionId,
    bookingId: state.bookingId,

    // Operations
    startAnalysis,
    finalizeAnalysis,
    cancelAnalysis,
    reset,

    // Status flags
    isProcessing,
    isCapturing: state.step === 'capturing',
    isComplete: state.step === 'complete',
    hasError: state.step === 'error',
  };
};
