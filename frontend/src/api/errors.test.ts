import { describe, it, expect } from 'vitest';
import {
  ApiError,
  NetworkError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ServerError,
  isRetryableError,
  getErrorMessage,
} from './errors';

describe('API Error Classes', () => {
  describe('ApiError', () => {
    it('should create an ApiError with all properties', () => {
      const error = new ApiError('Test error', 400, 'TEST_ERROR', { detail: 'test' });
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.name).toBe('ApiError');
    });

    it('should create an ApiError with minimal properties', () => {
      const error = new ApiError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBeUndefined();
      expect(error.code).toBeUndefined();
      expect(error.details).toBeUndefined();
    });
  });

  describe('NetworkError', () => {
    it('should create a NetworkError with default message', () => {
      const error = new NetworkError();
      
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(NetworkError);
      expect(error.message).toBe('Network error. Please check your connection and try again.');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.name).toBe('NetworkError');
    });

    it('should create a NetworkError with custom message', () => {
      const error = new NetworkError('Custom network error');
      
      expect(error.message).toBe('Custom network error');
      expect(error.code).toBe('NETWORK_ERROR');
    });

    it('should include details', () => {
      const details = { originalError: 'timeout' };
      const error = new NetworkError('Timeout', details);
      
      expect(error.details).toEqual(details);
    });
  });

  describe('AuthenticationError', () => {
    it('should create an AuthenticationError with default message', () => {
      const error = new AuthenticationError();
      
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toBe('Authentication failed. Please log in again.');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.name).toBe('AuthenticationError');
    });

    it('should create an AuthenticationError with custom message', () => {
      const error = new AuthenticationError('Token expired');
      
      expect(error.message).toBe('Token expired');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('ValidationError', () => {
    it('should create a ValidationError with default message', () => {
      const error = new ValidationError();
      
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid request data.');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('should create a ValidationError with custom message', () => {
      const error = new ValidationError('Booking ID is required');
      
      expect(error.message).toBe('Booking ID is required');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('NotFoundError', () => {
    it('should create a NotFoundError with default message', () => {
      const error = new NotFoundError();
      
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Resource not found.');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
    });

    it('should create a NotFoundError with custom message', () => {
      const error = new NotFoundError('Booking not found');
      
      expect(error.message).toBe('Booking not found');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('ServerError', () => {
    it('should create a ServerError with default message', () => {
      const error = new ServerError();
      
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(ServerError);
      expect(error.message).toBe('Server error. Please try again later.');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('SERVER_ERROR');
      expect(error.name).toBe('ServerError');
    });

    it('should create a ServerError with custom message', () => {
      const error = new ServerError('Database connection failed');
      
      expect(error.message).toBe('Database connection failed');
      expect(error.statusCode).toBe(500);
    });
  });
});

describe('isRetryableError', () => {
  it('should return true for NetworkError', () => {
    const error = new NetworkError();
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for 5xx errors', () => {
    expect(isRetryableError(new ServerError())).toBe(true);
    expect(isRetryableError(new ApiError('Error', 502))).toBe(true);
    expect(isRetryableError(new ApiError('Error', 503))).toBe(true);
    expect(isRetryableError(new ApiError('Error', 504))).toBe(true);
  });

  it('should return true for 408 timeout error', () => {
    const error = new ApiError('Timeout', 408);
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return false for 4xx client errors', () => {
    expect(isRetryableError(new ValidationError())).toBe(false);
    expect(isRetryableError(new AuthenticationError())).toBe(false);
    expect(isRetryableError(new NotFoundError())).toBe(false);
    expect(isRetryableError(new ApiError('Error', 403))).toBe(false);
  });

  it('should return false for non-ApiError errors', () => {
    expect(isRetryableError(new Error('Generic error'))).toBe(false);
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('should return message from ApiError', () => {
    const error = new ValidationError('Invalid booking ID');
    expect(getErrorMessage(error)).toBe('Invalid booking ID');
  });

  it('should return message from generic Error', () => {
    const error = new Error('Generic error');
    expect(getErrorMessage(error)).toBe('Generic error');
  });

  it('should return default message for unknown error types', () => {
    expect(getErrorMessage('string error')).toBe('An unexpected error occurred. Please try again.');
    expect(getErrorMessage(null)).toBe('An unexpected error occurred. Please try again.');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred. Please try again.');
    expect(getErrorMessage({ unknown: 'object' })).toBe('An unexpected error occurred. Please try again.');
  });

  it('should handle NetworkError', () => {
    const error = new NetworkError('Connection timeout');
    expect(getErrorMessage(error)).toBe('Connection timeout');
  });

  it('should handle ServerError', () => {
    const error = new ServerError('Internal server error');
    expect(getErrorMessage(error)).toBe('Internal server error');
  });
});
