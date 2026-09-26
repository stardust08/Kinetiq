/**
 * Video consultation API, and the URL of the signalling socket.
 *
 * Nothing here carries media. The REST calls manage the consultation's lifecycle and
 * the screening authorisation; the socket carries WebRTC negotiation, and the audio and
 * video travel directly between the two browsers.
 */

import { apiClient } from './client';
import type {
  AnalysisType,
  ConsultationEvent,
  JoinConsultationResult,
  VideoSession,
} from '../types/consultation';

const VIDEO_BASE_URL = '/api/video';

/**
 * Open (or fetch) the consultation for a booking. Clinician or admin only.
 *
 * Idempotent: calling it twice returns the same room, which is what stops a clinician
 * who double-clicks from ending up in a different room from their patient.
 */
export const createSession = async (
  bookingId: string,
  scheduledAt?: string,
): Promise<VideoSession> => {
  const response = await apiClient.post<{ data: VideoSession }>(
    `${VIDEO_BASE_URL}/sessions`,
    { bookingId, scheduledAt },
  );
  return response.data.data;
};

export const listSessions = async (params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<VideoSession[]> => {
  const response = await apiClient.get<{ data: VideoSession[] }>(
    `${VIDEO_BASE_URL}/sessions`,
    { params },
  );
  return response.data.data;
};

export const getSession = async (sessionId: string): Promise<VideoSession> => {
  const response = await apiClient.get<{ data: VideoSession }>(
    `${VIDEO_BASE_URL}/sessions/${sessionId}`,
  );
  return response.data.data;
};

/**
 * The open consultation for a booking, or null.
 *
 * This is the patient's waiting room. Null is the normal answer for most of the time
 * the page is open - the clinician has not started the call yet - so it is not an error.
 */
export const getSessionForBooking = async (
  bookingId: string,
): Promise<VideoSession | null> => {
  const response = await apiClient.get<{ data: VideoSession | null }>(
    `${VIDEO_BASE_URL}/bookings/${bookingId}/session`,
  );
  return response.data.data;
};

/** Enter the room: ICE servers, this viewer's permissions, current authorisation. */
export const joinSession = async (
  sessionId: string,
): Promise<JoinConsultationResult> => {
  const response = await apiClient.post<{ data: JoinConsultationResult }>(
    `${VIDEO_BASE_URL}/sessions/${sessionId}/join`,
  );
  return response.data.data;
};

export const endSession = async (
  sessionId: string,
  clinicalNotes?: string,
): Promise<VideoSession> => {
  const response = await apiClient.post<{ data: VideoSession }>(
    `${VIDEO_BASE_URL}/sessions/${sessionId}/end`,
    { clinicalNotes },
  );
  return response.data.data;
};

export const saveClinicalNotes = async (
  sessionId: string,
  clinicalNotes: string,
): Promise<VideoSession> => {
  const response = await apiClient.patch<{ data: VideoSession }>(
    `${VIDEO_BASE_URL}/sessions/${sessionId}/notes`,
    { clinicalNotes },
  );
  return response.data.data;
};

export const getSessionEvents = async (
  sessionId: string,
): Promise<ConsultationEvent[]> => {
  const response = await apiClient.get<{ data: ConsultationEvent[] }>(
    `${VIDEO_BASE_URL}/sessions/${sessionId}/events`,
  );
  return response.data.data;
};

/**
 * Authorise the patient in this consultation to perform one screening.
 *
 * Clinician or admin only. Returns the one-shot token, which is also pushed to the
 * patient's browser over the socket - the staff client rarely needs it, but it is
 * returned so an operator performing the capture themselves has it to hand.
 */
export const enableScreening = async (
  sessionId: string,
  screeningType: AnalysisType,
): Promise<{
  session: VideoSession;
  screeningToken: string;
  screeningType: AnalysisType;
  expiresAt: string;
}> => {
  const response = await apiClient.post<{
    data: {
      session: VideoSession;
      screeningToken: string;
      screeningType: AnalysisType;
      expiresAt: string;
    };
  }>(`${VIDEO_BASE_URL}/sessions/${sessionId}/enable-screening`, { screeningType });
  return response.data.data;
};

/** Withdraw the authorisation, for when a capture is called off mid-consultation. */
export const revokeScreening = async (sessionId: string): Promise<VideoSession> => {
  const response = await apiClient.post<{ data: VideoSession }>(
    `${VIDEO_BASE_URL}/sessions/${sessionId}/revoke-screening`,
  );
  return response.data.data;
};

/**
 * Build the signalling socket URL.
 *
 * The token goes in the query string because the browser's WebSocket API cannot set an
 * Authorization header - there is no way around it client-side. The scheme is derived
 * from the API base URL rather than from `window.location`, because in development the
 * app runs on Vite's port and the API on another.
 */
export const signallingUrl = (sessionId: string): string => {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const token = localStorage.getItem('auth_token') ?? '';
  const wsBase = base.replace(/^http/, 'ws').replace(/\/$/, '');
  return `${wsBase}${VIDEO_BASE_URL}/ws/${sessionId}?token=${encodeURIComponent(token)}`;
};
