import {
  detectView,
  orientationBlocks,
  orientationMessage,
  type CaptureView,
} from '../../lib/captureOrientation';
import { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useMediaPipePose } from '../../hooks/useMediaPipePose';

// Same skeleton connections as WebcamCapture.tsx
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32],
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
];

export type GaitView = 'front' | 'leftside' | 'rightside';

export interface GaitFrameData {
  frameIndex: number;
  landmarks: Record<string, number[]>;
  timestamp: number;
}

export interface GaitViewCapture {
  timeSeries: GaitFrameData[];
  backgroundImage: string | null;
  bestVisibility: number;
  frameCount: number;
}

export interface GaitCaptureResult {
  views: Record<GaitView, GaitViewCapture>;
  totalFrames: number;
  capturedViews: string;
  fps: number;
  /**
   * Actual capture dimensions, read from the video track rather than assumed from the
   * requested constraints - browsers frequently hand back a different resolution than
   * the one asked for.
   *
   * The backend needs these because MediaPipe normalises x by width and y by height,
   * making normalised landmark space anisotropic on any non-square frame. Without the
   * true dimensions every angle is skewed by the aspect ratio: on a 16:9 capture that
   * turned 60 degrees of peak knee flexion into 41.9.
   */
  imageWidth: number;
  imageHeight: number;
}

export interface GaitWebcamCaptureProps {
  onCaptureComplete: (result: GaitCaptureResult) => void;
  onError: (error: string) => void;
  onCancel: () => void;
  bookingId: string;
}

type CapturePhase =
  | 'loading'        // MediaPipe loading
  | 'initial'        // Initial countdown (5s)
  | 'front'          // Capturing front view (5s walking)
  | 'front_break'    // Break before leftside (5s)
  | 'leftside'       // Capturing left side (5s walking)
  | 'leftside_break' // Break before rightside (5s)
  | 'rightside'      // Capturing right side (5s walking)
  | 'confirmation';  // User confirms

/**
 * 60 fps, not 30.
 *
 * Several gait measurements are limited by the sampling rate rather than by anything
 * we compute. The knee's extension trough is briefer than one frame at 30 fps, so its
 * depth cannot be recovered at all: certification measured knee flexion range 10.6
 * degrees low and within tolerance on only 85% of captures at 30 fps, against 5.3
 * degrees and 100% at 60. The backend withholds that metric below 50 fps rather than
 * report a number it knows reads low.
 *
 * TARGET_FPS is what we ASK for. It is not what we get - the capture loop shares a
 * thread with MediaPipe inference, and a mid-range laptop will drop frames. Which is
 * why the rate sent to the backend is measured from the frames' own timestamps below,
 * and why the backend re-derives it rather than trusting the number.
 */
const TARGET_FPS = 60;
const SECONDS_PER_VIEW = 5;
const FRAMES_PER_VIEW = SECONDS_PER_VIEW * TARGET_FPS;
/** Below this the capture is too sparse to analyse whatever the nominal rate was. */
const MIN_FRAMES_PER_VIEW = 60;
const BREAK_DURATION = 5;
const INITIAL_COUNTDOWN = 5;
const VISIBILITY_THRESHOLD = 0.5;

/**
 * Frame rate implied by a captured series, from the frames' own timestamps.
 *
 * Median interval, not mean: a capture that stalls for a few frames while the tab is
 * backgrounded or inference spikes should not drag the whole time base with it.
 * Returns null when there is too little to measure, so the caller can fall back.
 */
function measuredFps(series: Array<{ timestamp?: number }>): number | null {
  const stamps = series
    .map(f => f.timestamp)
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  if (stamps.length < 10) return null;

  const deltas: number[] = [];
  for (let i = 1; i < stamps.length; i++) {
    const d = stamps[i] - stamps[i - 1];
    if (d > 0.5 && d < 500) deltas.push(d);
  }
  if (deltas.length < 8) return null;

  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  return median > 0 ? Math.round(1000 / median) : null;
}

