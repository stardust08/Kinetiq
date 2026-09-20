/**
 * Custom error classes for API error handling
 */

/**
 * Base API error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Network error - connection issues, timeouts, etc.
 */
export class NetworkError extends ApiError {
  constructor(message: string = 'Network error. Please check your connection and try again.', details?: unknown) {
    super(message, undefined, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Authentication error - invalid or expired token
 */
export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed. Please log in again.', details?: unknown) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Validation error - invalid request data
 */
export class ValidationError extends ApiError {
  constructor(message: string = 'Invalid request data.', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Not found error - resource doesn't exist
 */
export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found.', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Server error - internal server error
 */
export class ServerError extends ApiError {
  constructor(message: string = 'Server error. Please try again later.', details?: unknown) {
    super(message, 500, 'SERVER_ERROR', details);
    this.name = 'ServerError';
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }
  
  if (error instanceof ApiError) {
    // Retry on 5xx errors and 408 (timeout)
    return (error.statusCode !== undefined && 
            (error.statusCode >= 500 || error.statusCode === 408));
  }
  
  return false;
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred. Please try again.';
}
