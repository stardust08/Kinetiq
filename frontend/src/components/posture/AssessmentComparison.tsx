import { useState, useMemo } from 'react';
import { PostureAnalysis } from '../../types';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/**
 * AssessmentComparison Component
 * 
 * Compares multiple posture assessments side-by-side to track progress over time.
 * 
 * Features:
 * - Compare 2-4 assessments simultaneously
 * - Show metric changes over time with trend visualization
 * - Highlight improvements (green) and regressions (red)
 * - Filter by metric category
 * - Toggle between line chart and bar chart views
 * - Summary statistics showing overall progress
 * 
 * @param assessments - Array of 2-4 posture analyses to compare (sorted by date)
 * @param onClose - Optional callback to close the comparison view
 */
export interface AssessmentComparisonProps {
  assessments: PostureAnalysis[];
  onClose?: () => void;
}

/**
 * Metric categories for filtering
 */
const METRIC_CATEGORIES = {
  'All Metrics': 'all',
  'Global Posture': 'global',
  'Shoulder & Arm': 'shoulder',
  'Pelvis & Hip': 'pelvis',
  'Lower Extremity': 'lower',
  'Body Proportions': 'proportions',
} as const;

/**
 * Metric keys by category
 */
const CATEGORY_METRICS: Record<string, string[]> = {
  global: [
    'fhdPixels',
    'cervicalAngle',
    'headLateralFlexion',
    'headRotation',
    'thoracicKyphosisAngle',
    'lumbarLordosisAngle',
    'trunkLateralShift',
    'trunkAngle',
  ],
  shoulder: [
    'leftShoulderAngle',
    'rightShoulderAngle',
    'shoulderHeightDiff',
    'roundedShoulderAngle',
    'leftElbowAngle',
    'rightElbowAngle',
  ],
  pelvis: [
    'leftHipAngle',
    'rightHipAngle',
    'pelvicObliquity',
    'pelvicTiltAngle',
    'hipHeightDiff',
  ],
  lower: [
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
  proportions: [
    'shoulderWidth',
    'hipWidth',
    'torsoLength',
    'leftArmLength',
    'rightArmLength',
    'leftLegLength',
    'rightLegLength',
  ],
};

/**
 * Metric display names
 */
const METRIC_NAMES: Record<string, string> = {
  fhdPixels: 'Forward Head Distance',
  cervicalAngle: 'Cervical Angle',
  headLateralFlexion: 'Head Lateral Flexion',
  headRotation: 'Head Rotation',
  thoracicKyphosisAngle: 'Thoracic Kyphosis',
  lumbarLordosisAngle: 'Lumbar Lordosis',
  trunkLateralShift: 'Trunk Lateral Shift',
  trunkAngle: 'Trunk Angle',
  leftShoulderAngle: 'Left Shoulder Angle',
  rightShoulderAngle: 'Right Shoulder Angle',
  shoulderHeightDiff: 'Shoulder Height Diff',
  roundedShoulderAngle: 'Rounded Shoulders',
  leftElbowAngle: 'Left Elbow Angle',
  rightElbowAngle: 'Right Elbow Angle',
  leftHipAngle: 'Left Hip Angle',
  rightHipAngle: 'Right Hip Angle',
  pelvicObliquity: 'Pelvic Obliquity',
  pelvicTiltAngle: 'Pelvic Tilt',
  hipHeightDiff: 'Hip Height Diff',
  leftKneeAngle: 'Left Knee Angle',
  rightKneeAngle: 'Right Knee Angle',
  kneeVarusValgus: 'Knee Varus/Valgus',
  kneeFlexionNeutral: 'Knee Flexion',
  qAngleLeft: 'Q-Angle Left',
  qAngleRight: 'Q-Angle Right',
  footProgressionAngle: 'Foot Progression',
  pronationSupinationLeft: 'Pronation/Supination L',
  pronationSupinationRight: 'Pronation/Supination R',
  shoulderWidth: 'Shoulder Width',
  hipWidth: 'Hip Width',
  torsoLength: 'Torso Length',
  leftArmLength: 'Left Arm Length',
  rightArmLength: 'Right Arm Length',
  leftLegLength: 'Left Leg Length',
  rightLegLength: 'Right Leg Length',
};

/**
 * Calculate percentage change between two values
 */
function calculateChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}

