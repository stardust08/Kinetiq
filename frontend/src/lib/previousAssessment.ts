/**
 * Values from a patient's previous screening, for the "Since last" comparison.
 *
 * The comparison itself is not a subtraction. Any two measurements of an unchanged
 * patient differ, so a raw delta invites a clinician to read a 1.2 degree "improvement"
 * that the instrument cannot resolve. Each metric carries a minimal detectable change
 * (measured by scripts/repeatability.py), and MetricReport judges the delta against it.
 *
 * This module's only job is finding the right prior assessment and pulling its numbers
 * out in the shape that comparison needs.
 */

import type { PostureAnalysis } from '../types';
import type { MetricsPayload } from '../types/metrics';

type Assessment = PostureAnalysis & { metricsJson?: MetricsPayload | null };

/**
 * The most recent assessment strictly BEFORE `current`.
 *
 * Compares by date rather than by list position, because "my assessments" is ordered
 * newest-first but the current analysis may or may not have landed in that list yet -
 * it is created moments before this runs. Excluding by id alone would then silently
 * compare a screening against itself and report no change, every time.
 */
export function findPrevious(
  current: Assessment,
  history: Assessment[],
): Assessment | null {
  const currentTime = new Date(current.analysisDate).getTime();
  const earlier = history
    .filter((a) => a.id !== current.id)
    .filter((a) => {
      const t = new Date(a.analysisDate).getTime();
      return Number.isFinite(t) && t < currentTime;
    })
    .sort((a, b) => new Date(b.analysisDate).getTime() - new Date(a.analysisDate).getTime());
  return earlier[0] ?? null;
}

/**
 * Metric values from an assessment, keyed by metric.
 *
 * Only values the pipeline was willing to stand behind are returned. A metric that was
 * withheld last time has no number to compare against, and treating its absence as a
 * change - or as zero - would manufacture a finding out of a missing measurement.
 */
export function valuesFrom(assessment: Assessment | null): Record<string, number | null> {
  const metrics = assessment?.metricsJson?.metrics;
  if (!metrics) return {};
  const out: Record<string, number | null> = {};
  for (const [key, metric] of Object.entries(metrics)) {
    const usable = metric.status === 'measured' || metric.status === 'low_confidence';
    if (usable && typeof metric.value === 'number') out[key] = metric.value;
  }
  return out;
}

/** Convenience: previous values for `current`, given the patient's assessment history. */
export function previousValuesFor(
  current: Assessment,
  history: Assessment[],
): Record<string, number | null> {
  return valuesFrom(findPrevious(current, history));
}
