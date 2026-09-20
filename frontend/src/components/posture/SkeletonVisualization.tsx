import { useEffect, useRef, useState } from 'react';
import { PostureAnalysis } from '../../types';

/**
 * MediaPipe Pose landmark indices
 * 33 landmarks (0-32) + virtual neck (33)
 */
const POSE_CONNECTIONS = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7], // Right eye
  [0, 4], [4, 5], [5, 6], [6, 8], // Left eye
  [9, 10], // Mouth
  
  // Torso
  [11, 12], // Shoulders
  [11, 23], [12, 24], // Shoulders to hips
  [23, 24], // Hips
  
  // Right arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  
  // Left arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  
  // Right leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  
  // Left leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
];

/**
 * Landmark names for reference
 */
const LANDMARK_NAMES: Record<number, string> = {
  0: 'nose',
  1: 'left_eye_inner',
  2: 'left_eye',
  3: 'left_eye_outer',
  4: 'right_eye_inner',
  5: 'right_eye',
  6: 'right_eye_outer',
  7: 'left_ear',
  8: 'right_ear',
  9: 'mouth_left',
  10: 'mouth_right',
  11: 'left_shoulder',
  12: 'right_shoulder',
  13: 'left_elbow',
  14: 'right_elbow',
  15: 'left_wrist',
  16: 'right_wrist',
  17: 'left_pinky',
  18: 'right_pinky',
  19: 'left_index',
  20: 'right_index',
  21: 'left_thumb',
  22: 'right_thumb',
  23: 'left_hip',
  24: 'right_hip',
  25: 'left_knee',
  26: 'right_knee',
  27: 'left_ankle',
  28: 'right_ankle',
  29: 'left_heel',
  30: 'right_heel',
  31: 'left_foot_index',
  32: 'right_foot_index',
  33: 'virtual_neck',
};

type ViewAngle = 'front' | 'side' | 'back' | 'top';

interface SkeletonVisualizationProps {
  analysis: PostureAnalysis;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Extract landmarks from analysis data
 * Handles both new multi-pose structure and old single-pose structure
 * Parses JSON string if needed (backend stores as JSON string)
 */
function extractLandmarks(analysis: PostureAnalysis): Map<number, [number, number, number, number]> {
  const landmarks = new Map<number, [number, number, number, number]>();

  // Step 1: Parse JSON string to object if needed
  let landmarksData;
  try {
    landmarksData = typeof analysis.landmarksData === 'string' 
      ? JSON.parse(analysis.landmarksData) 
      : analysis.landmarksData;
  } catch (e) {
    console.error('Failed to parse landmarksData:', e);
    return landmarks;
  }

  if (!landmarksData) {
    return landmarks;
  }

  // Step 2: Handle new multi-pose structure
  if (landmarksData.poses) {
    // Pick which pose to visualize (default to front)
    const poseType = 'front'; // You can make this configurable later
    const poseData = landmarksData.poses[poseType];
    
    if (poseData?.samples && poseData.samples.length > 0) {
      // Use the first sample (or you could average multiple samples)
      const firstSample = poseData.samples[0];
      
      if (firstSample?.pose) {
        for (const [key, value] of Object.entries(firstSample.pose)) {
          const index = parseInt(key);
          if (Array.isArray(value) && value.length >= 3) {
            const [x, y, z, visibility = 1.0] = value as number[];
            landmarks.set(index, [x, y, z, visibility]);
          }
        }
      }
    }
  }
  // Step 3: Handle old structure (backward compatibility)
  else if (landmarksData.pose) {
    for (const [key, value] of Object.entries(landmarksData.pose)) {
      const index = parseInt(key);
      if (Array.isArray(value) && value.length >= 3) {
        const [x, y, z, visibility = 1.0] = value as number[];
        landmarks.set(index, [x, y, z, visibility]);
      }
    }
  }
  
  return landmarks;
}

/**
 * Project 3D landmarks to 2D based on view angle
 */
function projectLandmark(
  landmark: [number, number, number, number],
  viewAngle: ViewAngle,
  rotation: number
): [number, number] {
  const [x, y, z] = landmark;
  const rad = (rotation * Math.PI) / 180;
  
  switch (viewAngle) {
    case 'front':
      // Front view: x-y plane, apply rotation around y-axis
      return [
        x * Math.cos(rad) - z * Math.sin(rad),
        y
      ];
    
    case 'side':
      // Side view: z-y plane (90° rotation)
      return [
        z * Math.cos(rad) - x * Math.sin(rad),
        y
      ];
    
    case 'back':
      // Back view: inverted x-y plane (180° rotation)
      return [
        -(x * Math.cos(rad) - z * Math.sin(rad)),
        y
      ];
    
    case 'top':
      // Top view: x-z plane
      return [
        x * Math.cos(rad) - z * Math.sin(rad),
        z * Math.sin(rad) + x * Math.cos(rad)
      ];
    
    default:
      return [x, y];
  }
}

/**
 * Normalize landmarks to fit canvas
 */
function normalizeLandmarks(
  landmarks: Map<number, [number, number, number, number]>,
  width: number,
  height: number,
  viewAngle: ViewAngle,
  rotation: number
): Map<number, [number, number]> {
  const normalized = new Map<number, [number, number]>();
  
  if (landmarks.size === 0) return normalized;
  
  // Project all landmarks to 2D
  const projected = new Map<number, [number, number]>();
  for (const [index, landmark] of landmarks.entries()) {
    projected.set(index, projectLandmark(landmark, viewAngle, rotation));
  }
  
  // Find bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const [x, y] of projected.values()) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  
  // Add padding
  const padding = 50;
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  
  // Scale to fit canvas with padding
  const scaleX = (width - 2 * padding) / rangeX;
  const scaleY = (height - 2 * padding) / rangeY;
  const scale = Math.min(scaleX, scaleY);
  
  // Normalize and center
  for (const [index, [x, y]] of projected.entries()) {
    const normalizedX = ((x - minX) * scale) + padding;
    const normalizedY = ((y - minY) * scale) + padding;
    normalized.set(index, [normalizedX, normalizedY]);
  }
  
  return normalized;
}

/**
 * SkeletonVisualization Component
 * 
 * Renders a 3D skeleton visualization from pose landmarks.
 * Supports multiple view angles (front, side, back, top) and rotation controls.
 * 
 * Features:
 * - 3D skeleton rendering from 33 pose landmarks
 * - Multiple view angles with smooth transitions
 * - Interactive rotation controls
 * - Color-coded skeleton (joints and connections)
 * - Responsive canvas sizing
 * 
 * @param analysis - PostureAnalysis with landmarks data
 * @param width - Canvas width (default: 600)
 * @param height - Canvas height (default: 600)
 * @param className - Additional CSS classes
 */
export default function SkeletonVisualization({
  analysis,
  width = 600,
  height = 600,
  className = '',
}: SkeletonVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewAngle, setViewAngle] = useState<ViewAngle>('front');
  const [rotation, setRotation] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Extract and normalize landmarks
    const landmarks = extractLandmarks(analysis);
    if (landmarks.size === 0) {
      // Draw "No landmarks data" message
      ctx.fillStyle = '#6B7280';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No landmark data available', width / 2, height / 2);
      return;
    }
    
