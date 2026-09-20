import { lazy, Suspense, useState } from 'react';
import type { BestFrameData, PoseView } from '../../lib/postureStore';

// Lazy-load Three.js viewer — never init scene until user clicks "View in 3D"
const PostureViewer3D = lazy(() => import('./PostureViewer3D'));

const VIEW_LABELS: Record<PoseView, string> = {
  front: 'Front',
  leftside: 'Left Side',
  rightside: 'Right Side',
  back: 'Back',
};

const VIEW_ICONS: Record<PoseView, string> = {
  front: '⬜',
  leftside: '◁',
  rightside: '▷',
  back: '⬛',
};

interface PoseCardProps {
  view: PoseView;
  frameData: BestFrameData | null;
}

/**
 * PoseCard
 *
 * Displays:
 * - Thumbnail of the best captured frame per pose
 * - Visibility score badge ("92% clarity")
 * - "View in 3D" button → lazy-loads PostureViewer3D modal
 */
export default function PoseCard({ view, frameData }: PoseCardProps) {
  const [show3D, setShow3D] = useState(false);

  const label = VIEW_LABELS[view];
  const icon = VIEW_ICONS[view];

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!frameData) {
    return (
      <div
        id={`pose-card-${view}`}
        className="flex flex-col rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
      >
        <div className="aspect-[3/4] flex flex-col items-center justify-center gap-3 bg-white/5 text-gray-500">
          <span className="text-3xl opacity-30">{icon}</span>
          <span className="text-xs uppercase tracking-widest opacity-50">{label} view</span>
          <span className="text-xs opacity-40">Not yet captured</span>
        </div>
        <div className="px-4 py-3 bg-black/20">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        </div>
      </div>
    );
  }

  const visibilityPct = Math.round(frameData.visibility * 100);
  const badgeColor =
    visibilityPct >= 85
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : visibilityPct >= 65
      ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
      : 'bg-red-500/20 text-red-300 border-red-500/40';

  return (
    <>
      <div
        id={`pose-card-${view}`}
        className="flex flex-col rounded-2xl border border-white/10 bg-white/5 overflow-hidden hover:border-blue-500/40 transition-colors group"
      >
        {/* Thumbnail */}
        <div className="relative aspect-[3/4] overflow-hidden">
          <img
            src={frameData.imageDataUrl}
            alt={`${label} posture capture`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {/* Clarity badge */}
          <div
            className={`absolute top-3 right-3 px-2.5 py-1 rounded-full border text-xs font-bold backdrop-blur-sm ${badgeColor}`}
          >
            {visibilityPct}% clarity
          </div>
          {/* Frame info */}
          <div className="absolute bottom-3 left-3 px-2 py-1 rounded-md bg-black/60 text-white text-xs font-mono">
            Frame #{frameData.frameIndex}
          </div>
        </div>

        {/* Card footer */}
        <div className="px-4 py-3 bg-black/30 flex items-center justify-between gap-3">
          <div>
            <span className="block text-xs font-bold text-white uppercase tracking-wide">{label} View</span>
            <span className="block text-xs text-gray-400 mt-0.5">Best of {frameData.frameIndex} scanned</span>
          </div>
          <button
            id={`view-3d-btn-${view}`}
            onClick={() => setShow3D(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
              bg-gradient-to-r from-blue-600 to-indigo-600 text-white
              hover:from-blue-500 hover:to-indigo-500 active:scale-95 transition-all shadow-md"
          >
            <span>🔭</span>
            View in 3D
          </button>
        </div>
      </div>

      {/* Lazy-loaded 3D viewer */}
      {show3D && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
              <div className="text-white text-sm animate-pulse">Loading 3D viewer…</div>
            </div>
          }
        >
          <PostureViewer3D
            frameData={frameData}
            poseName={label}
            onClose={() => setShow3D(false)}
          />
        </Suspense>
      )}
    </>
  );
}
