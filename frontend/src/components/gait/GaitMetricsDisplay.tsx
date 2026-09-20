import MetricReport from '../metrics/MetricReport';
import type { MetricsPayload, QualityFlags } from '../../types/metrics';

/**
 * Section grouping for the v2 report. Titles and ordering live here; units, normal
 * ranges and citations come from the backend registry, never from this file.
 */
const GAIT_SECTIONS = [
  {
    title: 'I. Temporal Parameters',
    keys: [
      'cadence',
      'stride_time_left',
      'stride_time_right',
      'stance_phase_percent',
      'swing_phase_percent',
      'double_support_percent',
    ],
  },
  {
    title: 'II. Spatial Parameters',
    keys: ['stride_length_ratio', 'walking_speed_ratio', 'step_length_symmetry', 'step_width_ratio'],
  },
  {
    title: 'III. Kinematic Parameters',
    keys: [
      'hip_flexion_max',
      'hip_extension_max',
      'hip_flexion_rom',
      'knee_flexion_max',
      'knee_flexion_rom',
      'ankle_dorsiflexion_max',
      'foot_progression_angle_left',
      'foot_progression_angle_right',
    ],
  },
  {
    title: 'IV. Trunk & Pelvis',
    keys: ['trunk_sagittal_lean', 'trunk_lateral_sway_ratio', 'pelvic_obliquity_range'],
  },
  {
    title: 'V. Functional Scores',
    keys: ['gait_symmetry_index', 'stride_time_variability', 'gait_cycle_count'],
  },
];

interface GaitMetrics {
  // I. Temporal
  cadence: number | null;
  strideTimeLeft: number | null;
  strideTimeRight: number | null;
  stancePhasePercent: number | null;
  swingPhasePercent: number | null;
  doubleSupportTime: number | null;
  // II. Spatial
  strideLength: number | null;
  stepLengthLeft: number | null;
  stepLengthRight: number | null;
  stepWidth: number | null;
  walkingSpeed: number | null;
  stepLengthSymmetry: number | null;
  // III. Kinematic
  hipFlexionMax: number | null;
  hipExtensionMax: number | null;
  hipFlexionRom: number | null;
  kneeFlexionMax: number | null;
  kneeExtensionMin: number | null;
  kneeFlexionRom: number | null;
  leftKneeAngleAvg: number | null;
  rightKneeAngleAvg: number | null;
  ankleDorsiflexionMax: number | null;
  footProgressionAngleLeft: number | null;
  footProgressionAngleRight: number | null;
  armSwingAmplitude: number | null;
  // IV. Trunk & Pelvis
  trunkLateralSway: number | null;
  trunkSagittalLean: number | null;
  pelvicObliquityRange: number | null;
  armSwingSymmetry: number | null;
  // V. Scores
  gaitSymmetryIndex: number | null;
  stepRegularity: number | null;
  gaitQualityScore: number | null;
  gaitCycleCount: number | null;
}

interface GaitMetricsDisplayProps {
  metrics: GaitMetrics;
  /** v2 payload. Present on schemaVersion >= 2 analyses. */
  metricsJson?: MetricsPayload | null;
  qualityFlags?: QualityFlags | null;
  schemaVersion?: number;
}

interface MetricRow {
  label: string;
  value: number | null;
  unit: string;
  normalRange?: string;
}

