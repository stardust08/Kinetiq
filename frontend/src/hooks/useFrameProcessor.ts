/**
 * useFrameProcessor Hook
 * 
 * Custom React hook for managing frame capture intervals, encoding, and progress tracking
 * during posture analysis.
 * 
 * Features:
 * - Manages frame capture at 30 FPS (one frame every ~33ms)
 * - Handles frame encoding to base64
 * - Tracks frame count (0-449 for 450 total frames)
 * - Calculates progress (0.0 to 1.0)
 * - Provides start/stop controls for frame capture
 * - Integrates with usePostureAnalysis for frame processing
 * 
 * Usage:
 * ```tsx
 * const {
 *   startCapture,
 *   stopCapture,
 *   isCapturing,
 *   frameCount,
 *   progress,
 *   captureFrame
 * } = useFrameProcessor({
 *   webcamRef,
 *   onFrameCaptured: processFrame,
 *   totalFrames: 450
 * });
 * 
 * // Start capturing frames at 30 FPS
 * startCapture();
 * 
 * // Stop capturing
 * stopCapture();
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';

/**
 * Configuration options for frame processor
 */
export interface UseFrameProcessorOptions {
  /** Reference to the webcam component */
  webcamRef: React.RefObject<Webcam | null>;
  /** Callback when a frame is captured and encoded */
  onFrameCaptured?: (frameData: string, frameNumber: number) => void | Promise<void>;
  /** Total number of frames to capture (default: 450) */
  totalFrames?: number;
  /** Frame rate in FPS (default: 30) */
  fps?: number;
  /** Callback when capture completes */
  onCaptureComplete?: () => void;
  /** Callback when capture errors occur */
  onError?: (error: Error) => void;
}

/**
 * Hook return type
 */
export interface UseFrameProcessorReturn {
  /** Start capturing frames */
  startCapture: () => void;
  /** Stop capturing frames */
  stopCapture: () => void;
  /** Whether currently capturing frames */
  isCapturing: boolean;
  /** Current frame count (0-based) */
  frameCount: number;
  /** Progress from 0.0 to 1.0 */
  progress: number;
  /** Manually capture a single frame */
  captureFrame: () => Promise<string | null>;
  /** Reset frame processor state */
  reset: () => void;
}

const DEFAULT_TOTAL_FRAMES = 450;
const DEFAULT_FPS = 30;

/**
 * Custom hook for frame processing during posture analysis
 */
export const useFrameProcessor = ({
  webcamRef,
  onFrameCaptured,
  totalFrames = DEFAULT_TOTAL_FRAMES,
  fps = DEFAULT_FPS,
  onCaptureComplete,
  onError,
}: UseFrameProcessorOptions): UseFrameProcessorReturn => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [progress, setProgress] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCountRef = useRef(0);

  /**
   * Calculate interval in milliseconds based on FPS
   * 30 FPS = 1000ms / 30 = ~33.33ms per frame
   */
  const captureInterval = Math.floor(1000 / fps);

  /**
   * Capture a single frame from the webcam and encode to base64
   */
  const captureFrame = useCallback(async (): Promise<string | null> => {
    if (!webcamRef.current) {
      console.error('Webcam ref not available');
      return null;
    }

    try {
      // Get screenshot as base64 data URL
      const imageSrc = webcamRef.current.getScreenshot();
      
      if (!imageSrc) {
        console.error('Failed to capture frame');
        return null;
      }

      // Extract base64 data (remove "data:image/jpeg;base64," prefix)
      const base64Data = imageSrc.split(',')[1];
      
      return base64Data;
    } catch (error) {
      console.error('Error capturing frame:', error);
      onError?.(error instanceof Error ? error : new Error('Failed to capture frame'));
      return null;
    }
  }, [webcamRef, onError]);

  /**
   * Stop frame capture
   */
  const stopCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsCapturing(false);
  }, []);

  /**
   * Handle frame capture in interval
   */
  const handleFrameCapture = useCallback(async () => {
    const currentFrame = frameCountRef.current;

    // Check if we've captured enough frames
    if (currentFrame >= totalFrames) {
      stopCapture();
      onCaptureComplete?.();
      return;
    }

    try {
      // Capture and encode frame
      const frameData = await captureFrame();

      if (frameData) {
        // Update frame count and progress
        frameCountRef.current = currentFrame + 1;
        setFrameCount(currentFrame + 1);
        
        const newProgress = Math.min((currentFrame + 1) / totalFrames, 1.0);
        setProgress(newProgress);

        // Call the callback with frame data
        await onFrameCaptured?.(frameData, currentFrame);
      }
    } catch (error) {
      console.error('Error in frame capture:', error);
      onError?.(error instanceof Error ? error : new Error('Frame capture error'));
    }
  }, [totalFrames, captureFrame, onFrameCaptured, stopCapture, onCaptureComplete, onError]);

  /**
   * Start capturing frames at the specified FPS
   */
  const startCapture = useCallback(() => {
    if (isCapturing) {
      console.warn('Already capturing frames');
      return;
    }

    if (!webcamRef.current) {
      console.error('Webcam not ready');
      onError?.(new Error('Webcam not ready'));
      return;
    }

    // Reset counters
    frameCountRef.current = 0;
    setFrameCount(0);
    setProgress(0);
    setIsCapturing(true);

    // Start interval for frame capture
    intervalRef.current = setInterval(handleFrameCapture, captureInterval);
  }, [isCapturing, webcamRef, handleFrameCapture, captureInterval, onError]);

  /**
   * Reset frame processor state
   */
  const reset = useCallback(() => {
    stopCapture();
    frameCountRef.current = 0;
    setFrameCount(0);
    setProgress(0);
  }, [stopCapture]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    startCapture,
    stopCapture,
    isCapturing,
    frameCount,
    progress,
    captureFrame,
    reset,
  };
};
