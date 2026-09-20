import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import * as authApi from '../api/auth';
import type { User } from '../types';

/**
 * Custom hook for authentication operations
 * Provides login, logout, and user state management
 */
export const useAuth = () => {
  const { user, token, isAuthenticated, login: storeLogin, logout: storeLogout } = useAuthStore();

  /**
   * Send OTP to phone number
   * @param phone - Phone number with country code
   * @param type - OTP type: LOGIN or SIGNUP
   */
  const sendOtp = useCallback(async (phone: string, type: 'LOGIN' | 'SIGNUP' = 'LOGIN') => {
    return await authApi.sendOtp(phone, type);
  }, []);

  /**
   * Verify OTP and login user
   * @param phone - Phone number with country code
   * @param otp - 6-digit OTP code
   */
  const verifyOtp = useCallback(async (phone: string, otp: string) => {
    const response = await authApi.verifyOtp(phone, otp);
    // token and user are null when the API answers `requiresProfileCompletion` - the
    // OTP was right, but there is no session yet. This logged in unconditionally, so
    // that branch stored a null token and left the app believing it was authenticated.
    // The caller inspects `requiresProfileCompletion` and routes accordingly.
    if (response.token && response.user) {
      storeLogin(response.token, response.user);
    }
    return response;
  }, [storeLogin]);

  /**
   * Get current user information
   */
  const getCurrentUser = useCallback(async () => {
    return await authApi.getCurrentUser();
  }, []);

  /**
   * Logout user
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Always clear local state even if API call fails
      storeLogout();
    }
  }, [storeLogout]);

  return {
    // State
    user,
    token,
    isAuthenticated,
    
    // Actions
    sendOtp,
    verifyOtp,
    getCurrentUser,
    logout,
  };
};
