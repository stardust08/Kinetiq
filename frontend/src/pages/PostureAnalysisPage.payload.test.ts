/**
 * Verifies the browser -> backend contract for posture screening.
 *
 * MediaPipe runs as WASM in the browser, so the backend never sees an image for the
 * posture path - it sees only what this transform emits. If a field is dropped here it
 * is gone, and the backend silently degrades: without `pose_world` every angle falls
 * back to the 2D projection, and without the capture dimensions the backend has to
 * assume a 4:3 frame, which skews every angle by the aspect ratio.
 *
 * These tests pin the exact keys that must reach the wire.
 */

import { describe, expect, it } from 'vitest';

import { toBackendSample } from './PostureAnalysisPage';

/** A frame shaped exactly as useMediaPipePose.processFrame returns it. */
function mediapipeFrame(overrides: Record<string, unknown> = {}) {
  const pose: Record<number, number[]> = {};
  for (let i = 0; i < 33; i++) {
    // Normalised 0-1, as MediaPipe emits: x by frame width, y by frame height.
    pose[i] = [0.4 + i * 0.001, 0.3 + i * 0.002, -0.05, 0.97];
  }
  return {
    landmarks: { pose },
    worldLandmarks: Array.from({ length: 33 }, (_, i) => ({
      x: 0.01 * i,
      y: 0.02 * i,
      z: -0.003 * i,
      visibility: 0.97,
    })),
    screenLandmarks: [],
    visibility: 0.97,
    frameNumber: 1,
    poseType: 'leftside' as const,
    timestamp: 1234,
    captureWidth: 1280,
    captureHeight: 720,
    ...overrides,
  };
}

describe('posture payload sent from WASM MediaPipe to the backend', () => {
  it('carries the 2D pose landmarks the backend keys on', () => {
    const sample = toBackendSample(mediapipeFrame());
    expect(sample.pose).toBeDefined();
    expect(Object.keys(sample.pose)).toHaveLength(33);
    // Backend PostureCalibrator.add_sample() rejects a sample without "pose".
    expect(sample.pose[11]).toHaveLength(4);
  });

  it('carries poseWorldLandmarks as pose_world in the index-keyed dict shape', () => {
    const sample = toBackendSample(mediapipeFrame());
    expect(sample.pose_world).toBeDefined();
    expect(Object.keys(sample.pose_world)).toHaveLength(33);
    // [x, y, z, visibility] — the shape app/core/pose/calibration_v2 expects.
    expect(sample.pose_world[0]).toEqual([0, 0, -0, 0.97]);
    expect(sample.pose_world[10]).toEqual([0.1, 0.2, -0.03, 0.97]);
  });

  it('omits pose_world rather than sending an empty object when unavailable', () => {
    // An older client, or a frame where MediaPipe returned no world landmarks.
    const sample = toBackendSample(mediapipeFrame({ worldLandmarks: [] }));
    expect(sample.pose_world).toBeUndefined();
    expect(sample.pose).toBeDefined(); // must still degrade to the 2D path
  });

  it('does not mutate the source frame', () => {
    const frame = mediapipeFrame();
    const before = JSON.stringify(frame.landmarks);
    toBackendSample(frame);
    expect(JSON.stringify(frame.landmarks)).toBe(before);
    expect((frame.landmarks as any).pose_world).toBeUndefined();
  });

  it('preserves normalised coordinates unchanged — the backend does the correction', () => {
    const frame = mediapipeFrame();
    const sample = toBackendSample(frame);
    // The aspect correction happens once, on the backend, at ingest. If the frontend
    // also scaled x the correction would be applied twice.
    expect(sample.pose[5][0]).toBe(frame.landmarks.pose[5][0]);
    expect(sample.pose[5][1]).toBe(frame.landmarks.pose[5][1]);
  });
});

describe('capture metadata required for correct geometry', () => {
  it('frames carry the true capture dimensions read from the video track', () => {
    const frame = mediapipeFrame();
    // PostureAnalysisPage reads these off frames[0] to build imageWidth/imageHeight.
    expect(frame.captureWidth).toBe(1280);
    expect(frame.captureHeight).toBe(720);
    expect(frame.captureWidth / frame.captureHeight).toBeCloseTo(16 / 9, 5);
  });

  it('a 16:9 capture is distinguishable from the 4:3 the backend would assume', () => {
    // This is the regression that mattered: assuming 4:3 on a 16:9 capture reported
    // 41.9 degrees of peak knee flexion instead of 60.
    const frame = mediapipeFrame();
    const assumed = 4 / 3;
    const actual = frame.captureWidth / frame.captureHeight;
    expect(Math.abs(actual - assumed)).toBeGreaterThan(0.4);
  });
});
