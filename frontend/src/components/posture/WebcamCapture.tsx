import {
  detectView,
  orientationBlocks,
  orientationMessage,
  type CaptureView,
} from '../../lib/captureOrientation';
import { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useMediaPipePose, ProcessedFrame } from '../../hooks/useMediaPipePose';
import {
  bestFrameTracker,
  resetCaptureSession,
  setCaptureCallbacks,
  captureSession,
} from '../../lib/captureSession';
import { type BestFrameData, type PoseView } from '../../lib/postureStore';
import CaptureProgress from './CaptureProgress';

/**
 * MediaPipe Pose landmark connections for drawing skeleton
 */
const POSE_CONNECTIONS = [
  [11, 12], // Shoulders
  [11, 13], [13, 15], // Left arm
  [12, 14], [14, 16], // Right arm
  [11, 23], [12, 24], // Torso
  [23, 24], // Hips
  [23, 25], [25, 27], [27, 29], [29, 31], // Left leg
  [24, 26], [26, 28], [28, 30], [30, 32], // Right leg
  [0, 1], [1, 2], [2, 3], [3, 7], // Face right
  [0, 4], [4, 5], [5, 6], [6, 8], // Face left
];

/**
 * Frame data with pose type information and landmarks
 */
export interface FrameData {
  landmarks: any; // MediaPipe landmarks — normalised 0-1, keyed {pose: {index: [x,y,z,vis]}}
  visibility: number;
  poseType: 'front' | 'leftside' | 'rightside' | 'back';
  frameNumber: number;
  timestamp: number;
  /**
   * poseWorldLandmarks — metric 3D coordinates in metres, origin at the mid-hip.
   *
   * Sent to the backend so sagittal and frontal angles can be computed in 3D rather
   * than from the 2D projection. Projected angles are corrupted whenever the subject
   * stands even slightly off-axis to the camera; world landmarks are not.
   */
  worldLandmarks?: Array<{ x: number; y: number; z: number; visibility?: number }>;
  /**
   * Real capture dimensions, read from the video track rather than the requested
   * constraints. MediaPipe normalises x by width and y by height, so normalised
   * landmark space is anisotropic on any non-square frame; without these the backend
   * has to assume 4:3 and every angle is skewed by the aspect ratio.
   */
  captureWidth?: number;
  captureHeight?: number;
}

/**
 * WebcamCapture Component Props
 */
export interface WebcamCaptureProps {
  /** Callback when capture is complete with all frames */
  onCaptureComplete: (frames: FrameData[]) => void;
  /** Callback when an error occurs */
  onError: (error: string) => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Booking ID for the analysis session */
  bookingId: string;
  /**
   * Optional: called whenever a pose best-frame is finalized.
   * Receives the full bestFrames Record so the parent can show PoseCards.
   */
  onBestFramesUpdate?: (bestFrames: Record<PoseView, BestFrameData | null>) => void;
}

// Re-export for parent usage
export type { BestFrameData, PoseView } from '../../lib/postureStore';

/**
 * Scanning phase types
 */
export type ScanningPhase = 'initial' | 'front' | 'leftside' | 'rightside' | 'back' | 'break' | 'confirmation';

/**
 * WebcamCapture Component
 * 
 * Captures video frames from the user's webcam for posture analysis with new multi-phase flow:
 * 
 * New Flow:
 * 1. Initial 5-second countdown before starting
 * 2. Front View Scan: 2 seconds (60 frames) → 5 second break with instruction
 * 3. Left-Side Pose Scan: 2 seconds (60 frames) → 5 second break with instruction  
 * 4. Right-Side Pose Scan: 2 seconds (60 frames) -> 5 second break with instruction
 * 5. Back Pose Scan: 2 seconds (60 frames) -> 5 second break with instruction
 * 6. Confirmation Step: Ask user to confirm submission
 * 7. Restart option: If user says no, restart from step 1
 * 
 * Technical Details:
 * - Uses react-webcam for video capture
 * - Captures frames as base64-encoded JPEG images
 * - Frame rate: 30 FPS (33.33ms interval)
 * - Each pose: 2 seconds = 60 frames
 * - Total frames: 240 (60 × 4 poses)
 * - Break duration: 5 seconds between poses
 * 
 * @example
 * <WebcamCapture
 *   bookingId="abc123"
 *   onCaptureComplete={(frames) => console.log('Captured', frames.length, 'frames')}
 *   onError={(error) => console.error(error)}
 *   onCancel={() => console.log('Cancelled')}
 * />
 */