/**
 * The stance each waiting phase is waiting for.
 *
 * Only the phases where the subject is standing still getting into position. During a
 * capture they are walking, and a walker passes through every orientation - so the
 * question "are they facing the right way" is only meaningful before the walk starts.
 *
 * The front capture accepts either direction because it is a walk toward the camera AND
 * back: a subject who starts at the near end produces the same data in the opposite
 * order. The side captures do not accept either, because that is exactly the confusion
 * that puts a right-side walk in the leftside slot.
 */
const REQUIRED_STANCE: Partial<Record<CapturePhase, readonly CaptureView[]>> = {
  initial: ['front', 'back'],
  front_break: ['leftside'],
  leftside_break: ['rightside'],
};

const VIEW_INSTRUCTIONS: Record<string, { title: string; body: string; icon: string }> = {
  front: {
    title: 'Front View — Walk Toward & Away',
    body: 'Walk toward the camera and back. Keep your full body visible.',
    icon: '🚶',
  },
  front_break: {
    title: 'Next: Left Side View',
    body: 'Turn so your LEFT side faces the camera. Walk from left to right.',
    icon: '↩️',
  },
  leftside: {
    title: 'Left Side — Walk Left to Right',
    body: 'Walk parallel to the camera with your left side facing it.',
    icon: '🚶‍♂️',
  },
  leftside_break: {
    title: 'Next: Right Side View',
    body: 'Turn so your RIGHT side faces the camera. Walk from right to left.',
    icon: '↪️',
  },
  rightside: {
    title: 'Right Side — Walk Right to Left',
    body: 'Walk parallel to the camera with your right side facing it.',
    icon: '🚶',
  },
};

function phaseToView(phase: CapturePhase): GaitView | null {
  if (phase === 'front') return 'front';
  if (phase === 'leftside') return 'leftside';
  if (phase === 'rightside') return 'rightside';
  return null;
}

// Map capture phase to the poseType param expected by useMediaPipePose.processFrame
function phaseToPoseType(phase: CapturePhase): 'front' | 'leftside' | 'rightside' | 'back' {
  if (phase === 'leftside') return 'leftside';
  if (phase === 'rightside') return 'rightside';
  return 'front';
}

