import MetricReport from '../metrics/MetricReport';
import type { MetricsPayload, QualityFlags } from '../../types/metrics';

/**
 * Section grouping for the v2 posture report. Titles and ordering live here; units,
 * normal ranges and citations come from the backend registry.
 *
 * The NORMAL_RANGES table below it is legacy-only. It applies to pre-rewrite analyses
 * and must not be extended - a range defined in the frontend can drift away from the
 * computation that produces the value, which is how trunk angle ended up graded
 * against "0-5 degrees" while the backend returned ~180 for every patient.
 */
const POSTURE_SECTIONS = [
  {
    title: 'Global Posture (Head & Spine)',
    keys: ['trunk_angle', 'thoracic_kyphosis_angle', 'forward_head_ratio', 'head_lateral_flexion'],
  },
  {
    title: 'Shoulder & Pelvis',
    keys: ['shoulder_obliquity', 'pelvic_obliquity', 'trunk_lateral_shift_ratio', 'rounded_shoulder_angle'],
  },
  {
    title: 'Lower Extremity',
    keys: [
      'left_hip_angle',
      'right_hip_angle',
      'left_knee_angle',
      'right_knee_angle',
      'knee_varus_valgus',
      'leg_length_asymmetry_ratio',
    ],
  },
  {
    title: 'Body Proportions',
    keys: ['shoulder_hip_width_ratio'],
  },
  {
    title: 'Not Available With This Capture',
    keys: [
      'foot_progression_angle_left',
      'foot_progression_angle_right',
      'head_rotation',
      'pelvic_tilt_angle',
      'q_angle_left',
      'q_angle_right',
      'pronation_supination_left',
      'pronation_supination_right',
      'thoracic_kyphosis_angle',
      'rounded_shoulder_angle',
      'knee_flexion_neutral',
    ],
  },
];

import { PostureAnalysis } from '../../types';

/**
 * Normal ranges for clinical metrics
 * Based on clinical standards from PoseDetection system
 */
const NORMAL_RANGES: Record<string, { min: number; max: number; unit: string; description: string }> = {
  // Global Posture
  fhdPixels: { min: 0, max: 50, unit: 'px', description: 'Forward Head Distance' },
  cervicalAngle: { min: 35, max: 45, unit: '°', description: 'Cervical Angle' },
  headLateralFlexion: { min: -5, max: 5, unit: '°', description: 'Head Lateral Flexion' },
  headRotation: { min: -5, max: 5, unit: '°', description: 'Head Rotation' },
  thoracicKyphosisAngle: { min: 20, max: 40, unit: '°', description: 'Thoracic Kyphosis' },
  lumbarLordosisAngle: { min: 30, max: 50, unit: '°', description: 'Lumbar Lordosis' },
  trunkLateralShift: { min: -10, max: 10, unit: 'px', description: 'Trunk Lateral Shift' },
  trunkAngle: { min: -5, max: 5, unit: '°', description: 'Trunk Angle' },
  
  // Shoulder & Arm
  leftShoulderAngle: { min: 85, max: 95, unit: '°', description: 'Left Shoulder Angle' },
  rightShoulderAngle: { min: 85, max: 95, unit: '°', description: 'Right Shoulder Angle' },
  shoulderHeightDiff: { min: 0, max: 10, unit: 'px', description: 'Shoulder Height Difference' },
  roundedShoulderAngle: { min: 0, max: 15, unit: '°', description: 'Rounded Shoulders' },
  leftElbowAngle: { min: 175, max: 185, unit: '°', description: 'Left Elbow Angle' },
  rightElbowAngle: { min: 175, max: 185, unit: '°', description: 'Right Elbow Angle' },
  
  // Pelvis & Hip
  leftHipAngle: { min: 175, max: 185, unit: '°', description: 'Left Hip Angle' },
  rightHipAngle: { min: 175, max: 185, unit: '°', description: 'Right Hip Angle' },
  pelvicObliquity: { min: -3, max: 3, unit: '°', description: 'Pelvic Obliquity' },
  pelvicTiltAngle: { min: -5, max: 5, unit: '°', description: 'Pelvic Tilt' },
  hipHeightDiff: { min: 0, max: 10, unit: 'px', description: 'Hip Height Difference' },
  
  // Lower Extremity
  leftKneeAngle: { min: 175, max: 185, unit: '°', description: 'Left Knee Angle' },
  rightKneeAngle: { min: 175, max: 185, unit: '°', description: 'Right Knee Angle' },
  kneeVarusValgus: { min: -5, max: 5, unit: '°', description: 'Knee Varus/Valgus' },
  kneeFlexionNeutral: { min: 175, max: 185, unit: '°', description: 'Knee Flexion (Neutral)' },
  qAngleLeft: { min: 10, max: 15, unit: '°', description: 'Q-Angle Left' },
  qAngleRight: { min: 10, max: 15, unit: '°', description: 'Q-Angle Right' },
  footProgressionAngle: { min: -5, max: 10, unit: '°', description: 'Foot Progression Angle' },
  pronationSupinationLeft: { min: -5, max: 5, unit: '°', description: 'Pronation/Supination Left' },
  pronationSupinationRight: { min: -5, max: 5, unit: '°', description: 'Pronation/Supination Right' },
  
  // Body Proportions (no normal ranges - informational only)
  shoulderWidth: { min: 0, max: Infinity, unit: 'px', description: 'Shoulder Width' },
  hipWidth: { min: 0, max: Infinity, unit: 'px', description: 'Hip Width' },
  torsoLength: { min: 0, max: Infinity, unit: 'px', description: 'Torso Length' },
  leftArmLength: { min: 0, max: Infinity, unit: 'px', description: 'Left Arm Length' },
  rightArmLength: { min: 0, max: Infinity, unit: 'px', description: 'Right Arm Length' },
  leftLegLength: { min: 0, max: Infinity, unit: 'px', description: 'Left Leg Length' },
  rightLegLength: { min: 0, max: Infinity, unit: 'px', description: 'Right Leg Length' },
};

