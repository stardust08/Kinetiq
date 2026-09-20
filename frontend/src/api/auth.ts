import { apiClient } from './client';
import { LoginResponse, User } from '../types';

/**
 * Auth API functions for authentication operations
 */

export interface SendOtpRequest {
  phone: string;
  type: 'LOGIN' | 'SIGNUP';
}

export interface VerifyOtpRequest {
  phone: string;
  otp: string;
}

export interface CompleteProfileRequest {
  phone: string;
  name: string;
  email?: string;
  notificationPreference?: string;
}

/**
 * Send OTP to a phone number
 * @param phone - Phone number with country code (e.g., +1234567890)
 * @param type - OTP type: LOGIN or SIGNUP
 * @returns Promise with success message
 */
export const sendOtp = async (phone: string, type: 'LOGIN' | 'SIGNUP' = 'LOGIN'): Promise<{ message: string }> => {
  const response = await apiClient.post<{ message: string }>('/api/auth/send-otp', {
    phone,
    type,
  });
  return response.data;
};

/**
 * Verify OTP and get authentication token or profile completion requirement
 * @param phone - Phone number with country code
 * @param otp - 6-digit OTP code
 * @returns Promise with token and user data OR profile completion flag
 */
export const verifyOtp = async (phone: string, otp: string): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/api/auth/verify-otp', {
    phone,
    otp,
  });
  return response.data;
};

/**
 * Complete user profile after OTP verification
 * @param data - Profile data including phone, name, and optional fields
 * @returns Promise with token and user data
 */
export const completeProfile = async (data: CompleteProfileRequest): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/api/auth/complete-profile', data);
  return response.data;
};

/**
 * Get current authenticated user information
 * @returns Promise with user data
 */
export const getCurrentUser = async (): Promise<User> => {
  const response = await apiClient.get<User>('/api/auth/me');
  return response.data;
};

/**
 * Logout current user
 * @returns Promise with success message
 */
export const logout = async (): Promise<{ message: string }> => {
  const response = await apiClient.post<{ message: string }>('/api/auth/logout');
  return response.data;
};
