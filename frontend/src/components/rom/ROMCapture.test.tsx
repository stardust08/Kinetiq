/**
 * The range-of-motion capture gates.
 *
 * The orientation gate is the part worth testing. A ROM session walks the patient
 * through front, right-side and left-side setups across ten movements, and a hold
 * performed from the wrong side measures the FAR limb through the near one - the
 * backend detects that afterwards, but catching it while the patient is still standing
 * there is the only cheap fix. If this gate stops blocking, nothing downstream turns a
 * wrong-way capture back into a right one.
 *
 * The webcam and MediaPipe are stubbed: neither exists in jsdom, and neither is what
 * these assertions are about. What IS real is the component's own logic - the vote over
 * consecutive frames, the visibility check, and the countdown that must reset when the
 * subject stops being ready.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ROMCapture from './ROMCapture';

// ── stubs ──────────────────────────────────────────────────────────────────

// react-webcam exposes the underlying element as `ref.current.video`, and the
// detection loop reads its readyState before doing any work. A plain function
// component has no ref at all, so the loop silently did nothing and every gate
// assertion passed against the component's initial state instead of its logic.
vi.mock('react-webcam', () => {
  const React = require('react');
  return {
    default: React.forwardRef((_props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        video: { readyState: 4, videoWidth: 1280, videoHeight: 720, currentTime: 0 },
      }));
      return <video data-testid="webcam" />;
    }),
  };
});

const processFrame = vi.fn();
vi.mock('../../hooks/useMediaPipePose', () => ({
  useMediaPipePose: () => ({
    poseLandmarker: {},
    isLoading: false,
    error: null,
    processFrame,
  }),
}));

// ── landmark fixtures ──────────────────────────────────────────────────────

type LM = Record<number, number[]>;

/**
 * A subject facing the camera: shoulders and hips spread wide across the frame, and
 * the subject's LEFT (index 11) on the image's right, which is what an un-mirrored
 * front-facing webcam produces.
 */
function facingFront(): LM {
  const lm: LM = {};
  for (const i of [0, 11, 12, 23, 24, 25, 26, 27, 28]) lm[i] = [0.5, 0.5, 0, 0.9];
  lm[11] = [0.65, 0.30, 0, 0.9];   // left shoulder, image-right
  lm[12] = [0.35, 0.30, 0, 0.9];   // right shoulder
  lm[23] = [0.60, 0.60, 0, 0.9];   // left hip
  lm[24] = [0.40, 0.60, 0, 0.9];   // right hip
  return lm;
}

/**
 * A subject side-on: shoulders and hips collapsed onto each other, with the toes ahead
 * of the heels in +x, which puts the camera on the subject's RIGHT.
 */
function rightSideOn(): LM {
  const lm: LM = {};
  for (const i of [0, 11, 12, 23, 24, 25, 26, 27, 28]) lm[i] = [0.5, 0.5, 0, 0.9];
  lm[11] = [0.50, 0.30, 0, 0.9];
  lm[12] = [0.48, 0.30, 0, 0.9];
  lm[23] = [0.50, 0.60, 0, 0.9];
  lm[24] = [0.48, 0.60, 0, 0.9];
  lm[29] = [0.45, 0.95, 0, 0.9];   // left heel
  lm[31] = [0.55, 0.95, 0, 0.9];   // left toe, ahead in +x
  lm[30] = [0.45, 0.95, 0, 0.9];
  lm[32] = [0.55, 0.95, 0, 0.9];
  return lm;
}

/** The same stance, but with most key landmarks below the visibility threshold. */
function notFullyInFrame(): LM {
  const lm = facingFront();
  for (const i of [23, 24, 25, 26, 27, 28]) lm[i] = [lm[i][0], lm[i][1], 0, 0.1];
  return lm;
}

function frameOf(lm: LM) {
  return { landmarks: { pose: lm }, worldLandmarks: [] };
}

// ── rAF control ────────────────────────────────────────────────────────────

