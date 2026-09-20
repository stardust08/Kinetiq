import { useEffect, useState } from 'react';

interface CaptureProgressProps {
  /** Current frame index being processed */
  frameCount: number;
  /** Total frames to capture (default 60) */
  totalFrames: number;
  /** Latest best-frame visibility score (0–1) */
  bestVisibility: number;
  /** True while the capture session is active */
  isActive: boolean;
  /** Flash "Better frame found!" each time this increments */
  betterFrameVersion: number;
}

/**
 * CaptureProgress
 *
 * Parallel live-feedback UI that runs alongside the existing body-detection UI.
 * It shows:
 * - Visibility progress bar (based on best frame so far)
 * - Frame counter "Scanning… frame X / 60"
 * - "Better frame found!" flash notification
 *
 * This component does NOT touch the existing detection feedback –
 * it is purely additive.
 */
export default function CaptureProgress({
  frameCount,
  totalFrames,
  bestVisibility,
  isActive,
  betterFrameVersion,
}: CaptureProgressProps) {
  const [showFlash, setShowFlash] = useState(false);

  // Flash "Better frame found!" whenever betterFrameVersion ticks up
  useEffect(() => {
    if (betterFrameVersion === 0) return;
    setShowFlash(true);
    const t = setTimeout(() => setShowFlash(false), 1400);
    return () => clearTimeout(t);
  }, [betterFrameVersion]);

  if (!isActive) return null;

  const visibilityPct = Math.round(bestVisibility * 100);
  const framePct = Math.min(100, Math.round((frameCount / totalFrames) * 100));

  const barColor =
    visibilityPct >= 85
      ? 'bg-emerald-400'
      : visibilityPct >= 65
      ? 'bg-yellow-400'
      : 'bg-red-400';

  return (
    <div
      id="capture-progress-panel"
      className="w-full rounded-xl border border-white/10 bg-black/60 backdrop-blur-sm p-4 space-y-3"
    >
      {/* Frame counter */}
      <div className="flex items-center justify-between text-xs text-gray-300">
        <span className="font-medium tracking-wide uppercase opacity-70">Best-Frame Scan</span>
        <span className="font-mono text-white">
          frame{' '}
          <span className="text-blue-300 font-bold">{frameCount}</span>
          {' '}/ {totalFrames}
        </span>
      </div>

      {/* Visibility bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-400">Best clarity so far</span>
          <span className={`font-bold ${visibilityPct >= 85 ? 'text-emerald-400' : visibilityPct >= 65 ? 'text-yellow-400' : 'text-red-400'}`}>
            {visibilityPct}%
          </span>
        </div>
        <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${barColor}`}
            style={{ width: `${visibilityPct}%` }}
          />
        </div>
      </div>

      {/* Frame scan progress */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-400">Scanning…</span>
          <span className="text-gray-300">{framePct}%</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-75 ease-linear"
            style={{ width: `${framePct}%` }}
          />
        </div>
      </div>

      {/* "Better frame found!" flash */}
      {showFlash && (
        <div
          id="better-frame-flash"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold animate-pulse"
        >
          <span>⚡</span>
          Better frame found! ({visibilityPct}% clarity)
        </div>
      )}
    </div>
  );
}
