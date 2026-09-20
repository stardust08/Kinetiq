import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry';
import { NetworkError, ServerError, ValidationError, ApiError } from './errors';

describe('withRetry', () => {
  it('should return result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    
    const result = await withRetry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on NetworkError', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce('success');
    
    const result = await withRetry(fn, { maxRetries: 2, initialDelay: 10 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on ServerError (5xx)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new ServerError())
      .mockResolvedValueOnce('success');
    
    const result = await withRetry(fn, { maxRetries: 2, initialDelay: 10 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on ValidationError (4xx)', async () => {
    const error = new ValidationError('Invalid data');
    const fn = vi.fn().mockRejectedValue(error);
    
    await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow(ValidationError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw error after max retries exhausted', async () => {
    const error = new NetworkError('Connection failed');
    const fn = vi.fn().mockRejectedValue(error);
    
    await expect(withRetry(fn, { maxRetries: 2, initialDelay: 10 })).rejects.toThrow(NetworkError);
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should use exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce('success');
    
    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelay: 10,
      backoffMultiplier: 2,
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect maxDelay', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce('success');
    
    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelay: 10,
      backoffMultiplier: 10,
      maxDelay: 20,
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use custom shouldRetry function', async () => {
    const customError = new Error('Custom error');
    const fn = vi.fn()
      .mockRejectedValueOnce(customError)
      .mockResolvedValueOnce('success');
    
    const shouldRetry = vi.fn().mockReturnValue(true);
    
    const result = await withRetry(fn, {
      maxRetries: 2,
      initialDelay: 10,
      shouldRetry,
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(shouldRetry).toHaveBeenCalledWith(customError);
  });

  it('should not retry when custom shouldRetry returns false', async () => {
    const error = new NetworkError();
    const fn = vi.fn().mockRejectedValue(error);
    
    const shouldRetry = vi.fn().mockReturnValue(false);
    
    await expect(
      withRetry(fn, { maxRetries: 2, shouldRetry })
    ).rejects.toThrow(NetworkError);
    
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(error);
  });

  it('should handle 408 timeout errors as retryable', async () => {
    const error = new ApiError('Request timeout', 408);
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success');
    
    const result = await withRetry(fn, { maxRetries: 2, initialDelay: 10 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should log retry attempts', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new NetworkError('Connection failed');
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('success');
    
    await withRetry(fn, { maxRetries: 2, initialDelay: 10 });
    
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Request failed (attempt 1/3)'),
      error
    );
    
    consoleWarnSpy.mockRestore();
  });

  it('should work with default options', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce('success');
    
    const result = await withRetry(fn);
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should handle multiple consecutive failures', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(new ServerError())
      .mockRejectedValueOnce(new ApiError('Error', 503))
      .mockResolvedValueOnce('success');
    
    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelay: 10,
      backoffMultiplier: 2,
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
