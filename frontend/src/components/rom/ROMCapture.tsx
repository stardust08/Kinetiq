/**
 * Range-of-motion capture: a sequence of end-range holds.
 *
 * Each movement is one held position, captured from the view its plane requires. The
 * flow reuses the two gates the posture and gait captures arrived at, because the
 * failures they prevent are identical here:
 *
 *   - the subject must be fully in frame before a countdown starts, and
 *   - the subject must be facing the way the capture needs.
 *
 * The orientation gate matters more for ROM than anywhere else. A session walks the
 * patient through front, right-side and left-side setups, and a hold performed from the
 * wrong side measures the far limb through the near one. The backend detects that after
 * the fact; catching it here, while the patient is still standing there, is the only
 * cheap fix.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { useMediaPipePose } from '../../hooks/useMediaPipePose';
import {
  detectView,
  orientationBlocks,
  orientationMessage,
  type CaptureView as DetectedView,
} from '../../lib/captureOrientation';
import {
  FRAMES_PER_HOLD,
  HOLD_SECONDS,
  ROM_MOVEMENTS,
  type ROMMovement,
} from '../../lib/romMovements';
import type { ROMCaptureResult, ROMMovementCapture } from '../../api/rom';

const READY_COUNTDOWN = 4;
const VISIBILITY_THRESHOLD = 0.5;
/** Landmarks that must be visible before any hold can start. */
const KEY_LANDMARKS = [0, 11, 12, 23, 24, 25, 26, 27, 28];

type Phase = 'loading' | 'ready' | 'capturing' | 'between' | 'done';

interface Props {
  onComplete: (result: ROMCaptureResult) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}

