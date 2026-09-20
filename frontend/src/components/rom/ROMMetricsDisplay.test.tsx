/**
 * The range-of-motion report.
 *
 * The left/right comparison is the clinical headline of this screening - a shoulder
 * reaching 170 degrees on one side and 120 on the other is the finding, and two numbers
 * sitting inside their normal range individually is exactly how that finding gets
 * missed. It also has real logic in it (which metrics are usable, what the difference
 * is), so it is the part most worth pinning.
 */

import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import ROMMetricsDisplay from './ROMMetricsDisplay';
import type { MetricsPayload, MetricResult } from '../../types/metrics';

/**
 * The left/right comparison table.
 *
 * Scoped explicitly, because MetricReport below it renders the same metrics again in
 * its own per-joint sections - so an unscoped query for "170.0" finds two elements and
 * a query for a row matches in both tables.
 */
function comparisonTable() {
  return screen.getByText('Left / right comparison').parentElement!;
}

function metric(over: Partial<MetricResult> = {}): MetricResult {
  return {
    key: 'rom_shoulder_flexion_left',
    clinicalName: 'Shoulder flexion (left)',
    value: 170,
    unit: 'degrees',
    status: 'measured',
    spread: 1.2,
    nFrames: 60,
    viewUsed: 'leftside',
    normalRange: [165, 180],
    reference: 'AAOS',
    detail: null,
    ...over,
  };
}

function payload(metrics: Record<string, MetricResult>): MetricsPayload {
  return {
    calibrationDate: '2026-09-20T10:00:00Z',
    personId: 'user_1',
    schemaVersion: 2,
    viewsCaptured: ['front', 'leftside', 'rightside'],
    metrics,
  };
}

const BOTH_SHOULDERS = payload({
  rom_shoulder_flexion_left: metric({ value: 170 }),
  rom_shoulder_flexion_right: metric({
    key: 'rom_shoulder_flexion_right',
    clinicalName: 'Shoulder flexion (right)',
    value: 120,
    viewUsed: 'rightside',
  }),
});

describe('left / right comparison', () => {
  it('shows both sides and their difference', () => {
    renderWithProviders(<ROMMetricsDisplay payload={BOTH_SHOULDERS} />);
    const row = within(comparisonTable()).getByRole('row', {
      name: /Shoulder flexion/,
    });
    expect(within(row).getByText('170.0°')).toBeInTheDocument();
    expect(within(row).getByText('120.0°')).toBeInTheDocument();
    expect(within(row).getByText('50.0°')).toBeInTheDocument();
  });

  it('states that the difference carries no threshold', () => {
    // Deliberate: what counts as a meaningful side-to-side difference depends on the
    // joint and the patient, and inventing a cutoff is the thing the metric registry
    // exists to prevent. If a badge ever appears here, this should fail.
    renderWithProviders(<ROMMetricsDisplay payload={BOTH_SHOULDERS} />);
    expect(screen.getByText(/without a threshold/i)).toBeInTheDocument();
  });

  it('omits a joint when only one side could be measured', () => {
    const one = payload({
      rom_shoulder_flexion_left: metric({ value: 170 }),
      rom_shoulder_flexion_right: metric({
        key: 'rom_shoulder_flexion_right',
        value: null,
        status: 'insufficient_data',
        detail: 'The right-side hold was too short.',
      }),
    });
    renderWithProviders(<ROMMetricsDisplay payload={one} />);
    // A comparison against a missing measurement is not a comparison. Showing 170 vs
    // nothing invites reading the gap as asymmetry.
    expect(screen.queryByText('Left / right comparison')).not.toBeInTheDocument();
  });

  it('is not rendered at all when no joint has both sides', () => {
    const none = payload({
      rom_cervical_lateral_flexion: metric({
        key: 'rom_cervical_lateral_flexion',
        clinicalName: 'Cervical lateral flexion',
        value: 35,
        viewUsed: 'front',
      }),
    });
    renderWithProviders(<ROMMetricsDisplay payload={none} />);
    expect(screen.queryByText('Left / right comparison')).not.toBeInTheDocument();
  });

  it('includes a low-confidence reading, which still carries a value', () => {
    const lowConf = payload({
      rom_knee_flexion_left: metric({
        key: 'rom_knee_flexion_left', clinicalName: 'Knee flexion (left)',
        value: 130, normalRange: [130, 145],
      }),
      rom_knee_flexion_right: metric({
        key: 'rom_knee_flexion_right', clinicalName: 'Knee flexion (right)',
        value: 124, status: 'low_confidence', normalRange: [130, 145],
      }),
    });
    renderWithProviders(<ROMMetricsDisplay payload={lowConf} />);
    const row = within(comparisonTable()).getByRole('row', { name: /Knee flexion/ });
    expect(within(row).getByText('6.0°')).toBeInTheDocument();
  });
});

describe('withheld metrics', () => {
  it('renders nothing at all when there is no payload', () => {
    const { container } = renderWithProviders(
      <ROMMetricsDisplay payload={undefined as never} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an unsupported metric with its reason rather than a dash', () => {
    const withUnsupported = payload({
      rom_cervical_rotation: metric({
        key: 'rom_cervical_rotation',
        clinicalName: 'Cervical rotation',
        value: null,
        status: 'unsupported',
        normalRange: null,
        detail: 'Transverse-plane movement, which a single camera cannot see.',
      }),
    });
    renderWithProviders(<ROMMetricsDisplay payload={withUnsupported} />);
    expect(screen.getByText(/single camera cannot see/i)).toBeInTheDocument();
  });
});
