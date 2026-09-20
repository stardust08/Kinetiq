/**
 * Clinical reference thresholds and metric status utilities for posture reporting.
 * All ranges follow standard physiotherapy reference values.
 */

import type { MetricStatus, MetricRow, MetricGroup } from '../types/report';
import type { PostureAnalysis } from '../types';

type RangeCheck = (value: number) => MetricStatus;

const between = (lo: number, hi: number, value: number) =>
  value >= lo && value <= hi;

/**
 * Map of metric key → status classifier function.
 * Metrics not listed here (body dimensions) always return 'Normal'.
 */
const THRESHOLDS: Record<string, RangeCheck> = {
  cervicalAngle: v =>
    between(0, 15, v) ? 'Normal' : between(15, 25, v) ? 'Mild' : 'Severe',

  headLateralFlexion: v =>
    between(0, 5, v) ? 'Normal' : between(5, 10, v) ? 'Mild' : 'Severe',

  headRotation: v =>
    between(0, 8, v) ? 'Normal' : between(8, 15, v) ? 'Mild' : 'Severe',

  thoracicKyphosisAngle: v =>
    between(20, 40, v) ? 'Normal' : between(40, 50, v) ? 'Mild' : 'Severe',

  lumbarLordosisAngle: v =>
    between(20, 45, v) ? 'Normal' : between(45, 60, v) ? 'Mild' : 'Severe',

  trunkAngle: v => {
    // Calibrated to the CURRENT sign convention: 0 = upright, positive = forward lean,
    // negative = backward. It previously measured deviation from 180, which matched the
    // old defect where an upright trunk reported ~180 degrees. Left uncorrected, a
    // correctly-measured upright patient graded Severe (|0 - 180| = 180).
    const dev = Math.abs(v);
    return dev <= 5 ? 'Normal' : dev <= 10 ? 'Mild' : 'Severe';
  },

  trunkLateralShift: v =>
    between(0, 1, v) ? 'Normal' : between(1, 3, v) ? 'Mild' : 'Severe',

  shoulderHeightDiff: v =>
    between(0, 1, v) ? 'Normal' : between(1, 3, v) ? 'Mild' : 'Severe',

  leftShoulderAngle: v =>
    between(10, 20, v) ? 'Normal' : between(20, 30, v) ? 'Mild' : 'Severe',

  rightShoulderAngle: v =>
    between(10, 20, v) ? 'Normal' : between(20, 30, v) ? 'Mild' : 'Severe',

  roundedShoulderAngle: v =>
    v >= 160 ? 'Normal' : v >= 140 ? 'Mild' : 'Severe',

  leftElbowAngle: v =>
    v >= 140 ? 'Normal' : v >= 120 ? 'Mild' : 'Severe',

  rightElbowAngle: v =>
    v >= 140 ? 'Normal' : v >= 120 ? 'Mild' : 'Severe',

  leftHipAngle: v =>
    v >= 170 ? 'Normal' : v >= 160 ? 'Mild' : 'Severe',

  rightHipAngle: v =>
    v >= 170 ? 'Normal' : v >= 160 ? 'Mild' : 'Severe',

  pelvicObliquity: v =>
    between(0, 2, v) ? 'Normal' : between(2, 5, v) ? 'Mild' : 'Severe',

  pelvicTiltAngle: v =>
    between(0, 5, v) ? 'Normal' : between(5, 10, v) ? 'Mild' : 'Severe',

  hipHeightDiff: v =>
    between(0, 1, v) ? 'Normal' : between(1, 3, v) ? 'Mild' : 'Severe',

  leftKneeAngle: v =>
    v >= 170 ? 'Normal' : v >= 160 ? 'Mild' : 'Severe',

  rightKneeAngle: v =>
    v >= 170 ? 'Normal' : v >= 160 ? 'Mild' : 'Severe',

  kneeVarusValgus: v =>
    between(0, 5, v) ? 'Normal' : between(5, 10, v) ? 'Mild' : 'Severe',

  qAngleLeft: v =>
    between(0, 20, v) ? 'Normal' : between(20, 25, v) ? 'Mild' : 'Severe',

  qAngleRight: v =>
    between(0, 20, v) ? 'Normal' : between(20, 25, v) ? 'Mild' : 'Severe',

  footProgressionAngle: v =>
    between(10, 30, v) ? 'Normal' : between(30, 40, v) ? 'Mild' : 'Severe',

  pronationSupinationLeft: v =>
    between(10, 30, v) ? 'Normal' : between(30, 40, v) ? 'Mild' : 'Severe',

  pronationSupinationRight: v =>
    between(10, 30, v) ? 'Normal' : between(30, 40, v) ? 'Mild' : 'Severe',
};