let rafCallbacks: FrameRequestCallback[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  rafCallbacks = [];
  processFrame.mockReset();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Run the detection loop `n` times with `processFrame` returning `frame`. */
async function pump(n: number) {
  for (let i = 0; i < n; i++) {
    const pending = rafCallbacks;
    rafCallbacks = [];
    await act(async () => {
      pending.forEach((cb) => cb(0));
    });
  }
}

/** The readiness banner, which is the only element these tests are about. */
function banner() {
  return screen.getByText((_, el) => {
    const text = el?.textContent ?? '';
    return (
      (el?.tagName === 'DIV') &&
      (text.startsWith('\u2713 ') || text.startsWith('\u2717 ')) &&
      (el?.children.length ?? 0) === 0
    );
  });
}

function renderCapture() {
  const onComplete = vi.fn();
  const onError = vi.fn();
  const onCancel = vi.fn();
  render(<ROMCapture onComplete={onComplete} onError={onError} onCancel={onCancel} />);
  // The component reads webcamRef.current.video; jsdom gives it no readyState, so the
  // loop's guard skips frame work unless we supply one.
  const video = screen.getByTestId('webcam') as HTMLVideoElement;
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });
  return { onComplete, onError, onCancel };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('the first movement asks the patient to face the camera', () => {
  it('accepts a subject who is facing the right way', async () => {
    processFrame.mockReturnValue(frameOf(facingFront()));
    renderCapture();
    await pump(5);
    expect(banner()).toHaveTextContent('\u2713 Hold the position');
  });

  it('blocks a subject who is side-on, and says which way to turn', async () => {
    processFrame.mockReturnValue(frameOf(rightSideOn()));
    renderCapture();
    await pump(5);
    // The banner must name what is wrong AND which way to stand. "Not ready"
    // tells the patient nothing they can act on.
    expect(banner()).toHaveTextContent('\u2717');
    expect(banner()).toHaveTextContent(/showing your RIGHT side/i);
  });

  it('blocks a subject who is not fully in frame', async () => {
    processFrame.mockReturnValue(frameOf(notFullyInFrame()));
    renderCapture();
    await pump(5);
    expect(banner()).toHaveTextContent(/step back/i);
  });
});

describe('the orientation vote', () => {
  it('needs several agreeing frames before it acts', async () => {
    // A patient turning between setups passes through every orientation on the way,
    // so the gate holds its verdict until several frames agree. ONE frame of a wrong
    // stance is deliberately not yet a block - otherwise the banner would strobe red
    // and green while the patient did exactly as they were asked.
    processFrame.mockReturnValue(frameOf(rightSideOn()));
    renderCapture();

    await pump(1);
    expect(banner()).toHaveTextContent('\u2713 Hold the position');

    await pump(5);
    expect(banner()).toHaveTextContent('\u2717');
  });

  it('forgets the previous stance once the patient turns', async () => {
    // A verdict carried over would gate the patient against a stance they have
    // already left, and no amount of standing correctly would clear it.
    processFrame.mockReturnValue(frameOf(rightSideOn()));
    renderCapture();
    await pump(5);
    expect(banner()).toHaveTextContent('\u2717');

    processFrame.mockReturnValue(frameOf(facingFront()));
    await pump(5);
    expect(banner()).toHaveTextContent('\u2713');
  });

  it('lets the patient correct themselves', async () => {
    processFrame.mockReturnValue(frameOf(rightSideOn()));
    renderCapture();
    await pump(5);
    expect(banner()).toHaveTextContent('\u2717');

    processFrame.mockReturnValue(frameOf(facingFront()));
    await pump(5);
    expect(banner()).toHaveTextContent('\u2713 Hold the position');
  });
});

describe('the countdown', () => {
  it('starts only once the subject is ready', async () => {
    processFrame.mockReturnValue(frameOf(rightSideOn()));
    renderCapture();
    await pump(5);
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    // Still blocked, so nothing has been captured.
    expect(screen.queryByText(/hold…/i)).not.toBeInTheDocument();
  });

  it('resets when the subject stops being ready part-way through', async () => {
    // Someone who drifts out of frame three seconds in must not be captured anyway.
    processFrame.mockReturnValue(frameOf(facingFront()));
    renderCapture();
    await pump(5);
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    processFrame.mockReturnValue(frameOf(notFullyInFrame()));
    await pump(5);
    expect(banner()).toHaveTextContent(/step back/i);
    expect(screen.queryByText(/hold…/i)).not.toBeInTheDocument();
  });
});

describe('progress', () => {
  it('names the movement and its position in the sequence', async () => {
    const { ROM_MOVEMENTS } = await import('../../lib/romMovements');
    processFrame.mockReturnValue(frameOf(facingFront()));
    renderCapture();
    await pump(2);
    expect(
      screen.getByText(new RegExp(`Movement 1 of ${ROM_MOVEMENTS.length}`, 'i')),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(ROM_MOVEMENTS[0].title, 'i'))).toBeInTheDocument();
  });

  it('offers a way out at any point', async () => {
    processFrame.mockReturnValue(frameOf(facingFront()));
    const { onCancel } = renderCapture();
    await pump(2);
    screen.getByRole('button', { name: /cancel/i }).click();
    expect(onCancel).toHaveBeenCalled();
  });
});
