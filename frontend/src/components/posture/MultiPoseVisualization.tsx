import { useState, useEffect } from 'react';
import { PostureAnalysis } from '../../types';
import SkeletonVisualization from './SkeletonVisualization';

/**
 * MultiPoseVisualization Component
 * 
 * Displays posture analysis results with multiple pose views (front, side, back)
 * in a side-by-side comparison layout. Supports pose selection and 3D visualization
 * for each captured pose.
 * 
 * Features:
 * - Three-view display (front, side, back) when available
 * - Pose selection tabs with visual indicators
 * - Side-by-side comparison of different poses
 * - Integration with existing SkeletonVisualization component
 * - Responsive layout for different screen sizes
 * 
 * @param analysis - PostureAnalysis with landmarks data
 * @param width - Canvas width for each visualization (default: 400)
 * @param height - Canvas height for each visualization (default: 400)
 * @param className - Additional CSS classes
 */
interface MultiPoseVisualizationProps {
  analysis: PostureAnalysis;
  width?: number;
  height?: number;
  className?: string;
}

type PoseType = 'front' | 'leftside' | 'rightside' | 'back';

/**
 * Extract available poses from analysis data
 */
function getAvailablePoses(analysis: PostureAnalysis): PoseType[] {
  const poses: PoseType[] = [];

  // Check capturedPoses field first
  if (analysis.capturedPoses) {
    const poseList = analysis.capturedPoses.split(',').map(p => p.trim() as PoseType);
    poses.push(...poseList.filter(p => ['front', 'leftside', 'rightside', 'back'].includes(p)));
  }

  // Check landmarksData structure
  if (analysis.landmarksData?.poses) {
    const poseTypes = Object.keys(analysis.landmarksData.poses) as PoseType[];
    poseTypes.forEach(pose => {
      if (['front', 'leftside', 'rightside', 'back'].includes(pose) && !poses.includes(pose)) {
        poses.push(pose);
      }
    });
  }

  // Default to front if no poses found
  if (poses.length === 0) {
    poses.push('front');
  }

  return poses;
}

/**
 * Get pose-specific title
 */
function getPoseTitle(pose: PoseType): string {
  const titles: Record<PoseType, string> = {
    front: 'Front View',
    leftside: 'Left Side View',
    rightside: 'Right Side View',
    back: 'Back View',
  };
  return titles[pose];
}

/**
 * Get pose-specific description
 */
function getPoseDescription(pose: PoseType): string {
  const descriptions: Record<PoseType, string> = {
    front: 'Anterior view showing forward head posture, shoulder alignment, and trunk position',
    leftside: 'Left lateral view showing spinal curves, pelvic tilt, and knee alignment',
    rightside: 'Right lateral view showing spinal curves, pelvic tilt, and knee alignment',
    back: 'Posterior view showing shoulder symmetry, spinal alignment, and hip position',
  };
  return descriptions[pose] || 'Posture visualization';
}

