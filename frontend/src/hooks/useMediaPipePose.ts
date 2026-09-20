import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver, PoseLandmarkerResult } from '@mediapipe/tasks-vision';

export interface MediaPipeLandmarks {
  pose: Record<number, [number, number, number, number]>;
  face?: Record<number, [number, number, number]>;
  left_hand?: Record<number, [number, number, number, number]>;
  right_hand?: Record<number, [number, number, number, number]>;
}

export interface Landmark3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface ProcessedFrame {
  landmarks: MediaPipeLandmarks;
  /** poseWorldLandmarks – metric coords in metres (for Three.js skeleton) */
  worldLandmarks: Landmark3D[];
  /** poseLandmarks – normalised 0-1 screen coords (for 2-D overlay) */
  screenLandmarks: Landmark3D[];
  visibility: number;
  frameNumber: number;
  poseType: 'front' | 'leftside' | 'rightside' | 'back';
  timestamp: number;
  /**
   * True pixel dimensions of the frame this was extracted from.
   *
   * The backend needs these to undo MediaPipe's anisotropic normalisation - x is
   * divided by width and y by height, so on any non-square frame equal physical
   * distances come back as different numbers and every angle computed from them is
   * skewed. WebcamCapture attaches them; they were being assigned to an interface that
   * did not declare them, so the one consumer that mattered was invisible to the
   * compiler.
   */
  captureWidth?: number;
  captureHeight?: number;
}

/**
 * Hook for MediaPipe Pose Detection in Browser
 * 
 * This runs Google's MediaPipe Holistic model entirely in the browser using WebAssembly.
 * No backend processing needed - everything happens on the client side.
 * 
 * Benefits:
 * - Zero backend CPU usage
 * - No network latency during capture
 * - Instant feedback to user
 * - Infinite scalability
 * - 95% less data transfer
 */
