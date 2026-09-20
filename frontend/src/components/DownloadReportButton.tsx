/**
 * DownloadReportButton
 * Captures offscreen Three.js skeleton snapshots for each pose view,
 * then triggers PDF generation with all images.
 */

import { useState } from 'react';
import type { PostureAnalysis } from '../types';
import type { BestFrameData, PoseView } from '../lib/postureStore';
import { captureSkeletonSnapshot } from '../utils/captureSkeletonSnapshot';
import { generatePostureReport } from '../utils/generatePostureReport';
import frontPostureImage from '../assets/front_posture_reference.png';
import leftSideImage from '../assets/left_posture_reference.png';
import rightSideImage from '../assets/right_posture_reference.png';
import backPostureImage from '../assets/back_posture_reference.png';
import type { CapturedFrames } from '../types/report';

interface Props {
  analysis: PostureAnalysis;
  bestFrames: Record<PoseView, BestFrameData | null>;
  className?: string;
}

const VIEWS: PoseView[] = ['front', 'leftside', 'rightside', 'back'];

export function DownloadReportButton({ analysis, bestFrames, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      // ── Step 1: render offscreen Three.js snapshots for each captured view ──
      const capturedFrames: CapturedFrames = { front: null, leftside: null, rightside: null, back: null };

      for (const view of VIEWS) {
        const frame = bestFrames[view];
        if (!frame) continue;

        setProgress(`Rendering ${view} view…`);
        const snaps = await captureSkeletonSnapshot(frame);

        capturedFrames[view] = {
          photoWithOverlay: snaps.withOverlay,   // photo + skeleton + angles
          skeletalAnalysis: snaps.photo,          // raw camera photo (col 2)
          skeletonOnly: snaps.skeletonOnly,   // skeleton + angles, no photo
        };
      }

      // ── Step 2: ideal posture reference image
      const idealFrames = { front: frontPostureImage, leftside: leftSideImage, rightside: rightSideImage, back: backPostureImage };

      // ── Step 3: generate and download the PDF ────────────────────────────────
      setProgress('Generating PDF…');
      await generatePostureReport({ analysis, capturedFrames, idealFrames });
    } catch (err) {
      console.error('[DownloadReportButton]', err);
      setError('Failed to generate PDF. Please try again.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={
          className ??
          'inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 active:bg-sky-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors'
        }
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            {progress || 'Working…'}
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Report
          </>
        )}
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