/**
 * Metric categories for organized display
 */
const METRIC_CATEGORIES = {
  'Global Posture': [
    'fhdPixels',
    'cervicalAngle',
    'headLateralFlexion',
    'headRotation',
    'thoracicKyphosisAngle',
    'lumbarLordosisAngle',
    'trunkLateralShift',
    'trunkAngle',
  ],
  'Shoulder & Arm': [
    'leftShoulderAngle',
    'rightShoulderAngle',
    'shoulderHeightDiff',
    'roundedShoulderAngle',
    'leftElbowAngle',
    'rightElbowAngle',
  ],
  'Pelvis & Hip': [
    'leftHipAngle',
    'rightHipAngle',
    'pelvicObliquity',
    'pelvicTiltAngle',
    'hipHeightDiff',
  ],
  'Lower Extremity': [
    'leftKneeAngle',
    'rightKneeAngle',
    'kneeVarusValgus',
    'kneeFlexionNeutral',
    'qAngleLeft',
    'qAngleRight',
    'footProgressionAngle',
    'pronationSupinationLeft',
    'pronationSupinationRight',
  ],
  'Body Proportions': [
    'shoulderWidth',
    'hipWidth',
    'torsoLength',
    'leftArmLength',
    'rightArmLength',
    'leftLegLength',
    'rightLegLength',
  ],
};

interface MetricsDisplayProps {
  analysis: PostureAnalysis & {
    metricsJson?: MetricsPayload | null;
    qualityFlags?: QualityFlags | null;
    schemaVersion?: number;
  };
  remainingScreeningCount?: number;
  /**
   * Values from this patient's previous screening, keyed by metric. When supplied, each
   * row shows the change judged against that metric's minimal detectable change rather
   * than against zero.
   */
  previousValues?: Record<string, number | null>;
}

/**
 * Check if a metric value is within normal range
 */
function isWithinNormalRange(metricKey: string, value: number): boolean {
  const range = NORMAL_RANGES[metricKey];
  if (!range) return true;
  
  // Body proportions have no upper limit
  if (range.max === Infinity) return true;
  
  return value >= range.min && value <= range.max;
}

/**
 * Get deviation status for a metric
 */
function getDeviationStatus(metricKey: string, value: number): 'normal' | 'warning' | 'alert' {
  const range = NORMAL_RANGES[metricKey];
  if (!range || range.max === Infinity) return 'normal';
  
  const isNormal = isWithinNormalRange(metricKey, value);
  if (isNormal) return 'normal';
  
  // Calculate how far outside the range
  const deviation = value < range.min 
    ? ((range.min - value) / range.min) * 100
    : ((value - range.max) / range.max) * 100;
  
  // Warning if deviation is < 20%, alert if >= 20%
  return deviation < 20 ? 'warning' : 'alert';
}

/**
 * MetricCard Component
 * Displays a single metric with its value, normal range, and deviation status
 */