/**
 * Return the clinical status of a metric value.
 * @param key - PostureAnalysis field name
 * @param value - measured value
 */
export function getMetricStatus(key: string, value: number | null | undefined): MetricStatus {
  // A metric with no value was not measured. Returning 'Normal' here would assert a
  // clean finding we never made; returning 'Severe' would invent a pathology.
  if (value === null || value === undefined || Number.isNaN(value)) return 'Unmeasured';
  return THRESHOLDS[key]?.(value) ?? 'Normal';
}

const RANGE_TEXT: Record<string, string> = {
  cervicalAngle:           'Normal 0–15°  Mild 15–25°  Severe >25°',
  headLateralFlexion:      'Normal 0–5°   Mild 5–10°   Severe >10°',
  headRotation:            'Normal 0–8°   Mild 8–15°   Severe >15°',
  thoracicKyphosisAngle:   'Normal 20–40° Mild 40–50°  Severe >50°',
  lumbarLordosisAngle:     'Normal 20–45° Mild 45–60°  Severe >60°',
  trunkAngle:              'Normal ±5°    Mild ±10°    Severe >±10°',
  trunkLateralShift:       'Normal 0–1cm  Mild 1–3cm   Severe >3cm',
  shoulderHeightDiff:      'Normal 0–1°   Mild 1–3°    Severe >3°',
  leftShoulderAngle:       'Normal 10–20° Mild 20–30°  Severe >30°',
  rightShoulderAngle:      'Normal 10–20° Mild 20–30°  Severe >30°',
  roundedShoulderAngle:    'Normal 160–180° Mild 140–160° Severe <140°',
  leftElbowAngle:          'Normal 140–180° Mild 120–140° Severe <120°',
  rightElbowAngle:         'Normal 140–180° Mild 120–140° Severe <120°',
  leftHipAngle:            'Normal 170–180° Mild 160–170° Severe <160°',
  rightHipAngle:           'Normal 170–180° Mild 160–170° Severe <160°',
  pelvicObliquity:         'Normal 0–2°   Mild 2–5°    Severe >5°',
  pelvicTiltAngle:         'Normal 0–5°   Mild 5–10°   Severe >10°',
  hipHeightDiff:           'Normal 0–1°   Mild 1–3°    Severe >3°',
  leftKneeAngle:           'Normal 170–180° Mild 160–170° Severe <160°',
  rightKneeAngle:          'Normal 170–180° Mild 160–170° Severe <160°',
  kneeVarusValgus:         'Normal 0–5°   Mild 5–10°   Severe >10°',
  qAngleLeft:              'Normal 0–20°  Mild 20–25°  Severe >25°',
  qAngleRight:             'Normal 0–20°  Mild 20–25°  Severe >25°',
  footProgressionAngle:    'Normal 10–30° Mild 30–40°  Severe >40°',
  pronationSupinationLeft: 'Normal 10–30° Mild 30–40°  Severe >40°',
  pronationSupinationRight:'Normal 10–30° Mild 30–40°  Severe >40°',
};

