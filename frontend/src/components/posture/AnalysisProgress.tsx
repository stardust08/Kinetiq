/**
 * AnalysisProgress Component Props
 */
export interface AnalysisProgressProps {
  /** Current frame count */
  frameCount: number;
  /** Total frames to capture (default: 180) */
  totalFrames?: number;
  /** Elapsed time in seconds */
  elapsedTime: number;
  /** Total duration in seconds (default: 6) */
  totalDuration?: number;
  /** Current status message */
  statusMessage?: string;
  /** Whether the capture is currently active */
  isCapturing?: boolean;
}

/**
 * AnalysisProgress Component
 * 
 * Displays real-time progress information during posture analysis capture.
 * 
 * Features:
 * - Visual progress bar showing completion percentage
 * - Frame count display (X/180)
 * - Duration display (Xs/6s)
 * - Status messages for user feedback
 * - Responsive design
 * 
 * Technical Details:
 * - Progress calculated as (frameCount / totalFrames) * 100
 * - Updates in real-time as frames are captured
 * - Color-coded progress bar (blue for active, green for complete)
 * 
 * @example
 * <AnalysisProgress
 *   frameCount={60}
 *   totalFrames={180}
 *   elapsedTime={2}
 *   totalDuration={6}
 *   statusMessage="Capturing frames..."
 *   isCapturing={true}
 * />
 */
export default function AnalysisProgress({
  frameCount,
  totalFrames = 180,
  elapsedTime,
  totalDuration = 6,
  statusMessage = 'Capturing frames...',
  isCapturing = true
}: AnalysisProgressProps) {
  // Calculate progress percentage
  const progressPercentage = Math.min((frameCount / totalFrames) * 100, 100);
  const isComplete = frameCount >= totalFrames;

  // Calculate remaining values
  const remainingFrames = Math.max(totalFrames - frameCount, 0);
  const remainingTime = Math.max(totalDuration - elapsedTime, 0);

  return (
    <div className="w-full space-y-4">
      {/* Status Message */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {isComplete ? 'Capture Complete!' : statusMessage}
        </h3>
        <p className="text-sm text-gray-600">
          {isComplete
            ? 'Processing your posture analysis...'
            : 'Please hold your position while we capture frames'}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
          <div
            className={`
              h-full transition-all duration-300 ease-linear
              ${isComplete
                ? 'bg-green-500'
                : isCapturing
                ? 'bg-blue-600'
                : 'bg-gray-400'
              }
            `}
            style={{ width: `${progressPercentage}%` }}
            role="progressbar"
            aria-valuenow={Math.round(progressPercentage)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Progress Percentage */}
        <div className="text-center">
          <span className="text-2xl font-bold text-gray-900">
            {Math.round(progressPercentage)}%
          </span>
          <span className="text-sm text-gray-500 ml-2">Complete</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        {/* Frame Count */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900">Frames</span>
            <svg
              className="w-5 h-5 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {frameCount}
            <span className="text-lg text-blue-600 font-normal"> / {totalFrames}</span>
          </div>
          <div className="text-xs text-blue-700 mt-1">
            {remainingFrames} remaining
          </div>
        </div>

        {/* Duration */}
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-purple-900">Duration</span>
            <svg
              className="w-5 h-5 text-purple-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="text-2xl font-bold text-purple-900">
            {elapsedTime}s
            <span className="text-lg text-purple-600 font-normal"> / {totalDuration}s</span>
          </div>
          <div className="text-xs text-purple-700 mt-1">
            {remainingTime}s remaining
          </div>
        </div>
      </div>

      {/* Capture Rate Info */}
      {isCapturing && frameCount > 0 && elapsedTime > 0 && (
        <div className="text-center mt-4">
          <div className="inline-flex items-center space-x-2 bg-gray-100 rounded-full px-4 py-2">
            <svg
              className="w-4 h-4 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span className="text-sm text-gray-700">
              Capturing at {Math.round(frameCount / elapsedTime)} FPS
            </span>
          </div>
        </div>
      )}

      {/* Completion Message */}
      {isComplete && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                All frames captured successfully!
              </h3>
              <p className="mt-1 text-sm text-green-700">
                We're now calculating your clinical posture metrics. This will take just a moment.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
