/**
 * Range-of-motion screening API.
 *
 * Sends landmark NUMBERS only - pose estimation runs in the browser, so no video and no
 * per-frame images leave the device.
 */

import { apiClient } from './client';
import type { MetricsPayload, QualityFlags } from '../types/metrics';
import { currentScreeningToken } from '../store/screeningStore';

// Every route in this app is mounted under /api, and the axios client's baseURL is
// the bare host. Posture and gait both carry the prefix here; ROM did not, so all
// four of its requests went to paths the server does not serve.
const ROM_BASE_URL = '/api/rom';

/** A single end-range hold: the movement, the view it was captured from, its frames. */
export interface ROMMovementCapture {
  view: string;
  samples: Array<Record<string, unknown>>;
  frameCount: number;
}

export interface ROMCaptureResult {
  movements: Record<string, ROMMovementCapture>;
  coordinateSpace: 'normalized';
  imageWidth: number;
  imageHeight: number;
}

export interface ROMAnalysis {
  id: string;
  userId: string;
  bookingId: string;
  analysisDate: string;
  metricsJson?: MetricsPayload | null;
  qualityFlags?: QualityFlags | null;
  capturedMovements?: string | null;
  totalFrames?: number | null;
  status: string;
}

export const startAnalysis = async (bookingId: string) => {
  const response = await apiClient.post<{
    data: { sessionId: string; bookingId: string; remainingCount: number; movements: string[] };
  }>(`${ROM_BASE_URL}/start-analysis`, {
    bookingId,
    // A patient may only begin a capture their clinician unlocked in a consultation.
    // The token is held for the duration of one capture; see store/screeningStore.ts.
    // A clinician or admin driving the capture themselves sends none and is authorised
    // by their role.
    screeningToken: currentScreeningToken(),
  });
  return response.data.data;
};

export const finalizeAnalysis = async (request: {
  sessionId: string;
  bookingId: string;
  romData: ROMCaptureResult;
}): Promise<ROMAnalysis> => {
  const response = await apiClient.post<{
    data: { analysis: ROMAnalysis; remainingCount: number };
  }>(`${ROM_BASE_URL}/finalize-analysis`, {
    ...request,
    // Re-presented here because the server re-checks: an authorisation the clinician
    // withdrew mid-capture must not still produce a stored analysis.
    screeningToken: currentScreeningToken(),
  });
  return response.data.data.analysis;
};

export const cancelAnalysis = async (sessionId: string) => {
  await apiClient.post(`${ROM_BASE_URL}/cancel-analysis`, { sessionId });
};

export const getMyAnalyses = async (params?: { limit?: number; offset?: number }) => {
  const response = await apiClient.get<{ data: ROMAnalysis[] }>(
    `${ROM_BASE_URL}/my-analyses`,
    { params },
  );
  return response.data.data;
};
