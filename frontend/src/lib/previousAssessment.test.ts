import { describe, expect, it } from 'vitest';
import { findPrevious, previousValuesFor, valuesFrom } from './previousAssessment';
import { changeSinceLast, type MetricResult } from '../types/metrics';

function assessment(id: string, date: string, metrics: Record<string, Partial<MetricResult>> = {}) {
  return {
    id,
    analysisDate: date,
    metricsJson: {
      calibrationDate: date,
      personId: 'u1',
      schemaVersion: 2,
      viewsCaptured: ['front'],
      metrics: Object.fromEntries(
        Object.entries(metrics).map(([k, m]) => [
          k,
          { key: k, clinicalName: k, unit: 'degrees', status: 'measured',
            value: null, spread: null, nFrames: 60, viewUsed: 'front',
            normalRange: null, reference: null, detail: null, ...m } as MetricResult,
        ]),
      ),
    },
  } as any;
}

describe('findPrevious', () => {
  const current = assessment('now', '2026-09-20T10:00:00Z');

  it('picks the most recent assessment before the current one', () => {
    const history = [
      assessment('older', '2026-07-01T10:00:00Z'),
      assessment('recent', '2026-08-15T10:00:00Z'),
    ];
    expect(findPrevious(current, history)?.id).toBe('recent');
  });

  it('never compares a screening against itself', () => {
    // "my assessments" is ordered newest-first and the current analysis is created
    // moments before this runs, so it may already be in the list. Matching on id alone
    // is not enough if ids ever differ across fetches - the date check is what makes
    // this safe, and a self-comparison would silently report "no change" every time.
    expect(findPrevious(current, [current])).toBeNull();
  });

  it('ignores assessments taken after the current one', () => {
    const later = assessment('later', '2026-09-25T10:00:00Z');
    expect(findPrevious(current, [later])).toBeNull();
  });

  it('returns null when there is no history', () => {
    expect(findPrevious(current, [])).toBeNull();
  });
});

describe('valuesFrom', () => {
  it('returns values the pipeline stood behind', () => {
    const a = assessment('a', '2026-08-01T10:00:00Z', {
      trunk_angle: { value: 4.2, status: 'measured' },
      pelvic_obliquity: { value: -1.1, status: 'low_confidence' },
    });
    expect(valuesFrom(a)).toEqual({ trunk_angle: 4.2, pelvic_obliquity: -1.1 });
  });

  it('omits metrics that were withheld', () => {
    // A metric with no value last time has nothing to compare against. Treating its
    // absence as zero would manufacture a finding out of a missing measurement.
    const a = assessment('a', '2026-08-01T10:00:00Z', {
      trunk_angle: { value: null, status: 'insufficient_data' },
      q_angle_left: { value: null, status: 'unsupported' },
    });
    expect(valuesFrom(a)).toEqual({});
  });

  it('returns nothing for a pre-rewrite assessment with no metricsJson', () => {
    expect(valuesFrom({ id: 'x', analysisDate: '2026-01-01' } as any)).toEqual({});
  });
});

describe('the comparison a clinician actually sees', () => {
  const metric = (over: Partial<MetricResult>): MetricResult => ({
    key: 'trunk_angle', clinicalName: 'Trunk angle', unit: 'degrees',
    status: 'measured', value: 6.0, spread: null, nFrames: 60, viewUsed: 'leftside',
    normalRange: [-2, 6], reference: null, detail: null, ...over,
  });

  it('calls a change smaller than the detectable minimum "no change"', () => {
    // The whole point of wiring this up. A 0.3 degree difference is the instrument
    // moving, not the patient, and must not be presented as progress.
    const result = changeSinceLast(metric({ value: 6.0, mdc95: 0.43, tracksChange: true }), 5.7);
    expect(result?.meaningful).toBe(false);
  });

  it('reports a change that exceeds it', () => {
    const result = changeSinceLast(metric({ value: 9.0, mdc95: 0.43, tracksChange: true }), 5.7);
    expect(result?.meaningful).toBe(true);
    expect(result?.delta).toBeCloseTo(3.3, 5);
  });

  it('refuses to report change for a metric that cannot track it', () => {
    const result = changeSinceLast(metric({ value: 40, tracksChange: false }), 10);
    expect(result?.meaningful).toBe(false);
  });

  it('shows nothing when there is no previous value', () => {
    expect(changeSinceLast(metric({ mdc95: 0.43, tracksChange: true }), null)).toBeNull();
  });
});

describe('previousValuesFor', () => {
  it('threads the whole path: history in, comparable values out', () => {
    const current = assessment('now', '2026-09-20T10:00:00Z', { trunk_angle: { value: 6.0 } });
    const history = [
      assessment('old', '2026-06-01T10:00:00Z', { trunk_angle: { value: 1.0 } }),
      assessment('prev', '2026-08-01T10:00:00Z', { trunk_angle: { value: 4.2 } }),
    ];
    expect(previousValuesFor(current, history)).toEqual({ trunk_angle: 4.2 });
  });
});
