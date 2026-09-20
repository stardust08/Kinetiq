/**
 * Report-specific TypeScript types.
 * Reuses PostureAnalysis from src/types/index.ts.
 */

import type { PostureAnalysis } from './index';
import type { PoseView, BestFrameData } from '../lib/postureStore';

/** Clinical severity classification for a single metric */
/**
 * 'Ungraded' exists because a metric can carry a value and still have no verdict: the
 * backend withdraws the normal range from any metric whose measurement error is wider
 * than that range, since the badge would otherwise be decided by measurement noise
 * rather than by the patient. Such a metric shows its number and no severity.
 *
 * 'Unmeasured' exists because a metric can now legitimately have no value: the
 * required capture view was missing, too few frames were usable, or the quantity is
 * not observable with these landmarks. Such a metric must never be graded, flagged or
 * given a treatment recommendation - it was not measured, so there is nothing to
 * interpret.
 */
export type MetricStatus = 'Normal' | 'Mild' | 'Severe' | 'Unmeasured' | 'Ungraded';

/**
 * Per-view captured frames.
 * imageDataUrl is the raw camera snapshot stored in postureStore.
 * The PDF template uses the same image for all three column variants
 * since overlay/skeleton renders are not persisted as separate URLs.
 */
export interface CapturedViewFrames {
  /** Raw camera image (used as photoWithOverlay column) */
  photoWithOverlay: string;
  /** Same image labelled as Skeletal Analysis column */
  skeletalAnalysis: string;
  /** Same image labelled as Posture Model column */
  skeletonOnly: string;
}

export interface CapturedFrames {
  front: CapturedViewFrames | null;
  leftside: CapturedViewFrames | null;
  rightside: CapturedViewFrames | null;
  back: CapturedViewFrames | null;
}

/** All data needed to generate a posture PDF report */
export interface ReportData {
  analysis: PostureAnalysis;
  capturedFrames: CapturedFrames;
  idealFrames: Record<'front' | 'leftside' | 'rightside' | 'back', string>;
}

/** A single evaluated metric row for display/PDF */
export interface MetricRow {
  label: string;
  /** null when status is 'Unmeasured' — the metric has no value to display. */
  value: number | null;
  unit: string;
  status: MetricStatus;
  range?: string;
  /** Caveat that travels with the number: low-confidence reason, cross-view agreement. */
  note?: string;
  /** Citation for the reference range, so a printed report can be checked. */
  reference?: string;
}

/** A group of related metrics */
export interface MetricGroup {
  title: string;
  metrics: MetricRow[];
}

/** Re-export for convenience */
export type { PostureAnalysis, PoseView, BestFrameData };