function MetricsSection({ title, rows }: { title: string; rows: MetricRow[] }) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-3">
        {title}
      </h4>
      <div className="space-y-2">
        {rows.map(row => (
          <div
            key={row.label}
            className="flex items-center justify-between py-1 border-b border-gray-700/50 last:border-0"
          >
            <div>
              <span className="text-sm text-gray-300">{row.label}</span>
              {row.normalRange && (
                <span className="ml-2 text-xs text-gray-500">
                  ({row.normalRange})
                </span>
              )}
            </div>
            <span className="text-sm font-mono font-semibold text-white">
              {typeof row.value === 'number' ? row.value.toFixed(2) : '—'}{' '}
              <span className="text-gray-400 font-normal text-xs">{row.unit}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GaitMetricsDisplay({
  metrics: m,
  metricsJson,
  qualityFlags,
  schemaVersion,
}: GaitMetricsDisplayProps) {
  // v2 analyses carry a self-describing payload: value, unit, normal range, citation
  // and measurement status per metric. Render that directly so the report cannot grade
  // a patient against a threshold the backend did not define.
  if (metricsJson?.metrics) {
    return (
      <div className="space-y-4">
        <MetricReport
          payload={metricsJson}
          qualityFlags={qualityFlags ?? undefined}
          sections={GAIT_SECTIONS}
        />
      </div>
    );
  }

  // Legacy path: analyses recorded before the metric rewrite. Their numbers were
  // produced by superseded maths, so they are shown but explicitly labelled.
  return (
    <>
      {(schemaVersion ?? 1) < 2 && (
        <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
          This assessment was recorded before the measurement rewrite. Its values were
          produced by a superseded calculation and are not comparable with newer
          assessments.
        </div>
      )}
      {renderLegacyGaitMetrics(m)}
    </>
  );
}

function renderLegacyGaitMetrics(m: GaitMetrics) {
  return (
    <div className="flex flex-col gap-4">
      {/* Quality Score Banner */}
      <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-700/50 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">Gait Quality Score</p>
          <p className="text-4xl font-bold text-white">
            {typeof m.gaitQualityScore === 'number' ? m.gaitQualityScore.toFixed(0) : '—'}
            <span className="text-lg text-gray-400">/100</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">Symmetry Index</p>
          <p className="text-2xl font-semibold text-green-400">
            {typeof m.gaitSymmetryIndex === 'number' ? `${m.gaitSymmetryIndex.toFixed(1)}%` : '—'}
          </p>
          <p className="text-xs text-gray-500">
            {m.gaitCycleCount} gait cycles analyzed
          </p>
        </div>
      </div>

      <MetricsSection
        title="I. Temporal Parameters"
        rows={[
          { label: 'Cadence', value: m.cadence, unit: 'steps/min', normalRange: '100–120' },
          { label: 'Stride Time (Left)', value: m.strideTimeLeft, unit: 's', normalRange: '0.98–1.07' },
          { label: 'Stride Time (Right)', value: m.strideTimeRight, unit: 's' },
          { label: 'Stance Phase', value: m.stancePhasePercent, unit: '%', normalRange: '~60%' },
          { label: 'Swing Phase', value: m.swingPhasePercent, unit: '%', normalRange: '~40%' },
          { label: 'Double Support Time', value: m.doubleSupportTime, unit: 's', normalRange: '0.10–0.14' },
        ]}
      />

      <MetricsSection
        title="II. Spatial Parameters"
        rows={[
          { label: 'Stride Length', value: m.strideLength, unit: 'norm' },
          { label: 'Step Length (Left)', value: m.stepLengthLeft, unit: 'norm' },
          { label: 'Step Length (Right)', value: m.stepLengthRight, unit: 'norm' },
          { label: 'Step Width', value: m.stepWidth, unit: 'norm' },
          { label: 'Walking Speed', value: m.walkingSpeed, unit: 'norm/s' },
          { label: 'Step Length Symmetry', value: m.stepLengthSymmetry, unit: '%', normalRange: '>95%' },
        ]}
      />

      <MetricsSection
        title="III. Kinematic Parameters"
        rows={[
          { label: 'Hip Flexion Max', value: m.hipFlexionMax, unit: '°', normalRange: '20–30°' },
          { label: 'Hip Extension Max', value: m.hipExtensionMax, unit: '°', normalRange: '10–20°' },
          { label: 'Hip Flexion ROM', value: m.hipFlexionRom, unit: '°', normalRange: '40–50°' },
          { label: 'Knee Flexion Max', value: m.kneeFlexionMax, unit: '°', normalRange: '55–65°' },
          { label: 'Knee Extension Min', value: m.kneeExtensionMin, unit: '°' },
          { label: 'Knee Flexion ROM', value: m.kneeFlexionRom, unit: '°' },
          { label: 'Left Knee Angle (avg)', value: m.leftKneeAngleAvg, unit: '°' },
          { label: 'Right Knee Angle (avg)', value: m.rightKneeAngleAvg, unit: '°' },
          { label: 'Ankle Dorsiflexion Max', value: m.ankleDorsiflexionMax, unit: '°', normalRange: '10–15°' },
          { label: 'Foot Progression (Left)', value: m.footProgressionAngleLeft, unit: '°', normalRange: '5–15°' },
          { label: 'Foot Progression (Right)', value: m.footProgressionAngleRight, unit: '°' },
          { label: 'Arm Swing Amplitude', value: m.armSwingAmplitude, unit: 'norm' },
        ]}
      />

      <MetricsSection
        title="IV. Trunk & Pelvis"
        rows={[
          { label: 'Trunk Lateral Sway', value: m.trunkLateralSway, unit: 'norm' },
          { label: 'Trunk Sagittal Lean', value: m.trunkSagittalLean, unit: '°', normalRange: '0–5°' },
          { label: 'Pelvic Obliquity Range', value: m.pelvicObliquityRange, unit: '°', normalRange: '4–6°' },
          { label: 'Arm Swing Symmetry', value: m.armSwingSymmetry, unit: '%', normalRange: '>90%' },
        ]}
      />

      <MetricsSection
        title="V. Functional Scores"
        rows={[
          { label: 'Gait Symmetry Index', value: m.gaitSymmetryIndex, unit: '%', normalRange: '>95%' },
          { label: 'Step Regularity', value: m.stepRegularity, unit: '(0–1)', normalRange: '>0.85' },
          { label: 'Gait Quality Score', value: m.gaitQualityScore, unit: '/100' },
          { label: 'Gait Cycles Analyzed', value: m.gaitCycleCount, unit: 'cycles' },
        ]}
      />
    </div>
  );
}
