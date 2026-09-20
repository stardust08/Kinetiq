/**
 * The movements a range-of-motion screening captures, in the order it captures them.
 *
 * ROM is measured as an END-RANGE HOLD: the patient moves the joint as far as it goes
 * and holds while frames are collected. That is what lets the whole posture capture path
 * be reused - the visibility gate, the orientation gate, the confidence gates - instead
 * of needing a motion pipeline that does not exist.
 *
 * Ordering is by VIEW, not by body part. Each change of view means the patient turns and
 * the operator re-checks framing, so grouping the front-facing movements together and
 * then the two side views keeps a session to three setups rather than ten.
 *
 * `metrics` names what each hold yields, and it is the contract with the backend: the
 * service keeps only those keys, because every other metric in the registry is computed
 * from the same frames and would be a measurement of a joint the patient was not moving.
 */

export type CaptureView = 'front' | 'leftside' | 'rightside';

export interface ROMMovement {
  id: string;
  title: string;
  instruction: string;
  view: CaptureView;
  /** Registry keys this hold produces. */
  metrics: string[];
  icon: string;
}

export const ROM_MOVEMENTS: ROMMovement[] = [
  {
    id: 'shoulder_abduction',
    title: 'Shoulder abduction',
    instruction:
      'Face the camera. Raise both arms out to the sides, as high as they will comfortably go, and hold.',
    view: 'front',
    metrics: ['rom_shoulder_abduction_left', 'rom_shoulder_abduction_right'],
    icon: '🙆',
  },
  {
    id: 'cervical_lateral_flexion',
    title: 'Neck side bend',
    instruction:
      'Face the camera. Tilt your head toward one shoulder, as far as is comfortable, and hold. Keep your shoulders level.',
    view: 'front',
    metrics: ['rom_cervical_lateral_flexion'],
    icon: '🙂',
  },
  {
    id: 'shoulder_flexion_right',
    title: 'Shoulder flexion — right',
    instruction:
      'Turn so your RIGHT side faces the camera. Raise your right arm forward and up, and hold.',
    view: 'rightside',
    metrics: ['rom_shoulder_flexion_right'],
    icon: '💪',
  },
  {
    id: 'elbow_flexion_right',
    title: 'Elbow flexion — right',
    instruction:
      'Right side still to the camera. Arm at your side, bend your right elbow as far as it goes, and hold.',
    view: 'rightside',
    metrics: ['rom_elbow_flexion_right'],
    icon: '🦾',
  },
  {
    id: 'knee_flexion_right',
    title: 'Knee flexion — right',
    instruction:
      'Right side to the camera. Bend your right knee, bringing the heel toward your buttock, and hold.',
    view: 'rightside',
    metrics: ['rom_knee_flexion_right'],
    icon: '🦵',
  },
  {
    id: 'hip_flexion_right',
    title: 'Hip flexion — right',
    instruction:
      'Right side to the camera. Lift your right knee forward and up toward your chest, and hold.',
    view: 'rightside',
    metrics: ['rom_hip_flexion_right'],
    icon: '🚶',
  },
  {
    id: 'shoulder_flexion_left',
    title: 'Shoulder flexion — left',
    instruction:
      'Turn so your LEFT side faces the camera. Raise your left arm forward and up, and hold.',
    view: 'leftside',
    metrics: ['rom_shoulder_flexion_left'],
    icon: '💪',
  },
  {
    id: 'elbow_flexion_left',
    title: 'Elbow flexion — left',
    instruction:
      'Left side still to the camera. Arm at your side, bend your left elbow as far as it goes, and hold.',
    view: 'leftside',
    metrics: ['rom_elbow_flexion_left'],
    icon: '🦾',
  },
  {
    id: 'knee_flexion_left',
    title: 'Knee flexion — left',
    instruction:
      'Left side to the camera. Bend your left knee, bringing the heel toward your buttock, and hold.',
    view: 'leftside',
    metrics: ['rom_knee_flexion_left'],
    icon: '🦵',
  },
  {
    id: 'hip_flexion_left',
    title: 'Hip flexion — left',
    instruction:
      'Left side to the camera. Lift your left knee forward and up toward your chest, and hold.',
    view: 'leftside',
    metrics: ['rom_hip_flexion_left'],
    icon: '🚶',
  },
];

/** Seconds of held position captured per movement. */
export const HOLD_SECONDS = 3;
/** Frames collected per hold, at the capture loop's target rate. */
export const FRAMES_PER_HOLD = 60;
/** Below this the backend rejects the hold as too brief to measure. */
export const MIN_FRAMES_PER_HOLD = 20;

/** Movements grouped into the consecutive runs that share a camera view. */
export function movementsByView(): Array<{ view: CaptureView; movements: ROMMovement[] }> {
  const groups: Array<{ view: CaptureView; movements: ROMMovement[] }> = [];
  for (const movement of ROM_MOVEMENTS) {
    const last = groups[groups.length - 1];
    if (last && last.view === movement.view) last.movements.push(movement);
    else groups.push({ view: movement.view, movements: [movement] });
  }
  return groups;
}
