import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSupervisedScreening } from '../hooks/useSupervisedScreening';
import SupervisionBanner from '../components/video/SupervisionBanner';
import BookingSelectionStep from '../components/booking/BookingSelectionStep';
import InstructionsPanel from '../components/posture/InstructionsPanel';
import WebcamCapture, { FrameData, BestFrameData, PoseView } from '../components/posture/WebcamCapture';
import AnalysisProgress from '../components/posture/AnalysisProgress';
import PoseCard from '../components/posture/PoseCard';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { BackButton } from '../components/layout/BackButton';
import { usePostureAnalysis } from '../hooks/usePostureAnalysis';
import MetricsDisplay from '../components/posture/MetricsDisplay';
import { DownloadReportButton } from '../components/DownloadReportButton';
import { getBestFrame } from '../lib/postureStore';
import { useQuery } from '@tanstack/react-query';
import * as postureApi from '../api/posture';
import { previousValuesFor } from '../lib/previousAssessment';

/**
 * Analysis step types for the multi-step flow
 */
export type AnalysisStep =
  | 'select_booking'
  | 'instructions'
  | 'capturing'
  | 'processing'
  | 'results';

/**
 * PostureAnalysisPage Component
 *
 * Main page component that orchestrates the entire posture analysis workflow.
 * Implements a multi-step flow:
 * 1. select_booking - User selects a booking with remaining screening counts
 * 2. instructions - Display positioning instructions before starting
 * 3. capturing - Multi-phase webcam capture: Front (2s), Side (2s), Back (2s) with breaks (180 frames total)
 * 4. processing - Calculate clinical metrics from captured frames
 * 5. results - Display all 33 clinical metrics and 3D visualization
 *
 * Features:
 * - URL parameter handling (bookingId)
 * - Step transition management
 * - Error handling for all scenarios
 * - Booking validation before starting
 * - Count deduction on successful completion
 *
 * @example
 * // Direct navigation with bookingId
 * <Link to="/posture-analysis?bookingId=abc123">Start Analysis</Link>
 *
 * // Navigation without bookingId (shows booking selection)
 * <Link to="/posture-analysis">Start Analysis</Link>
 */

/**
 * Build one backend sample from a captured frame.
 *
 * Adds `pose_world` (MediaPipe's poseWorldLandmarks, metric metres, hip-centred) in the
 * index-keyed dict shape the calibrator expects. The backend prefers these for angles
 * because, unlike the 2D projection, they are not corrupted when the subject stands
 * off-axis to the camera.
 */
export function toBackendSample(frame: { landmarks: any; worldLandmarks?: Array<{ x: number; y: number; z: number; visibility?: number }> }) {
  const sample: Record<string, any> = { ...frame.landmarks };
  if (frame.worldLandmarks?.length) {
    const world: Record<number, number[]> = {};
    frame.worldLandmarks.forEach((lm, i) => {
      world[i] = [lm.x, lm.y, lm.z, lm.visibility ?? 1];
    });
    sample.pose_world = world;
  }
  return sample;
}

