/**
 * Report rows built from the v2 metric payload.
 *
 * The PDF and the on-screen report used to be built from the flat legacy columns on
 * PostureAnalysis. Those columns are filled conservatively on purpose: a legacy column
 * receives a value only where the v2 metric measures the same quantity in the same
 * unit, and 25 of the 33 are deliberately NULL because the unit or the definition
 * changed. Reading them produced a report in which most rows said "Unmeasured" while
 * the measurements sat unread in metricsJson - including six that are fully certified.
 *
 * These builders read metricsJson instead, and keep the shape the PDF template already
 * renders so only the data source changes, not the layout.
 *
 * The one behavioural difference is that a metric here can carry a value and still have
 * no verdict. The backend strips the normal range from any metric whose measurement
 * error is wider than that range, because the badge would otherwise be decided by noise
 * rather than by the patient. Those rows render as 'Ungraded' with the reason, instead
 * of being silently graded against a range the frontend invented.
 */

import type { FlaggedMetric } from './reportThresholds';
import type { MetricGroup, MetricRow, MetricStatus } from '../types/report';
import {
  formatUnit,
  gradeAgainstRange,
  hasValue,
  type MetricResult,
  type MetricsPayload,
  type QualityFlags,
} from '../types/metrics';

/** Section titles and ordering for the printed report. */
export const REPORT_SECTIONS: Array<{ title: string; keys: string[] }> = [
  {
    title: 'Global Posture (Head & Spine)',
    keys: ['trunk_angle', 'thoracic_kyphosis_angle', 'forward_head_ratio', 'head_lateral_flexion'],
  },
  {
    title: 'Shoulder & Pelvis',
    keys: ['shoulder_obliquity', 'pelvic_obliquity', 'trunk_lateral_shift_ratio'],
  },
  {
    title: 'Lower Extremity',
    keys: [
      'left_hip_angle',
      'right_hip_angle',
      'left_knee_angle',
      'right_knee_angle',
      'knee_varus_valgus',
      'leg_length_asymmetry_ratio',
    ],
  },
  { title: 'Body Proportions', keys: ['shoulder_hip_width_ratio'] },
];

/**
 * Metrics the capture could not produce. Printed as a short list rather than as rows:
 * a page of dashes reads as a broken report, while a named list with a reason reads as
 * a deliberate limitation - which is what it is.
 */
export const UNAVAILABLE_TITLE = 'Not Available With This Capture';

function statusFor(metric: MetricResult): MetricStatus {
  if (!hasValue(metric)) return 'Unmeasured';
  const verdict = gradeAgainstRange(metric);
  if (verdict === 'ungraded') return 'Ungraded';
  if (verdict === 'normal') return 'Normal';
  // The backend does not distinguish mild from severe; it reports the value and the
  // range. Anything outside the range is reported as outside the range, and the
  // clinician decides how far outside matters.
  return 'Mild';
}

function rangeText(metric: MetricResult): string {
  if (!metric.normalRange) {
    return metric.ungradeableReason
      ? `No verdict: ${metric.ungradeableReason}`
      : 'No reference range';
  }
  const [lo, hi] = metric.normalRange;
  return `${lo} to ${hi}${formatUnit(metric.unit)}`;
}

function toRow(metric: MetricResult): MetricRow {
  const notes: string[] = [];
  if (metric.status === 'low_confidence' && metric.detail) notes.push(metric.detail);
  if (
    metric.crossViewDelta !== null &&
    metric.crossViewDelta !== undefined &&
    metric.viewsCompared &&
    metric.viewsCompared.length > 1
  ) {
    notes.push(
      `${metric.viewsCompared.join(' vs ')} agree to ${metric.crossViewDelta.toFixed(2)}${formatUnit(metric.unit)}`,
    );
  }
  return {
    label: metric.clinicalName,
    value: hasValue(metric) ? metric.value : null,
    unit: formatUnit(metric.unit),
    status: statusFor(metric),
    range: rangeText(metric),
    note: notes.length ? notes.join('. ') : undefined,
    reference: metric.reference ?? undefined,
  };
}

