import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthButton } from './AuthButton';
import { useAuthStore } from '../../store/authStore';
import * as authApi from '../../api/auth';
import type { User } from '../../types';

// Mock the auth API
vi.mock('../../api/auth');

describe('AuthButton', () => {
  const mockUser: User = {
    id: 'user-123',
    phone: '+1234567890',
    name: 'Test User',
    role: 'USER',
    status: 'ACTIVE',
    sessionCount: 0,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
    });
    vi.clearAllMocks();
  });

  describe('When logged out', () => {
    it('should show login button', () => {
      render(<AuthButton />);
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    });

    it('should open login modal when login button is clicked', async () => {
      const user = userEvent.setup();
      render(<AuthButton />);
      
      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);
      
      // Check if modal is opened by looking for dialog title
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });

  describe('When logged in', () => {
    beforeEach(() => {
      useAuthStore.setState({
        user: mockUser,
        token: 'test-token',
        isAuthenticated: true,
      });
    });

    it('should show user menu button with user name', () => {
      render(<AuthButton />);
      expect(screen.getByRole('button', { name: /test user/i })).toBeInTheDocument();
    });

    it('should show user phone if name is not available', () => {
      const userWithoutName = { ...mockUser, name: undefined };
      useAuthStore.setState({
        user: userWithoutName,
        token: 'test-token',
        isAuthenticated: true,
      });

      render(<AuthButton />);
      expect(screen.getByRole('button', { name: /\+1234567890/i })).toBeInTheDocument();
    });

    it('should open dropdown menu when clicked', async () => {
      const user = userEvent.setup();
      render(<AuthButton />);
      
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);
      
      await waitFor(() => {
        expect(screen.getByText('My Account')).toBeInTheDocument();
        expect(screen.getByText('Logout')).toBeInTheDocument();
      });
    });

    it('should display user info in dropdown menu', async () => {
      const user = userEvent.setup();
      render(<AuthButton />);
      
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);
      
      await waitFor(() => {
        expect(screen.getAllByText('Test User').length).toBeGreaterThan(0);
        expect(screen.getByText('+1234567890')).toBeInTheDocument();
      });
    });

    it('should call logout when logout menu item is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out' });
      
      render(<AuthButton />);
      
      // Open menu
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);
      
      // Click logout
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);
      
      await waitFor(() => {
        expect(authApi.logout).toHaveBeenCalled();
      });
    });

    it('should clear auth state after logout', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out' });
      
      render(<AuthButton />);
      
      // Open menu
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);
      
      // Click logout
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);
      
      await waitFor(() => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isAuthenticated).toBe(false);
      });
    });

    it('should clear auth state even if logout API fails', async () => {
      const user = userEvent.setup();
      
      // Mock logout to reject - the error will be caught by useAuth's try/finally
      vi.mocked(authApi.logout).mockRejectedValue(new Error('Network error'));
      
      render(<AuthButton />);
      
      // Open menu
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);
      
      // Click logout
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);
      
      // State should still be cleared even though API failed
      await waitFor(() => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.isAuthenticated).toBe(false);
      });
      
      // Verify logout was called
      expect(authApi.logout).toHaveBeenCalled();
    });

    it('should remove token from localStorage on logout', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out' });
      
      // Set token in localStorage
      localStorage.setItem('auth_token', 'test-token');
      
      render(<AuthButton />);
      
      // Open menu
      const menuButton = screen.getByRole('button', { name: /test user/i });
      await user.click(menuButton);
      
      // Click logout
      const logoutItem = await screen.findByText('Logout');
      await user.click(logoutItem);
      
      // Token should be removed from localStorage
      await waitFor(() => {
        expect(localStorage.getItem('auth_token')).toBeNull();
      });
    });
  });
});