export const useMediaPipePose = () => {
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  useEffect(() => {
    let cancelled = false;
    let landmarker: PoseLandmarker | null = null;

    const initializeMediaPipe = async () => {
      try {
        setIsLoading(true);
        console.log('Initializing MediaPipe...');

        // Load WASM files from CDN
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        if (cancelled) {
          console.log('MediaPipe initialization cancelled (component unmounted)');
          return;
        }

        // Create pose landmarker with optimal settings
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
            delegate: "GPU" // Use GPU acceleration if available
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.7, // Match backend settings
          minPosePresenceConfidence: 0.7,
          minTrackingConfidence: 0.7,
          outputSegmentationMasks: false // We don't need segmentation
        });

        if (cancelled) {
          console.log('MediaPipe initialization cancelled (component unmounted during creation)');
          landmarker.close();
          return;
        }

        setPoseLandmarker(landmarker);
        setIsLoading(false);
        console.log('MediaPipe initialized successfully');
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to initialize MediaPipe:', err);
          setError(err instanceof Error ? err.message : 'Failed to initialize MediaPipe');
          setIsLoading(false);
        }
      }
    };

    initializeMediaPipe();

    // Cleanup
    return () => {
      cancelled = true;
      if (poseLandmarker) {
        poseLandmarker.close();
        console.log('MediaPipe cleaned up');
      }
      if (landmarker && landmarker !== poseLandmarker) {
        landmarker.close();
        console.log('MediaPipe landmarker cleaned up');
      }
    };
  }, []);

  /**
   * Process a video frame and extract landmarks
   * This runs entirely in the browser - no backend call!
   */
  const processFrame = (
    videoElement: HTMLVideoElement,
    frameNumber: number,
    poseType: 'front' | 'leftside' | 'rightside' | 'back'
  ): ProcessedFrame | null => {
    if (!poseLandmarker || !videoElement) {
      return null;
    }

    try {
      // Get current video time in milliseconds
      const timestamp = performance.now();

      // Prevent processing the same frame twice
      if (videoElement.currentTime === lastVideoTimeRef.current) {
        return null;
      }
      lastVideoTimeRef.current = videoElement.currentTime;

      // Detect pose landmarks using MediaPipe
      const results: PoseLandmarkerResult = poseLandmarker.detectForVideo(
        videoElement,
        timestamp
      );

      // Check if pose was detected
      if (!results.landmarks || results.landmarks.length === 0) {
        console.warn(`No pose detected in frame ${frameNumber}`);
        return null;
      }

      // Convert to our format (matching backend structure)
      const landmarks: MediaPipeLandmarks = {
        pose: {}
      };

      // Extract pose landmarks (33 points from MediaPipe)
      const poseLandmarks = results.landmarks[0]; // First person
      poseLandmarks.forEach((landmark, index) => {
        landmarks.pose[index] = [
          landmark.x,
          landmark.y,
          landmark.z || 0,
          landmark.visibility || 1.0
        ];
      });

      // Calculate virtual neck (index 33) - EXACT same formula as backend
      // Neck = 0.6 * MidShoulder + 0.4 * Nose
      if (landmarks.pose[11] && landmarks.pose[12] && landmarks.pose[0]) {
        const leftShoulder = landmarks.pose[11];
        const rightShoulder = landmarks.pose[12];
        const nose = landmarks.pose[0];

        const midShoulderX = (leftShoulder[0] + rightShoulder[0]) / 2;
        const midShoulderY = (leftShoulder[1] + rightShoulder[1]) / 2;
        const midShoulderZ = (leftShoulder[2] + rightShoulder[2]) / 2;

        const neckX = 0.6 * midShoulderX + 0.4 * nose[0];
        const neckY = 0.6 * midShoulderY + 0.4 * nose[1];
        const neckZ = 0.6 * midShoulderZ + 0.4 * nose[2];
        const neckVisibility = Math.min(leftShoulder[3], rightShoulder[3], nose[3]);

        landmarks.pose[33] = [neckX, neckY, neckZ, neckVisibility];
      }

      // ── NEW: preserve raw world + screen landmark arrays for 3D viewer ──
      const rawScreenLandmarks = results.landmarks[0];
      const rawWorldLandmarks = results.worldLandmarks?.[0] ?? [];

      const screenLandmarks: Landmark3D[] = rawScreenLandmarks.map(lm => ({
        x: lm.x,
        y: lm.y,
        z: lm.z || 0,
        visibility: lm.visibility ?? 1,
      }));

      const worldLandmarks: Landmark3D[] = rawWorldLandmarks.map(lm => ({
        x: lm.x,
        y: lm.y,
        z: lm.z || 0,
        visibility: lm.visibility ?? 1,
      }));

      // Calculate average visibility
      const visibility = calculateVisibility(landmarks);

      return {
        landmarks,
        worldLandmarks,
        screenLandmarks,
        visibility,
        frameNumber,
        poseType,
        timestamp
      };
    } catch (err) {
      console.error(`Error processing frame ${frameNumber}:`, err);
      return null;
    }
  };

  /**
   * Calculate average visibility from pose landmarks
   */
  const calculateVisibility = (landmarks: MediaPipeLandmarks): number => {
    const visibilities: number[] = [];

    Object.values(landmarks.pose).forEach(lm => {
      if (lm.length >= 4) {
        visibilities.push(lm[3]);
      }
    });

    if (visibilities.length === 0) return 0;
    return visibilities.reduce((sum, v) => sum + v, 0) / visibilities.length;
  };

  /**
   * Get visibility feedback message
   */
  const getVisibilityMessage = (visibility: number): string => {
    if (visibility < 0.5) {
      return "Low visibility detected. Please ensure good lighting and full body is visible.";
    } else if (visibility < 0.7) {
      return "Moderate visibility. Try to improve lighting for better results.";
    } else {
      return "Good visibility. Continue capturing.";
    }
  };

  return {
    poseLandmarker,
    isLoading,
    error,
    processFrame,
    calculateVisibility,
    getVisibilityMessage
  };
};
