import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as gaitApi from '../api/gait';
import { BOOKINGS_QUERY_KEY } from './useBookings';

export type GaitStep = 'idle' | 'starting' | 'capturing' | 'processing' | 'complete' | 'error';

interface GaitState {
  step: GaitStep;
  sessionId: string | null;
  bookingId: string | null;
  error: string | null;
  result: any | null;
}

const initialState: GaitState = {
  step: 'idle',
  sessionId: null,
  bookingId: null,
  error: null,
  result: null,
};

export function useGaitAnalysis() {
  const [state, setState] = useState<GaitState>(initialState);
  const [isProcessing, setIsProcessing] = useState(false);
  const queryClient = useQueryClient();
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeout_ = useCallback(() => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
  }, []);

  const startAnalysis = useCallback(async (bookingId: string) => {
    try {
      setState(prev => ({ ...prev, step: 'starting', bookingId, error: null }));
      const result = await gaitApi.startGaitAnalysis({ bookingId });
      setState(prev => ({ ...prev, step: 'capturing', sessionId: result.sessionId }));
      // 15-minute session timeout
      sessionTimeoutRef.current = setTimeout(() => {
        setState(prev => ({
          ...prev,
          step: 'error',
          error: 'Session expired. Please start again.',
        }));
      }, 15 * 60 * 1000);
      return result;
    } catch (error: any) {
      const msg = error?.message || 'Failed to start gait analysis.';
      setState(prev => ({ ...prev, step: 'error', error: msg }));
      throw error;
    }
  }, []);

  const finalizeAnalysis = useCallback(async (gaitData: gaitApi.FinalizeGaitRequest['gaitData']) => {
    if (!state.sessionId || !state.bookingId) {
      throw new Error('No active session. Please start the analysis first.');
    }
    try {
      clearTimeout_();
      setIsProcessing(true);
      setState(prev => ({ ...prev, step: 'processing', error: null }));
      const result = await gaitApi.finalizeGaitAnalysis({
        sessionId: state.sessionId,
        bookingId: state.bookingId,
        gaitData,
      });
      setState(prev => ({ ...prev, step: 'complete', result }));
      // Refresh bookings to update remaining count
      queryClient.invalidateQueries({ queryKey: BOOKINGS_QUERY_KEY });
      return result;
    } catch (error: any) {
      const msg = error?.message || 'Failed to finalize gait analysis.';
      setState(prev => ({ ...prev, step: 'error', error: msg }));
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [state.sessionId, state.bookingId, clearTimeout_, queryClient]);

  const cancelAnalysis = useCallback(async () => {
    clearTimeout_();
    if (state.sessionId) {
      try {
        await gaitApi.cancelGaitAnalysis(state.sessionId);
      } catch {
        // Ignore cancel errors
      }
    }
    setState(initialState);
  }, [state.sessionId, clearTimeout_]);

  const reset = useCallback(() => {
    clearTimeout_();
    setState(initialState);
    setIsProcessing(false);
  }, [clearTimeout_]);

  return {
    state,
    isProcessing,
    startAnalysis,
    finalizeAnalysis,
    cancelAnalysis,
    reset,
  };
}
