import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthButton } from '../layout/AuthButton';
import { useAuthStore } from '../../store/authStore';
import * as authApi from '../../api/auth';
import type { User } from '../../types';

// Mock the auth API
vi.mock('../../api/auth');

describe('Logout Flow Integration', () => {
  const mockUser: User = {
    id: 'user-123',
    phone: '+1234567890',
    name: 'Test User',
    role: 'USER',
    status: 'ACTIVE',
    sessionCount: 1,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Complete logout flow', () => {
    it('should clear auth state, remove token, and update UI on successful logout', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out successfully' });

      // Set up authenticated state
      localStorage.setItem('auth_token', 'test-token-123');
      useAuthStore.setState({
        user: mockUser,
        token: 'test-token-123',
        isAuthenticated: true,
      });

      render(<AuthButton />);

      // Verify user is logged in
      expect(screen.getByRole('button', { name: /test user/i })).toBeInTheDocument();
      expect(localStorage.getItem('auth_token')).toBe('test-token-123');

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);

      // Click logout
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);

      // Verify API was called
      await waitFor(() => {
        expect(authApi.logout).toHaveBeenCalledTimes(1);
      });

      // Verify auth state is cleared
      await waitFor(() => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isAuthenticated).toBe(false);
      });

      // Verify token is removed from localStorage
      expect(localStorage.getItem('auth_token')).toBeNull();

      // Verify UI updates to show login button
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /test user/i })).not.toBeInTheDocument();
      });
    });

    it('should clear local state even if logout API call fails', async () => {
      const user = userEvent.setup();
      
      // Mock console.error to suppress error output in tests
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Create a rejected promise that will be caught by useAuth
      vi.mocked(authApi.logout).mockRejectedValue(new Error('Network error'));

      // Set up authenticated state
      localStorage.setItem('auth_token', 'test-token-123');
      useAuthStore.setState({
        user: mockUser,
        token: 'test-token-123',
        isAuthenticated: true,
      });

      render(<AuthButton />);

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);

      // Click logout
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);

      // Verify API was called
      await waitFor(() => {
        expect(authApi.logout).toHaveBeenCalledTimes(1);
      });

      // Verify auth state is still cleared despite API failure
      await waitFor(() => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isAuthenticated).toBe(false);
      });

      // Verify token is removed from localStorage
      expect(localStorage.getItem('auth_token')).toBeNull();

      // Verify UI updates to show login button
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
      });
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle logout with user having no name', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out successfully' });

      const userWithoutName = { ...mockUser, name: undefined };
      localStorage.setItem('auth_token', 'test-token-123');
      useAuthStore.setState({
        user: userWithoutName,
        token: 'test-token-123',
        isAuthenticated: true,
      });

      render(<AuthButton />);

      // Verify user is logged in (showing phone number)
      expect(screen.getByRole('button', { name: /\+1234567890/i })).toBeInTheDocument();

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /\+1234567890/i });
      await user.click(menuButton);

      // Click logout
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);

      // Verify complete logout
      await waitFor(() => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
        expect(localStorage.getItem('auth_token')).toBeNull();
        expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
      });
    });

    it('should complete logout successfully with API call', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out successfully' });

      localStorage.setItem('auth_token', 'test-token-123');
      useAuthStore.setState({
        user: mockUser,
        token: 'test-token-123',
        isAuthenticated: true,
      });

      render(<AuthButton />);

      // Open dropdown menu
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);

      // Click logout
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);

      // Verify logout completes
      await waitFor(() => {
        expect(authApi.logout).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
      });
    });
  });

  describe('Auth state persistence', () => {
    it('should not restore auth state after logout on page reload', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out successfully' });

      // Set up authenticated state
      localStorage.setItem('auth_token', 'test-token-123');
      useAuthStore.setState({
        user: mockUser,
        token: 'test-token-123',
        isAuthenticated: true,
      });

      const { unmount } = render(<AuthButton />);

      // Perform logout
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);

      // Wait for logout to complete
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
      });

      // Verify localStorage is cleared
      expect(localStorage.getItem('auth_token')).toBeNull();

      // Unmount and remount to simulate page reload
      unmount();
      
      // Reset store to simulate fresh page load
      useAuthStore.setState({
        user: null,
        token: null,
        isAuthenticated: false,
      });

      render(<AuthButton />);

      // Verify user is still logged out
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /test user/i })).not.toBeInTheDocument();
    });
  });

  describe('Token cleanup', () => {
    it('should remove auth_token from localStorage on logout', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out successfully' });

      // Set token in localStorage
      localStorage.setItem('auth_token', 'test-token-123');
      useAuthStore.setState({
        user: mockUser,
        token: 'test-token-123',
        isAuthenticated: true,
      });

      render(<AuthButton />);

      // Verify token exists
      expect(localStorage.getItem('auth_token')).toBe('test-token-123');

      // Perform logout
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);

      // Verify token is removed
      await waitFor(() => {
        expect(localStorage.getItem('auth_token')).toBeNull();
      });
    });

    it('should clear token even if it was manually modified', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out successfully' });

      // Set different token in localStorage than in store
      localStorage.setItem('auth_token', 'different-token');
      useAuthStore.setState({
        user: mockUser,
        token: 'test-token-123',
        isAuthenticated: true,
      });

      render(<AuthButton />);

      // Perform logout
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);

      // Verify token is removed regardless of mismatch
      await waitFor(() => {
        expect(localStorage.getItem('auth_token')).toBeNull();
      });
    });
  });
});
