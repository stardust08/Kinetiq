import { lazy, Suspense, useState } from 'react';
import { PostureAnalysis } from '../../types';
import MetricsDisplay from './MetricsDisplay';
import type { BestFrameData, PoseView } from '../../lib/postureStore';

const PostureViewer3D = lazy(() => import('./PostureViewer3D'));

const POSE_VIEWS: { view: PoseView; label: string }[] = [
  { view: 'front',     label: 'Front' },
  { view: 'leftside',  label: 'Left Side' },
  { view: 'rightside', label: 'Right Side' },
  { view: 'back',      label: 'Back' },
];

const PLACEHOLDER = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160"><rect width="120" height="160" fill="%23374151"/><text x="60" y="84" text-anchor="middle" fill="%236b7280" font-size="11" font-family="sans-serif">No Image</text></svg>';

export interface AssessmentDetailViewProps {
  analysis: PostureAnalysis;
  onCompare?: () => void;
  onBack?: () => void;
}

/**
 * AssessmentDetailView Component
 * 
 * Displays the complete details of a single posture assessment.
 * 
 * Features:
 * - Full metrics display with all 33 clinical measurements
 * - 3D skeleton visualization with multiple view angles
 * - Booking context information
 * - Comparison option to compare with other assessments
 * - Navigation controls (back button)
 * - Responsive layout with tabs for metrics and visualization
 * 
 * @param analysis - Complete posture analysis data
 * @param onCompare - Optional callback to initiate comparison with other assessments
 * @param onBack - Optional callback for back navigation
 */
export default function AssessmentDetailView({
  analysis,
  onCompare,
  onBack,
}: AssessmentDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'metrics' | 'visualization'>('metrics');
  const [viewer3DPose, setViewer3DPose] = useState<{ frameData: BestFrameData; label: string } | null>(null);

  /** Reconstruct BestFrameData from stored per-pose data for PostureViewer3D */
  function buildFrameData(view: PoseView): BestFrameData | null {
    const p = analysis.poses?.[view];
    if (!p?.imageData) return null;
    return {
      imageDataUrl: p.imageData,
      landmarks2D:  p.landmarks2D  ?? [],
      landmarks3D:  p.landmarks3D  ?? [],
      visibility:   p.visibility   ?? 0,
      frameIndex:   p.frameIndex   ?? 0,
      view,
    };
  }
  
  const analysisDate = new Date(analysis.analysisDate);

  return (
    <>
    <div className="assessment-detail-view space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            {/* Back Button */}
            {onBack && (
              <button
                onClick={onBack}
                className="mb-4 flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
                aria-label="Go back"
              >
                <span className="mr-2">←</span>
                Back to History
              </button>
            )}
            
            {/* Title */}
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Assessment Details
            </h1>
            
            {/* Date and Status */}
            <div className="flex items-center space-x-3">
              <span className="text-lg text-gray-600">
                {analysisDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                {' at '}
                {analysisDate.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  analysis.status === 'completed'
                    ? 'bg-green-100 text-green-800'
                    : analysis.status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {analysis.status}
              </span>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex space-x-2">
            {onCompare && (
              <button
                onClick={onCompare}
                className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"
                aria-label="Compare with other assessments"
              >
                📊 Compare
              </button>
            )}
          </div>
        </div>
        
        {/* Booking Context */}
        {analysis.booking && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Booking Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Service</div>
                <div className="text-sm font-semibold text-gray-900">
                  {analysis.booking.service?.name || 'N/A'}
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Booking Date</div>
                <div className="text-sm font-semibold text-gray-900">
                  {/* `time` is null for draft bookings. new Date(null) silently yields
                      1 Jan 1970, so an unguarded call renders a wrong date as fact. */}
                  {analysis.booking.time ? new Date(analysis.booking.time).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }) : 'Not scheduled yet'}
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Screening Counts</div>
                <div className="text-sm font-semibold text-gray-900">
                  {analysis.booking.usedScreeningCount} / {analysis.booking.totalScreeningCount} used
                  <span className="text-xs text-gray-600 ml-2">
                    ({analysis.booking.remainingScreeningCount} remaining)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('metrics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'metrics'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              aria-current={activeTab === 'metrics' ? 'page' : undefined}
            >
              📊 Clinical Metrics
            </button>
            <button
              onClick={() => setActiveTab('visualization')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'visualization'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              aria-current={activeTab === 'visualization' ? 'page' : undefined}
            >
              🦴 3D Skeleton
            </button>
          </nav>
        </div>
        
        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'metrics' && (
            <MetricsDisplay
              analysis={analysis}
              remainingScreeningCount={analysis.booking?.remainingScreeningCount}
            />
          )}
          
          {activeTab === 'visualization' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Click <strong>View in 3D</strong> on any pose. Inside the viewer use <em>Photo On/Off</em> to toggle between photo and skeleton.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {POSE_VIEWS.map(({ view, label }) => {
                  const frameData = buildFrameData(view);
                  const src = frameData?.imageDataUrl ?? null;
                  return (
                    <div key={view} className="flex flex-col rounded-xl border border-gray-200 overflow-hidden">
                      <div className="aspect-[3/4] bg-gray-800 overflow-hidden">
                        <img src={src ?? PLACEHOLDER} alt={`${label} posture`} className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER; }} />
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between bg-white border-t border-gray-100">
                        <span className="text-xs font-semibold text-gray-700">{label}</span>
                        <button disabled={!frameData} onClick={() => frameData && setViewer3DPose({ frameData, label })}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all">
                          🔭 3D
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Additional Information */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          About This Assessment
        </h3>
        
        <div className="space-y-3 text-sm text-gray-700">
          <div className="flex items-start">
            <span className="mr-2">📋</span>
            <div>
              <strong>Assessment ID:</strong> {analysis.id}
            </div>
          </div>
          
          <div className="flex items-start">
            <span className="mr-2">🔬</span>
            <div>
              <strong>Metrics Captured:</strong> 33 clinical posture measurements including 
              global posture, shoulder & arm alignment, pelvis & hip positioning, lower extremity 
              angles, and body proportions.
            </div>
          </div>
          
          <div className="flex items-start">
            <span className="mr-2">📸</span>
            <div>
              <strong>Data Collection:</strong> This assessment was captured using MediaPipe 
              Holistic pose detection across three poses (Front, Side, Back) with 180 total samples.
            </div>
          </div>
          
          {analysis.landmarksData && (
            <div className="flex items-start">
              <span className="mr-2">🎯</span>
              <div>
                <strong>Landmarks:</strong> 33 pose landmarks + virtual neck landmark captured 
                and stored for 3D visualization.
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>⚠️ Medical Disclaimer:</strong> These metrics are for informational purposes 
            only and should not be used as a substitute for professional medical advice, diagnosis, 
            or treatment. Always consult with a qualified healthcare provider for proper evaluation 
            and treatment of any posture-related concerns.
          </p>
        </div>
      </div>
    </div>

    {/* 3D viewer modal — lazy-loaded, only mounts when a pose card is clicked */}
    {viewer3DPose && (
      <Suspense fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="text-white text-sm animate-pulse">Loading 3D viewer…</div>
        </div>
      }>
        <PostureViewer3D
          frameData={viewer3DPose.frameData}
          poseName={viewer3DPose.label}
          onClose={() => setViewer3DPose(null)}
        />
      </Suspense>
    )}
    </>
  );
}