export function buildMetricGroupsV2(payload: MetricsPayload): MetricGroup[] {
  const all = payload.metrics ?? {};
  const placed = new Set<string>();
  const groups: MetricGroup[] = [];

  for (const section of REPORT_SECTIONS) {
    const rows: MetricRow[] = [];
    for (const key of section.keys) {
      const metric = all[key];
      if (!metric) continue;
      placed.add(key);
      // Metrics this hardware cannot measure at all belong in the unavailable list,
      // not as a dash in the middle of a results table.
      if (metric.status === 'unsupported') continue;
      rows.push(toRow(metric));
    }
    if (rows.length) groups.push({ title: section.title, metrics: rows });
  }

  // Anything the registry added that no section names yet still has to appear, or a new
  // metric would be invisible until someone remembered to edit this file.
  const leftover = Object.values(all).filter(
    (m) => !placed.has(m.key) && m.status !== 'unsupported',
  );
  if (leftover.length) {
    groups.push({ title: 'Other Measurements', metrics: leftover.map(toRow) });
  }
  return groups;
}

/** Metrics that could not be measured, each with the backend's reason. */
export function buildUnavailableV2(payload: MetricsPayload): Array<{ label: string; reason: string }> {
  return Object.values(payload.metrics ?? {})
    .filter((m) => !hasValue(m))
    .map((m) => ({
      label: m.clinicalName,
      reason: m.detail ?? 'Not measurable from this capture.',
    }));
}

/**
 * Findings worth a recommendation.
 *
 * Only metrics that carry both a value and a normal range qualify. An unmeasured metric
 * is not a finding, and a metric whose range was withdrawn because the measurement
 * cannot resolve it is not one either - attaching a treatment recommendation to either
 * is how a report tells a healthy person to seek care.
 */
export function buildFlaggedMetricsV2(payload: MetricsPayload): FlaggedMetric[] {
  const flagged: FlaggedMetric[] = [];
  for (const metric of Object.values(payload.metrics ?? {})) {
    if (!hasValue(metric) || !metric.normalRange) continue;
    const verdict = gradeAgainstRange(metric);
    if (verdict !== 'below' && verdict !== 'above') continue;
    const [lo, hi] = metric.normalRange;
    flagged.push({
      label: metric.clinicalName,
      value: metric.value!,
      status: 'Mild',
      recommendation:
        `Measured ${metric.value!.toFixed(1)}${formatUnit(metric.unit)}, ` +
        `${verdict} the ${lo} to ${hi} reference range` +
        (metric.reference ? ` (${metric.reference})` : '') +
        '. Review with a physiotherapist.',
    });
  }
  return flagged;
}

/**
 * Capture-quality caveats that belong on the report itself.
 *
 * A reader holding a printed PDF has no way to ask how the capture went, so anything
 * that qualifies the numbers has to travel with them.
 */
export function buildQualityNotesV2(
  payload: MetricsPayload,
  flags?: QualityFlags | null,
): string[] {
  const notes: string[] = [];
  if (payload.aspectAssumed || flags?.aspectRatioAssumed) {
    notes.push(
      'Capture dimensions were not reported, so a 4:3 frame was assumed. Angles may be skewed.',
    );
  }
  if (payload.fpsNote) notes.push(payload.fpsNote);
  for (const w of payload.orientationWarnings ?? []) notes.push(w);
  if (payload.viewsCaptured && payload.viewsCaptured.length < 4) {
    notes.push(
      `Only ${payload.viewsCaptured.join(', ')} captured. Metrics needing the missing views are not reported.`,
    );
  }
  const lowConfidence = Object.values(payload.metrics ?? {}).filter(
    (m) => m.status === 'low_confidence',
  );
  if (lowConfidence.length) {
    notes.push(
      `${lowConfidence.length} metric(s) are marked low confidence: ${lowConfidence
        .map((m) => m.clinicalName)
        .join(', ')}.`,
    );
  }
  return notes;
}
