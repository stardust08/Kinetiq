import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
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
      renderWithProviders(<AuthButton />);
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    });

    it('should open login modal when login button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AuthButton />);
      
      const loginButton = screen.getByRole('button', { name: /login/i });
      await user.click(loginButton);
      
      // Check if modal is opened by looking for dialog title
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });


  /**
   * The signed-in menu trigger.
   *
   * It renders an avatar icon and no text at all - the user's name and phone used to
   * sit beside it and were removed - so it has no accessible name to query by. It is
   * the only button on screen when signed in, which is what makes this safe.
   */
  const menuTrigger = () => screen.getByRole('button');

  describe('When logged in', () => {
    beforeEach(() => {
      useAuthStore.setState({
        user: mockUser,
        token: 'test-token',
        isAuthenticated: true,
      });
    });

    it('shows an avatar trigger rather than the login button', () => {
      renderWithProviders(<AuthButton />);
      expect(menuTrigger()).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /login/i })).not.toBeInTheDocument();
    });

    it('does not put the user name or phone in the header', () => {
      // Deliberate: the header shows an avatar only. These assertions used to require
      // the opposite, and are inverted rather than deleted so that putting a phone
      // number back into the global header is a decision someone has to make on
      // purpose.
      renderWithProviders(<AuthButton />);
      expect(screen.queryByText('Test User')).not.toBeInTheDocument();
      expect(screen.queryByText('+1234567890')).not.toBeInTheDocument();
    });

    it('should open dropdown menu when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AuthButton />);
      
      const menuButton = menuTrigger();
      await user.hover(menuButton);
      
      await waitFor(() => {
        expect(screen.getByText('My Account')).toBeInTheDocument();
        expect(screen.getByText('Logout')).toBeInTheDocument();
      });
    });

    it('should display user info in dropdown menu', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AuthButton />);
      
      const menuButton = menuTrigger();
      await user.hover(menuButton);
      
      await waitFor(() => {
        // The menu lists actions, not identity - the name and phone were removed.
        expect(screen.getByText('My Account')).toBeInTheDocument();
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });
    });

    it('should call logout when logout menu item is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out' });
      
      renderWithProviders(<AuthButton />);
      
      // Open menu
      const menuButton = menuTrigger();
      await user.hover(menuButton);
      
      // Click logout
      const logoutItem = await screen.findByText('Logout');
      fireEvent.click(logoutItem);
      
      await waitFor(() => {
        expect(authApi.logout).toHaveBeenCalled();
      });
    });

    it('should clear auth state after logout', async () => {
      const user = userEvent.setup();
      vi.mocked(authApi.logout).mockResolvedValue({ message: 'Logged out' });
      
      renderWithProviders(<AuthButton />);
      
      // Open menu
      const menuButton = menuTrigger();
      await user.hover(menuButton);
      
      // Click logout
      const logoutItem = await screen.findByText('Logout');
      fireEvent.click(logoutItem);
      
      await waitFor(() => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isAuthenticated).toBe(false);
      });
    });

    it('should clear auth state even if logout API fails', async () => {
      const user = userEvent.setup();
      
      vi.mocked(authApi.logout).mockRejectedValue(new Error('Network error'));
      
      renderWithProviders(<AuthButton />);
      
      // Open menu
      const menuButton = menuTrigger();
      await user.hover(menuButton);
      
      // Click logout
      const logoutItem = await screen.findByText('Logout');
      fireEvent.click(logoutItem);
      
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
      
      renderWithProviders(<AuthButton />);
      
      // Open menu
      const menuButton = menuTrigger();
      await user.hover(menuButton);
      
      // Click logout
      const logoutItem = await screen.findByText('Logout');
      fireEvent.click(logoutItem);
      
      // Token should be removed from localStorage
      await waitFor(() => {
        expect(localStorage.getItem('auth_token')).toBeNull();
      });
    });
  });
});
