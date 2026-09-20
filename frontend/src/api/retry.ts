import { isRetryableError } from './errors';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Function to determine if error should be retried (default: isRetryableError) */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  shouldRetry: isRetryableError,
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number
): number {
  const delay = initialDelay * Math.pow(backoffMultiplier, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Async function to retry
 * @param options - Retry configuration options
 * @returns Promise with the result of the function
 * @throws The last error if all retries fail
 * 
 * @example
 * ```typescript
 * const data = await withRetry(
 *   () => apiClient.get('/api/bookings'),
 *   { maxRetries: 3, initialDelay: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt === config.maxRetries) {
        break;
      }

      // Check if error should be retried
      if (!config.shouldRetry(error)) {
        throw error;
      }

      // Calculate delay and wait before retrying
      const delay = calculateDelay(
        attempt,
        config.initialDelay,
        config.maxDelay,
        config.backoffMultiplier
      );

      console.warn(
        `Request failed (attempt ${attempt + 1}/${config.maxRetries + 1}). ` +
        `Retrying in ${delay}ms...`,
        error
      );

      await sleep(delay);
    }
  }

  // All retries exhausted, throw the last error
  throw lastError;
}