export default function ROMCapture({ onComplete, onError, onCancel }: Props) {
  const webcamRef = useRef<Webcam>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturedRef = useRef<Record<string, ROMMovementCapture>>({});
  const samplesRef = useRef<Array<Record<string, unknown>>>([]);
  const votesRef = useRef<{ view: DetectedView | null; count: number }>({
    view: null,
    count: 0,
  });

  const { poseLandmarker, isLoading, error, processFrame } = useMediaPipePose();

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [countdown, setCountdown] = useState(READY_COUNTDOWN);
  const [frameCount, setFrameCount] = useState(0);
  const [bodyVisible, setBodyVisible] = useState(false);
  const [detected, setDetected] = useState<DetectedView | null>(null);

  const movement: ROMMovement | undefined = ROM_MOVEMENTS[index];

  useEffect(() => {
    if (!isLoading && !error && poseLandmarker) setPhase('ready');
    if (error) onError(`Pose detection failed to load: ${error}`);
  }, [isLoading, error, poseLandmarker, onError]);

  // A stance read during the previous movement must not gate the next one.
  useEffect(() => {
    votesRef.current = { view: null, count: 0 };
    setDetected(null);
  }, [index]);

  const fullyVisible = useCallback((landmarks: any): boolean => {
    const pose = landmarks?.pose;
    if (!pose) return false;
    const seen = KEY_LANDMARKS.filter((i) => {
      const lm = pose[i] ?? pose[String(i)];
      return Array.isArray(lm) && lm.length >= 4 && lm[3] >= VISIBILITY_THRESHOLD;
    });
    return seen.length >= Math.ceil(KEY_LANDMARKS.length * 0.9);
  }, []);

  // ── detection loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!poseLandmarker) return;
    let cancelled = false;

    const loop = () => {
      if (cancelled) return;
      const video = webcamRef.current?.video;
      if (video && video.readyState >= 2) {
        try {
          const frame = processFrame(video, 0, 'front');
          if (frame?.landmarks) {
            setBodyVisible(fullyVisible(frame.landmarks));

            // Three consecutive agreeing frames before acting: a patient turning
            // between setups passes through every orientation on the way, and a gate
            // reacting to one frame would strobe while they did as they were asked.
            const seen = detectView(
              frame.landmarks.pose as unknown as Record<number, number[]>,
            );
            const votes = votesRef.current;
            if (seen === votes.view) {
              votes.count += 1;
            } else {
              votes.view = seen;
              votes.count = 1;
            }
            if (votes.count >= 3) setDetected(seen);

            if (phase === 'capturing' && samplesRef.current.length < FRAMES_PER_HOLD) {
              const sample: Record<string, unknown> = { ...frame.landmarks };
              if (frame.worldLandmarks?.length) {
                const world: Record<number, number[]> = {};
                frame.worldLandmarks.forEach((lm, i) => {
                  world[i] = [lm.x, lm.y, lm.z, lm.visibility ?? 1];
                });
                sample.pose_world = world;
              }
              samplesRef.current.push(sample);
              setFrameCount(samplesRef.current.length);
            }
          }
        } catch {
          /* a dropped frame is not an error worth surfacing */
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [poseLandmarker, processFrame, phase, fullyVisible]);

  // ── readiness ──────────────────────────────────────────────────────────────
  const wrongWay = movement ? orientationBlocks(movement.view, detected) : false;
  const ready = bodyVisible && !wrongWay;
  const readiness = !bodyVisible
    ? 'Step back until your whole body is in frame'
    : wrongWay && detected && movement
      ? orientationMessage(movement.view, detected)
      : 'Hold the position';

  // ── countdown, then the hold ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'ready' || !ready) {
      // Hold the countdown while the subject is not ready, and reset it, so someone who
      // drifts out of frame three seconds in does not get captured anyway.
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCountdown(READY_COUNTDOWN);
      return;
    }
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          samplesRef.current = [];
          setFrameCount(0);
          setPhase('capturing');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, ready]);

  // ── end of a hold ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'capturing' || frameCount < FRAMES_PER_HOLD || !movement) return;

    capturedRef.current[movement.id] = {
      view: movement.view,
      samples: [...samplesRef.current],
      frameCount: samplesRef.current.length,
    };

    if (index + 1 >= ROM_MOVEMENTS.length) {
      const video = webcamRef.current?.video;
      setPhase('done');
      onComplete({
        movements: capturedRef.current,
        coordinateSpace: 'normalized',
        imageWidth: video?.videoWidth ?? 1280,
        imageHeight: video?.videoHeight ?? 720,
      });
    } else {
      setPhase('between');
    }
  }, [phase, frameCount, movement, index, onComplete]);

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-300">Loading pose detection…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Movement {index + 1} of {ROM_MOVEMENTS.length}
          </p>
          <h3 className="text-lg font-semibold text-white">
            {movement?.icon} {movement?.title}
          </h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">{movement?.instruction}</p>
        </div>
        <button onClick={onCancel} className="text-slate-400 hover:text-white text-sm underline">
          Cancel
        </button>
      </div>

      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
          style={{ width: `${(index / ROM_MOVEMENTS.length) * 100}%` }}
        />
      </div>

      <div className="relative rounded-xl overflow-hidden bg-black">
        <Webcam
          ref={webcamRef}
          audio={false}
          videoConstraints={{ width: 1280, height: 720, facingMode: 'user' }}
          className="w-full h-auto"
        />

        {phase === 'ready' && (
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg text-sm font-semibold text-center max-w-md ${
              ready ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white animate-pulse'
            }`}
          >
            {ready ? `✓ ${readiness}` : `✗ ${readiness}`}
          </div>
        )}

        {phase === 'ready' && ready && countdown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-7xl font-bold text-white animate-pulse">{countdown}</span>
          </div>
        )}

        {phase === 'capturing' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-lg bg-violet-600 text-white text-sm font-semibold">
            Hold… {(Math.round((frameCount / FRAMES_PER_HOLD) * HOLD_SECONDS * 10) / 10).toFixed(1)}s
            {' / '}
            {HOLD_SECONDS}s
          </div>
        )}
      </div>

      {phase === 'between' && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-slate-300">
            Captured. Next:{' '}
            <span className="text-white font-medium">{ROM_MOVEMENTS[index + 1]?.title}</span>
          </p>
          <button
            onClick={() => {
              setIndex((i) => i + 1);
              setPhase('ready');
            }}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-semibold"
          >
            I&apos;m ready
          </button>
        </div>
      )}
    </div>
  );
}