function MetricCard({ metricKey, value }: { metricKey: string; value: number }) {
  const range = NORMAL_RANGES[metricKey];
  if (!range) return null;
  
  const status = getDeviationStatus(metricKey, value);
  const isNormal = status === 'normal';
  
  const statusColors = {
    normal: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    alert: 'bg-red-50 border-red-200',
  };
  
  const statusTextColors = {
    normal: 'text-green-700',
    warning: 'text-yellow-700',
    alert: 'text-red-700',
  };
  
  const statusIcons = {
    normal: '✓',
    warning: '⚠',
    alert: '✗',
  };
  
  return (
    <div className={`border rounded-lg p-4 ${statusColors[status]}`}>
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-900">{range.description}</h4>
        <span className={`text-lg ${statusTextColors[status]}`}>
          {statusIcons[status]}
        </span>
      </div>
      
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-gray-900">
            {value.toFixed(1)}
          </span>
          <span className="text-sm text-gray-600">{range.unit}</span>
        </div>
        
        {range.max !== Infinity && (
          <div className="text-xs text-gray-600">
            <div className="flex justify-between mb-1">
              <span>Normal Range:</span>
              <span className="font-medium">
                {range.min} - {range.max} {range.unit}
              </span>
            </div>
            
            {!isNormal && (
              <div className={`mt-2 text-xs font-medium ${statusTextColors[status]}`}>
                {value < range.min ? 'Below' : 'Above'} normal range
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MetricsDisplay Component
 * 
 * Displays all 33 clinical posture metrics organized by category.
 * Shows normal ranges, highlights deviations, and provides download/share options.
 * 
 * Features:
 * - Organized by 5 categories (Global, Shoulder, Pelvis, Lower Extremity, Body Proportions)
 * - Color-coded status indicators (green=normal, yellow=warning, red=alert)
 * - Normal range display for each metric
 * - Remaining screening count display
 * - Download and share functionality
 * 
 * @param analysis - Complete posture analysis with all 33 metrics
 * @param remainingScreeningCount - Optional remaining screening count to display
 */
export default function MetricsDisplay({
  analysis,
  remainingScreeningCount,
  previousValues,
}: MetricsDisplayProps) {
  // v2 analyses describe themselves: value, unit, normal range, citation and
  // measurement status per metric. Render that rather than the frontend's own table.
  if (analysis.metricsJson?.metrics) {
    return (
      <div className="space-y-4">
        <MetricReport
          payload={analysis.metricsJson}
          qualityFlags={analysis.qualityFlags ?? undefined}
          sections={POSTURE_SECTIONS}
          previousValues={previousValues}
        />
      </div>
    );
  }

  if ((analysis.schemaVersion ?? 1) < 2) {
    return (
      <>
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          This assessment was recorded before the measurement rewrite. Its values came
          from a superseded calculation and are not comparable with newer assessments.
        </div>
        {renderLegacyMetrics({ analysis, remainingScreeningCount })}
      </>
    );
  }

  return renderLegacyMetrics({ analysis, remainingScreeningCount });
}

function renderLegacyMetrics({ analysis, remainingScreeningCount }: MetricsDisplayProps) {
  const handleDownload = () => {
    // Create a JSON blob with the analysis data
    const dataStr = JSON.stringify(analysis, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `posture-analysis-${analysis.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const handleShare = async () => {
    const shareData = {
      title: 'Posture Analysis Results',
      text: `Posture Analysis from ${new Date(analysis.analysisDate).toLocaleDateString()}`,
      url: window.location.href,
    };
    
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      // Fallback: copy link to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };
  
  // Calculate summary statistics
  const totalMetrics = 33;
  const metricsWithRanges = Object.keys(NORMAL_RANGES).filter(
    key => NORMAL_RANGES[key].max !== Infinity
  ).length;
  
  const deviationCount = Object.keys(NORMAL_RANGES)
    .filter(key => NORMAL_RANGES[key].max !== Infinity)
    .filter(key => !isWithinNormalRange(key, analysis[key as keyof PostureAnalysis] as number))
    .length;
  
  const normalCount = metricsWithRanges - deviationCount;
  
  return (
    <div className="space-y-6">
      {/* Header with Summary */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Analysis Results
            </h2>
            <p className="text-sm text-gray-600">
              Completed on {new Date(analysis.analysisDate).toLocaleString()}
            </p>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={handleDownload}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              📥 Download
            </button>
            <button
              onClick={handleShare}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              🔗 Share
            </button>
          </div>
        </div>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium mb-1">Total Metrics</div>
            <div className="text-3xl font-bold text-blue-900">{totalMetrics}</div>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium mb-1">Within Normal Range</div>
            <div className="text-3xl font-bold text-green-900">{normalCount}</div>
          </div>
          
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-sm text-yellow-600 font-medium mb-1">Deviations</div>
            <div className="text-3xl font-bold text-yellow-900">{deviationCount}</div>
          </div>
          
          {remainingScreeningCount !== undefined && (
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-sm text-purple-600 font-medium mb-1">Screenings Remaining</div>
              <div className="text-3xl font-bold text-purple-900">{remainingScreeningCount}</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Metrics by Category */}
      {Object.entries(METRIC_CATEGORIES).map(([category, metricKeys]) => (
        <div key={category} className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">{category}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metricKeys.map(metricKey => (
              <MetricCard
                key={metricKey}
                metricKey={metricKey}
                value={analysis[metricKey as keyof PostureAnalysis] as number}
              />
            ))}
          </div>
        </div>
      ))}
      
      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Status Legend</h4>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-green-600 text-lg">✓</span>
            <span className="text-gray-700">Within normal range</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-yellow-600 text-lg">⚠</span>
            <span className="text-gray-700">Minor deviation (&lt;20%)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-red-600 text-lg">✗</span>
            <span className="text-gray-700">Significant deviation (≥20%)</span>
          </div>
        </div>
        
        <div className="mt-4 text-xs text-gray-600">
          <p>
            <strong>Note:</strong> These metrics are for informational purposes only and should not be used as a substitute for professional medical advice. 
            Please consult with a qualified healthcare provider for proper diagnosis and treatment.
          </p>
        </div>
      </div>
    </div>
  );
}
