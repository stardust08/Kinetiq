import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  ApiError,
  NetworkError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ServerError,
} from './errors';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Default timeout for most requests
const DEFAULT_TIMEOUT = 30000; // 30 seconds

// Extended timeout for long-running operations (frame processing, analysis)
const EXTENDED_TIMEOUT = 60000; // 60 seconds

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: DEFAULT_TIMEOUT,
});

// Request interceptor - add auth token and adjust timeout for specific endpoints
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Use extended timeout for frame processing and finalization (only if not already set)
    if (config.url?.includes('/process-frame') || config.url?.includes('/finalize-analysis')) {
      if (!config.timeout || config.timeout <= EXTENDED_TIMEOUT) {
        config.timeout = EXTENDED_TIMEOUT;
      }
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(new NetworkError('Failed to send request', error));
  }
);

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Network errors (no response from server)
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        // Provide context-specific timeout messages
        const isFrameProcessing = error.config?.url?.includes('/process-frame');
        const isFinalization = error.config?.url?.includes('/finalize-analysis');
        
        let timeoutMessage = 'Request timeout. Please check your connection and try again.';
        if (isFrameProcessing) {
          timeoutMessage = 'Frame processing timeout. The server may be busy. Please try again.';
        } else if (isFinalization) {
          timeoutMessage = 'Analysis finalization timeout. Your data is being processed. Please wait a moment and check your assessment history.';
        }
        
        return Promise.reject(
          new NetworkError(timeoutMessage, error)
        );
      }
      return Promise.reject(
        new NetworkError('Network error. Please check your connection and try again.', error)
      );
    }

    // Extract error message from response
    const responseData = error.response.data as { message?: string; detail?: string; error?: string };
    const errorMessage = responseData?.message || responseData?.error || responseData?.detail || error.message;

    // Handle different status codes
    switch (error.response.status) {
      case 401:
        // Clear auth token but don't auto-redirect for cart requests
        // Cart can be accessed without auth (empty cart)
        const isCartRequest = error.config?.url?.includes('/cart');
        
        localStorage.removeItem('auth_token');
        
        // Only redirect if not a cart request and not already on login page
        if (!isCartRequest && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        
        return Promise.reject(
          new AuthenticationError(errorMessage || 'Authentication failed. Please log in again.', error)
        );

      case 400:
        // Provide context-specific validation messages
        let validationMessage = errorMessage || 'Invalid request data.';
        if (error.config?.url?.includes('/start-analysis')) {
          validationMessage = errorMessage || 'Unable to start analysis. Please check your booking has remaining screening counts.';
        } else if (error.config?.url?.includes('/process-frame')) {
          validationMessage = errorMessage || 'Invalid frame data. Please ensure your camera is working properly.';
        } else if (error.config?.url?.includes('/finalize-analysis')) {
          validationMessage = errorMessage || 'Unable to complete analysis. Please ensure all frames were captured correctly.';
        }
        
        return Promise.reject(
          new ValidationError(validationMessage, error)
        );

      case 404:
        return Promise.reject(
          new NotFoundError(errorMessage || 'Resource not found.', error)
        );

      case 403:
        return Promise.reject(
          new ApiError(errorMessage || 'Access denied.', 403, 'FORBIDDEN', error)
        );

      case 409:
        return Promise.reject(
          new ApiError(errorMessage || 'Conflict. Resource already exists.', 409, 'CONFLICT', error)
        );

      case 422:
        return Promise.reject(
          new ValidationError(errorMessage || 'Validation failed.', error)
        );

      case 429:
        return Promise.reject(
          new ApiError(errorMessage || 'Too many requests. Please try again later.', 429, 'RATE_LIMIT', error)
        );

      case 500:
      case 502:
      case 503:
      case 504:
        // Provide context-specific server error messages
        let serverErrorMessage = errorMessage || 'Server error. Please try again later.';
        if (error.config?.url?.includes('/process-frame')) {
          serverErrorMessage = errorMessage || 'Frame processing failed on server. This is usually temporary. Please try again.';
        } else if (error.config?.url?.includes('/finalize-analysis')) {
          serverErrorMessage = errorMessage || 'Analysis calculation failed. Please try starting a new analysis.';
        }
        
        return Promise.reject(
          new ServerError(serverErrorMessage, error)
        );

      default:
        return Promise.reject(
          new ApiError(errorMessage || 'An unexpected error occurred.', error.response.status, 'UNKNOWN', error)
        );
    }
  }
);