    const normalized = normalizeLandmarks(landmarks, width, height, viewAngle, rotation);
    
    // Draw connections
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    for (const [start, end] of POSE_CONNECTIONS) {
      const startPoint = normalized.get(start);
      const endPoint = normalized.get(end);
      
      if (startPoint && endPoint) {
        // Check visibility
        const startLandmark = landmarks.get(start);
        const endLandmark = landmarks.get(end);
        
        if (startLandmark && endLandmark) {
          const startVisibility = startLandmark[3];
          const endVisibility = endLandmark[3];
          
          // Only draw if both landmarks are visible
          if (startVisibility > 0.5 && endVisibility > 0.5) {
            ctx.globalAlpha = Math.min(startVisibility, endVisibility);
            ctx.beginPath();
            ctx.moveTo(startPoint[0], startPoint[1]);
            ctx.lineTo(endPoint[0], endPoint[1]);
            ctx.stroke();
          }
        }
      }
    }
    
    // Draw landmarks (joints)
    ctx.globalAlpha = 1.0;
    
    for (const [index, [x, y]] of normalized.entries()) {
      const landmark = landmarks.get(index);
      if (!landmark) continue;
      
      const visibility = landmark[3];
      
      // Only draw visible landmarks
      if (visibility > 0.5) {
        ctx.globalAlpha = visibility;
        
        // Different colors for different body parts
        if (index <= 10) {
          // Face
          ctx.fillStyle = '#EF4444';
        } else if (index >= 11 && index <= 22) {
          // Upper body
          ctx.fillStyle = '#10B981';
        } else {
          // Lower body
          ctx.fillStyle = '#8B5CF6';
        }
        
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);    
        ctx.fill();

        // Add white outline ring around each dot
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw landmark label on hover (optional)
        // ctx.fillStyle = '#1F2937';
        // ctx.font = '10px sans-serif';
        // ctx.fillText(LANDMARK_NAMES[index] || `${index}`, x + 8, y - 8);
      }
    }
    
    ctx.globalAlpha = 1.0;
  }, [analysis, viewAngle, rotation, width, height]);
  
  // Auto-rotation effect
  useEffect(() => {
    if (!isRotating) return;
    
    const interval = setInterval(() => {
      setRotation(prev => (prev + 2) % 360);
    }, 50);
    
    return () => clearInterval(interval);
  }, [isRotating]);
  
  const handleViewChange = (view: ViewAngle) => {
    setViewAngle(view);
    setRotation(0); // Reset rotation when changing view
  };
  
  return (
    <div className={`skeleton-visualization ${className}`}>
      {/* View Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex space-x-2">
          <button
            onClick={() => handleViewChange('front')}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${viewAngle === 'front'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            Front
          </button>
          <button
            onClick={() => handleViewChange('side')}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${viewAngle === 'side'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            Side
          </button>
          <button
            onClick={() => handleViewChange('back')}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${viewAngle === 'back'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            Back
          </button>
          <button
            onClick={() => handleViewChange('top')}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${viewAngle === 'top'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            Top
          </button>
        </div>
        
        <button
          onClick={() => setIsRotating(!isRotating)}
          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${isRotating
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          {isRotating ? '⏸ Pause' : '▶ Auto-Rotate'}
        </button>
      </div>
      
      {/* Canvas */}
      <div className="bg-gray-900 rounded-lg shadow-sm p-4 border border-gray-700">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="mx-auto"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
      
      {/* Rotation Slider */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Manual Rotation: {rotation}°
        </label>
        <input
          type="range"
          min="0"
          max="360"
          value={rotation}
          onChange={(e) => {
            setIsRotating(false);
            setRotation(parseInt(e.target.value));
          }}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
      </div>
      
      {/* Legend */}
      <div className="mt-4 bg-gray-50 rounded-lg p-3">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Color Legend</h4>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span className="text-gray-700">Face</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <span className="text-gray-700">Upper Body</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-purple-500"></div>
            <span className="text-gray-700">Lower Body</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-1 bg-blue-500"></div>
            <span className="text-gray-700">Connections</span>
          </div>
        </div>
      </div>
    </div>
  );
}
