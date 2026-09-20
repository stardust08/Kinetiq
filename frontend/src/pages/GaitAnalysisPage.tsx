import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useGaitAnalysis } from '../hooks/useGaitAnalysis';
import GaitWebcamCapture, { GaitCaptureResult } from '../components/gait/GaitWebcamCapture';
import { GaitMetricsDisplay } from '../components/gait/GaitMetricsDisplay';
import { GaitSkeletonPlayer } from '../components/gait/GaitSkeletonPlayer';
import { GaitDownloadReportButton } from '../components/gait/GaitDownloadReportButton';
import BookingSelectionStep from '../components/booking/BookingSelectionStep';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { BackButton } from '../components/layout/BackButton';

type PageStep = 'select_booking' | 'instructions' | 'capturing' | 'processing' | 'results';

const PAGE_STEPS: PageStep[] = ['instructions', 'capturing', 'processing', 'results'];

export default function GaitAnalysisPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookingIdFromUrl = searchParams.get('bookingId');

  const [currentStep, setCurrentStep] = useState<PageStep>(
    bookingIdFromUrl ? 'instructions' : 'select_booking'
  );
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(bookingIdFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState('Analyzing your gait...');

  const { state, isProcessing: _isProcessing, startAnalysis, finalizeAnalysis, cancelAnalysis, reset } =
    useGaitAnalysis();

  const handleBookingSelected = async (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setCurrentStep('instructions');
  };

  const handleStartCapture = async () => {
    if (!selectedBookingId) return;
    try {
      setError(null);
      await startAnalysis(selectedBookingId);
      setCurrentStep('capturing');
    } catch (err: any) {
      setError(err?.message || 'Failed to start analysis.');
    }
  };

  const handleCaptureComplete = async (captureResult: GaitCaptureResult) => {
    setCurrentStep('processing');
    setProcessingMessage('Detecting gait cycles...');

    try {
      const views: Record<string, any> = {};
      for (const [viewName, viewData] of Object.entries(captureResult.views)) {
        views[viewName] = {
          timeSeries: viewData.timeSeries,
          backgroundImage: viewData.backgroundImage || undefined,
          frameCount: viewData.frameCount,
        };
      }

      const t1 = setTimeout(() => setProcessingMessage('Calculating stride parameters...'), 800);
      const t2 = setTimeout(() => setProcessingMessage('Computing joint kinematics...'), 1600);

      await finalizeAnalysis({
        views,
        totalFrames: captureResult.totalFrames,
        capturedViews: captureResult.capturedViews,
        fps: captureResult.fps,
      });

      clearTimeout(t1);
      clearTimeout(t2);
      setCurrentStep('results');
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze gait. Please try again.');
      setCurrentStep('capturing');
    }
  };

  const handleCaptureError = (errMsg: string) => setError(errMsg);

  const handleCancel = async () => {
    await cancelAnalysis();
    reset();
    setCurrentStep('select_booking');
    setSelectedBookingId(null);
    setError(null);
  };

  const handleRetry = () => {
    setError(null);
    setCurrentStep('capturing');
  };

  const analysisResult = state.result;
  const stepIndex = PAGE_STEPS.indexOf(currentStep);

  return (
    <div className="min-h-screen bg-[#030712] text-white relative overflow-hidden">
      {/* Neural grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(13,148,136,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(13,148,136,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 100% 60% at 50% 0%, black 20%, transparent 100%)",
        }}
      />
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[300px] rounded-full blur-[120px] bg-[#0D9488]/8 pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-[400px] h-[250px] rounded-full blur-[100px] bg-[#2F86C7]/6 pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <BackButton onClick={() => navigate('/bookings')} />
          <Breadcrumb
            items={[
              { label: 'Bookings', href: '/bookings' },
              { label: 'Gait Analysis' },
            ]}
          />
        </div>

        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-3"
            style={{ background: "rgba(13,148,136,0.12)", border: "1px solid rgba(13,148,136,0.25)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#34D399]">AI Analysis</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Gait Analysis</h1>
          <p className="text-slate-400 mt-1 text-sm">
            AI-powered walking analysis across 3 views · 15 seconds total
          </p>
        </div>

        {/* Step Progress */}
        {currentStep !== 'select_booking' && (
          <div className="flex items-center gap-2 mb-8 p-4 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {PAGE_STEPS.map((step, i) => {
              const isDone = i < stepIndex;
              const isCurrent = i === stepIndex;
              return (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      isDone
                        ? 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                        : isCurrent
                        ? 'bg-[#0D9488] text-white shadow-[0_0_14px_rgba(13,148,136,0.5)]'
                        : 'bg-white/5 text-slate-500 border border-white/10'
                    }`}
                  >
                    {isDone ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs capitalize font-medium ${
                    isCurrent ? 'text-white' : isDone ? 'text-emerald-400' : 'text-slate-600'
                  }`}>
                    {step.replace('_', ' ')}
                  </span>
                  {i < PAGE_STEPS.length - 1 && (
                    <div className={`w-8 h-px mx-1 ${isDone ? 'bg-emerald-500/50' : 'bg-white/8'}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="rounded-xl p-4 mb-6 flex items-start justify-between"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-red-300 text-sm">{error}</p>
            <div className="flex gap-3 ml-4 shrink-0">
              <button onClick={handleRetry} className="text-xs text-[#60b5e8] hover:text-white transition-colors underline">
                Retry
              </button>
              <button onClick={handleCancel} className="text-xs text-slate-400 hover:text-white transition-colors underline">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: Select Booking */}
        {currentStep === 'select_booking' && (
          <BookingSelectionStep onBookingSelected={handleBookingSelected} />
        )}

        {/* STEP 2: Instructions */}
        {currentStep === 'instructions' && (
          <div className="rounded-2xl p-6 flex flex-col gap-5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
            <h2 className="text-xl font-semibold text-white">How Gait Analysis Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: '🚶', view: 'Front View', desc: 'Walk toward & away from camera for 5 seconds', color: '#2F86C7' },
                { icon: '👤', view: 'Left Side', desc: 'Walk parallel to camera (left side facing it) for 5 seconds', color: '#0D9488' },
                { icon: '👤', view: 'Right Side', desc: 'Walk parallel to camera (right side facing it) for 5 seconds', color: '#8b5cf6' },
              ].map(({ icon, view, desc, color }) => (
                <div key={view} className="rounded-xl p-4 text-center"
                  style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                  <div className="text-3xl mb-2">{icon}</div>
                  <h3 className="font-semibold text-white mb-1 text-sm">{view}</h3>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4"
              style={{ background: "rgba(47,134,199,0.06)", border: "1px solid rgba(47,134,199,0.2)" }}>
              <h4 className="font-medium text-[#60b5e8] mb-2 text-sm">Tips for Best Results</h4>
              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside leading-relaxed">
                <li>Walk at your natural, comfortable pace</li>
                <li>Keep your full body in frame (head to feet)</li>
                <li>Ensure good lighting — avoid backlighting</li>
                <li>Wear fitted clothing so joints are visible</li>
                <li>Walk in a straight line parallel to the camera for side views</li>
              </ul>
            </div>

            <div className="flex gap-3 mt-2">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-all duration-300"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                Back
              </button>
              <button
                onClick={handleStartCapture}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg, #0D9488, #0F766E)", boxShadow: "0 4px 20px rgba(13,148,136,0.3)" }}
              >
                Start Capture →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Capturing */}
        {currentStep === 'capturing' && selectedBookingId && (
          <GaitWebcamCapture
            bookingId={selectedBookingId}
            onCaptureComplete={handleCaptureComplete}
            onError={handleCaptureError}
            onCancel={handleCancel}
          />
        )}

        {/* STEP 4: Processing */}
        {currentStep === 'processing' && (
          <div className="flex flex-col items-center justify-center min-h-[320px] gap-6 rounded-2xl p-8"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-2 border-white/5" />
              <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-[#0D9488] border-t-transparent animate-spin" />
              <div className="absolute inset-2 w-16 h-16 rounded-full border-2 border-[#2F86C7]/30 border-b-transparent animate-spin"
                style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white mb-1">{processingMessage}</p>
              <p className="text-sm text-slate-500">Analyzing 32 gait parameters...</p>
            </div>
          </div>
        )}

        {/* STEP 5: Results */}
        {currentStep === 'results' && analysisResult && (
          <div className="flex flex-col gap-5">
            {/* Skeleton Player */}
            <div className="rounded-2xl p-5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-[#0D9488]" />
                <h2 className="text-base font-semibold text-white">Walking Skeleton Replay</h2>
              </div>
              {analysisResult.analysis?.gaitFrames ? (
                <GaitSkeletonPlayer gaitFrames={analysisResult.analysis.gaitFrames} />
              ) : (
                <div className="h-32 flex items-center justify-center text-slate-500 text-sm">
                  Skeleton data not available
                </div>
              )}
            </div>

            {/* Metrics */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-[#2F86C7]" />
                <h2 className="text-base font-semibold text-white">Gait Analysis Results</h2>
              </div>
              {analysisResult.analysis?.metrics && (
                <GaitMetricsDisplay metrics={analysisResult.analysis.metrics} />
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pb-6">
              {analysisResult.analysis && (
                <GaitDownloadReportButton analysis={analysisResult.analysis} />
              )}
              <button
                onClick={() => navigate('/bookings')}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-all duration-300"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                Back to Bookings
              </button>
              <button
                onClick={() => { reset(); setCurrentStep('select_booking'); }}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg, #0D9488, #0F766E)", boxShadow: "0 4px 20px rgba(13,148,136,0.25)" }}
              >
                New Analysis
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