export default function WebcamCapture({
  onCaptureComplete,
  onError,
  onCancel,
  bookingId,
  onBestFramesUpdate,
}: WebcamCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Initialize MediaPipe for local processing
  const {
    poseLandmarker,
    isLoading: mediaPipeLoading,
    error: mediaPipeError,
    processFrame: processFrameWithMediaPipe,
    getVisibilityMessage
  } = useMediaPipePose();

  // State
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<ScanningPhase>('initial');
  const [capturedFrames, setCapturedFrames] = useState<FrameData[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timerRemaining, setTimerRemaining] = useState(5);
  const [webcamReady, setWebcamReady] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [lastCompletedPhase, setLastCompletedPhase] = useState<ScanningPhase>('initial');
  const [currentVisibility, setCurrentVisibility] = useState<number>(0);
  const [currentLandmarks, setCurrentLandmarks] = useState<any>(null);
  const [isUserFullyVisible, setIsUserFullyVisible] = useState<boolean>(false);
  /**
   * The view the camera can actually see, as opposed to the one being asked for.
   *
   * Held as consecutive agreeing frames rather than the latest frame: a subject
   * mid-turn passes through every orientation on the way, and a gate that reacted to
   * one frame would flicker red while they were doing exactly what was asked.
   */
  const [detectedView, setDetectedView] = useState<CaptureView | null>(null);
  const viewVotesRef = useRef<{ view: CaptureView | null; count: number }>({ view: null, count: 0 });
  // The canvas draw runs outside React's render, so it reads the verdict from refs.
  const overlayReadyRef = useRef<boolean>(false);
  const overlayMessageRef = useRef<string>('Position Your Full Body');
  const [detectionActive, setDetectionActive] = useState<boolean>(false);
  const detectionIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Best-frame tracker state (parallel UI, does not affect detection) ──
  const [bestFrames, setBestFrames] = useState<Record<PoseView, BestFrameData | null>>({
    front: null, leftside: null, rightside: null, back: null,
  });
  const [currentBestVisibility, setCurrentBestVisibility] = useState(0);
  const [betterFrameVersion, setBetterFrameVersion] = useState(0); // increments to trigger flash
  const trackerFrameCountRef = useRef(0); // mirrors captureSession.frameCount for UI

  // Constants or we can say rules for the capture process
  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS; // 33.33ms
  const FRAMES_PER_POSE = 60; // 2 seconds at 30 FPS
  const BREAK_DURATION = 5; // seconds
  const INITIAL_TIMER = 5; // seconds
  const TOTAL_FRAMES = FRAMES_PER_POSE * 4; // 240 frames total (4 poses x 60)
  const VISIBILITY_THRESHOLD = 0.6; // Minimum visibility for landmarks
  const DETECTION_FPS = 10; // Check for full body visibility at 10 FPS

  // Register capture callbacks once on mount (parallel, doesn't affect detection)
  useEffect(() => {
    setCaptureCallbacks({
      onBetterFrameFound: (vis) => {
        setCurrentBestVisibility(vis);
        setBetterFrameVersion(v => v + 1);
      },
      onSessionFinalized: (view, frameData) => {
        setBestFrames(prev => {
          const next = { ...prev, [view]: frameData };
          // Notify parent so it can show PoseCard thumbnails
          onBestFramesUpdate?.(next);
          return next;
        });
      },
    });
  }, [onBestFramesUpdate]);

  /**
   * The pose this countdown is counting down TO.
   *
   * The orientation gate has to check the UPCOMING view, not the current phase: during
   * 'initial' and 'break' the subject is being asked to get into position for the next
   * capture, and that is the only moment at which telling them they are facing the
   * wrong way is still useful.
   */
  const upcomingView = useCallback((): CaptureView | null => {
    if (currentPhase === 'initial') return 'front';
    if (currentPhase !== 'break') return null;
    if (lastCompletedPhase === 'front') return 'leftside';
    if (lastCompletedPhase === 'leftside') return 'rightside';
    if (lastCompletedPhase === 'rightside') return 'back';
    return null;   // after the back capture there is nothing left to stand for
  }, [currentPhase, lastCompletedPhase]);

  /**
   * Check if user is fully visible (head to feet)
   * Returns true if all key landmarks are detected with good visibility
   */
  const checkFullBodyVisibility = useCallback((landmarks: any): boolean => {
    if (!landmarks?.pose) return false;

    // Key landmarks to check for full body visibility
    const keyLandmarks = [
      0,  // Nose (head)
      11, 12, // Shoulders
      23, 24, // Hips
      25, 26, // Knees
      27, 28, // Ankles
      31, 32  // Feet
    ];

    let visibleCount = 0;
    let totalVisibility = 0;

    for (const idx of keyLandmarks) {
      const landmark = landmarks.pose[idx];
      if (landmark && Array.isArray(landmark) && landmark.length >= 4) {
        const visibility = landmark[3];
        if (visibility >= VISIBILITY_THRESHOLD) {
          visibleCount++;
          totalVisibility += visibility;
        }
      }
    }

    // Require at least 90% of key landmarks to be visible
    const requiredLandmarks = Math.ceil(keyLandmarks.length * 0.9);
    const avgVisibility = visibleCount > 0 ? totalVisibility / visibleCount : 0;

    return visibleCount >= requiredLandmarks && avgVisibility >= VISIBILITY_THRESHOLD;
  }, []);

  /**
   * Get phase-specific instructions
   */
  const getPhaseInstructions = (phase: ScanningPhase): string => {
    switch (phase) {
      case 'initial':
        if (!isUserFullyVisible) {
          return 'Position yourself so your full body is visible (head to feet)';
        }
        return `Starting front view scan in ${timerRemaining}s`;
      case 'front':
        return 'Front Pose: Stand facing the camera with arms at your sides';
      case 'leftside':
        return 'Left Side Pose: Turn 90 degrees to show your profile';
      case 'rightside':
        return 'Right Side Pose: Turn 90 degrees to show your profile';
      case 'back':
        return 'Back Pose: Turn around to show your back';
      case 'break':
        // Determine which pose is next based on last completed phase
        if (lastCompletedPhase === 'front') {
          if (!isUserFullyVisible) {
            return 'Position yourself for leftside pose (full body visible)';
          }
          return `Starting leftside pose in ${timerRemaining}s`;
        } else if (lastCompletedPhase === 'leftside') {
          if (!isUserFullyVisible) {
            return 'Position yourself for rightside pose (full body visible)';
          }
          return `Starting rightside pose in ${timerRemaining}s`;
        } else if (lastCompletedPhase === 'rightside') {
          if (!isUserFullyVisible) {
            return 'Position yourself for back pose (full body visible)';
          }
          return `Starting back pose in ${timerRemaining}s`;
        }
        return `Get ready in ${timerRemaining}s`;
      case 'confirmation':
        return 'Review your captured frames before submission';
      default:
        return 'Position yourself to match the guide';
    }
  };

  /**
   * Get phase-specific overlay color
   */
  const getPhaseColor = (phase: ScanningPhase): string => {
    switch (phase) {
      case 'initial':
        return 'gray';
      case 'front':
        return 'blue';
      case 'leftside':
        return 'green';
      case 'rightside':
        return 'orange';
      case 'back':
        return 'purple';
      case 'break':
        return 'yellow';
      case 'confirmation':
        return 'gray';
      default:
        return 'blue';
    }
  };

  /**
   * Handle webcam user media (permission granted)
   */
  const handleUserMedia = useCallback(() => {
    setWebcamReady(true);
    setPermissionError(null);
  }, []);

  /**
   * Handle webcam user media error (permission denied or other error)
   */
  const handleUserMediaError = useCallback((error: string | DOMException) => {
    console.error('Webcam error:', error);
    const errorMessage = typeof error === 'string'
      ? error
      : error.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access to continue.'
        : error.name === 'NotFoundError'
          ? 'No camera found. Please connect a camera to continue.'
          : 'Failed to access camera. Please check your camera settings.';

    setPermissionError(errorMessage);
    setWebcamReady(false);
    onError(errorMessage);
  }, [onError]);

  /**
   * Capture and process a single frame using MediaPipe (LOCAL PROCESSING!)
   */
  const captureFrame = useCallback(() => {
    if (!webcamRef.current || !poseLandmarker) return null;

    try {
      const video = webcamRef.current.video;
      if (!video) return null;

      // Calculate frame number within current phase (not total frames)
      const currentPhaseFrames = capturedFrames.filter(
        f => f.poseType === (currentPhase as 'front' | 'leftside' | 'rightside' | 'back')
      );
      const frameNumber = currentPhaseFrames.length + 1;

      // Process frame with MediaPipe - runs entirely in browser!
      const processedFrame = processFrameWithMediaPipe(
        video,
        frameNumber,
        currentPhase as 'front' | 'leftside' | 'rightside' | 'back'
      );

      if (processedFrame) {
        // Update visibility for UI feedback
        setCurrentVisibility(processedFrame.visibility);
        // Update landmarks for real-time skeleton overlay
        setCurrentLandmarks(processedFrame.landmarks);

        // ── Touch point 1: hook best-frame tracker (does NOT modify anything above) ──
        const video = webcamRef.current?.video ?? null;
        bestFrameTracker(
          processedFrame.worldLandmarks,
          processedFrame.screenLandmarks,
          video
        );
        // worldLandmarks already comes back from processFrame; attach the true capture
        // size so the backend can undo MediaPipe's anisotropic normalisation.
        processedFrame.captureWidth = video?.videoWidth;
        processedFrame.captureHeight = video?.videoHeight;
        trackerFrameCountRef.current = captureSession.frameCount;
      } else {
        console.warn(`Frame ${frameNumber} for ${currentPhase} pose failed to process`);
      }

      return processedFrame;
    } catch (error) {
      console.error('Error capturing frame:', error);
      return null;
    }
  }, [poseLandmarker, processFrameWithMediaPipe, currentPhase, capturedFrames]);

  /**
   * Start continuous detection to check for full body visibility
   */
  const startDetection = useCallback(() => {
    // Clear any existing intervals first
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    if (timerIntervalRef.current) {
      console.log('Clearing existing timer before starting detection');
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    console.log('Starting detection mode - skeleton overlay should be visible');
    setDetectionActive(true);
    setIsUserFullyVisible(false); // Reset visibility status
    const detectionInterval = 1000 / DETECTION_FPS; // Check at 10 FPS

    detectionIntervalRef.current = setInterval(() => {
      if (!webcamRef.current || !poseLandmarker) {
        console.warn('Detection skipped: webcam or poseLandmarker not ready');
        return;
      }

      try {
        const video = webcamRef.current.video;
        if (!video) {
          console.warn('Detection skipped: video element not ready');
          return;
        }

        // Process frame with MediaPipe to get landmarks
        const processedFrame = processFrameWithMediaPipe(
          video,
          0, // Frame number doesn't matter for detection
          currentPhase as 'front' | 'leftside' | 'rightside' | 'back'
        );

        if (processedFrame) {
          // Update landmarks for real-time skeleton overlay
          setCurrentLandmarks(processedFrame.landmarks);
          setCurrentVisibility(processedFrame.visibility);

          // Check if user is fully visible
          const isFullyVisible = checkFullBodyVisibility(processedFrame.landmarks);
          setIsUserFullyVisible(isFullyVisible);

          // Which way are they actually standing? Require three consecutive agreeing
          // frames before acting, so turning around does not strobe the banner.
          const seen = detectView(processedFrame.landmarks?.pose);
          const votes = viewVotesRef.current;
          if (seen === votes.view) {
            votes.count += 1;
          } else {
            votes.view = seen;
            votes.count = 1;
          }
          if (votes.count >= 3) setDetectedView(seen);

          // Log first detection
          if (!isUserFullyVisible) {
            console.log('Detecting pose... visibility:', processedFrame.visibility.toFixed(2));
          }
        } else {
          setIsUserFullyVisible(false);
          console.warn('No pose detected in frame');
        }
      } catch (error) {
        console.error('Detection error:', error);
      }
    }, detectionInterval);
  }, [webcamRef, poseLandmarker, processFrameWithMediaPipe, currentPhase, checkFullBodyVisibility]);

  /**
   * Stop detection
   */
  // A reading from the previous pose must not gate the next one.
  useEffect(() => {
    viewVotesRef.current = { view: null, count: 0 };
    setDetectedView(null);
  }, [currentPhase, lastCompletedPhase]);

  const stopDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    console.log('Stopping detection mode');
    setDetectionActive(false);
  }, []);

  /**
   * Start timer for initial countdown or breaks (only when user is fully visible)
   */
  const startTimer = useCallback((duration: number, nextPhase: ScanningPhase) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    setTimerRemaining(duration);

    timerIntervalRef.current = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 1) {
          // Timer finished, move to next phase
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          // Stop detection when moving to capture phase
          stopDetection();
          setCurrentPhase(nextPhase);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopDetection]);

  /**
   * Start capturing frames for current phase (only when user is fully visible)
   */
  const startPhaseCapture = useCallback(() => {
    if (!webcamReady || !poseLandmarker) {
      onError('System not ready. Please wait for camera and AI model to initialize.');
      return;
    }
    // 1. Tell UI "We are scanning now"
    setIsCapturing(true);
    setFrameCount(0);
    setElapsedTime(0);
    // 2. Set phase to 'front' (or whatever is next)
    let currentFrame = 0;
    let successfulFrames = 0;
    const startTime = Date.now();
    // 3. Reset local counter (NOT the global capturedFrames)
    const phaseFrames: FrameData[] = []; // Local array to collect frames for this phase
    const maxAttempts = Math.floor(FRAMES_PER_POSE * 1.5); // Allow 50% more attempts for failures

    // 4. Capture frames at 30 FPS for current phase
    captureIntervalRef.current = setInterval(() => {
      const processedFrame = captureFrame();

      if (processedFrame) {
        phaseFrames.push(processedFrame); // Add processed frame with landmarks
        successfulFrames++;
      }

      currentFrame++;
      setFrameCount(successfulFrames); // Show successful frames count

      // Update elapsed time
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);

      // Check if we've captured enough successful frames OR hit max attempts
      if (successfulFrames >= FRAMES_PER_POSE || currentFrame >= maxAttempts) {
        // Stop capturing for this phase
        if (captureIntervalRef.current) {
          clearInterval(captureIntervalRef.current);
          captureIntervalRef.current = null;
        }
        setIsCapturing(false);

        // Validate minimum frames
        if (successfulFrames < FRAMES_PER_POSE * 0.8) {
          onError(`Only captured ${successfulFrames} valid frames for ${currentPhase} pose. Need at least ${Math.floor(FRAMES_PER_POSE * 0.8)}. Please try again.`);
          return;
        }

        // Add phase frames to total captured frames
        setCapturedFrames(prev => [...prev, ...phaseFrames]);
        setLastCompletedPhase(currentPhase);

        console.log(`Captured ${successfulFrames} frames for ${currentPhase} pose (${currentFrame - successfulFrames} failed)`);

        // Move to next phase or show confirmation
        if (currentPhase === 'front') {
          // Start break before leftside pose - start detection for user positioning
          setCurrentPhase('break');
          setIsUserFullyVisible(false);
          startDetection();
          // ── Touch point 2: reset tracker for next view (leftside) ──
          resetCaptureSession('leftside', FRAMES_PER_POSE);
          trackerFrameCountRef.current = 0;
          setCurrentBestVisibility(0);
        } else if (currentPhase === 'leftside') {
          // Start break before rightside pose - start detection for user positioning
          setCurrentPhase('break');
          setIsUserFullyVisible(false);
          startDetection();
          // ── Touch point 2: reset tracker for next view (rightside) ──
          resetCaptureSession('rightside', FRAMES_PER_POSE);
          trackerFrameCountRef.current = 0;
          setCurrentBestVisibility(0);
        } else if (currentPhase === 'rightside') {
          // Start break before back pose - start detection for user positioning
          setCurrentPhase('break');
          setIsUserFullyVisible(false);
          startDetection();
          // ── Touch point 2: reset tracker for next view (back) ──
          resetCaptureSession('back', FRAMES_PER_POSE);
          trackerFrameCountRef.current = 0;
          setCurrentBestVisibility(0);
        } else if (currentPhase === 'back') {
          // All poses captured, show confirmation
          setCurrentPhase('confirmation');
          setShowConfirmation(true);
          stopDetection();
        }
      }
    }, FRAME_INTERVAL);
  }, [webcamReady, poseLandmarker, captureFrame, onError, currentPhase, startTimer]);

  /**
   * Handle user confirmation to submit frames
   */
  const handleConfirmSubmission = useCallback(() => {
    setUserConfirmed(true);
    setShowConfirmation(false);
    console.log('User confirmed submission. Collected', capturedFrames.length, 'frames');
    onCaptureComplete(capturedFrames);
  }, [capturedFrames, onCaptureComplete]);

  /**
   * Handle user rejection - restart scanning
   */
  const handleRejectAndRestart = useCallback(() => {
    console.log('User rejected submission. Restarting scanning...');
    setUserConfirmed(false);
    setShowConfirmation(false);
    setCapturedFrames([]);
    setCurrentPhase('initial');
    setLastCompletedPhase('initial');
    setFrameCount(0);
    setElapsedTime(0);
    setTimerRemaining(INITIAL_TIMER);
    setIsUserFullyVisible(false);

    // Clear any existing timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Reset best-frame tracker for restart
    resetCaptureSession('front', FRAMES_PER_POSE);
    trackerFrameCountRef.current = 0;
    setCurrentBestVisibility(0);
    setBestFrames({ front: null, leftside: null, rightside: null, back: null });

    // Start detection to check for full body visibility
    startDetection();
  }, [startDetection]);

  /**
   * Start the entire scanning process
   */
  const startScanning = useCallback(() => {
    if (!webcamReady) {
      onError('Webcam not ready. Please wait for camera to initialize.');
      return;
    }

    if (!poseLandmarker) {
      onError('AI model not ready. Please wait for initialization.');
      return;
    }

    // Reset state
    setCapturedFrames([]);
    setCurrentPhase('initial');
    setLastCompletedPhase('initial');
    setFrameCount(0);
    setElapsedTime(0);
    setTimerRemaining(INITIAL_TIMER);
    setUserConfirmed(false);
    setShowConfirmation(false);
    setIsUserFullyVisible(false);

    // Reset best-frame tracker for front view
    resetCaptureSession('front', FRAMES_PER_POSE);
    trackerFrameCountRef.current = 0;
    setCurrentBestVisibility(0);

    // Start detection to check for full body visibility
    startDetection();
  }, [webcamReady, poseLandmarker, onError, startDetection]);

  /**
   * Stop capturing frames
   */
  const stopCapture = useCallback((completed: boolean = false) => {
    console.log('Stopping capture, completed:', completed);

    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Stop detection as well
    stopDetection();

    setIsCapturing(false);

    if (completed && capturedFrames.length > 0) {
      // Capture is complete, pass frames to parent
      onCaptureComplete(capturedFrames);
    }
  }, [capturedFrames, onCaptureComplete, stopDetection]);

  /**
   * Handle cancel button click
   */
  const handleCancel = useCallback(() => {
    stopCapture(false);
    onCancel();
  }, [stopCapture, onCancel]);

  /**
   * Auto-start timer when user becomes fully visible (for initial and break phases)
   */
  useEffect(() => {
    // Only auto-start if we're in detection mode and user is fully visible
    // A confirmed wrong-way stance holds the countdown. The backend can still measure
    // such a capture correctly, but a set containing two right-side views has no
    // left-side data in it and no cross-view check - and by the time that is visible on
    // a report, the patient has gone home. This is the only cheap moment to fix it.
    const required = upcomingView();
    const wrongWay = required !== null && orientationBlocks(required, detectedView);

    if ((currentPhase === 'initial' || currentPhase === 'break') &&
      isUserFullyVisible &&
      !wrongWay &&
      detectionActive &&
      !timerIntervalRef.current) {
      console.log(`User fully visible! Starting ${currentPhase === 'initial' ? INITIAL_TIMER : BREAK_DURATION}s timer for ${currentPhase} phase`);

      // Determine next phase based on current phase
      let nextPhase: ScanningPhase = 'front';
      if (currentPhase === 'break') {
        if (lastCompletedPhase === 'front') {
          nextPhase = 'leftside';
        } else if (lastCompletedPhase === 'leftside') {
          nextPhase = 'rightside';
        } else if (lastCompletedPhase === 'rightside') {
          nextPhase = 'back';
        } else if (lastCompletedPhase === 'back') {
          nextPhase = 'confirmation';
        }
      }

      // Start the countdown timer
      const duration = currentPhase === 'initial' ? INITIAL_TIMER : BREAK_DURATION;
      startTimer(duration, nextPhase);
    }
  }, [currentPhase, isUserFullyVisible, detectionActive, lastCompletedPhase, startTimer,
      upcomingView, detectedView]);

  /**
   * One readiness verdict, used by the countdown, the banner and the overlay alike.
   *
   * Derived rather than stored, so the red box on the video and the gate on the timer
   * can never disagree - which is the failure that makes a blocking gate infuriating:
   * a green light that does not start, or a red one that does.
   */
  const readiness = (() => {
    const required = upcomingView();
    if (!isUserFullyVisible) {
      return { ok: false, message: 'Position Your Full Body' };
    }
    if (required !== null && orientationBlocks(required, detectedView)) {
      return { ok: false, message: orientationMessage(required, detectedView!) };
    }
    return { ok: true, message: 'Ready' };
  })();

  overlayReadyRef.current = readiness.ok;
  overlayMessageRef.current = `✗ ${readiness.message}`;

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  /**
   * Synchronize canvas size with video display size
   * Uses ResizeObserver for efficient, automatic updates
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    const webcam = webcamRef.current;

    if (!canvas || !webcam || !webcam.video) return;

    const video = webcam.video;

    /**
     * Update canvas internal dimensions to match video display size
     * This ensures 1:1 pixel mapping between drawing and display
     */
    const updateCanvasSize = () => {
      const rect = video.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);

      // Only update if size actually changed (avoid unnecessary redraws)
      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }
    };

    // Initial size sync
    updateCanvasSize();

    // Watch for video size changes (window resize, orientation change, etc.)
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });

    resizeObserver.observe(video);
    resizeObserverRef.current = resizeObserver;

    return () => {
      resizeObserver.disconnect();
    };
  }, [webcamReady]);

  /**
   * Real-time skeleton overlay rendering
   * Draws detected pose landmarks on canvas with optimized performance
   * NOW SHOWS DURING DETECTION PHASE TOO!
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    const webcam = webcamRef.current;

    if (!canvas || !webcam || !webcam.video) return;

    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true // Hint for better performance
    });
    if (!ctx) return;

    let lastDrawTime = 0;
    const targetFPS = 30; // Match capture rate for efficiency
    const frameInterval = 1000 / targetFPS;

    const drawSkeleton = (timestamp: number) => {
      // Throttle to target FPS for better performance
      if (timestamp - lastDrawTime < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(drawSkeleton);
        return;
      }
      lastDrawTime = timestamp;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw if we have landmarks and are either capturing OR detecting
      if (currentLandmarks?.pose && (isCapturing || detectionActive) && canvas.width > 0 && canvas.height > 0) {
        const landmarks = currentLandmarks.pose;
        const width = canvas.width;
        const height = canvas.height;

        // Set rendering quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw connections first (behind dots)
        // Use different colors for detection vs capture
        ctx.strokeStyle = detectionActive && !isCapturing ? '#00FFFF' : '#00FF00'; // Cyan during detection, green during capture
        ctx.lineWidth = 3; // Slightly thicker for better visibility
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
          const start = landmarks[startIdx];
          const end = landmarks[endIdx];

          if (start && end && Array.isArray(start) && Array.isArray(end) &&
            start.length >= 4 && end.length >= 4) {
            const [x1, y1, , v1] = start;
            const [x2, y2, , v2] = end;

            // Only draw if both points are visible
            if (v1 > 0.5 && v2 > 0.5) {
              const avgVisibility = (v1 + v2) / 2;
              ctx.globalAlpha = avgVisibility * 0.8;

              ctx.beginPath();
              ctx.moveTo(x1 * width, y1 * height);
              ctx.lineTo(x2 * width, y2 * height);
              ctx.stroke();
            }
          }
        }

        // Draw landmarks (dots)
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 2;

        Object.entries(landmarks).forEach(([idx, landmark]) => {
          if (Array.isArray(landmark) && landmark.length >= 4) {
            const [x, y, , visibility] = landmark;

            // Only draw visible landmarks
            if (visibility > 0.5) {
              const pixelX = x * width;
              const pixelY = y * height;

              // Skip if outside canvas bounds (safety check)
              if (pixelX < 0 || pixelX > width || pixelY < 0 || pixelY > height) {
                return;
              }

              // Color based on visibility quality
              // Use cyan tones during detection, green tones during capture
              if (detectionActive && !isCapturing) {
                // Detection mode - cyan colors
                if (visibility > 0.8) {
                  ctx.fillStyle = '#00FFFF'; // Cyan - excellent
                } else if (visibility > 0.6) {
                  ctx.fillStyle = '#00CCCC'; // Light cyan - good
                } else {
                  ctx.fillStyle = '#0099CC'; // Blue-cyan - acceptable
                }
              } else {
                // Capture mode - green colors
                if (visibility > 0.8) {
                  ctx.fillStyle = '#00FF00'; // Green - excellent
                } else if (visibility > 0.6) {
                  ctx.fillStyle = '#FFFF00'; // Yellow - good
                } else {
                  ctx.fillStyle = '#FF9900'; // Orange - acceptable
                }
              }

              // Draw dot with outline (larger during detection for better visibility)
              const dotRadius = detectionActive && !isCapturing ? 6 : 5;
              ctx.beginPath();
              ctx.arc(pixelX, pixelY, dotRadius, 0, 2 * Math.PI);
              ctx.fill();

              // White outline for better visibility
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }
        });

        // Reset alpha
        ctx.globalAlpha = 1.0;

        // Draw full body visibility indicator during detection phase
        if (detectionActive && !isCapturing) {
          // Draw border around canvas to indicate detection status
          ctx.strokeStyle = overlayReadyRef.current ? '#00FF00' : '#FF0000';
          ctx.lineWidth = 8;
          ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

          // Draw status text
          ctx.font = 'bold 24px Arial';
          ctx.textAlign = 'center';
          ctx.fillStyle = overlayReadyRef.current ? '#00FF00' : '#FF0000';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          const statusText = overlayReadyRef.current
            ? '✓ Ready'
            : overlayMessageRef.current;
          ctx.strokeText(statusText, canvas.width / 2, 50);
          ctx.fillText(statusText, canvas.width / 2, 50);
        }
      }

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(drawSkeleton);
    };

    // Start drawing loop
    animationFrameRef.current = requestAnimationFrame(drawSkeleton);

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentLandmarks, isCapturing, detectionActive, isUserFullyVisible]);

  /**
   * Handle phase changes and start appropriate actions
   */
  useEffect(() => {
    if (currentPhase === 'front' || currentPhase === 'leftside' || currentPhase === 'rightside' || currentPhase === 'back') {
      if (!isCapturing && capturedFrames.length < TOTAL_FRAMES && !showConfirmation) {
        // Start capturing for this phase
        startPhaseCapture();
      }
    }
  }, [currentPhase, isCapturing, capturedFrames.length, showConfirmation, startPhaseCapture]);

  /**
   * Calculate progress percentage
   */
  const progressPercentage = (capturedFrames.length / TOTAL_FRAMES) * 100;

  /**
   * Get current phase display text
   */
  const getPhaseDisplayText = (): string => {
    switch (currentPhase) {
      case 'initial':
        return 'Initial Countdown';
      case 'front':
        return 'Front View Scanning';
      case 'leftside':
        return 'Left Side Pose Scanning';
      case 'rightside':
        return 'Right Side Pose Scanning';
      case 'back':
        return 'Back Pose Scanning';
      case 'break':
        return 'Break - Get Ready';
      case 'confirmation':
        return 'Review & Confirm';
      default:
        return 'Ready to Start';
    }
  };

  // Show loading state while MediaPipe initializes
  if (mediaPipeLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center max-w-md">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Loading AI Model...</h3>
          <p className="text-gray-600 mb-4">
            Downloading MediaPipe pose detection model (~10MB). This only happens once.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">Why this is better:</p>
            <ul className="text-left space-y-1">
              <li>✅ Processes frames instantly in your browser</li>
              <li>✅ No server load or delays</li>
              <li>✅ Works offline after first load</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Show error if MediaPipe failed to load
  if (mediaPipeError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
        <h3 className="text-lg font-semibold text-red-900 mb-2">Failed to Load</h3>
        <p className="text-red-700 mb-4">{mediaPipeError}</p>
        <div className="space-y-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
          <button
            onClick={onCancel}
            className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Webcam Container */}
      <div className="relative w-full max-w-5xl">
        {/* Webcam */}
        <div className="relative bg-black rounded-lg overflow-hidden shadow-lg" style={{ minHeight: '600px' }}>
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.92}
            videoConstraints={{
              width: 1920,
              height: 1080,
              facingMode: 'user'
            }}
            onUserMedia={handleUserMedia}
            onUserMediaError={handleUserMediaError}
            className="w-full h-auto"
          />

          {/* Real-time skeleton overlay canvas */}
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill', // Ensures canvas fills container without distortion
              zIndex: 10 // Ensure canvas is above video but below UI overlays
            }}
          />

          {/* Phase-specific overlay */}
          {webcamReady && (
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
              {/* Phase indicator */}
              <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 bg-${getPhaseColor(currentPhase)}-600 text-white px-4 py-2 rounded-lg text-sm font-medium`}>
                {getPhaseDisplayText()}
              </div>

              {/* Instructions */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg text-sm max-w-md text-center">
                {getPhaseInstructions(currentPhase)}
              </div>

              {/* Timer display for initial and break phases (only when user is visible) */}
              {(currentPhase === 'initial' || currentPhase === 'break') && readiness.ok && timerRemaining > 0 && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <div className="text-6xl font-bold text-white animate-pulse">
                    {timerRemaining}
                  </div>
                </div>
              )}

              {/* Readiness indicator during detection: visibility AND orientation */}
              {(currentPhase === 'initial' || currentPhase === 'break') && detectionActive && (
                <div className={`absolute top-20 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg text-lg font-semibold max-w-xl text-center ${readiness.ok
                  ? 'bg-green-600 text-white'
                  : 'bg-red-600 text-white animate-pulse'
                  }`}>
                  {readiness.ok ? '✓ Ready' : `✗ ${readiness.message}`}
                </div>
              )}

              {/* Frame counter (only during capture) */}
              {isCapturing && (
                <div className="absolute top-4 right-4 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg">
                  <div className="text-sm font-medium">
                    Frame {frameCount} / {FRAMES_PER_POSE}
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    {elapsedTime}s / 2s
                  </div>
                </div>
              )}

              {/* Recording indicator */}
              {isCapturing && (
                <div className="absolute top-4 left-4 flex items-center space-x-2 bg-red-600 text-white px-3 py-2 rounded-lg">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">Recording</span>
                </div>
              )}

              {/* Pose Guide Overlay (only when not capturing and not in timer phases) */}
              {webcamReady && !isCapturing && currentPhase !== 'initial' && currentPhase !== 'break' && currentPhase !== 'confirmation' && (
                <svg
                  className="absolute inset-0 w-full h-full opacity-30"
                  viewBox="0 0 1280 720"
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Head circle */}
                  <circle
                    cx="640"
                    cy="150"
                    r="60"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                  {/* Body line */}
                  <line
                    x1="640"
                    y1="210"
                    x2="640"
                    y2="500"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                  {/* Shoulders */}
                  <line
                    x1="540"
                    y1="250"
                    x2="740"
                    y2="250"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                  {/* Arms */}
                  <line
                    x1="540"
                    y1="250"
                    x2="480"
                    y2="400"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                  <line
                    x1="740"
                    y1="250"
                    x2="800"
                    y2="400"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                  {/* Hips */}
                  <line
                    x1="590"
                    y1="500"
                    x2="690"
                    y2="500"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                  {/* Legs */}
                  <line
                    x1="590"
                    y1="500"
                    x2="580"
                    y2="680"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                  <line
                    x1="690"
                    y1="500"
                    x2="700"
                    y2="680"
                    stroke="white"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                </svg>
              )}
            </div>
          )}

          {/* Permission Error Overlay */}
          {permissionError && (
            <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center">
              <div className="text-center text-white px-6">
                <svg
                  className="w-16 h-16 mx-auto mb-4 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <h3 className="text-lg font-semibold mb-2">Camera Access Required</h3>
                <p className="text-sm text-gray-300">{permissionError}</p>
              </div>
            </div>
          )}

          {/* Loading Overlay */}
          {!webcamReady && !permissionError && (
            <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                <p className="text-sm">Initializing camera...</p>
              </div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {(currentPhase !== 'initial' || capturedFrames.length > 0) && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-300 ease-linear"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>{Math.round(progressPercentage)}% Complete</span>
              <span>
                {currentPhase === 'confirmation'
                  ? 'Awaiting confirmation'
                  : `${TOTAL_FRAMES - capturedFrames.length} frames remaining`}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Phase: {currentPhase.toUpperCase()} | Frames: {capturedFrames.length}/{TOTAL_FRAMES}
            </div>
          </div>
        )}

        {/* ── Best-frame scan tracker (parallel UI — does not replace any existing UI) ── */}
        <CaptureProgress
          frameCount={trackerFrameCountRef.current}
          totalFrames={FRAMES_PER_POSE}
          bestVisibility={currentBestVisibility}
          isActive={isCapturing}
          betterFrameVersion={betterFrameVersion}
        />
      </div>

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirm Submission
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              We have captured {capturedFrames.length} frames from all four poses.
              Please confirm if you were able to provide proper posture views.
              If you sneezed or had any issues during scanning, you can restart.
            </p>
            <div className="flex space-x-4">
              <button
                onClick={handleConfirmSubmission}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                Yes, Submit Frames
              </button>
              <button
                onClick={handleRejectAndRestart}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                No, Restart Scanning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex space-x-4">
        {!isCapturing && !showConfirmation && currentPhase === 'initial' && capturedFrames.length === 0 && (
          <>
            <button
              onClick={startScanning}
              disabled={!webcamReady || permissionError !== null}
              className={`
                px-8 py-3 rounded-lg font-medium transition-all shadow-sm hover:shadow-md
                ${webcamReady && !permissionError
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              Start Scanning
            </button>
            <button
              onClick={handleCancel}
              className="px-8 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </>
        )}

        {isCapturing && (
          <button
            onClick={() => stopCapture(false)}
            className="px-8 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm hover:shadow-md"
          >
            Stop Capture
          </button>
        )}

        {/* Resume button if scanning was interrupted */}
        {!isCapturing && !showConfirmation && capturedFrames.length > 0 && capturedFrames.length < TOTAL_FRAMES && (
          <button
            onClick={startScanning}
            className="px-8 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            Resume Scanning
          </button>
        )}
      </div>

      {/* Instructions */}
      {!isCapturing && !showConfirmation && webcamReady && capturedFrames.length === 0 && currentPhase === 'initial' && (
        <div className="max-w-2xl text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            New Scanning Flow
          </h3>
          <p className="text-sm text-gray-600">
            We will start with a 5-second countdown, then capture three poses:
            Front (2s), Left Side (2s), Right Side (2s), and Back (2s) with 5-second breaks between each.
            After capturing all poses, you'll be asked to confirm before submission.
            Total: 240 frames across all poses.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
            <div className="bg-gray-100 text-gray-800 p-2 rounded">1. Initial Countdown (5s)</div>
            <div className="bg-blue-100 text-blue-800 p-2 rounded">2. Front View (60 frames)</div>
            <div className="bg-green-100 text-green-800 p-2 rounded">3. Left Side Pose (60 frames)</div>
            <div className="bg-orange-100 text-orange-800 p-2 rounded">4. Right Side Pose (60 frames)</div>
            <div className="bg-purple-100 text-purple-800 p-2 rounded">5. Back Pose (60 frames)</div>
          </div>
        </div>
      )}

      {/* Phase Status */}
      {capturedFrames.length > 0 && !showConfirmation && (
        <div className="max-w-2xl text-center">
          <div className="grid grid-cols-5 gap-2 mb-4">
            <div className="p-2 rounded bg-gray-600 text-white">
              Initial ✓
            </div>
            <div className={`p-2 rounded ${capturedFrames.length >= FRAMES_PER_POSE ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              Front {capturedFrames.length >= FRAMES_PER_POSE ? '✓' : '...'}
            </div>
            <div className={`p-2 rounded ${capturedFrames.length >= FRAMES_PER_POSE * 2 ? 'bg-green-600 text-white' : capturedFrames.length >= FRAMES_PER_POSE ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-500'}`}>
              Left Side {capturedFrames.length >= FRAMES_PER_POSE * 2 ? '✓' : '...'}
            </div>
            <div className={`p-2 rounded ${capturedFrames.length >= FRAMES_PER_POSE * 3 ? 'bg-orange-600 text-white' : capturedFrames.length >= FRAMES_PER_POSE * 2 ? 'bg-orange-200 text-orange-800' : 'bg-gray-200 text-gray-500'}`}>
              Right Side {capturedFrames.length >= FRAMES_PER_POSE * 3 ? '✓' : '...'}
            </div>
            <div className={`p-2 rounded ${capturedFrames.length >= TOTAL_FRAMES ? 'bg-purple-600 text-white' : capturedFrames.length >= FRAMES_PER_POSE * 3 ? 'bg-purple-200 text-purple-800' : 'bg-gray-200 text-gray-500'}`}>
              Back {capturedFrames.length >= TOTAL_FRAMES ? '✓' : '...'}
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Progress: {capturedFrames.length}/{TOTAL_FRAMES} frames captured
            {(currentPhase === 'initial' || currentPhase === 'break') && ` | Next phase in ${timerRemaining}s`}
          </p>
        </div>
      )}

      {/* Debug Info (development only) */}
      {(import.meta as any).env?.DEV && (
        <div className="text-xs text-gray-500 mt-4 bg-gray-100 p-3 rounded">
          <div className="font-bold mb-2">Debug Info:</div>
          <div>Booking ID: {bookingId}</div>
          <div>Webcam Ready: {webcamReady ? 'Yes' : 'No'}</div>
          <div>MediaPipe Ready: {poseLandmarker ? 'Yes' : 'No'}</div>
          <div>Current Phase: <span className="font-semibold">{currentPhase}</span></div>
          <div>Last Completed: {lastCompletedPhase}</div>
          <div>Capturing: {isCapturing ? 'Yes' : 'No'}</div>
          <div className="font-bold text-blue-600">Detection Active: {detectionActive ? 'YES - Skeleton should be visible!' : 'No'}</div>
          <div>Full Body Visible: {isUserFullyVisible ? 'Yes' : 'No'}</div>
          <div>Needs / sees: {upcomingView() ?? '-'} / {detectedView ?? 'undetermined'}</div>
          <div>Current Visibility: {(currentVisibility * 100).toFixed(1)}%</div>
          <div>Has Landmarks: {currentLandmarks?.pose ? `Yes (${Object.keys(currentLandmarks.pose).length} points)` : 'No'}</div>
          <div>Frames Captured: {capturedFrames.length}/{TOTAL_FRAMES}</div>
          <div>Timer: {timerRemaining}s</div>
          <div>User Confirmed: {userConfirmed ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  );
}