export default function PostureAnalysisPage() {
  // Picks up the one-shot authorisation if a clinician unlocked this capture in a
  // video consultation. A patient who arrives without one is refused by the server -
  // see backend app/core/screening_gate.py.
  // Called for its effect: it moves the one-shot authorisation a clinician issued
  // in the video consultation into the store the API layer reads, and clears it when
  // this page unmounts. SupervisionBanner below renders the state of it.
  useSupervisedScreening();

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Get bookingId from URL if present
  const bookingIdFromUrl = searchParams.get('bookingId');

  /*
    Previous screening, for the "Since last" column.

    The column and the minimal-detectable-change logic behind it already existed, but
    nothing ever supplied the prior values, so every row rendered a dash. This fetches
    the patient's assessment history and hands MetricsDisplay the most recent screening
    before this one.

    Deliberately not gated on the booking: a patient's posture last month is the right
    comparison whether or not it was booked under the same reference.
  */
  const { data: assessmentHistory } = useQuery({
    queryKey: ['posture', 'my-assessments'],
    queryFn: () => postureApi.getMyAssessments({ limit: 25 }),
    staleTime: 5 * 60 * 1000,
  });

  // State management
  const [currentStep, setCurrentStep] = useState<AnalysisStep>(
    bookingIdFromUrl ? 'instructions' : 'select_booking'
  );
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    bookingIdFromUrl
  );
  const [error, setError] = useState<string | null>(null);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [processingStartTime, setProcessingStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  // Best captured frames per pose (received from WebcamCapture via onBestFramesUpdate)
  const [bestFrames, setBestFrames] = useState<Record<PoseView, BestFrameData | null>>({
    front: null, leftside: null, rightside: null, back: null,
  });

  // Use posture analysis hook
  const {
    startAnalysis,
    finalizeAnalysis,
    cancelAnalysis,
    state: analysisState,
    isProcessing,
  } = usePostureAnalysis();

  // Update step when bookingId changes in URL
  useEffect(() => {
    if (bookingIdFromUrl && !selectedBookingId) {
      setSelectedBookingId(bookingIdFromUrl);
      setCurrentStep('instructions');
    }
  }, [bookingIdFromUrl, selectedBookingId]);

  // Timer for processing step
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (currentStep === 'processing' && processingStartTime > 0) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - processingStartTime) / 1000));
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [currentStep, processingStartTime]);

  /**
   * Handle booking selection from BookingSelectionStep
   */
  const handleBookingSelected = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setCurrentStep('instructions');
    setError(null);
  };

  /**
   * Handle start capture button click
   */
  const handleStartCapture = () => {
    if (!selectedBookingId) {
      setError('No booking selected');
      return;
    }
    setCurrentStep('capturing');
    setError(null);
  };

  /**
   * Handle capture completion - send ONLY aggregated data to backend
   */
  const handleCaptureComplete = async (frames: FrameData[]) => {
    console.log(`Capture complete! Processed ${frames.length} frames locally`);

    if (!selectedBookingId) {
      setError('No booking selected');
      return;
    }

    // Validate minimum frames
    if (frames.length < 150) {
      setError(`Insufficient frames captured. Got ${frames.length}, need at least 150. Please try again.`);
      return;
    }

    try {
      setCapturedFrames(frames.map(f => f.landmarks)); // Store for display
      setCurrentStep('processing');
      setError(null);
      setProcessingStartTime(Date.now());

      console.log('Sending aggregated data to backend (ONE API CALL)...');

      // Start analysis session to get sessionId
      const sessionResponse = await startAnalysis(selectedBookingId);

      if (!sessionResponse) {
        setError('Failed to start analysis session');
        return;
      }

      const { sessionId, bookingId } = sessionResponse;
      console.log('Session created:', sessionId);

      // Filter frames by pose type ONCE (optimization)
      const frontFrames = frames.filter(f => f.poseType === 'front');
      const leftsideFrames = frames.filter(f => f.poseType === 'leftside');
      const rightsideFrames = frames.filter(f => f.poseType === 'rightside');
      const backFrames = frames.filter(f => f.poseType === 'back');

      // Validate each pose has minimum frames
      if (frontFrames.length < 40) {
        setError(`Insufficient front pose frames. Got ${frontFrames.length}, need at least 40.`);
        return;
      }
      if (leftsideFrames.length < 40) {
        setError(`Insufficient left side pose frames. Got ${leftsideFrames.length}, need at least 40.`);
        return;
      }
      if (rightsideFrames.length < 40) {
        setError(`Insufficient right side pose frames. Got ${rightsideFrames.length}, need at least 40.`);
        return;
      }
      if (backFrames.length < 40) {
        setError(`Insufficient back pose frames. Got ${backFrames.length}, need at least 40.`);
        return;
      }

      // Helper function to calculate average visibility safely
      const calculateAvgVisibility = (frames: FrameData[]) => {
        if (frames.length === 0) return 0;
        return frames.reduce((sum, f) => sum + f.visibility, 0) / frames.length;
      };

      // Read best-frame snapshots from in-memory store (synchronous, no batching issues)
      const poseImages: Record<string, string | null> = {
        front:     getBestFrame('front')?.imageDataUrl     ?? null,
        leftside:  getBestFrame('leftside')?.imageDataUrl  ?? null,
        rightside: getBestFrame('rightside')?.imageDataUrl ?? null,
        back:      getBestFrame('back')?.imageDataUrl      ?? null,
      };

      // Best-frame skeleton data per pose (landmarks2D/3D for PostureViewer3D)
      const poseBestFrameData: Record<string, { landmarks2D: any[] | null; landmarks3D: any[] | null; visibility: number; frameIndex: number } | null> = {};
      (['front', 'leftside', 'rightside', 'back'] as const).forEach(view => {
        const f = getBestFrame(view);
        poseBestFrameData[view] = f
          ? { landmarks2D: f.landmarks2D, landmarks3D: f.landmarks3D, visibility: f.visibility, frameIndex: f.frameIndex }
          : null;
      });

      // Aggregate all landmarks by pose type
      const aggregatedData = {
        poses: {
          front: {
            samples: frontFrames.map(toBackendSample),
            frameCount: frontFrames.length,
            avgVisibility: calculateAvgVisibility(frontFrames)
          },
          leftside: {
            samples: leftsideFrames.map(toBackendSample),
            frameCount: leftsideFrames.length,
            avgVisibility: calculateAvgVisibility(leftsideFrames)
          },
          rightside: {
            samples: rightsideFrames.map(toBackendSample),
            frameCount: rightsideFrames.length,
            avgVisibility: calculateAvgVisibility(rightsideFrames)
          },
          back: {
            samples: backFrames.map(toBackendSample),
            frameCount: backFrames.length,
            avgVisibility: calculateAvgVisibility(backFrames)
          }
        },
        totalFrames: frames.length,
        capturedPoses: 'front,leftside,rightside,back',
        // Landmarks are MediaPipe's normalised 0-1 coordinates, which are anisotropic
        // (x divided by width, y by height). The backend needs both the declaration and
        // the true frame size to restore isotropy before computing any angle - without
        // them it assumes 4:3 and flags the assumption on the stored result.
        coordinateSpace: 'normalized',
        imageWidth: frames[0]?.captureWidth,
        imageHeight: frames[0]?.captureHeight,
        poseImages,
        poseBestFrameData,
      };

      console.log('Aggregated data:', {
        totalFrames: aggregatedData.totalFrames,
        frontFrames: aggregatedData.poses.front.frameCount,
        leftsideFrames: aggregatedData.poses.leftside.frameCount,
        rightsideFrames: aggregatedData.poses.rightside.frameCount,
        backFrames: aggregatedData.poses.back.frameCount,
        frontAvgVisibility: aggregatedData.poses.front.avgVisibility.toFixed(2),
        leftsideAvgVisibility: aggregatedData.poses.leftside.avgVisibility.toFixed(2),
        rightsideAvgVisibility: aggregatedData.poses.rightside.avgVisibility.toFixed(2),
        backAvgVisibility: aggregatedData.poses.back.avgVisibility.toFixed(2)
      });

      // ONE API CALL with all data
      const result = await finalizeAnalysis(sessionId, bookingId, aggregatedData);
      console.log('Analysis completed:', result);

      if (result) {
        setCurrentStep('results');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process analysis';
      setError(errorMessage);
      setCurrentStep('capturing');
    }
  };

  /**
   * Handle analysis completion
   */
  const handleAnalysisComplete = () => {
    setCurrentStep('results');
  };

  /**
   * Handle cancel at any step
   */
  const handleCancel = () => {
    setSelectedBookingId(null);
    setCurrentStep('select_booking');
    setError(null);
    navigate('/posture-analysis', { replace: true });
  };

  /**
   * Handle error from any step
   */
  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  /**
   * Handle retry after error
   */
  const handleRetry = () => {
    setError(null);
    setCurrentStep('instructions');
  };

  /**
   * Handle navigation back to bookings
   */
  const handleBackToBookings = () => {
    navigate('/bookings');
  };

  // Step labels for better UX
  const stepLabels: Record<AnalysisStep, string> = {
    select_booking: 'Select Booking',
    instructions: 'Instructions',
    capturing: 'Capturing',
    processing: 'Processing',
    results: 'Results'
  };

  const steps: AnalysisStep[] = ['select_booking', 'instructions', 'capturing', 'processing', 'results'];
  const currentStepIndex = steps.indexOf(currentStep);

  return (
    <div className="min-h-screen bg-[#030712] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(47,134,199,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(47,134,199,0.04) 1px, transparent 1px)", backgroundSize: "60px 60px", maskImage: "radial-gradient(ellipse 100% 60% at 50% 0%, black 20%, transparent 100%)" }} />

      {/* Header with Breadcrumb */}
      <div style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Breadcrumb
            items={[
              { label: 'Bookings', href: '/bookings' },
              { label: 'Posture Analysis' }
            ]}
            className="mb-4"
          />
          <SupervisionBanner />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">
                Posture Analysis
              </h1>
              <p className="text-sm text-slate-400">
                Complete clinical posture assessment with AI-powered analysis
              </p>
            </div>
            <BackButton to="/bookings" label="Back to Bookings" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Step Indicator - Enhanced with better visual hierarchy */}
        <div className="mb-10">
          {/* Desktop Step Indicator */}
          <div className="hidden md:block">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              {steps.map((step, index) => (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    {/* Step Circle */}
                    <div
                      className={`
                        relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold
                        transition-all duration-300 ease-in-out
                        ${currentStep === step
                          ? 'bg-[#2F86C7] text-white shadow-lg scale-110 ring-4 ring-[#2F86C7]/20'
                          : index < currentStepIndex
                            ? 'bg-emerald-500 text-white shadow-md'
                            : 'bg-white/8 text-slate-500'
                        }
                      `}
                    >
                      {index < currentStepIndex ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>

                    {/* Step Label */}
                    <div className="mt-3 text-center">
                      <span
                        className={`
                          text-sm font-medium transition-colors duration-200
                          ${currentStep === step
                            ? 'text-[#2F86C7]'
                            : index < currentStepIndex
                              ? 'text-emerald-400'
                              : 'text-slate-500'
                          }
                        `}
                      >
                        {stepLabels[step]}
                      </span>
                    </div>
                  </div>

                  {/* Connector Line */}
                  {index < steps.length - 1 && (
                    <div className="flex-1 px-4 pb-8">
                      <div
                        className={`
                          h-1 rounded-full transition-all duration-300
                          ${index < currentStepIndex
                            ? 'bg-emerald-500'
                            : 'bg-white/8'
                          }
                        `}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Mobile Step Indicator */}
          <div className="md:hidden">
            <div className="rounded-lg p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">
                  Step {currentStepIndex + 1} of {steps.length}
                </span>
                <span className="text-xs text-slate-500">
                  {Math.round(((currentStepIndex + 1) / steps.length) * 100)}% Complete
                </span>
              </div>
              <div className="w-full bg-white/8 rounded-full h-2 mb-3">
                <div
                  className="bg-[#2F86C7] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
                />
              </div>
              <p className="text-sm font-medium text-[#2F86C7]">
                {stepLabels[currentStep]}
              </p>
            </div>
          </div>
        </div>

        {/* Error Display - Enhanced with better styling */}
        {error && (
          <div className="mb-8 animate-fadeIn">
            <div className="p-5" style={{ background: "rgba(239,68,68,0.06)", borderLeft: "4px solid #ef4444", borderRadius: "0.75rem" }}>
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-red-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="text-base font-semibold text-red-300 mb-1">
                    Something went wrong
                  </h3>
                  <p className="text-sm text-red-300/80 leading-relaxed">{error}</p>
                  <div className="mt-4 flex space-x-3">
                    <button
                      onClick={handleRetry}
                      className="inline-flex items-center px-4 py-2 bg-red-500/20 text-red-300 text-sm font-medium rounded-md hover:bg-red-500/30 transition-colors border border-red-500/30"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Try Again
                    </button>
                    <button
                      onClick={handleCancel}
                      className="inline-flex items-center px-4 py-2 text-slate-400 text-sm font-medium rounded-md border border-white/10 hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step Content - Enhanced with better card styling and spacing */}
        <div className="rounded-2xl overflow-hidden transition-all duration-300" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
          {currentStep === 'select_booking' && (
            <div className="p-6 sm:p-8">
              <BookingSelectionStep
                onBookingSelected={handleBookingSelected}
                preSelectedBookingId={selectedBookingId || undefined}
              />
            </div>
          )}

          {currentStep === 'instructions' && (
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Positioning Instructions
                </h2>
                <p className="text-slate-400">
                  Follow these guidelines to ensure accurate posture analysis
                </p>
              </div>

              {/* InstructionsPanel component */}
              <div className="mb-8">
                <InstructionsPanel />
              </div>

              {/* Action buttons - Enhanced with better styling */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <button
                  onClick={handleStartCapture}
                  className="flex-1 inline-flex items-center justify-center text-white px-8 py-4 rounded-xl font-semibold transition-all duration-300 hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg, #2F86C7, #1E6FA8)", boxShadow: "0 4px 20px rgba(47,134,199,0.3)" }}
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Start Analysis
                </button>
                <button
                  onClick={handleCancel}
                  className="sm:w-auto px-8 py-4 rounded-xl font-semibold text-slate-300 hover:text-white transition-all duration-300"
                  style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {currentStep === 'capturing' && selectedBookingId && (
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Capturing Posture Data
                </h2>
                <p className="text-slate-400">
                  Hold still while we capture your posture
                </p>
              </div>
              {/* Import and use WebcamCapture component */}
              <WebcamCapture
                bookingId={selectedBookingId}
                onCaptureComplete={handleCaptureComplete}
                onError={handleError}
                onCancel={handleCancel}
                onBestFramesUpdate={(frames) => setBestFrames(frames)}
              />
            </div>
          )}

          {currentStep === 'processing' && (
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Processing Analysis
                </h2>
                <p className="text-slate-400">
                  Calculating your clinical metrics
                </p>
              </div>
              <AnalysisProgress
                frameCount={analysisState.frameCount}
                totalFrames={capturedFrames.length}
                elapsedTime={elapsedTime}
                totalDuration={6}
                statusMessage="Processing frames..."
                isCapturing={false}
              />
            </div>
          )}

          {currentStep === 'results' && (
            <div className="p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Analysis Results
                </h2>
                <p className="text-slate-400">
                  Your comprehensive posture assessment
                </p>
              </div>

              {/* Pose result cards with best captured frames */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Captured Posture Frames
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {(['front', 'leftside', 'rightside', 'back'] as PoseView[]).map(view => (
                    <PoseCard key={view} view={view} frameData={bestFrames[view]} />
                  ))}
                </div>
              </div>

              {/* Clinical metrics + download report */}
              {analysisState.analysisResult && (
                <>
                  <div className="mb-4 flex justify-end">
                    <DownloadReportButton
                      analysis={analysisState.analysisResult}
                      bestFrames={bestFrames}
                    />
                  </div>
                  {/*
                    Renders the v2 payload (metricsJson) when the analysis carries one,
                    and falls back to the legacy columns with a warning banner for
                    assessments recorded before the measurement rewrite.

                    This page used to render ClinicalMetricsDisplay, which reads only the
                    flat legacy columns. Those are filled conservatively on purpose - a
                    legacy column gets a value only where the v2 metric measures the same
                    quantity in the same unit, and 25 of the 33 are deliberately NULL
                    because the unit or the definition changed. The result was a report
                    where 25 cards read "Unmeasured" while the measurements sat unread in
                    metricsJson, including six that are fully certified: forward head
                    ratio, shoulder obliquity, pelvic obliquity, trunk lateral shift,
                    shoulder/hip width ratio and leg length asymmetry.
                  */}
                  <MetricsDisplay
                    analysis={analysisState.analysisResult}
                    previousValues={previousValuesFor(
                      analysisState.analysisResult,
                      assessmentHistory ?? [],
                    )}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
