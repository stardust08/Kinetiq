/**
 * useWebcam Hook
 * 
 * Custom React hook for managing webcam initialization, permissions, and error handling.
 * 
 * Features:
 * - Handles webcam initialization and cleanup
 * - Manages permission requests and errors
 * - Provides webcam ref for react-webcam component
 * - Tracks webcam ready state
 * - Handles common webcam errors (permission denied, no camera found, etc.)
 * 
 * Usage:
 * ```tsx
 * const {
 *   webcamRef,
 *   isReady,
 *   error,
 *   permissionStatus,
 *   handleUserMedia,
 *   handleUserMediaError,
 *   reset
 * } = useWebcam();
 * 
 * <Webcam
 *   ref={webcamRef}
 *   onUserMedia={handleUserMedia}
 *   onUserMediaError={handleUserMediaError}
 * />
 * ```
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';

/**
 * Permission status types
 */
export type PermissionStatus = 'prompt' | 'granted' | 'denied' | 'unknown';

/**
 * Webcam error types
 */
export interface WebcamError {
  type: 'permission' | 'not_found' | 'not_readable' | 'overconstrained' | 'unknown';
  message: string;
  originalError?: string | DOMException;
}

/**
 * Hook return type
 */
export interface UseWebcamReturn {
  /** Ref to pass to Webcam component */
  webcamRef: React.RefObject<Webcam | null>;
  /** Whether webcam is ready and streaming */
  isReady: boolean;
  /** Current error if any */
  error: WebcamError | null;
  /** Current permission status */
  permissionStatus: PermissionStatus;
  /** Callback for Webcam onUserMedia prop */
  handleUserMedia: () => void;
  /** Callback for Webcam onUserMediaError prop */
  handleUserMediaError: (error: string | DOMException) => void;
  /** Reset hook state */
  reset: () => void;
  /** Request webcam permissions explicitly */
  requestPermission: () => Promise<boolean>;
}

/**
 * Custom hook for webcam management
 */
export const useWebcam = (): UseWebcamReturn => {
  const webcamRef = useRef<Webcam>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<WebcamError | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('unknown');

  /**
   * Parse DOMException or string error into structured WebcamError
   */
  const parseError = useCallback((err: string | DOMException): WebcamError => {
    if (typeof err === 'string') {
      return {
        type: 'unknown',
        message: err,
        originalError: err,
      };
    }

    // Handle DOMException
    switch (err.name) {
      case 'NotAllowedError':
        return {
          type: 'permission',
          message: 'Camera permission denied. Please allow camera access to continue.',
          originalError: err,
        };
      
      case 'NotFoundError':
        return {
          type: 'not_found',
          message: 'No camera found. Please connect a camera to continue.',
          originalError: err,
        };
      
      case 'NotReadableError':
        return {
          type: 'not_readable',
          message: 'Camera is already in use by another application. Please close other apps using the camera.',
          originalError: err,
        };
      
      case 'OverconstrainedError':
        return {
          type: 'overconstrained',
          message: 'Camera does not meet the required specifications. Please try a different camera.',
          originalError: err,
        };
      
      case 'AbortError':
        return {
          type: 'unknown',
          message: 'Camera access was aborted. Please try again.',
          originalError: err,
        };
      
      case 'SecurityError':
        return {
          type: 'permission',
          message: 'Camera access blocked due to security settings. Please check your browser settings.',
          originalError: err,
        };
      
      default:
        return {
          type: 'unknown',
          message: `Failed to access camera: ${err.message || 'Unknown error'}`,
          originalError: err,
        };
    }
  }, []);

  /**
   * Handle successful webcam initialization
   */
  const handleUserMedia = useCallback(() => {
    setIsReady(true);
    setError(null);
    setPermissionStatus('granted');
  }, []);

  /**
   * Handle webcam initialization error
   */
  const handleUserMediaError = useCallback((err: string | DOMException) => {
    console.error('Webcam error:', err);
    
    const parsedError = parseError(err);
    setError(parsedError);
    setIsReady(false);
    
    // Update permission status based on error type
    if (parsedError.type === 'permission') {
      setPermissionStatus('denied');
    }
  }, [parseError]);

  /**
   * Reset hook state
   */
  const reset = useCallback(() => {
    setIsReady(false);
    setError(null);
    setPermissionStatus('unknown');
  }, []);

  /**
   * Request webcam permission explicitly
   * Useful for checking permissions before showing the webcam component
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      // Check if Permissions API is available
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
        setPermissionStatus(result.state as PermissionStatus);
        
        if (result.state === 'granted') {
          return true;
        } else if (result.state === 'denied') {
          setError({
            type: 'permission',
            message: 'Camera permission was previously denied. Please enable it in your browser settings.',
          });
          return false;
        }
      }

      // Try to get user media to trigger permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true,
        audio: false 
      });
      
      // Stop the stream immediately (we just wanted to check permission)
      stream.getTracks().forEach(track => track.stop());
      
      setPermissionStatus('granted');
      setError(null);
      return true;
    } catch (err) {
      const parsedError = parseError(err as DOMException);
      setError(parsedError);
      
      if (parsedError.type === 'permission') {
        setPermissionStatus('denied');
      }
      
      return false;
    }
  }, [parseError]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      // Stop any active streams when component unmounts
      if (webcamRef.current?.stream) {
        webcamRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    webcamRef,
    isReady,
    error,
    permissionStatus,
    handleUserMedia,
    handleUserMediaError,
    reset,
    requestPermission,
  };
};