export default function MultiPoseVisualization({
  analysis,
  width = 400,
  height = 400,
  className = '',
}: MultiPoseVisualizationProps) {
  const [selectedPose, setSelectedPose] = useState<PoseType>('front');
  const [availablePoses, setAvailablePoses] = useState<PoseType[]>(['front']);
  const [showAllPoses, setShowAllPoses] = useState(false);

  // Initialize available poses
  useEffect(() => {
    const poses = getAvailablePoses(analysis);
    setAvailablePoses(poses);

    // Set initial selected pose
    if (poses.length > 0 && !poses.includes(selectedPose)) {
      setSelectedPose(poses[0]);
    }
  }, [analysis]);

  // Handle pose selection
  const handlePoseSelect = (pose: PoseType) => {
    setSelectedPose(pose);
    setShowAllPoses(false);
  };

  // Toggle between single view and all poses view
  const toggleViewMode = () => {
    setShowAllPoses(!showAllPoses);
  };

  // Create a modified analysis object for the selected pose
  const getPoseAnalysis = (pose: PoseType): PostureAnalysis => {
    // If we have multi-pose landmarks data, extract the specific pose
    if (analysis.landmarksData?.poses?.[pose]) {
      return {
        ...analysis,
        landmarksData: analysis.landmarksData.poses[pose]
      };
    }

    // Otherwise return the original analysis
    return analysis;
  };

  return (
    <div className={`multi-pose-visualization ${className}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Posture Visualization
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {showAllPoses
              ? 'Comparing all captured poses'
              : `Viewing ${getPoseTitle(selectedPose)}`}
          </p>
        </div>

        {/* View Toggle */}
        <button
          onClick={toggleViewMode}
          className={`mt-2 md:mt-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${showAllPoses
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          {showAllPoses ? 'Show Single View' : 'Show All Poses'}
        </button>
      </div>

      {/* Pose Selection Tabs */}
      {!showAllPoses && availablePoses.length > 1 && (
        <div className="mb-6">
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {availablePoses.map((pose) => (
              <button
                key={pose}
                onClick={() => handlePoseSelect(pose)}
                className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${selectedPose === pose
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {getPoseTitle(pose)}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {getPoseDescription(selectedPose)}
          </p>
        </div>
      )}

      {/* Visualization Content */}
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
        {showAllPoses ? (
          // All poses view
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {availablePoses.map((pose) => (
              <div key={pose} className="flex flex-col">
                <div className="mb-2">
                  <h4 className="text-sm font-medium text-gray-900">
                    {getPoseTitle(pose)}
                  </h4>
                  <p className="text-xs text-gray-600">
                    {getPoseDescription(pose)}
                  </p>
                </div>
                <div className="flex-grow">
                  <SkeletonVisualization
                    analysis={getPoseAnalysis(pose)}
                    width={width}
                    height={height}
                    className="border border-gray-200 rounded"
                  />
                </div>
                <button
                  onClick={() => {
                    setSelectedPose(pose);
                    setShowAllPoses(false);
                  }}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  View Details →
                </button>
              </div>
            ))}
          </div>
        ) : (
          // Single pose view
          <div>
            <SkeletonVisualization
              analysis={getPoseAnalysis(selectedPose)}
              width={width}
              height={height}
            />

            {/* Pose Navigation */}
            {availablePoses.length > 1 && (
              <div className="flex justify-between mt-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    const currentIndex = availablePoses.indexOf(selectedPose);
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : availablePoses.length - 1;
                    setSelectedPose(availablePoses[prevIndex]);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center"
                >
                  ← Previous
                </button>

                <div className="flex items-center space-x-2">
                  {availablePoses.map((pose, index) => (
                    <button
                      key={pose}
                      onClick={() => setSelectedPose(pose)}
                      className={`w-2 h-2 rounded-full ${selectedPose === pose ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      aria-label={`Go to ${getPoseTitle(pose)}`}
                    />
                  ))}
                </div>

                <button
                  onClick={() => {
                    const currentIndex = availablePoses.indexOf(selectedPose);
                    const nextIndex = currentIndex < availablePoses.length - 1 ? currentIndex + 1 : 0;
                    setSelectedPose(availablePoses[nextIndex]);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pose Information */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        {availablePoses.map((pose) => (
          <div
            key={pose}
            className={`p-4 rounded-lg border ${selectedPose === pose && !showAllPoses
                ? 'border-blue-300 bg-blue-50'
                : 'border-gray-200 bg-gray-50'
              }`}
          >
            <h4 className="text-sm font-medium text-gray-900 mb-1">
              {getPoseTitle(pose)}
            </h4>
            <p className="text-xs text-gray-600">
              {getPoseDescription(pose)}
            </p>
            {analysis.landmarksData?.poses?.[pose]?.frameCount && (
              <div className="mt-2 text-xs text-gray-500">
                {analysis.landmarksData.poses[pose].frameCount} frames captured
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">
          How to Interpret the Visualization
        </h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Front View:</strong> Check for shoulder symmetry, head position, and arm alignment</li>
          <li>• <strong>Left Side View:</strong> Assess spinal curves, pelvic tilt, and knee position from the left</li>
          <li>• <strong>Right Side View:</strong> Assess spinal curves, pelvic tilt, and knee position from the right</li>
          <li>• <strong>Back View:</strong> Look for shoulder blade symmetry and spinal alignment</li>
          <li>• Use the rotation controls to view the skeleton from different angles</li>
          <li>• Compare your posture with the ideal posture reference ranges</li>
        </ul>
      </div>
    </div>
  );
}