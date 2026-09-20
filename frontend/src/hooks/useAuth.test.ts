import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';
import { useAuthStore } from '../store/authStore';
import * as authApi from '../api/auth';

// Mock the auth API
vi.mock('../api/auth');

describe('useAuth', () => {
  beforeEach(() => {
    // Clear store state before each test
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
    });
    vi.clearAllMocks();
  });

  it('should return initial unauthenticated state', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should send OTP', async () => {
    const mockResponse = { message: 'OTP sent successfully' };
    vi.mocked(authApi.sendOtp).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const response = await result.current.sendOtp('+1234567890', 'LOGIN');
      expect(response).toEqual(mockResponse);
    });

    expect(authApi.sendOtp).toHaveBeenCalledWith('+1234567890', 'LOGIN');
  });

  it('should verify OTP and login user', async () => {
    const mockUser = {
      id: 'user-1',
      phone: '+1234567890',
      role: 'USER' as const,
      status: 'ACTIVE' as const,
      sessionCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };
    const mockResponse = {
      token: 'test-token',
      user: mockUser,
    };
    vi.mocked(authApi.verifyOtp).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const response = await result.current.verifyOtp('+1234567890', '123456');
      expect(response).toEqual(mockResponse);
    });

    expect(authApi.verifyOtp).toHaveBeenCalledWith('+1234567890', '123456');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.token).toBe('test-token');
  });

  it('should get current user', async () => {
    const mockUser = {
      id: 'user-1',
      phone: '+1234567890',
      role: 'USER' as const,
      status: 'ACTIVE' as const,
      sessionCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };
    vi.mocked(authApi.getCurrentUser).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const user = await result.current.getCurrentUser();
      expect(user).toEqual(mockUser);
    });

    expect(authApi.getCurrentUser).toHaveBeenCalled();
  });

  it('should logout user', async () => {
    const mockUser = {
      id: 'user-1',
      phone: '+1234567890',
      role: 'USER' as const,
      status: 'ACTIVE' as const,
      sessionCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };
    
    // Set initial authenticated state
    useAuthStore.setState({
      user: mockUser,
      token: 'test-token',
      isAuthenticated: true,
    });

    vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out successfully' });

    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(authApi.logout).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it('should logout user even if API call fails', async () => {
    const mockUser = {
      id: 'user-1',
      phone: '+1234567890',
      role: 'USER' as const,
      status: 'ACTIVE' as const,
      sessionCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };
    
    // Set initial authenticated state
    useAuthStore.setState({
      user: mockUser,
      token: 'test-token',
      isAuthenticated: true,
    });

    vi.mocked(authApi.logout).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      try {
        await result.current.logout();
      } catch (error) {
        // Error is expected but should not prevent logout
      }
    });

    // Should still clear local state even if API fails
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });
});
