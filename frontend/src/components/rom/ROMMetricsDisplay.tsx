/**
 * Range-of-motion results.
 *
 * Renders the v2 payload through the shared MetricReport, so ROM inherits every
 * honesty mechanism the posture and gait reports have: withheld metrics show their
 * reason rather than a dash, metrics without the precision to support a verdict show a
 * number and no badge, and cross-view agreement is reported whether or not it passed.
 *
 * Grouped by joint rather than by capture view. The capture order is driven by which
 * camera setup a movement needs, which is an operational concern; a clinician reading
 * the result wants the shoulder findings together.
 */

import MetricReport from '../metrics/MetricReport';
import type { MetricsPayload, QualityFlags } from '../../types/metrics';

const ROM_SECTIONS = [
  {
    title: 'Shoulder',
    keys: [
      'rom_shoulder_flexion_left',
      'rom_shoulder_flexion_right',
      'rom_shoulder_abduction_left',
      'rom_shoulder_abduction_right',
    ],
  },
  {
    title: 'Elbow',
    keys: ['rom_elbow_flexion_left', 'rom_elbow_flexion_right'],
  },
  {
    title: 'Hip',
    keys: ['rom_hip_flexion_left', 'rom_hip_flexion_right'],
  },
  {
    title: 'Knee',
    keys: ['rom_knee_flexion_left', 'rom_knee_flexion_right'],
  },
  {
    title: 'Cervical spine',
    keys: ['rom_cervical_lateral_flexion'],
  },
  {
    title: 'Not Available With This Capture',
    keys: ['rom_cervical_rotation'],
  },
];

interface Props {
  payload: MetricsPayload;
  qualityFlags?: QualityFlags | null;
  previousValues?: Record<string, number | null>;
}

/**
 * Left-right difference per joint.
 *
 * Asymmetry is what a clinician is looking for, and it is not visible by reading two
 * rows several lines apart. A shoulder reaching 170 degrees on one side and 120 on the
 * other is the finding; both numbers sitting inside their normal range individually is
 * exactly how that finding gets missed.
 */
function AsymmetryRow({ payload }: { payload: MetricsPayload }) {
  const pairs: Array<{ label: string; stem: string }> = [
    { label: 'Shoulder flexion', stem: 'rom_shoulder_flexion' },
    { label: 'Shoulder abduction', stem: 'rom_shoulder_abduction' },
    { label: 'Elbow flexion', stem: 'rom_elbow_flexion' },
    { label: 'Hip flexion', stem: 'rom_hip_flexion' },
    { label: 'Knee flexion', stem: 'rom_knee_flexion' },
  ];

  const rows = pairs
    .map(({ label, stem }) => {
      const left = payload.metrics?.[`${stem}_left`];
      const right = payload.metrics?.[`${stem}_right`];
      const usable = (m?: typeof left) =>
        m && m.value !== null && (m.status === 'measured' || m.status === 'low_confidence');
      if (!usable(left) || !usable(right)) return null;
      return { label, left: left!.value!, right: right!.value!, diff: Math.abs(left!.value! - right!.value!) };
    })
    .filter(Boolean) as Array<{ label: string; left: number; right: number; diff: number }>;

  if (rows.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-medium text-white mb-2">Left / right comparison</div>
      <table className="w-full text-xs">
        <thead className="text-slate-400">
          <tr>
            <th className="text-left font-normal pb-1">Movement</th>
            <th className="text-right font-normal pb-1">Left</th>
            <th className="text-right font-normal pb-1">Right</th>
            <th className="text-right font-normal pb-1">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-white/5">
              <td className="py-1.5 text-slate-300">{r.label}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-200">{r.left.toFixed(1)}°</td>
              <td className="py-1.5 text-right tabular-nums text-slate-200">{r.right.toFixed(1)}°</td>
              <td className="py-1.5 text-right tabular-nums text-white font-medium">
                {r.diff.toFixed(1)}°
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/*
        No threshold is applied to the difference on purpose. A meaningful asymmetry
        depends on the joint, the patient and what they are being assessed for, and
        inventing a cutoff here would be exactly the kind of uncited number the metric
        registry exists to prevent.
      */}
      <p className="mt-2 text-[11px] text-slate-500">
        Shown without a threshold: what counts as a meaningful side-to-side difference
        depends on the joint and the patient, and no cited cutoff exists for these
        measurements.
      </p>
    </div>
  );
}

export default function ROMMetricsDisplay({ payload, qualityFlags, previousValues }: Props) {
  if (!payload?.metrics) return null;
  return (
    <div className="space-y-4">
      <AsymmetryRow payload={payload} />
      <MetricReport
        payload={payload}
        qualityFlags={qualityFlags ?? undefined}
        sections={ROM_SECTIONS}
        previousValues={previousValues}
      />
    </div>
  );
}
