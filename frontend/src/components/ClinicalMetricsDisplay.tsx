/*ClinicalMetricsDisplay */

import { useState } from 'react';
import type { PostureAnalysis } from '../types';
import type { MetricStatus, MetricGroup } from '../types/report';
import { buildMetricGroups, buildFlaggedMetrics } from '../utils/reportThresholds';

// Status config
const STATUS_CONFIG: Record<
  MetricStatus,
  { card: string; badge: string; bar: string; icon: string }
> = {
  Normal: {
    card: 'bg-green-50 border-green-200',
    badge: 'bg-green-100 text-green-800',
    bar: 'bg-green-500',
    icon: '✓',
  },
  Mild: {
    card: 'bg-yellow-50 border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-800',
    bar: 'bg-yellow-400',
    icon: '⚠',
  },
  Severe: {
    card: 'bg-red-50 border-red-200',
    badge: 'bg-red-100 text-red-800',
    bar: 'bg-red-500',
    icon: '✗',
  },
  // Measured, but carrying no verdict: the backend withdrew the normal range because
  // the measurement error is wider than the range, so a badge would report noise.
  Ungraded: {
    card: 'bg-gray-50 border-gray-200',
    badge: 'bg-gray-100 text-gray-600',
    bar: 'bg-gray-400',
    icon: '–',
  },
  // Not a finding — the metric was not measured. Rendered neutrally and never graded.
  Unmeasured: {
    card: 'bg-gray-50 border-gray-200',
    badge: 'bg-gray-100 text-gray-600',
    bar: 'bg-gray-300',
    icon: '–',
  },
};

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------
function MetricCard({
  label,
  value,
  unit,
  status,
}: {
  label: string;
  value: number | null;
  unit: string;
  status: MetricStatus;
}) {
  const cfg = STATUS_CONFIG[status];

  // Progress bar fill: Normal → 100%, Mild → 60%, Severe → 30%
  const barWidth = status === 'Normal' ? 100 : status === 'Mild' ? 60 : 30;

  return (
    <div className={`border rounded-lg p-4 ${cfg.card}`}>
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-900 leading-snug pr-2">
          {label}
        </h4>
        <span
          className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}
        >
          {cfg.icon} {status}
        </span>
      </div>

      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-2xl font-bold text-gray-900">
          {typeof value === 'number' ? value.toFixed(1) : '—'}
        </span>
        <span className="text-sm text-gray-500">{unit}</span>
      </div>

      {/* Visual indicator bar */}
      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${cfg.bar}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupSection (collapsible)
// ---------------------------------------------------------------------------
function GroupSection({ group }: { group: MetricGroup }) {
  const [open, setOpen] = useState(true);

  const severeCnt = group.metrics.filter(m => m.status === 'Severe').length;
  const mildCnt = group.metrics.filter(m => m.status === 'Mild').length;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900">
            {group.title}
          </h3>
          {severeCnt > 0 && (
            <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {severeCnt} Severe
            </span>
          )}
          {mildCnt > 0 && (
            <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              {mildCnt} Mild
            </span>
          )}
        </div>
        <svg
          className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {group.metrics.map(m => (
            <MetricCard
              key={m.label}
              label={m.label}
              value={m.value}
              unit={m.unit}
              status={m.status}
            />
          ))}
        </div>
      )}
    </div>
  );
}
// ClinicalMetricsDisplay
interface Props {
  data: PostureAnalysis;
  remainingScreeningCount?: number;
}

/**
 * ClinicalMetricsDisplay
 * All data comes from the posture analysis JSON.
 * @example
 * <ClinicalMetricsDisplay data={postureAnalysisData} />
 */
export function ClinicalMetricsDisplay({ data, remainingScreeningCount }: Props) {
  const groups = buildMetricGroups(data);
  const flagged = buildFlaggedMetrics(data);

  const total = groups.reduce((sum, g) => sum + g.metrics.length, 0);
  const severeCount = flagged.filter(f => f.status === 'Severe').length;
  const mildCount = flagged.filter(f => f.status === 'Mild').length;
  const unmeasuredCount = groups.reduce(
    (sum, g) => sum + g.metrics.filter(m => m.status === 'Unmeasured').length,
    0,
  );
  // Unmeasured metrics are neither normal nor abnormal; counting them as normal would
  // overstate how much of the assessment actually succeeded.
  const normalCount = total - flagged.length - unmeasuredCount;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Clinical Metrics</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {new Date(data.analysisDate).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-medium mb-1">Total Metrics</div>
            <div className="text-2xl font-bold text-blue-900">{total}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-xs text-green-600 font-medium mb-1">Normal</div>
            <div className="text-2xl font-bold text-green-900">{normalCount}</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3">
            <div className="text-xs text-yellow-600 font-medium mb-1">Mild</div>
            <div className="text-2xl font-bold text-yellow-900">{mildCount}</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <div className="text-xs text-red-600 font-medium mb-1">Severe</div>
            <div className="text-2xl font-bold text-red-900">{severeCount}</div>
          </div>
          {remainingScreeningCount !== undefined && (
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-xs text-purple-600 font-medium mb-1">Screenings Left</div>
              <div className="text-2xl font-bold text-purple-900">
                {remainingScreeningCount}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Flagged summary */}
      {flagged.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-3">
            Flagged Findings
          </h3>
          <ul className="space-y-2">
            {flagged.map(item => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-0.5 flex-shrink-0 font-bold ${
                    item.status === 'Severe' ? 'text-red-600' : 'text-yellow-600'
                  }`}
                >
                  •
                </span>
                <span className="text-gray-800">
                  <span className="font-medium">{item.label}</span>{' '}
                  ({item.value !== null ? `${item.value.toFixed(1)}°` : 'not measured'}) —{' '}
                  <span
                    className={
                      item.status === 'Severe' ? 'text-red-700 font-semibold' : 'text-yellow-700 font-semibold'
                    }
                  >
                    {item.status}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {item.recommendation}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metric groups */}
      {groups.map(group => (
        <GroupSection key={group.title} group={group} />
      ))}

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4 flex flex-wrap gap-4 text-sm">
        {(['Normal', 'Mild', 'Severe'] as MetricStatus[]).map(s => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full inline-block ${STATUS_CONFIG[s].bar}`}
            />
            <span className="text-gray-700">{s}</span>
          </div>
        ))}
        <p className="w-full text-xs text-gray-500 mt-1">
          For informational purposes only. Consult a qualified healthcare
          provider for diagnosis and treatment.
        </p>
      </div>
    </div>
  );
}
