/**
 * GaitDownloadReportButton
 * Captures offscreen 2D canvas snapshots for each gait view (front, left, right)
 * then generates and downloads the PDF report.
 */

import { useState } from 'react';
import { captureGaitSnapshot } from '../../utils/captureGaitSnapshot';
import { generateGaitReport } from '../../utils/generateGaitReport';
import type { GaitFrameSnapshot, GaitViewData } from '../../utils/captureGaitSnapshot';

interface GaitAnalysisResult {
  id?: string;
  analysisId?: string;
  bookingId?: string;
  userId?: string;
  createdAt?: string;
  analysisDate?: string;
  metrics: Record<string, number>;
  gaitFrames: Record<string, GaitViewData & { annotatedTimeSeries: any[]; imageData?: string }>;
}

interface Props {
  analysis: GaitAnalysisResult;
  className?: string;
}

const VIEWS: Array<{ key: 'front' | 'leftside' | 'rightside'; label: string }> = [
  { key: 'front',     label: 'Front' },
  { key: 'leftside',  label: 'Left Side' },
  { key: 'rightside', label: 'Right Side' },
];

export function GaitDownloadReportButton({ analysis, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      // ── Step 1: capture offscreen canvas snapshots for each view ──────────
      const capturedSnapshots: {
        front?: GaitFrameSnapshot;
        leftside?: GaitFrameSnapshot;
        rightside?: GaitFrameSnapshot;
      } = {};

      for (const { key, label } of VIEWS) {
        const viewData = analysis.gaitFrames?.[key];
        if (!viewData) continue;
        setProgress(`Rendering ${label} view…`);
        capturedSnapshots[key] = await captureGaitSnapshot(viewData);
      }

      // ── Step 2: generate and download the PDF ─────────────────────────────
      setProgress('Generating PDF…');

      const analysisId = analysis.id || analysis.analysisId || 'unknown';
      const analysisDate = analysis.analysisDate || analysis.createdAt || new Date().toISOString();

      await generateGaitReport({
        analysisId,
        bookingId:  analysis.bookingId ?? '',
        userId:     analysis.userId,
        analysisDate,
        metrics:    analysis.metrics ?? {},
        capturedSnapshots,
      });
    } catch (err) {
      console.error('[GaitDownloadReportButton]', err);
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
          'inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors'
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
            Download Report (PDF)
          </>
        )}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