/** Return the human-readable normal range string for a metric key. */
export function getMetricRange(key: string): string {
  return RANGE_TEXT[key] ?? '—';
}

 
// Human-readable labels for each metric key (used in report display).
const LABELS: Record<string, string> = {
  cervicalAngle: 'Cervical Angle',
  headLateralFlexion: 'Head Lateral Flexion',
  headRotation: 'Head Rotation',
  thoracicKyphosisAngle: 'Thoracic Kyphosis',
  lumbarLordosisAngle: 'Lumbar Lordosis',
  trunkAngle: 'Trunk Angle',
  trunkLateralShift: 'Trunk Lateral Shift',
  shoulderHeightDiff: 'Shoulder Height Diff',
  leftShoulderAngle: 'Left Shoulder Angle',
  rightShoulderAngle: 'Right Shoulder Angle',
  roundedShoulderAngle: 'Rounded Shoulder Angle',
  leftElbowAngle: 'Left Elbow Angle',
  rightElbowAngle: 'Right Elbow Angle',
  leftHipAngle: 'Left Hip Angle',
  rightHipAngle: 'Right Hip Angle',
  pelvicObliquity: 'Pelvic Obliquity',
  pelvicTiltAngle: 'Pelvic Tilt',
  hipHeightDiff: 'Hip Height Diff',
  leftKneeAngle: 'Left Knee Angle',
  rightKneeAngle: 'Right Knee Angle',
  kneeVarusValgus: 'Knee Varus/Valgus',
  qAngleLeft: 'Q-Angle Left',
  qAngleRight: 'Q-Angle Right',
  footProgressionAngle: 'Foot Progression Angle',
  pronationSupinationLeft: 'Pronation/Supination Left',
  pronationSupinationRight: 'Pronation/Supination Right',
  shoulderWidth: 'Shoulder Width',
  hipWidth: 'Hip Width',
  torsoLength: 'Torso Length',
  leftArmLength: 'Left Arm Length',
  rightArmLength: 'Right Arm Length',
  leftLegLength: 'Left Leg Length',
  rightLegLength: 'Right Leg Length',
};

/** Grouped metric key definitions (order matters for display) */
const METRIC_GROUPS: Array<{ title: string; keys: (keyof PostureAnalysis)[] }> = [
  {
    title: 'Head & Cervical',
    keys: ['cervicalAngle', 'headLateralFlexion', 'headRotation'],
  },
  {
    title: 'Trunk & Spine',
    keys: [
      'thoracicKyphosisAngle',
      'lumbarLordosisAngle',
      'trunkAngle',
      'trunkLateralShift',
    ],
  },
  {
    title: 'Shoulders',
    keys: [
      'shoulderHeightDiff',
      'leftShoulderAngle',
      'rightShoulderAngle',
      'roundedShoulderAngle',
    ],
  },
  {
    title: 'Arms & Elbows',
    keys: ['leftElbowAngle', 'rightElbowAngle'],
  },
  {
    title: 'Hips & Pelvis',
    keys: [
      'leftHipAngle',
      'rightHipAngle',
      'pelvicObliquity',
      'pelvicTiltAngle',
      'hipHeightDiff',
    ],
  },
  {
    title: 'Knees & Legs',
    keys: [
      'leftKneeAngle',
      'rightKneeAngle',
      'kneeVarusValgus',
      'qAngleLeft',
      'qAngleRight',
    ],
  },
  {
    title: 'Feet',
    keys: ['footProgressionAngle', 'pronationSupinationLeft', 'pronationSupinationRight'],
  },
  {
    title: 'Body Dimensions',
    keys: [
      'shoulderWidth',
      'hipWidth',
      'torsoLength',
      'leftArmLength',
      'rightArmLength',
      'leftLegLength',
      'rightLegLength',
    ],
  },
];

/**
 * Build grouped metric rows from a PostureAnalysis object.
 * Body Dimensions metrics always receive status 'Normal' (display-only).
 */
export function buildMetricGroups(analysis: PostureAnalysis): MetricGroup[] {
  return METRIC_GROUPS.map(({ title, keys }) => ({
    title,
    metrics: keys.map(key => {
      const value = (analysis[key] ?? null) as number | null;
      return {
        label: LABELS[key as string] ?? key,
        value,
        unit: '°',
        status: getMetricStatus(key as string, value),
        range: getMetricRange(key as string),
      } satisfies MetricRow;
    }),
  }));
}

