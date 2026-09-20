/**
 * Shared types for the v2 clinical metric payload.
 *
 * The backend metric registry is the single source of truth: it owns each metric's
 * unit, normal range, citation and measurement status, and ships them alongside the
 * value. The frontend must not carry its own copy of a normal range.
 *
 * That rule exists because the previous report hardcoded ranges in the component -
 * `trunkSagittalLean` was graded against "0–5°" while the backend was returning ~180°
 * for every patient, so every report said Severe and nothing in the code connected the
 * two numbers.
 */

/** Why a metric does or does not carry a usable value. */
export type MetricStatus =
  /** Measured, within physical bounds, spread within tolerance. */
  | 'measured'
  /** Required view absent, too few frames, or events undetectable. No value. */
  | 'insufficient_data'
  /** Measured, but frame-to-frame spread exceeds the tolerance for this metric. */
  | 'low_confidence'
  /** Outside physical possibility - indicates a defect, not a finding. No value. */
  | 'out_of_range'
  /** Cannot be measured with this hardware or these views. No value, ever. */
  | 'unsupported';

export interface MetricResult {
  key: string;
  clinicalName: string;
  /** null whenever status is not 'measured' or 'low_confidence'. */
  value: number | null;
  unit: string;
  status: MetricStatus;
  /** Interquartile spread across frames or cycles. Higher means less trustworthy. */
  spread: number | null;
  nFrames: number;
  viewUsed: string | null;
  /** [low, high] from the backend registry. Never define this in the frontend. */
  normalRange: [number, number] | null;
  /**
   * Set when the backend removed a normal range on purpose, because the metric's
   * measured error is wider than the range. Show the number, show this instead of a
   * normal/abnormal badge - never fall back to a locally hardcoded range.
   */
  ungradeableReason?: string | null;
  /**
   * Smallest change from a previous screening that can be told apart from measuring
   * twice (1.96 * sqrt(2) * within-subject SD, measured by scripts/repeatability.py).
   * null means repeat sessions of this metric do not agree well enough to compare at
   * all - see `tracksChange`.
   */
  mdc95?: number | null;
  /** Whether a difference between two screenings of this metric carries information. */
  tracksChange?: boolean;
  /** How far apart two captures that could both see this metric were. */
  crossViewDelta?: number | null;
  /** Which captures were compared to produce `crossViewDelta`. */
  viewsCompared?: string[] | null;
  /** Literature citation for the normal range. */
  reference: string | null;
  /** Human-readable explanation, always present when status is not 'measured'. */
  detail: string | null;
}

export interface MetricsPayload {
  calibrationDate: string;
  personId: string;
  schemaVersion: number;
  viewsCaptured: string[];
  metrics: Record<string, MetricResult>;
  framesPerView?: Record<string, number>;
  cyclesAnalysed?: number;
  aspectRatio?: number;
  aspectAssumed?: boolean;
  /** Frame rate the temporal metrics were computed on, measured from frame timestamps. */
  fpsUsed?: number;
  /** True when fpsUsed came from the frames themselves rather than the client's claim. */
  fpsMeasured?: boolean;
  /** Set when the capture ran materially slower than requested. Worth showing. */
  fpsNote?: string | null;
  /**
   * Captures whose landmarks disagree with the view they were filed under - the
   * subject faced the wrong way, or the views arrived in the wrong order. The
   * measurements are still correct; the session is missing a view it believes it has.
   */
  orientationWarnings?: string[] | null;
}

export interface QualityFlags {
  statusCounts?: Record<string, number>;
  viewsCaptured?: string[];
  aspectRatioAssumed?: string;
  lowConfidenceMetrics?: string[];
}

/** How a measured value sits against its normal range. */
export type RangeVerdict = 'normal' | 'below' | 'above' | 'ungraded';

export function gradeAgainstRange(metric: MetricResult): RangeVerdict {
  if (metric.value === null || !metric.normalRange) return 'ungraded';
  if (metric.status !== 'measured' && metric.status !== 'low_confidence') return 'ungraded';
  const [low, high] = metric.normalRange;
  if (metric.value < low) return 'below';
  if (metric.value > high) return 'above';
  return 'normal';
}

/** True when the metric carries a number a clinician may read. */
export function hasValue(metric: MetricResult): boolean {
  return metric.value !== null && (metric.status === 'measured' || metric.status === 'low_confidence');
}

export function formatValue(metric: MetricResult): string {
  if (!hasValue(metric)) return '—';
  const decimals = metric.unit === 'ratio' ? 2 : 1;
  return metric.value!.toFixed(decimals);
}

export function formatUnit(unit: string): string {
  switch (unit) {
    case 'degrees':
      return '°';
    case 'percent':
      return '%';
    case 'seconds':
      return 's';
    case 'steps_per_min':
      return 'steps/min';
    case 'metres':
      return 'm';
    case 'ratio':
      return '';
    case 'count':
      return '';
    case 'pixels':
      return 'px';
    default:
      return unit;
  }
}

export function formatRange(metric: MetricResult): string {
  if (!metric.normalRange) return '—';
  const [low, high] = metric.normalRange;
  const decimals = metric.unit === 'ratio' ? 2 : 0;
  return `${low.toFixed(decimals)}–${high.toFixed(decimals)}${formatUnit(metric.unit)}`;
}

/** Short label shown in place of a value when the metric was not measured. */
export function statusLabel(status: MetricStatus): string {
  switch (status) {
    case 'measured':
      return 'Measured';
    case 'low_confidence':
      return 'Low confidence';
    case 'insufficient_data':
      return 'Not measurable — retake';
    case 'out_of_range':
      return 'Computation error';
    case 'unsupported':
      return 'Not available';
    default:
      return status;
  }
}

/**
 * How a metric moved since the last screening, judged against measurement error.
 *
 * Returns null when there is nothing to compare. Otherwise `meaningful` says whether
 * the difference exceeds this metric's minimal detectable change - below that, two
 * screenings of an unchanged patient differ by this much routinely, and reporting it
 * as progress is reporting noise. Metrics whose repeat sessions do not agree at all
 * (`tracksChange === false`) never report a change, whatever the numbers say.
 */
export function changeSinceLast(
  metric: MetricResult,
  previous?: number | null,
): { delta: number; meaningful: boolean; explanation: string } | null {
  if (!hasValue(metric) || previous === null || previous === undefined) return null;
  const delta = metric.value! - previous;

  if (metric.tracksChange === false) {
    return {
      delta,
      meaningful: false,
      explanation:
        'Repeat screenings of this metric do not agree closely enough to track change over time.',
    };
  }
  const mdc = metric.mdc95;
  if (mdc === null || mdc === undefined) {
    return { delta, meaningful: false, explanation: 'No repeatability figure for this metric.' };
  }
  return {
    delta,
    meaningful: Math.abs(delta) > mdc,
    explanation:
      `Changed by ${Math.abs(delta).toFixed(2)}, within the ${mdc.toFixed(2)} this metric ` +
      'varies between screenings of an unchanged patient.',
  };
}
