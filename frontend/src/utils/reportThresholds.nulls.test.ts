/**
 * Null-safety for the legacy clinical report.
 *
 * Since the measurement rewrite, a metric that could not be measured is stored and
 * returned as null rather than coerced to 0.0. A real screening surfaced two failures
 * from that on the very first run:
 *
 *   1. ClinicalMetricsDisplay crashed with "Cannot read properties of null (reading
 *      'toFixed')" and took the whole results page down with it.
 *   2. Before crashing, buildFlaggedMetrics had already flagged the unmeasured metrics
 *      as clinical findings and attached treatment recommendations to them — telling a
 *      patient to do pectoral stretches because a number was missing.
 *
 * The second was the more dangerous of the two.
 */

import { describe, expect, it } from 'vitest';

import { buildFlaggedMetrics, buildMetricGroups, getMetricStatus } from './reportThresholds';

/** A finalize-analysis response shaped as the backend now returns it. */
function analysisWithNulls(overrides: Record<string, unknown> = {}) {
  return {
    id: 'analysis-1',
    userId: 'user-1',
    bookingId: 'booking-1',
    analysisDate: '2026-09-01T18:14:31.813000Z',
    // Retired or unsupported metrics come back as null, not 0.0.
    fhdPixels: null,
    cervicalAngle: null,
    headRotation: null,
    pelvicTiltAngle: null,
    qAngleLeft: null,
    qAngleRight: null,
    pronationSupinationLeft: null,
    pronationSupinationRight: null,
    footProgressionAngle: null,
    roundedShoulderAngle: null,
    shoulderHeightDiff: null,
    trunkLateralShift: null,
    lumbarLordosisAngle: null,
    leftShoulderAngle: null,
    rightShoulderAngle: null,
    leftElbowAngle: null,
    rightElbowAngle: null,
    // Measured metrics carry real values.
    trunkAngle: 13.59,
    thoracicKyphosisAngle: 38.2,
    headLateralFlexion: 1.1,
    leftHipAngle: 176.4,
    rightHipAngle: 177.1,
    leftKneeAngle: 179.2,
    rightKneeAngle: 178.8,
    kneeVarusValgus: 2.1,
    status: 'completed',
    schemaVersion: 2,
    ...overrides,
  } as any;
}

describe('getMetricStatus with missing values', () => {
  it('reports Unmeasured rather than inventing a verdict', () => {
    expect(getMetricStatus('cervicalAngle', null)).toBe('Unmeasured');
    expect(getMetricStatus('cervicalAngle', undefined)).toBe('Unmeasured');
    expect(getMetricStatus('cervicalAngle', NaN)).toBe('Unmeasured');
  });

  it('does not silently call a missing metric Normal', () => {
    // Returning 'Normal' would assert a clean finding that was never made.
    expect(getMetricStatus('trunkAngle', null)).not.toBe('Normal');
  });

  it('still grades real values', () => {
    expect(getMetricStatus('trunkAngle', 1)).toBe('Normal');
    expect(['Mild', 'Severe']).toContain(getMetricStatus('trunkAngle', 30));
  });
});

describe('buildFlaggedMetrics', () => {
  it('never flags an unmeasured metric as a clinical finding', () => {
    const flagged = buildFlaggedMetrics(analysisWithNulls());
    for (const item of flagged) {
      expect(item.value).not.toBeNull();
      expect(typeof item.value).toBe('number');
      expect(item.status).not.toBe('Unmeasured');
    }
  });

  it('attaches no treatment recommendation to a missing measurement', () => {
    const flagged = buildFlaggedMetrics(analysisWithNulls());
    const labels = flagged.map(f => f.label.toLowerCase());
    // Q-angle and pronation are unsupported and always null; they must not appear.
    expect(labels.some(l => l.includes('q-angle'))).toBe(false);
    expect(labels.some(l => l.includes('pronation'))).toBe(false);
  });

  it('every flagged value survives toFixed — the crash that took down the page', () => {
    const flagged = buildFlaggedMetrics(analysisWithNulls());
    for (const item of flagged) {
      expect(() => item.value.toFixed(1)).not.toThrow();
    }
  });

  it('handles an analysis where nothing at all was measured', () => {
    const allNull = Object.fromEntries(
      Object.entries(analysisWithNulls()).map(([k, v]) =>
        typeof v === 'number' ? [k, null] : [k, v],
      ),
    );
    expect(() => buildFlaggedMetrics(allNull as any)).not.toThrow();
    expect(buildFlaggedMetrics(allNull as any)).toHaveLength(0);
  });
});

describe('buildMetricGroups', () => {
  it('marks missing metrics Unmeasured and preserves null rather than zeroing', () => {
    const groups = buildMetricGroups(analysisWithNulls());
    const rows = groups.flatMap(g => g.metrics);
    const missing = rows.filter(r => r.value === null);

    expect(missing.length).toBeGreaterThan(0);
    for (const row of missing) {
      expect(row.status).toBe('Unmeasured');
      // A missing metric rendered as 0.0 would read as a real measurement of zero.
      expect(row.value).not.toBe(0);
    }
  });

  it('does not throw on a fully null analysis', () => {
    const allNull = Object.fromEntries(
      Object.entries(analysisWithNulls()).map(([k, v]) =>
        typeof v === 'number' ? [k, null] : [k, v],
      ),
    );
    expect(() => buildMetricGroups(allNull as any)).not.toThrow();
  });
});

describe('thresholds match the current sign conventions', () => {
  it('grades an upright trunk as Normal, not Severe', () => {
    // Regression: the threshold measured |v - 180|, matching the old defect where an
    // upright trunk reported ~180. After the sign fix an upright patient reads ~0, and
    // the stale threshold graded that Severe on a real screening.
    expect(getMetricStatus('trunkAngle', 0)).toBe('Normal');
    expect(getMetricStatus('trunkAngle', 1.2)).toBe('Normal');
    expect(getMetricStatus('trunkAngle', -3)).toBe('Normal');
  });

  it('grades a genuine forward lean as abnormal', () => {
    expect(getMetricStatus('trunkAngle', 8)).toBe('Mild');
    expect(getMetricStatus('trunkAngle', 20)).toBe('Severe');
    expect(getMetricStatus('trunkAngle', -20)).toBe('Severe');
  });

  it('leaves interior joint angles on their 180-degree baseline', () => {
    // Knee and hip angles are still interior angles where 180 = fully extended, so
    // these thresholds are correct as-is and must not be "fixed" alongside trunkAngle.
    expect(getMetricStatus('leftKneeAngle', 179)).toBe('Normal');
    expect(getMetricStatus('rightKneeAngle', 179)).toBe('Normal');
    expect(getMetricStatus('leftHipAngle', 176)).toBe('Normal');
  });
});
