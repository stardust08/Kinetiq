/**
 * Posture Analysis API Service
 * 
 * Provides API methods for posture analysis operations:
 * - Start analysis session
 * - Process video frames (with retry logic)
 * - Finalize analysis and save results
 * - Cancel analysis
 * - Get user assessments
 * - Validate booking
 * 
 * All methods include proper error handling via apiClient interceptors.
 * Frame processing includes automatic retry logic for transient failures.
 */

import { apiClient } from './client';
import { isRetryableError } from './errors';
import { currentScreeningToken } from '../store/screeningStore';
import type {
  StartAnalysisRequest,
  StartAnalysisResponse,
  ProcessFrameRequest,
  ProcessFrameResponse,
  FinalizeAnalysisRequest,
  PostureAnalysis,
  CancelAnalysisRequest,
  ValidateBookingResponse,
} from '../types';

const POSTURE_BASE_URL = '/api/posture';

// Retry configuration for frame processing
const FRAME_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
};

/**
 * Retry helper with exponential backoff
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retry attempts
 * @param delayMs - Initial delay in milliseconds
 * @returns Result of the function
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = FRAME_RETRY_CONFIG.maxRetries,
  delayMs: number = FRAME_RETRY_CONFIG.initialDelayMs
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if error is not retryable or we've exhausted retries
      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const currentDelay = Math.min(
        delayMs * Math.pow(FRAME_RETRY_CONFIG.backoffMultiplier, attempt),
        FRAME_RETRY_CONFIG.maxDelayMs
      );
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, currentDelay));
    }
  }
  
  throw lastError;
}

/**
 * Start a new posture analysis session
 * @param request - Contains bookingId
 * @returns Session information with sessionId and expiration
 */
export const startAnalysis = async (
  request: StartAnalysisRequest
): Promise<StartAnalysisResponse> => {
  const response = await apiClient.post<{ data: StartAnalysisResponse }>(
    `${POSTURE_BASE_URL}/start-analysis`,
    {
      ...request,
      // A patient may only begin a capture their clinician unlocked in a video
      // consultation. The token is held for one capture - see store/screeningStore.ts.
      // Staff driving the capture send none and are authorised by their role.
      screeningToken: request.screeningToken ?? currentScreeningToken(),
    }
  );
  return response.data.data;
};

/**
 * processFrame() was removed. It POSTed one base64 JPEG per frame to
 * /process-frame so the server could run MediaPipe on it. Pose estimation has run in
 * the browser since; the client extracts landmarks locally and posts the numbers once
 * via finalizeAnalysis(). The endpoint is gone from the backend too - keeping it meant
 * keeping a public route that image-decoded untrusted input for nobody's benefit.
 */


/**
 * Finalize analysis, calculate metrics, and save to database
 * 
 * This is a critical operation that includes retry logic for transient failures.
 * The operation is idempotent on the backend, so retries are safe.
 * 
 * @param request - Contains sessionId, bookingId, and collected landmarks
 * @returns Complete PostureAnalysis with all 33 metrics
 * @throws Error if all retry attempts fail or error is not retryable
 */
export const finalizeAnalysis = async (
  request: FinalizeAnalysisRequest
): Promise<PostureAnalysis> => {
  return retryWithBackoff(async () => {
    const response = await apiClient.post<{ data: { analysis: PostureAnalysis; remainingCount: number } }>(
      `${POSTURE_BASE_URL}/finalize-analysis`,
      {
        ...request,
        // Re-presented because the server re-checks: an authorisation withdrawn
        // mid-capture must not still produce a stored analysis.
        screeningToken: request.screeningToken ?? currentScreeningToken(),
      }
    );
    return response.data.data.analysis;
  });
};

/**
 * Cancel analysis session without deducting screening count
 * @param request - Contains sessionId
 */
export const cancelAnalysis = async (
  request: CancelAnalysisRequest
): Promise<{ message: string }> => {
  const response = await apiClient.post<{ message: string }>(
    `${POSTURE_BASE_URL}/cancel-analysis`,
    request
  );
  return response.data;
};

/**
 * Get all user's posture assessments
 * @param params - Optional filters (bookingId, limit, offset)
 * @returns Array of PostureAnalysis objects
 */
export const getMyAssessments = async (params?: {
  bookingId?: string;
  limit?: number;
  offset?: number;
}): Promise<PostureAnalysis[]> => {
  const response = await apiClient.get<{ data: PostureAnalysis[] }>(
    `${POSTURE_BASE_URL}/my-assessments`,
    { params }
  );
  return response.data.data;
};

/**
 * Get specific analysis by ID
 * @param analysisId - UUID of the analysis
 * @returns Complete PostureAnalysis object
 */
export const getAnalysisById = async (
  analysisId: string
): Promise<PostureAnalysis> => {
  const response = await apiClient.get<{ data: PostureAnalysis }>(
    `${POSTURE_BASE_URL}/analysis/${analysisId}`
  );
  return response.data.data;
};

/**
 * Validate if booking can be used for analysis
 * @param bookingId - UUID of the booking
 * @returns Validation result with remaining counts
 */
export const validateBooking = async (
  bookingId: string
): Promise<ValidateBookingResponse> => {
  const response = await apiClient.get<{ data: ValidateBookingResponse }>(
    `${POSTURE_BASE_URL}/validate-booking/${bookingId}`
  );
  return response.data.data;
};
