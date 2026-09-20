import { useQueryClient } from '@tanstack/react-query';
import { getAnalysisById } from '../../api/posture';
import { PostureAnalysis } from '../../types';

export interface AssessmentCardProps {
  assessment: PostureAnalysis;
  bookingName: string;
  onViewDetails: () => void;
}

export default function AssessmentCard({
  assessment,
  bookingName,
  onViewDetails,
}: AssessmentCardProps) {
  const queryClient = useQueryClient();
  const analysisDate = new Date(assessment.analysisDate);

  const handlePrefetch = () => {
    queryClient.prefetchQuery({
      queryKey: ['posture-analysis', assessment.id],
      queryFn: () => getAnalysisById(assessment.id),
      staleTime: 5 * 60 * 1000,
    });
  };

  const keyMetrics = [
    { label: 'Forward Head', value: assessment.fhdPixels, unit: 'px' },
    { label: 'Cervical Angle', value: assessment.cervicalAngle, unit: '°' },
    { label: 'Shoulder Height Diff', value: assessment.shoulderHeightDiff, unit: 'px' },
    { label: 'Pelvic Tilt', value: assessment.pelvicTiltAngle, unit: '°' },
  ];

  const statusColors = {
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">
              {analysisDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                statusColors[assessment.status as keyof typeof statusColors] ||
                statusColors.completed
              }`}
            >
              {assessment.status}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <span>📅</span>
            <span>
              {analysisDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="text-gray-400">•</span>
            <span>📋 {bookingName}</span>
          </div>
        </div>

        <button
          onClick={onViewDetails}
          onMouseEnter={handlePrefetch}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          aria-label={`View details for assessment from ${analysisDate.toLocaleDateString()}`}
        >
          View Details
        </button>
      </div>

      {/* Key Metrics Preview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
        {keyMetrics.map((metric) => (
          <div key={metric.label} className="text-center">
            <div className="text-xs text-gray-600 mb-1">{metric.label}</div>
            <div className="text-lg font-semibold text-gray-900">
              {metric.value.toFixed(1)}
              <span className="text-sm text-gray-600 ml-1">{metric.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
