import { apiClient } from './client';

const GAIT_BASE_URL = '/api/gait';

export interface StartGaitRequest {
  bookingId: string;
}

export interface GaitViewData {
  timeSeries: Array<{
    frameIndex: number;
    landmarks: Record<string, number[]>;
    timestamp: number;
  }>;
  backgroundImage?: string;
  frameCount: number;
}

export interface FinalizeGaitRequest {
  sessionId: string;
  bookingId: string;
  gaitData: {
    views: Record<string, GaitViewData>;
    totalFrames: number;
    capturedViews: string;
    fps: number;
    /**
     * Real capture dimensions. Required for correct geometry: MediaPipe normalises x
     * by width and y by height, so the backend must undo that anisotropy before
     * computing any angle or distance. Omitting them makes the backend assume 4:3 and
     * flag the assumption on the stored result.
     */
    imageWidth?: number;
    imageHeight?: number;
  };
}

export async function startGaitAnalysis(request: StartGaitRequest) {
  const response = await apiClient.post(`${GAIT_BASE_URL}/start-analysis`, request);
  return response.data.data;
}

export async function finalizeGaitAnalysis(request: FinalizeGaitRequest) {
  const response = await apiClient.post(`${GAIT_BASE_URL}/finalize-analysis`, request, {
    timeout: 90000, // 90 seconds - gait processing is heavier
  });
  return response.data.data;
}

export async function cancelGaitAnalysis(sessionId: string) {
  const response = await apiClient.post(`${GAIT_BASE_URL}/cancel-analysis`, { sessionId });
  return response.data;
}

export async function getMyGaitAnalyses(bookingId?: string, limit = 10, offset = 0) {
  const params: Record<string, string | number> = { limit, offset };
  if (bookingId) params.bookingId = bookingId;
  const response = await apiClient.get(`${GAIT_BASE_URL}/my-analyses`, { params });
  return response.data.data;
}

export async function getGaitAnalysisById(id: string) {
  const response = await apiClient.get(`${GAIT_BASE_URL}/analysis/${id}`);
  return response.data.data;
}

export async function validateBookingForGait(bookingId: string) {
  const response = await apiClient.get(`${GAIT_BASE_URL}/validate-booking/${bookingId}`);
  return response.data.data;
}
