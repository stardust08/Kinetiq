import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendOtp, verifyOtp, getCurrentUser, logout } from './auth';
import { apiClient } from './client';

vi.mock('./client');

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendOtp', () => {
    it('should send OTP successfully', async () => {
      const mockResponse = { data: { message: 'OTP sent successfully' } };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      const result = await sendOtp('+1234567890', 'LOGIN');

      expect(apiClient.post).toHaveBeenCalledWith('/auth/send-otp', {
        phone: '+1234567890',
        type: 'LOGIN',
      });
      expect(result).toEqual({ message: 'OTP sent successfully' });
    });

    it('should default to LOGIN type', async () => {
      const mockResponse = { data: { message: 'OTP sent successfully' } };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      await sendOtp('+1234567890');

      expect(apiClient.post).toHaveBeenCalledWith('/auth/send-otp', {
        phone: '+1234567890',
        type: 'LOGIN',
      });
    });
  });

  describe('verifyOtp', () => {
    it('should verify OTP and return token and user', async () => {
      const mockResponse = {
        data: {
          token: 'test-token',
          user: {
            id: 'user-1',
            phone: '+1234567890',
            role: 'USER' as const,
            status: 'ACTIVE' as const,
            sessionCount: 0,
            createdAt: '2024-01-01T00:00:00Z',
          },
        },
      };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      const result = await verifyOtp('+1234567890', '123456');

      expect(apiClient.post).toHaveBeenCalledWith('/auth/verify-otp', {
        phone: '+1234567890',
        otp: '123456',
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getCurrentUser', () => {
    it('should get current user information', async () => {
      const mockUser = {
        id: 'user-1',
        phone: '+1234567890',
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER' as const,
        status: 'ACTIVE' as const,
        sessionCount: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const mockResponse = { data: mockUser };
      vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

      const result = await getCurrentUser();

      expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
      expect(result).toEqual(mockUser);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockResponse = { data: { message: 'Logged out successfully' } };
      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      const result = await logout();

      expect(apiClient.post).toHaveBeenCalledWith('/auth/logout');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