/**
 * Determine if a change is an improvement based on metric type
 * For most metrics, moving toward normal range is improvement
 */
function isImprovement(metricKey: string, change: number): boolean {
  // For distance/difference metrics, decrease is improvement
  const decreaseIsGood = [
    'fhdPixels',
    'shoulderHeightDiff',
    'hipHeightDiff',
    'trunkLateralShift',
    'roundedShoulderAngle',
  ];
  
  if (decreaseIsGood.includes(metricKey)) {
    return change < 0;
  }
  
  // For most angle metrics, we'd need to know the baseline
  // For simplicity, we'll consider any change < 5% as neutral
  return Math.abs(change) < 5;
}

export default function AssessmentComparison({
  assessments,
  onClose,
}: AssessmentComparisonProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  
  // Validate assessments
  if (!assessments || assessments.length < 2) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800">
          Please select at least 2 assessments to compare.
        </p>
      </div>
    );
  }
  
  if (assessments.length > 4) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-800">
          Maximum 4 assessments can be compared at once.
        </p>
      </div>
    );
  }
  
  // Sort assessments by date (oldest first)
  const sortedAssessments = useMemo(() => {
    return [...assessments].sort(
      (a, b) => new Date(a.analysisDate).getTime() - new Date(b.analysisDate).getTime()
    );
  }, [assessments]);
  
  // Get metrics to display based on selected category
  const metricsToDisplay = useMemo(() => {
    if (selectedCategory === 'all') {
      return Object.keys(METRIC_NAMES);
    }
    return CATEGORY_METRICS[selectedCategory] || [];
  }, [selectedCategory]);
  
  // Calculate changes between first and last assessment
  const changes = useMemo(() => {
    const first = sortedAssessments[0];
    const last = sortedAssessments[sortedAssessments.length - 1];
    
    return metricsToDisplay.map(metricKey => {
      const oldValue = first[metricKey as keyof PostureAnalysis] as number;
      const newValue = last[metricKey as keyof PostureAnalysis] as number;
      const change = calculateChange(oldValue, newValue);
      const improved = isImprovement(metricKey, change);
      
      return {
        metric: metricKey,
        name: METRIC_NAMES[metricKey],
        oldValue,
        newValue,
        change,
        improved,
      };
    });
  }, [sortedAssessments, metricsToDisplay]);
  
  // Prepare chart data for selected metric
  const chartData = useMemo(() => {
    if (!selectedMetric) return [];
    
    return sortedAssessments.map((assessment, index) => ({
      name: `Assessment ${index + 1}`,
      date: new Date(assessment.analysisDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      value: assessment[selectedMetric as keyof PostureAnalysis] as number,
    }));
  }, [sortedAssessments, selectedMetric]);
  
  // Calculate summary statistics
  const summary = useMemo(() => {
    const improvements = changes.filter(c => c.improved && Math.abs(c.change) >= 5).length;
    const regressions = changes.filter(c => !c.improved && Math.abs(c.change) >= 5).length;
    const stable = changes.length - improvements - regressions;
    
    return { improvements, regressions, stable };
  }, [changes]);
  
  return (
    <div className="assessment-comparison space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Assessment Comparison
            </h2>
            <p className="text-sm text-gray-600">
              Comparing {sortedAssessments.length} assessments from{' '}
              {new Date(sortedAssessments[0].analysisDate).toLocaleDateString()} to{' '}
              {new Date(sortedAssessments[sortedAssessments.length - 1].analysisDate).toLocaleDateString()}
            </p>
          </div>
          
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close comparison"
            >
              ✕
            </button>
          )}
        </div>
        
        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium mb-1">Improvements</div>
            <div className="text-3xl font-bold text-green-900">{summary.improvements}</div>
            <div className="text-xs text-green-600 mt-1">Metrics improved ≥5%</div>
          </div>
          
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium mb-1">Stable</div>
            <div className="text-3xl font-bold text-blue-900">{summary.stable}</div>
            <div className="text-xs text-blue-600 mt-1">Metrics changed &lt;5%</div>
          </div>
          
          <div className="bg-red-50 rounded-lg p-4">
            <div className="text-sm text-red-600 font-medium mb-1">Regressions</div>
            <div className="text-3xl font-bold text-red-900">{summary.regressions}</div>
            <div className="text-xs text-red-600 mt-1">Metrics worsened ≥5%</div>
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1">
            <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Category
            </label>
            <select
              id="category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter by Category"
            >
              {Object.entries(METRIC_CATEGORIES).map(([label, value]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Chart Type
            </label>
            <div className="flex space-x-2">
              <button
                onClick={() => setChartType('line')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartType === 'line'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📈 Line Chart
              </button>
              <button
                onClick={() => setChartType('bar')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chartType === 'bar'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📊 Bar Chart
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Metric Changes Table */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Metric Changes Over Time
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                  Metric
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">
                  Initial
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">
                  Latest
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">
                  Change
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">
                  Trend
                </th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">
                  Chart
                </th>
              </tr>
            </thead>
            <tbody>
              {changes.map((item) => (
                <tr
                  key={item.metric}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">
                    {item.name}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700 text-right">
                    {item.oldValue.toFixed(1)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700 text-right">
                    {item.newValue.toFixed(1)}
                  </td>
                  <td
                    className={`py-3 px-4 text-sm font-medium text-right ${
                      Math.abs(item.change) < 5
                        ? 'text-gray-600'
                        : item.improved
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {item.change > 0 ? '+' : ''}
                    {item.change.toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-center">
                    {Math.abs(item.change) < 5 ? (
                      <span className="text-gray-400 text-lg">→</span>
                    ) : item.improved ? (
                      <span className="text-green-600 text-lg">↑</span>
                    ) : (
                      <span className="text-red-600 text-lg">↓</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => setSelectedMetric(item.metric)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        selectedMetric === item.metric
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Chart Visualization */}
      {selectedMetric && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {METRIC_NAMES[selectedMetric]} - Trend Over Time
          </h3>
          
          <ResponsiveContainer width="100%" height={400}>
            {chartType === 'line' ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Assessment Date', position: 'insideBottom', offset: -5 }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Value', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ fill: '#2563eb', r: 5 }}
                  activeDot={{ r: 7 }}
                  name={METRIC_NAMES[selectedMetric]}
                />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Assessment Date', position: 'insideBottom', offset: -5 }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Value', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar
                  dataKey="value"
                  fill="#2563eb"
                  name={METRIC_NAMES[selectedMetric]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
          
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Interpretation:</strong> This chart shows how{' '}
              {METRIC_NAMES[selectedMetric]} has changed across your{' '}
              {sortedAssessments.length} assessments. Look for trends and patterns
              to understand your progress over time.
            </p>
          </div>
        </div>
      )}
      
      {/* Assessment Timeline */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Assessment Timeline
        </h3>
        
        <div className="space-y-4">
          {sortedAssessments.map((assessment, index) => (
            <div
              key={assessment.id}
              className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                {index + 1}
              </div>
              
              <div className="flex-1">
                <div className="font-medium text-gray-900">
                  {new Date(assessment.analysisDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
                <div className="text-sm text-gray-600">
                  {new Date(assessment.analysisDate).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              
              <div className="text-sm text-gray-600">
                {assessment.booking?.service?.name || 'N/A'}
              </div>
              
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  assessment.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {assessment.status}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Disclaimer */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <strong>⚠️ Note:</strong> This comparison is for informational purposes only.
          Trends and changes should be interpreted in consultation with a qualified
          healthcare provider. Individual variations and measurement conditions can
          affect results.
        </p>
      </div>
    </div>
  );
}
