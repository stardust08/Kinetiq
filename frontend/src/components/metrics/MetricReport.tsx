/**
 * Registry-driven metric report.
 *
 * Renders whatever the backend sent, using the backend's own units, normal ranges and
 * citations. It deliberately has no knowledge of any specific metric: adding or
 * retiring a metric is a backend-only change.
 *
 * The important behaviour is what happens when a metric was NOT measured. Such a
 * metric renders as an explanation, never as a number and never with a severity badge.
 * The previous report had no such state - every metric got a value and a
 * Normal/Mild/Severe badge regardless of whether anything had actually been measured.
 */

import {
  formatRange,
  formatUnit,
  formatValue,
  gradeAgainstRange,
  changeSinceLast,
  hasValue,
  statusLabel,
  type MetricResult,
  type MetricsPayload,
  type QualityFlags,
} from '../../types/metrics';

const VERDICT_STYLES: Record<string, string> = {
  normal: 'bg-green-100 text-green-800',
  below: 'bg-amber-100 text-amber-800',
  above: 'bg-amber-100 text-amber-800',
  ungraded: 'bg-gray-100 text-gray-600',
};

const STATUS_STYLES: Record<string, string> = {
  measured: 'text-gray-900',
  low_confidence: 'text-amber-700',
  insufficient_data: 'text-gray-400 italic',
  out_of_range: 'text-red-600 italic',
  unsupported: 'text-gray-400 italic',
};

function MetricRow({ metric, previous }: { metric: MetricResult; previous?: number | null }) {
  const measured = hasValue(metric);
  const verdict = gradeAgainstRange(metric);
  const change = changeSinceLast(metric, previous);

  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="py-2 pr-3">
        <div className="text-sm text-gray-900">{metric.clinicalName}</div>
        {/* When a metric is missing, say why. An unexplained blank reads as a bug. */}
        {!measured && metric.detail && (
          <div className="mt-0.5 text-xs text-gray-500">{metric.detail}</div>
        )}
        {measured && metric.status === 'low_confidence' && metric.detail && (
          <div className="mt-0.5 text-xs text-amber-600">{metric.detail}</div>
        )}
        {/*
          A metric can be measured accurately and still not support a verdict, when the
          measurement error is wider than the normal range it would be graded against.
          The backend strips the range in that case; without this line the row simply
          shows one fewer badge than its neighbours and reads as a rendering bug.
        */}
        {measured && metric.ungradeableReason && (
          <div className="mt-0.5 text-xs text-gray-500">
            Shown without a verdict: {metric.ungradeableReason}
          </div>
        )}
        {/*
          Two captures that could both see this metric, and what they said. Agreement is
          the only check on this number that does not come from the same camera angle
          the number came from, so it is worth showing even when it passed.
        */}
        {measured && metric.crossViewDelta !== null && metric.crossViewDelta !== undefined
          && metric.viewsCompared && metric.viewsCompared.length > 1 && (
          <div className="mt-0.5 text-xs text-gray-400">
            {metric.viewsCompared.join(' vs ')} agree to{' '}
            {metric.crossViewDelta.toFixed(2)}
            {formatUnit(metric.unit)}
          </div>
        )}
      </td>

      <td className={`py-2 pr-3 text-right text-sm tabular-nums ${STATUS_STYLES[metric.status]}`}>
        {measured ? `${formatValue(metric)}${formatUnit(metric.unit)}` : '—'}
      </td>

      <td className="py-2 pr-3 text-right text-xs text-gray-500 tabular-nums">
        {formatRange(metric)}
      </td>

      {/*
        Change since the last screening, judged against the minimal detectable change
        rather than against zero. Any two measurements of an unchanged patient differ;
        MDC95 is how far they differ by chance. Printing a raw delta invites a clinician
        to read a 1.2 degree "improvement" that the instrument cannot resolve.
      */}
      <td className="py-2 pr-3 text-right text-xs tabular-nums">
        {change === null ? (
          <span className="text-gray-300">—</span>
        ) : change.meaningful ? (
          <span className="text-gray-900">
            {change.delta > 0 ? '+' : ''}
            {change.delta.toFixed(2)}
            {formatUnit(metric.unit)}
          </span>
        ) : (
          <span className="text-gray-400" title={change.explanation}>
            no change
          </span>
        )}
      </td>

      <td className="py-2 text-right">
        {measured ? (
          <span className={`inline-block rounded px-2 py-0.5 text-xs ${VERDICT_STYLES[verdict]}`}>
            {verdict === 'normal'
              ? 'Within range'
              : verdict === 'ungraded'
                ? 'No reference range'
                : verdict === 'below'
                  ? 'Below range'
                  : 'Above range'}
          </span>
        ) : (
          /* No badge. A metric that was not measured cannot be graded. */
          <span className="text-xs text-gray-400">{statusLabel(metric.status)}</span>
        )}
      </td>
    </tr>
  );
}

