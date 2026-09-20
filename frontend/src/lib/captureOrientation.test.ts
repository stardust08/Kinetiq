import { describe, expect, it } from 'vitest';
import {
  anteriorSign,
  detectView,
  lateralSign,
  orientationBlocks,
  orientationMessage,
} from './captureOrientation';

/**
 * Landmarks shaped the way MediaPipe delivers them: normalised, x right, y down, with a
 * visibility in slot 3. Built from the geometry of each view rather than copied from a
 * capture, so what each number means stays legible.
 */
function pose(view: 'front' | 'back' | 'leftside' | 'rightside', visibility = 0.9) {
  const shoulderY = 0.30;
  const hipY = 0.55;
  const heelY = 0.95;
  // Face-on the shoulders straddle the centre; edge-on they collapse onto it.
  const span = view === 'front' || view === 'back' ? 0.11 : 0.004;
  // Front: the subject's LEFT lands on the image's RIGHT. Back reverses it.
  const leftIsRight = view === 'front' ? 1 : view === 'back' ? -1 : 1;
  // Side views: anterior points toward increasing x when the camera is on the right.
  const anterior = view === 'rightside' ? 1 : -1;
  const p = (x: number, y: number) => [x, y, 0, visibility];
  return {
    11: p(0.5 + leftIsRight * span, shoulderY),
    12: p(0.5 - leftIsRight * span, shoulderY),
    23: p(0.5 + leftIsRight * span * 0.8, hipY),
    24: p(0.5 - leftIsRight * span * 0.8, hipY),
    29: p(0.5 - anterior * 0.02, heelY),
    30: p(0.5 - anterior * 0.02, heelY),
    31: p(0.5 + anterior * 0.04, heelY),
    32: p(0.5 + anterior * 0.04, heelY),
  } as Record<number, number[]>;
}

describe('detectView', () => {
  it.each(['front', 'back', 'leftside', 'rightside'] as const)(
    'identifies a %s capture',
    (view) => {
      expect(detectView(pose(view))).toBe(view);
    },
  );

  it('reads the anterior direction from the foot', () => {
    expect(anteriorSign(pose('rightside'))).toBe(1);
    expect(anteriorSign(pose('leftside'))).toBe(-1);
  });

  it('reads handedness from the shoulders', () => {
    expect(lateralSign(pose('front'))).toBe(1);
    expect(lateralSign(pose('back'))).toBe(-1);
  });

  it('returns null rather than guessing when the torso is not detected', () => {
    expect(detectView({})).toBeNull();
    expect(detectView(undefined)).toBeNull();
  });

  it('ignores landmarks the tracker is not confident about', () => {
    // A skeleton MediaPipe is guessing at is worse than no skeleton: it looks
    // authoritative and is invented.
    expect(detectView(pose('front', 0.1))).toBeNull();
  });

  it('returns null for a side view whose feet are not visible', () => {
    const p = pose('leftside');
    delete p[29]; delete p[30]; delete p[31]; delete p[32];
    expect(detectView(p)).toBeNull();
  });
});

describe('a walking subject', () => {
  /**
   * Gait captures are walks, so the feet are separated fore-aft rather than together.
   * Each foot still has its own toe ahead of its own heel, which is what the anterior
   * direction is read from - but only if both feet are considered, not the pair as a
   * whole.
   */
  function walkingSideView(anterior: 1 | -1, strideSeparation: number) {
    const p = (x: number, y: number) => [x, y, 0, 0.9];
    return {
      11: p(0.502, 0.30),
      12: p(0.498, 0.30),
      23: p(0.502, 0.55),
      24: p(0.498, 0.55),
      // Lead foot forward, trail foot back; each toe ahead of its own heel.
      29: p(0.5 + anterior * (strideSeparation - 0.02), 0.95),
      31: p(0.5 + anterior * (strideSeparation + 0.04), 0.95),
      30: p(0.5 - anterior * (strideSeparation + 0.02), 0.95),
      32: p(0.5 - anterior * (strideSeparation - 0.04), 0.95),
    } as Record<number, number[]>;
  }

  it.each([0, 0.05, 0.12])(
    'identifies a right-side walk at stride separation %s',
    (sep) => {
      expect(detectView(walkingSideView(1, sep))).toBe('rightside');
    },
  );

  it.each([0, 0.05, 0.12])(
    'identifies a left-side walk at stride separation %s',
    (sep) => {
      expect(detectView(walkingSideView(-1, sep))).toBe('leftside');
    },
  );
});

describe('orientationBlocks', () => {
  it('blocks a confirmed mismatch', () => {
    expect(orientationBlocks('leftside', 'rightside')).toBe(true);
    expect(orientationBlocks('front', 'back')).toBe(true);
  });

  it('allows a match', () => {
    expect(orientationBlocks('leftside', 'leftside')).toBe(false);
  });

  it('accepts any of several views when more than one genuinely works', () => {
    // The gait front capture is a walk toward the camera and back, so starting at
    // either end is correct.
    expect(orientationBlocks(['front', 'back'], 'back')).toBe(false);
    expect(orientationBlocks(['front', 'back'], 'leftside')).toBe(true);
  });

  it('allows an undetectable view through', () => {
    // Refusing to start on uncertainty would strand a patient whose feet are out of
    // frame behind a gate they cannot clear.
    expect(orientationBlocks('leftside', null)).toBe(false);
  });
});

describe('orientationMessage', () => {
  it('says which way they are facing and which way they should be', () => {
    const msg = orientationMessage('leftside', 'rightside');
    expect(msg).toContain('RIGHT');
    expect(msg).toContain('LEFT');
  });
});
