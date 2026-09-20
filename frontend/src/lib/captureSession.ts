import { grabVideoSnapshot } from './snapshotHelper';
import { setBestFrame, saveCapture, type BestFrameData, type PoseView } from './postureStore';

// Key landmarks to track for quality scoring (same as spec)
const KEY_LANDMARKS = [0, 11, 12, 23, 24, 25, 26];
const VISIBILITY_THRESHOLD = 0.75;

export interface CaptureSessionState {
  currentView: PoseView;
  frameCount: number;
  totalFrames: number;
  bestFrame: BestFrameData | null;
  bestVisibility: number;
}

// Mutable singleton – lives for the lifetime of the capture session
export const captureSession: CaptureSessionState = {
  currentView: 'front',
  frameCount: 0,
  totalFrames: 60, // Default FRAMES_PER_POSE from existing component
  bestFrame: null,
  bestVisibility: 0,
};

/** Callbacks so the UI can react without polling */
interface CaptureSessionCallbacks {
  onBetterFrameFound?: (visibility: number, frameIndex: number) => void;
  onSessionFinalized?: (view: PoseView, frameData: BestFrameData) => void;
}

let _callbacks: CaptureSessionCallbacks = {};

export function setCaptureCallbacks(cbs: CaptureSessionCallbacks) {
  _callbacks = cbs;
}

/**
 * Reset the session when a new pose view begins.
 * Call this wherever the existing transition logic fires (front → side → back).
 */
export function resetCaptureSession(newView: PoseView, totalFrames = 60): void {
  captureSession.currentView = newView;
  captureSession.frameCount = 0;
  captureSession.totalFrames = totalFrames;
  captureSession.bestFrame = null;
  captureSession.bestVisibility = 0;
}

/**
 * Called inside the existing capture loop for every processed frame.
 * Tracks the best-visibility frame across all frames in this session.
 *
 * @param worldLandmarks - poseWorldLandmarks from MediaPipe (3-D metric coords)
 * @param screenLandmarks - poseLandmarks from MediaPipe (normalized 0-1)
 * @param videoEl         - the raw <video> element (NOT the overlay canvas)
 */
export function bestFrameTracker(
  worldLandmarks: Array<{ x: number; y: number; z: number; visibility?: number }> | null,
  screenLandmarks: Array<{ x: number; y: number; z: number; visibility?: number }> | null,
  videoEl: HTMLVideoElement | null
): void {
  if (!worldLandmarks || !screenLandmarks || !videoEl) return;

  captureSession.frameCount++;

  // Score by key-landmark average visibility
  const avgVisibility =
    KEY_LANDMARKS.reduce((sum, i) => sum + (worldLandmarks[i]?.visibility ?? 0), 0) /
    KEY_LANDMARKS.length;

  if (
    avgVisibility >= VISIBILITY_THRESHOLD &&
    avgVisibility > captureSession.bestVisibility
  ) {
    captureSession.bestVisibility = avgVisibility;
    captureSession.bestFrame = {
      imageDataUrl: grabVideoSnapshot(videoEl),
      landmarks3D: worldLandmarks,
      landmarks2D: screenLandmarks,
      visibility: avgVisibility,
      frameIndex: captureSession.frameCount,
      view: captureSession.currentView,
    };

    _callbacks.onBetterFrameFound?.(avgVisibility, captureSession.frameCount);
  }

  // Finalize after all frames processed
  if (captureSession.frameCount >= captureSession.totalFrames) {
    finalizeCapture();
  }
}

async function finalizeCapture(): Promise<void> {
  if (!captureSession.bestFrame) return;

  const { currentView, bestFrame } = captureSession;

  // Layer 1 – in-memory (instant)
  setBestFrame(currentView, bestFrame);

  // Layer 2 – IndexedDB (persistent)
  await saveCapture(currentView, bestFrame);

  _callbacks.onSessionFinalized?.(currentView, bestFrame);
}