function QualityBanner({ payload, flags }: { payload: MetricsPayload; flags?: QualityFlags }) {
  const warnings: string[] = [];

  if (payload.aspectAssumed || flags?.aspectRatioAssumed) {
    warnings.push(
      flags?.aspectRatioAssumed ??
        'Capture dimensions were not reported, so a 4:3 frame was assumed. Angles may be skewed.',
    );
  }
  // A subject who faced the wrong way still gets correct numbers, but the session is
  // missing a view it thinks it has - and that is the operator's problem to fix, on the
  // spot, while the patient is still in the room.
  for (const w of payload.orientationWarnings ?? []) warnings.push(w);
  if (payload.fpsNote) {
    // The capture ran at a different rate than the client asked for. Every temporal
    // metric divides by that rate, so a large gap is worth showing even though the
    // backend has already corrected for it.
    warnings.push(payload.fpsNote);
  }
  if (payload.cyclesAnalysed !== undefined && payload.cyclesAnalysed < 3) {
    warnings.push(
      `Only ${payload.cyclesAnalysed} gait cycle(s) were analysed. Three or more are needed for a reliable result.`,
    );
  }
  const lowConfidence = flags?.lowConfidenceMetrics ?? [];
  if (lowConfidence.length > 0) {
    warnings.push(
      `${lowConfidence.length} metric(s) showed high frame-to-frame variability and are marked low confidence.`,
    );
  }

  if (warnings.length === 0) return null;

  return (
    <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3">
      <div className="text-sm font-medium text-amber-900">Capture quality</div>
      <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export interface MetricReportProps {
  payload: MetricsPayload;
  qualityFlags?: QualityFlags;
  /**
   * Values from this patient's previous screening, keyed by metric. When supplied, each
   * row shows the change judged against that metric's minimal detectable change rather
   * than against zero.
   */
  previousValues?: Record<string, number | null>;
  /** Optional grouping: section title -> ordered metric keys. Ungrouped keys follow. */
  sections?: Array<{ title: string; keys: string[] }>;
}

export function MetricReport({
  payload,
  qualityFlags,
  sections,
  previousValues,
}: MetricReportProps) {
  const metrics = payload.metrics ?? {};
  const grouped = sections ?? [{ title: 'Clinical metrics', keys: Object.keys(metrics) }];
  const claimed = new Set(grouped.flatMap((s) => s.keys));
  const remaining = Object.keys(metrics).filter((k) => !claimed.has(k));
  const allSections =
    remaining.length > 0 ? [...grouped, { title: 'Other', keys: remaining }] : grouped;

  return (
    <div>
      <QualityBanner payload={payload} flags={qualityFlags} />

      {allSections.map((section) => {
        const rows = section.keys.map((k) => metrics[k]).filter(Boolean);
        if (rows.length === 0) return null;
        return (
          <div key={section.title} className="mb-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">{section.title}</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="pb-1 text-left font-normal">Metric</th>
                  <th className="pb-1 text-right font-normal">Value</th>
                  <th className="pb-1 text-right font-normal">Normal range</th>
                  <th className="pb-1 text-right font-normal">Since last</th>
                  <th className="pb-1 text-right font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <MetricRow
                    key={m.key}
                    metric={m}
                    previous={previousValues?.[m.key]}
                  />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <ReferenceFootnotes metrics={Object.values(metrics)} />
    </div>
  );
}

/**
 * Citations for every normal range shown. If we grade a patient against a threshold we
 * should be able to say where the threshold came from.
 */
function ReferenceFootnotes({ metrics }: { metrics: MetricResult[] }) {
  const refs = Array.from(
    new Set(metrics.filter((m) => m.normalRange && m.reference).map((m) => m.reference!)),
  ).sort();

  if (refs.length === 0) return null;

  return (
    <div className="mt-6 border-t border-gray-200 pt-3">
      <div className="text-xs font-medium text-gray-600">Reference ranges</div>
      <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-gray-500">
        {refs.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

export default MetricReport;
