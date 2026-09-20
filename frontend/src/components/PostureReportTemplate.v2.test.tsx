/**
 * The PDF must print the v2 measurements, not the legacy columns.
 *
 * Two halves, because the bug being guarded against has two halves. The rows themselves
 * are asserted through the builders, which is where the selection and grading logic
 * lives. The template is then rendered for real, which is the part that actually broke:
 * every number was computed, stored and returned correctly, and the PDF still printed
 * dashes, because the template read `analysis.thoracicKyphosisAngle` and friends -
 * columns that are NULL by design on any analysis recorded after the measurement
 * rewrite.
 *
 * The render is asserted only to succeed and to produce a PDF. react-pdf emits
 * compressed content streams, so the text is not greppable from the output; asserting
 * on the builders is how the content is checked.
 */

import { describe, expect, it } from 'vitest';
import { renderToString } from '@react-pdf/renderer';
import {
  buildFlaggedMetricsV2,
  buildMetricGroupsV2,
  buildUnavailableV2,
} from '../utils/reportV2';
import { PostureReportTemplate } from './PostureReportTemplate';
import type { ReportData } from '../types/report';
import type { MetricsPayload } from '../types/metrics';

function metric(over: Partial<MetricsPayload['metrics'][string]> & { key: string }) {
  return {
    clinicalName: over.key,
    value: null,
    unit: 'degrees',
    status: 'measured' as const,
    spread: null,
    nFrames: 60,
    viewUsed: 'front',
    normalRange: null,
    reference: null,
    detail: null,
    ...over,
  };
}

const V2_PAYLOAD: MetricsPayload = {
  calibrationDate: '2026-09-19T19:10:00Z',
  personId: 'user_1',
  schemaVersion: 2,
  viewsCaptured: ['front', 'leftside', 'rightside', 'back'],
  aspectAssumed: false,
  metrics: {
    // Measured, in range, and reachable through a legacy column.
    trunk_angle: metric({
      key: 'trunk_angle', clinicalName: 'Trunk angle', value: -0.4,
      normalRange: [-2, 6], reference: 'Kendall FP et al.',
    }),
    // Measured, but NOT reachable through any legacy column - the case the old PDF
    // printed as a dash while the number existed.
    pelvic_obliquity: metric({
      key: 'pelvic_obliquity', clinicalName: 'Pelvic obliquity', value: -3.52,
      normalRange: [-2.5, 2.5],
    }),
    shoulder_obliquity: metric({
      key: 'shoulder_obliquity', clinicalName: 'Shoulder obliquity', value: -3.95,
      normalRange: [-2.5, 2.5],
    }),
    // Measured, but the backend withdrew its range: must print the number, no verdict.
    thoracic_kyphosis_angle: metric({
      key: 'thoracic_kyphosis_angle', clinicalName: 'Thoracic kyphosis (surface proxy)',
      value: 9.4, normalRange: null,
      ungradeableReason: 'graded against a radiographic Cobb range',
    }),
    // Not measurable with this hardware: belongs in the unavailable list, not a row.
    q_angle_left: metric({
      key: 'q_angle_left', clinicalName: 'Q-angle (left)', value: null,
      status: 'unsupported', detail: 'Requires ASIS and the patella centre.',
    }),
  },
};

const BLANK_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function reportData(payload: MetricsPayload | null): ReportData {
  return {
    analysis: {
      id: 'an_1',
      userId: 'user_1',
      bookingId: 'bk_1',
      analysisDate: '2026-09-19T19:10:00Z',
      status: 'completed',
      metricsJson: payload,
      schemaVersion: payload ? 2 : 1,
      // Legacy columns: NULL exactly as the backend writes them post-rewrite.
      thoracicKyphosisAngle: null,
      trunkAngle: null,
    } as unknown as ReportData['analysis'],
    capturedFrames: { front: null, leftside: null, rightside: null, back: null },
    idealFrames: { front: BLANK_IMG, leftside: BLANK_IMG, rightside: BLANK_IMG, back: BLANK_IMG },
  };
}

describe('v2 report rows', () => {
  const groups = buildMetricGroupsV2(V2_PAYLOAD);
  const rows = groups.flatMap((g) => g.metrics);
  const row = (label: string) => rows.find((r) => r.label === label);

  it('includes metrics that no legacy column can carry', () => {
    // Both have a value in metricsJson and no legacy column; the old PDF printed
    // dashes for them.
    expect(row('Pelvic obliquity')?.value).toBeCloseTo(-3.52, 2);
    expect(row('Shoulder obliquity')?.value).toBeCloseTo(-3.95, 2);
  });

  it('grades a metric that has a range', () => {
    expect(row('Trunk angle')?.status).toBe('Normal');
    expect(row('Pelvic obliquity')?.status).toBe('Mild');
  });

  it('prints a value with no verdict when the range was withdrawn', () => {
    const kyphosis = row('Thoracic kyphosis (surface proxy)');
    expect(kyphosis?.value).toBe(9.4);
    expect(kyphosis?.status).toBe('Ungraded');
    expect(kyphosis?.range).toContain('No verdict');
  });

  it('keeps unmeasurable metrics out of the results table', () => {
    expect(row('Q-angle (left)')).toBeUndefined();
  });

  it('lists unmeasurable metrics with the reason instead', () => {
    const unavailable = buildUnavailableV2(V2_PAYLOAD);
    const q = unavailable.find((u) => u.label === 'Q-angle (left)');
    expect(q?.reason).toContain('ASIS');
  });

  it('does not recommend treatment for a metric it could not grade', () => {
    // The specific false positive: a surface proxy graded against a radiographic Cobb
    // range badged every patient Severe, and it was the only finding on the report.
    const flagged = buildFlaggedMetricsV2(V2_PAYLOAD);
    expect(flagged.map((f) => f.label)).not.toContain('Thoracic kyphosis (surface proxy)');
    expect(flagged.map((f) => f.label)).toContain('Pelvic obliquity');
  });

  it('never attaches a recommendation to a metric with no value', () => {
    const flagged = buildFlaggedMetricsV2(V2_PAYLOAD);
    expect(flagged.every((f) => Number.isFinite(f.value))).toBe(true);
  });
});

describe('PostureReportTemplate rendering', () => {
  it('renders a v2 analysis to a PDF', async () => {
    const out = await renderToString(<PostureReportTemplate data={reportData(V2_PAYLOAD)} />);
    expect(out.startsWith('%PDF')).toBe(true);
  });

  it('renders a pre-rewrite analysis through the legacy path', async () => {
    const out = await renderToString(<PostureReportTemplate data={reportData(null)} />);
    expect(out.startsWith('%PDF')).toBe(true);
  });
});