const RECOMMENDATIONS: Record<string, string> = {
  cervicalAngle: 'Perform chin tucks and cervical retractions to reduce forward head posture.',
  headLateralFlexion: 'Lateral neck stretches and strengthening of deep cervical flexors recommended.',
  headRotation: 'Rotational mobility exercises and soft tissue release for cervical rotation.',
  thoracicKyphosisAngle: 'Thoracic extension exercises and pectoral stretching advised.',
  lumbarLordosisAngle: 'Core stabilisation and hip flexor stretching to normalise lumbar curve.',
  trunkAngle: 'Postural re-education and core strengthening to improve trunk alignment.',
  trunkLateralShift: 'Lateral trunk stabilisation exercises and functional movement screening.',
  shoulderHeightDiff: 'Shoulder levelling exercises; evaluate for scoliosis if persistent.',
  leftShoulderAngle: 'Scapular stabilisation and rotator cuff strengthening (left side).',
  rightShoulderAngle: 'Scapular stabilisation and rotator cuff strengthening (right side).',
  roundedShoulderAngle: 'Pectoral stretching and rhomboid/middle trapezius strengthening.',
  leftElbowAngle: 'Elbow mobility and forearm flexor/extensor stretching (left).',
  rightElbowAngle: 'Elbow mobility and forearm flexor/extensor stretching (right).',
  leftHipAngle: 'Hip flexor stretching and gluteal strengthening (left).',
  rightHipAngle: 'Hip flexor stretching and gluteal strengthening (right).',
  pelvicObliquity: 'Lateral pelvic stabilisation; assess leg length discrepancy.',
  pelvicTiltAngle: 'Pelvic floor and deep abdominal training to restore neutral tilt.',
  hipHeightDiff: 'Assess for leg length inequality and introduce corrective insoles if needed.',
  leftKneeAngle: 'Quadriceps and hamstring balance training (left).',
  rightKneeAngle: 'Quadriceps and hamstring balance training (right).',
  kneeVarusValgus: 'Hip abductor strengthening and foot orthoses assessment.',
  qAngleLeft: 'VMO strengthening and patellar tracking assessment (left).',
  qAngleRight: 'VMO strengthening and patellar tracking assessment (right).',
  footProgressionAngle: 'Gait retraining and tibial rotation assessment.',
  pronationSupinationLeft: 'Orthotics evaluation and intrinsic foot muscle strengthening (left).',
  pronationSupinationRight: 'Orthotics evaluation and intrinsic foot muscle strengthening (right).',
};

export interface FlaggedMetric {
  label: string;
  /** Always a real number: unmeasured metrics are never flagged. */
  value: number;
  /** 'Unmeasured' is excluded — a metric with no value is not a clinical finding. */
  status: Exclude<MetricStatus, 'Normal' | 'Unmeasured' | 'Ungraded'>;
  recommendation: string;
}

/**
 * Extract all metrics flagged as Mild or Severe with auto-generated recommendations.
 */
export function buildFlaggedMetrics(analysis: PostureAnalysis): FlaggedMetric[] {
  const flagged: FlaggedMetric[] = [];
  for (const group of METRIC_GROUPS.slice(0, 7)) {
    // Skip Body Dimensions
    for (const key of group.keys) {
      const value = (analysis[key] ?? null) as number | null;
      const status = getMetricStatus(key as string, value);
      // Only flag genuine findings. Neither an unmeasured metric nor one whose
      // reference range was withdrawn is a finding, and attaching a treatment
      // recommendation to either would be actively misleading.
      if (
        status !== 'Normal' &&
        status !== 'Unmeasured' &&
        status !== 'Ungraded' &&
        value !== null
      ) {
        flagged.push({
          label: LABELS[key as string] ?? (key as string),
          value,
          status,
          recommendation:
            RECOMMENDATIONS[key as string] ?? 'Consult a physiotherapist for further evaluation.',
        });
      }
    }
  }
  return flagged;
}
