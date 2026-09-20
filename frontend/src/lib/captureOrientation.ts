/**
 * Which way the subject is actually facing, from the landmarks alone.
 *
 * The posture screening asks for four captures in a fixed order, and a patient will
 * sometimes turn the wrong way - showing their right side when the screen says left, or
 * facing away when it says face the camera. Nothing on screen prevents that.
 *
 * The backend detects the same thing after the fact (PostureCalibrator.observed_view)
 * and its measurements stay correct either way, because every sign it uses is measured
 * from the anatomy rather than taken from the view label. But "correct measurements of
 * the wrong view" is still a wasted session: a capture set with two right-side views
 * has no left-side data in it and no second opinion to cross-check against, and the
 * patient has gone home. Catching it here, while they are still standing in front of
 * the camera, is the only cheap fix.
 *
 * Both discriminators are exact geometric facts, not tuned thresholds:
 *
 *   side vs face-on   the shoulders and hips are far apart across the frame when the
 *                     subject faces the camera and collapse onto each other side-on.
 *   left vs right     the toe is in front of the heel. So the direction from heel to
 *                     toe IS the anterior direction in the image, and the camera is on
 *                     the subject's right exactly when anterior points toward
 *                     increasing x.
 *   front vs back     MediaPipe labels left and right anatomically whichever way the
 *                     subject is turned, so which side of the frame the left shoulder
 *                     falls on says which way they face.
 */

export type CaptureView = 'front' | 'leftside' | 'rightside' | 'back';

/** MediaPipe landmark indices used here. */
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_HIP = 23;
const R_HIP = 24;
const L_HEEL = 29;
const R_HEEL = 30;
const L_TOE = 31;
const R_TOE = 32;

/**
 * Below this fraction of torso height, the shoulders are judged to be edge-on.
 *
 * Face-on, shoulder span is about 0.9 of shoulder-to-hip height in real proportions,
 * which lands near 0.5 once MediaPipe's normalisation compresses x on a widescreen
 * frame. Edge-on it approaches zero. 0.25 sits between the two with room on both sides,
 * so neither a broad-shouldered subject nor a slightly-turned one lands on the boundary.
 */
const EDGE_ON_SPAN_RATIO = 0.25;

/** A landmark is ignored below this confidence - an invented point is worse than none. */
const MIN_VISIBILITY = 0.5;

type Landmarks = Record<string | number, number[] | undefined> | undefined;

function point(landmarks: Landmarks, index: number): number[] | null {
  const lm = landmarks?.[index] ?? landmarks?.[String(index)];
  if (!Array.isArray(lm) || lm.length < 2) return null;
  if (lm.length >= 4 && lm[3] < MIN_VISIBILITY) return null;
  return lm;
}

/**
 * Direction of the subject's anterior along image x: +1 toward increasing x, -1 toward
 * decreasing, null when the feet give no usable direction (which is what a front or
 * back capture looks like, since the feet then point at or away from the camera).
 */
export function anteriorSign(landmarks: Landmarks): 1 | -1 | null {
  const spans: number[] = [];
  for (const [heelIdx, toeIdx] of [[L_HEEL, L_TOE], [R_HEEL, R_TOE]] as const) {
    const heel = point(landmarks, heelIdx);
    const toe = point(landmarks, toeIdx);
    if (!heel || !toe) continue;
    spans.push(toe[0] - heel[0]);
  }
  if (spans.length === 0) return null;

  const total = spans.reduce((a, b) => a + b, 0);
  const scale = Math.max(...spans.map(Math.abs));
  // Feet pointing at the camera project to almost no length, and two feet disagreeing
  // means the subject is mid-turn. Neither gives a direction worth acting on.
  if (scale < 1e-6 || Math.abs(total) < 0.5 * scale) return null;
  return total > 0 ? 1 : -1;
}

/** +1 when image x increases toward the subject's LEFT, -1 toward their right. */
export function lateralSign(landmarks: Landmarks): 1 | -1 | null {
  const pairs: Array<[number, number]> = [[L_SHOULDER, R_SHOULDER], [L_HIP, R_HIP]];
  for (const [leftIdx, rightIdx] of pairs) {
    const left = point(landmarks, leftIdx);
    const right = point(landmarks, rightIdx);
    if (!left || !right) continue;
    const dx = left[0] - right[0];
    if (Math.abs(dx) < 1e-9) continue;
    return dx > 0 ? 1 : -1;
  }
  return null;
}

/**
 * The view these landmarks actually show, or null when it cannot be told.
 *
 * Null is a real answer and must not be treated as a mismatch: a half-detected skeleton
 * or a subject mid-turn genuinely has no view, and blocking capture on it would make
 * the screening impossible to complete on a flaky frame.
 */
export function detectView(landmarks: Landmarks): CaptureView | null {
  const lSh = point(landmarks, L_SHOULDER);
  const rSh = point(landmarks, R_SHOULDER);
  const lHip = point(landmarks, L_HIP);
  const rHip = point(landmarks, R_HIP);
  if (!lSh || !rSh || !lHip || !rHip) return null;

  const shoulderSpan = Math.abs(lSh[0] - rSh[0]);
  const hipSpan = Math.abs(lHip[0] - rHip[0]);
  const torso = Math.abs(((lSh[1] + rSh[1]) / 2) - ((lHip[1] + rHip[1]) / 2));
  if (torso < 1e-6) return null;

  const edgeOn = Math.max(shoulderSpan, hipSpan) < EDGE_ON_SPAN_RATIO * torso;

  if (edgeOn) {
    const anterior = anteriorSign(landmarks);
    if (anterior === null) return null;
    // Camera on the subject's right <=> anterior projects toward increasing x.
    return anterior > 0 ? 'rightside' : 'leftside';
  }

  const lateral = lateralSign(landmarks);
  if (lateral === null) return null;
  return lateral > 0 ? 'front' : 'back';
}

const VIEW_LABEL: Record<CaptureView, string> = {
  front: 'facing the camera',
  back: 'facing away from the camera',
  leftside: 'showing your LEFT side',
  rightside: 'showing your RIGHT side',
};

/** What to tell the patient when they are stood the wrong way. */
export function orientationMessage(
  accepted: CaptureView | readonly CaptureView[],
  detected: CaptureView,
): string {
  const allowed = typeof accepted === 'string' ? [accepted] : accepted;
  const want = allowed.map((v) => VIEW_LABEL[v]).join(' or ');
  return `Turn around — you are ${VIEW_LABEL[detected]}. This capture needs you ${want}.`;
}

/**
 * Whether capture may proceed.
 *
 * Blocks only on a CONFIRMED mismatch. An undetectable view is allowed through, because
 * refusing to start on uncertainty would strand a patient whose feet are out of frame
 * behind a gate they cannot clear.
 *
 * `accepted` takes more than one view for captures where more than one genuinely works.
 * The gait front capture is a walk toward the camera AND back, so a subject who starts
 * at the near end facing away produces the same data in the opposite order - gating
 * that would be stricter than the measurement requires, and a gate that blocks a
 * correct stance is worse than no gate at all.
 */
export function orientationBlocks(
  accepted: CaptureView | readonly CaptureView[],
  detected: CaptureView | null,
): boolean {
  if (detected === null) return false;
  const allowed = typeof accepted === 'string' ? [accepted] : accepted;
  return !allowed.includes(detected);
}