export default function GaitWebcamCapture({
  onCaptureComplete,
  onError,
  onCancel,
}: GaitWebcamCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureRafRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  // Store landmarks using a ref so the capture loop always sees the latest value
  // without causing re-renders on every frame
  const currentLandmarksRef = useRef<Record<number, [number, number, number, number]> | null>(null);
  const frameNumberRef = useRef(0);

  const {
    poseLandmarker,
    isLoading: mediaPipeLoading,
    error: mediaPipeError,
    processFrame: processWithMediaPipe,
  } = useMediaPipePose();

  const [phase, setPhase] = useState<CapturePhase>('loading');
  const [timerRemaining, setTimerRemaining] = useState(INITIAL_COUNTDOWN);
  const [capturedFrameCount, setCapturedFrameCount] = useState(0);
  const [currentVisibility, setCurrentVisibility] = useState(0);
  const [webcamReady, setWebcamReady] = useState(false);
  // Separate state for rendering the skeleton (triggers canvas redraw)
  const [renderTick, setRenderTick] = useState(0);
  /**
   * The stance the camera can actually see. Held as consecutive agreeing frames: a
   * subject walking back to the start line passes through every orientation, and a
   * gate reacting to a single frame would strobe while they did as they were asked.
   */
  const [detectedView, setDetectedView] = useState<CaptureView | null>(null);
  const viewVotesRef = useRef<{ view: CaptureView | null; count: number }>({ view: null, count: 0 });

  // Collected data per view
  const capturedViews = useRef<Partial<Record<GaitView, GaitViewCapture>>>({});
  const currentTimeSeries = useRef<GaitFrameData[]>([]);
  const bestFrameRef = useRef<{ image: string | null; visibility: number }>({
    image: null,
    visibility: 0,
  });
  const frameIndexRef = useRef(0);
  // Track current phase in a ref so interval callbacks always read the latest value
  const phaseRef = useRef<CapturePhase>('loading');

  // Keep phaseRef in sync with phase state
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // A stance read during the previous view must not gate the next one.
  useEffect(() => {
    viewVotesRef.current = { view: null, count: 0 };
    setDetectedView(null);
  }, [phase]);

  // ── MEDIAPIPE LOADED ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mediaPipeLoading && !mediaPipeError && poseLandmarker) {
      setPhase('initial');
      setTimerRemaining(INITIAL_COUNTDOWN);
    }
    if (mediaPipeError) {
      onError(`MediaPipe failed to load: ${mediaPipeError}`);
    }
  }, [mediaPipeLoading, mediaPipeError, poseLandmarker, onError]);

  // ── LIVE DETECTION LOOP ───────────────────────────────────────────────────────
  const detectLoop = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video || !poseLandmarker || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    try {
      // processFrame signature: (videoElement, frameNumber, poseType)
      const result = processWithMediaPipe(
        video,
        frameNumberRef.current++,
        phaseToPoseType(phaseRef.current)
      );

      if (result?.landmarks?.pose) {
        currentLandmarksRef.current = result.landmarks.pose;
        setCurrentVisibility(result.visibility);
        // Trigger skeleton redraw
        setRenderTick(t => t + 1);

        const seen = detectView(result.landmarks.pose as Record<number, number[]>);
        const votes = viewVotesRef.current;
        if (seen === votes.view) {
          votes.count += 1;
        } else {
          votes.view = seen;
          votes.count = 1;
        }
        if (votes.count >= 3) setDetectedView(seen);
      }
    } catch {
      // Ignore frame detection errors
    }

    animationFrameRef.current = requestAnimationFrame(detectLoop);
  }, [poseLandmarker, processWithMediaPipe]);

  useEffect(() => {
    if (webcamReady && poseLandmarker) {
      animationFrameRef.current = requestAnimationFrame(detectLoop);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [webcamReady, poseLandmarker, detectLoop]);

  // ── SKELETON DRAWING ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const lms = currentLandmarksRef.current;
    if (!lms) return;

    const isCapturing = ['front', 'leftside', 'rightside'].includes(phase);
    const color = isCapturing ? '#00FF88' : '#00D4FF';

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    for (const [si, ei] of POSE_CONNECTIONS) {
      const s = lms[si];
      const e = lms[ei];
      if (!s || !e) continue;
      const [sx, sy, , sv] = s;
      const [ex, ey, , ev] = e;
      if (sv > VISIBILITY_THRESHOLD && ev > VISIBILITY_THRESHOLD) {
        ctx.globalAlpha = Math.min(sv, ev) * 0.9;
        ctx.beginPath();
        ctx.moveTo(sx * canvas.width, sy * canvas.height);
        ctx.lineTo(ex * canvas.width, ey * canvas.height);
        ctx.stroke();
      }
    }

    // Draw joints
    ctx.globalAlpha = 1.0;
    Object.values(lms).forEach((lm) => {
      if (!Array.isArray(lm) || lm.length < 4) return;
      const [x, y, , vis] = lm as [number, number, number, number];
      if (vis > VISIBILITY_THRESHOLD) {
        ctx.fillStyle = isCapturing ? '#00FF88' : '#00D4FF';
        ctx.beginPath();
        ctx.arc(x * canvas.width, y * canvas.height, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }, [renderTick, phase]);

  // ── CAPTURE A SINGLE FRAME ────────────────────────────────────────────────────
  const captureFrame = useCallback((): GaitFrameData | null => {
    const lms = currentLandmarksRef.current;
    if (!lms) return null;

    // Convert numeric-keyed pose landmarks to string-keyed record for serialization
    // Round to 4 decimal places to reduce JSON body size (~70% smaller than full float64)
    const landmarks: Record<string, number[]> = {};
    Object.entries(lms).forEach(([idx, lm]) => {
      if (Array.isArray(lm)) {
        landmarks[idx] = (lm as number[]).map(v => Math.round(v * 10000) / 10000);
      }
    });

    if (Object.keys(landmarks).length < 10) return null;

    // Calculate visibility for best frame tracking
    const keyIndices = [0, 11, 12, 23, 24, 25, 26, 27, 28];
    let totalVis = 0;
    let count = 0;
    for (const idx of keyIndices) {
      const lm = landmarks[idx.toString()];
      if (lm && lm.length >= 4) {
        totalVis += lm[3];
        count++;
      }
    }
    const vis = count > 0 ? totalVis / count : 0;

    // Track best frame (highest visibility) for background image
    if (vis > bestFrameRef.current.visibility) {
      const imageSrc = webcamRef.current?.getScreenshot({ width: 320, height: 240 });
      if (imageSrc) {
        bestFrameRef.current = { image: imageSrc, visibility: vis };
      }
    }

    const frame: GaitFrameData = {
      frameIndex: frameIndexRef.current++,
      landmarks,
      timestamp: performance.now(),
    };

    return frame;
  }, []);

  // ── START CAPTURING A VIEW ────────────────────────────────────────────────────
  const startViewCapture = useCallback(
    (view: GaitView) => {
      currentTimeSeries.current = [];
      bestFrameRef.current = { image: null, visibility: 0 };
      frameIndexRef.current = 0;
      setCapturedFrameCount(0);

      let attempts = 0;
      const maxAttempts = Math.floor(FRAMES_PER_VIEW * 1.5);
      const deadline = performance.now() + SECONDS_PER_VIEW * 1.6 * 1000;

      // requestAnimationFrame rather than setInterval. A 60 fps setInterval asks for a
      // callback every 16.7 ms, which the browser will not honour while MediaPipe is
      // running inference on the same thread - the timer backs up and fires in bursts,
      // so frames arrive uneven and the timestamps we derive the rate from get noisy.
      // rAF is aligned to the display's refresh and simply skips when we are behind,
      // which yields fewer frames but honestly spaced ones.
      const pump = () => {
        const frame = captureFrame();
        if (frame) {
          currentTimeSeries.current.push(frame);
          setCapturedFrameCount(currentTimeSeries.current.length);
        }
        attempts++;

        const done =
          currentTimeSeries.current.length >= FRAMES_PER_VIEW ||
          attempts >= maxAttempts ||
          performance.now() >= deadline;

        if (!done) {
          captureRafRef.current = requestAnimationFrame(pump);
          return;
        }
        captureRafRef.current = null;

        {
          if (currentTimeSeries.current.length < MIN_FRAMES_PER_VIEW) {
            onError(
              `Too few frames captured for ${view} view (${currentTimeSeries.current.length}). Ensure good lighting and full body visibility.`
            );
            return;
          }

          // Save this view's data
          capturedViews.current[view] = {
            timeSeries: [...currentTimeSeries.current],
            backgroundImage: bestFrameRef.current.image,
            bestVisibility: bestFrameRef.current.visibility,
            frameCount: currentTimeSeries.current.length,
          };

          // Advance to next phase
          const phaseMap: Record<GaitView, CapturePhase> = {
            front: 'front_break',
            leftside: 'leftside_break',
            rightside: 'confirmation',
          };
          setPhase(phaseMap[view]);
          setTimerRemaining(BREAK_DURATION);
        }
      };
      captureRafRef.current = requestAnimationFrame(pump);
    },
    [captureFrame, onError]
  );

  // ── TIMER FOR BREAKS AND COUNTDOWN ───────────────────────────────────────────
  const startTimer = useCallback((seconds: number, onDone: () => void) => {
    setTimerRemaining(seconds);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimerRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current!);
          timerIntervalRef.current = null;
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // ── ORIENTATION GATE ──────────────────────────────────────────────────────────
  const requiredStance = REQUIRED_STANCE[phase];
  const wrongWay = requiredStance !== undefined
    && orientationBlocks(requiredStance, detectedView);

  // ── PHASE TRANSITIONS ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Hold the countdown while the subject is confirmed to be facing the wrong way.
    // A right-side walk recorded in the leftside slot is not a recoverable error: the
    // session ends up with two captures of one side, no data for the other, and nothing
    // to cross-check against. Live, while they are still in front of the camera, is the
    // only point at which it costs a few seconds instead of a repeat visit.
    if (wrongWay) {
      // Stop a countdown already in flight. Without this, a subject who turns away
      // three seconds in still gets captured - the gate would only ever have caught
      // someone who was wrong from the very first frame.
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setTimerRemaining(phase === 'initial' ? INITIAL_COUNTDOWN : BREAK_DURATION);
      return;
    }

    if (phase === 'initial') {
      startTimer(INITIAL_COUNTDOWN, () => {
        setPhase('front');
      });
    } else if (phase === 'front') {
      startViewCapture('front');
    } else if (phase === 'front_break') {
      startTimer(BREAK_DURATION, () => setPhase('leftside'));
    } else if (phase === 'leftside') {
      startViewCapture('leftside');
    } else if (phase === 'leftside_break') {
      startTimer(BREAK_DURATION, () => setPhase('rightside'));
    } else if (phase === 'rightside') {
      startViewCapture('rightside');
    }
    // 'confirmation' handled by user interaction
  }, [phase, startTimer, startViewCapture, wrongWay]);

  // ── CONFIRM SUBMISSION ────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    const video = webcamRef.current?.video;
    const views = capturedViews.current;
    const viewNames = Object.keys(views) as GaitView[];

    if (viewNames.length < 2) {
      onError(
        'Insufficient views captured. Please restart and capture all 3 views.'
      );
      return;
    }

    const totalFrames = viewNames.reduce(
      (sum, v) => sum + (views[v]?.frameCount || 0),
      0
    );

    const result: GaitCaptureResult = {
      views: viewNames.reduce((acc, v) => {
        const vd = views[v]!;
        acc[v] = {
          timeSeries: vd.timeSeries,
          backgroundImage: vd.backgroundImage,
          bestVisibility: vd.bestVisibility,
          frameCount: vd.frameCount,
        };
        return acc;
      }, {} as Record<GaitView, GaitViewCapture>),
      totalFrames,
      capturedViews: viewNames.join(','),
      // The MEASURED rate, not TARGET_FPS. Every temporal metric downstream divides by
      // this: cadence, stride time, stance percentage, walking speed. A capture that
      // asked for 60 and delivered 45 would inflate all of them by a third, uniformly
      // and undetectably, because the data is self-consistent - just on the wrong time
      // base. The backend re-derives this from the same timestamps and prefers its own
      // measurement; sending it here keeps the two honest about disagreeing.
      fps: measuredFps(views[viewNames[0]]?.timeSeries ?? []) ?? TARGET_FPS,
      imageWidth: video?.videoWidth ?? 640,
      imageHeight: video?.videoHeight ?? 480,
    };

    onCaptureComplete(result);
  }, [onCaptureComplete, onError]);

  // ── CLEANUP ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (captureRafRef.current) cancelAnimationFrame(captureRafRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // ── PROGRESS HELPERS ──────────────────────────────────────────────────────────
  const getPhaseLabel = () => {
    const view = phaseToView(phase);
    if (view) {
      const labels: Record<GaitView, string> = {
        front: 'Front View',
        leftside: 'Left Side',
        rightside: 'Right Side',
      };
      return labels[view];
    }
    if (phase === 'front_break') return 'Get Ready: Left Side';
    if (phase === 'leftside_break') return 'Get Ready: Right Side';
    if (phase === 'initial') return 'Get in Position';
    if (phase === 'loading') return 'Loading AI...';
    if (phase === 'confirmation') return 'Review Capture';
    return '';
  };

  const getOverallProgress = () => {
    const viewProgress: Record<string, number> = {
      loading: 0,
      initial: 0,
      front: (capturedFrameCount / FRAMES_PER_VIEW) * 33,
      front_break: 33,
      leftside: 33 + (capturedFrameCount / FRAMES_PER_VIEW) * 33,
      leftside_break: 66,
      rightside: 66 + (capturedFrameCount / FRAMES_PER_VIEW) * 34,
      confirmation: 100,
    };
    return viewProgress[phase] || 0;
  };

  const isActiveCapture = ['front', 'leftside', 'rightside'].includes(phase);
  const isBreak = ['front_break', 'leftside_break'].includes(phase);
  const isCountdown = phase === 'initial';

  // ── RENDER ─────────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-300">Loading AI Pose Detection...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto">
      {/* Stance gate: red and blocking while the subject faces the wrong way. */}
      {requiredStance !== undefined && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-semibold text-center ${
            wrongWay
              ? 'bg-red-600 text-white animate-pulse'
              : 'bg-green-700/80 text-white'
          }`}
        >
          {wrongWay && detectedView
            ? `✗ ${orientationMessage(requiredStance, detectedView)}`
            : '✓ Ready — hold still'}
        </div>
      )}

      {/* Phase Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{getPhaseLabel()}</h3>
          <p className="text-sm text-gray-400">
            {isActiveCapture && `${capturedFrameCount} / ${FRAMES_PER_VIEW} frames`}
            {isBreak && (wrongWay ? 'Waiting for you to turn' : `Next view in ${timerRemaining}s`)}
            {isCountdown && (wrongWay ? 'Waiting for you to turn' : `Starting in ${timerRemaining}s`)}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-white text-sm underline"
        >
          Cancel
        </button>
      </div>

      {/* Overall Progress Bar */}
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${getOverallProgress()}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span className={capturedViews.current.front ? 'text-green-400' : ''}>
          Front
        </span>
        <span className={capturedViews.current.leftside ? 'text-green-400' : ''}>
          Left Side
        </span>
        <span className={capturedViews.current.rightside ? 'text-green-400' : ''}>
          Right Side
        </span>
      </div>

      {/* Camera View */}
      {phase !== 'confirmation' && (
        <div
          className="relative rounded-xl overflow-hidden bg-black"
          style={{ aspectRatio: '4/3' }}
        >
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.8}
            videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
            onUserMedia={() => setWebcamReady(true)}
            onUserMediaError={() =>
              onError('Camera access denied. Please allow camera access.')
            }
            className="w-full h-full object-cover"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            width={640}
            height={480}
          />

          {/* Countdown / break overlay */}
          {(isCountdown || isBreak) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
              <div className="text-7xl font-bold text-white mb-4">
                {timerRemaining}
              </div>
              {isBreak && (
                <div className="text-center px-6">
                  <p className="text-xl font-semibold text-white mb-2">
                    {VIEW_INSTRUCTIONS[phase]?.title}
                  </p>
                  <p className="text-gray-300">
                    {VIEW_INSTRUCTIONS[phase]?.body}
                  </p>
                </div>
              )}
              {isCountdown && (
                <p className="text-white text-lg">
                  Walk naturally when countdown ends
                </p>
              )}
            </div>
          )}

          {/* Capture indicator */}
          {isActiveCapture && (
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/50 rounded-full px-3 py-1">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-medium">RECORDING</span>
            </div>
          )}

          {/* Visibility indicator */}
          <div className="absolute bottom-3 right-3 bg-black/60 rounded-lg px-3 py-1">
            <span className="text-xs text-gray-300">
              Visibility:{' '}
              <span
                className={
                  currentVisibility > 0.7
                    ? 'text-green-400'
                    : currentVisibility > 0.5
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }
              >
                {(currentVisibility * 100).toFixed(0)}%
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Confirmation Screen */}
      {phase === 'confirmation' && (
        <div className="bg-gray-800/50 rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-white text-center">
            Capture Complete!
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {(['front', 'leftside', 'rightside'] as GaitView[]).map(view => {
              const vd = capturedViews.current[view];
              return (
                <div
                  key={view}
                  className="bg-gray-700 rounded-lg p-3 text-center"
                >
                  {vd?.backgroundImage ? (
                    <img
                      src={vd.backgroundImage}
                      className="w-full rounded mb-2 object-cover"
                      style={{ aspectRatio: '4/3' }}
                      alt={view}
                    />
                  ) : (
                    <div
                      className="w-full rounded mb-2 bg-gray-600 flex items-center justify-center"
                      style={{ aspectRatio: '4/3' }}
                    >
                      <span className="text-gray-400 text-xs">No image</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-300 capitalize">
                    {view.replace('side', ' Side')}
                  </p>
                  <p className="text-xs text-green-400">
                    {vd?.frameCount || 0} frames
                  </p>
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => {
                capturedViews.current = {};
                setPhase('initial');
                setTimerRemaining(INITIAL_COUNTDOWN);
              }}
              className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Retake
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
            >
              Submit Analysis
            </button>
          </div>
        </div>
      )}

      {/* Instructions for current view */}
      {isActiveCapture && (
        <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
          <p className="text-sm text-blue-200">
            {VIEW_INSTRUCTIONS[phase]?.body ||
              'Walk naturally with your full body visible.'}
          </p>
        </div>
      )}
    </div>
  );
}
