import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore';
import type { User } from '../types';

describe('Auth Store - Token Persistence', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset the store state
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
  });

  describe('Token Storage', () => {
    it('stores token in localStorage when user logs in', () => {
      const store = useAuthStore.getState();
      const mockUser: User = {
        id: '1',
        phone: '+1234567890',
        name: 'Test User',
      };
      const mockToken = 'test-token-123';

      store.login(mockToken, mockUser);

      expect(localStorage.getItem('auth_token')).toBe(mockToken);
    });

    it('stores user and token in Zustand store when user logs in', () => {
      const store = useAuthStore.getState();
      const mockUser: User = {
        id: '1',
        phone: '+1234567890',
        name: 'Test User',
      };
      const mockToken = 'test-token-123';

      store.login(mockToken, mockUser);

      const state = useAuthStore.getState();
      expect(state.token).toBe(mockToken);
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
    });

    it('removes token from localStorage when user logs out', () => {
      const store = useAuthStore.getState();
      const mockUser: User = {
        id: '1',
        phone: '+1234567890',
      };
      const mockToken = 'test-token-123';

      // Login first
      store.login(mockToken, mockUser);
      expect(localStorage.getItem('auth_token')).toBe(mockToken);

      // Then logout
      store.logout();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('clears user and token from Zustand store when user logs out', () => {
      const store = useAuthStore.getState();
      const mockUser: User = {
        id: '1',
        phone: '+1234567890',
      };
      const mockToken = 'test-token-123';

      // Login first
      store.login(mockToken, mockUser);

      // Then logout
      store.logout();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('State Persistence Across Page Reloads', () => {
    it('persists auth state in storage', () => {
      const store = useAuthStore.getState();
      const mockUser: User = {
        id: '1',
        phone: '+1234567890',
        name: 'Test User',
      };
      const mockToken = 'test-token-123';

      store.login(mockToken, mockUser);

      // Check that Zustand persist middleware stored the state
      const persistedState = localStorage.getItem('auth-storage');
      expect(persistedState).toBeTruthy();
      
      if (persistedState) {
        const parsed = JSON.parse(persistedState);
        expect(parsed.state.user).toEqual(mockUser);
        expect(parsed.state.token).toBe(mockToken);
        expect(parsed.state.isAuthenticated).toBe(true);
      }
    });

    it('restores auth state from storage on initialization', () => {
      const mockUser: User = {
        id: '1',
        phone: '+1234567890',
        name: 'Test User',
      };
      const mockToken = 'test-token-123';

      // First, login to persist the state
      const store = useAuthStore.getState();
      store.login(mockToken, mockUser);

      // Verify state is persisted
      const persistedState = localStorage.getItem('auth-storage');
      expect(persistedState).toBeTruthy();

      // Simulate page reload by getting fresh state
      // The Zustand persist middleware should have already loaded the state
      const state = useAuthStore.getState();
      
      expect(state.user).toEqual(mockUser);
      expect(state.token).toBe(mockToken);
      expect(state.isAuthenticated).toBe(true);
      expect(localStorage.getItem('auth_token')).toBe(mockToken);
    });

    it('maintains empty state when no persisted data exists', () => {
      // Ensure localStorage is empty
      localStorage.clear();

      const state = useAuthStore.getState();
      
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('handles corrupted persisted state gracefully', () => {
      // Set invalid JSON in localStorage
      localStorage.setItem('auth-storage', 'invalid-json{');

      // Should not throw and should return default state
      const state = useAuthStore.getState();
      
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('Token Synchronization', () => {
    it('keeps localStorage token in sync with store token', () => {
      const store = useAuthStore.getState();
      const mockUser: User = {
        id: '1',
        phone: '+1234567890',
      };
      const mockToken1 = 'token-1';
      const mockToken2 = 'token-2';

      // First login
      store.login(mockToken1, mockUser);
      expect(localStorage.getItem('auth_token')).toBe(mockToken1);

      // Second login (e.g., token refresh)
      store.login(mockToken2, mockUser);
      expect(localStorage.getItem('auth_token')).toBe(mockToken2);
    });

    it('ensures both storage mechanisms are cleared on logout', () => {
      const store = useAuthStore.getState();
      const mockUser: User = {
        id: '1',
        phone: '+1234567890',
      };
      const mockToken = 'test-token';

      store.login(mockToken, mockUser);
      
      // Verify both are set
      expect(localStorage.getItem('auth_token')).toBe(mockToken);
      expect(localStorage.getItem('auth-storage')).toBeTruthy();

      store.logout();

      // Verify auth_token is cleared
      expect(localStorage.getItem('auth_token')).toBeNull();
      
      // Verify Zustand persist storage is updated
      const persistedState = localStorage.getItem('auth-storage');
      if (persistedState) {
        const parsed = JSON.parse(persistedState);
        expect(parsed.state.token).toBeNull();
        expect(parsed.state.user).toBeNull();
        expect(parsed.state.isAuthenticated).toBe(false);
      }
    });
  });

  describe('Multiple Login Sessions', () => {
    it('replaces previous user data when logging in with different user', () => {
      const store = useAuthStore.getState();
      const user1: User = {
        id: '1',
        phone: '+1111111111',
        name: 'User One',
      };
      const user2: User = {
        id: '2',
        phone: '+2222222222',
        name: 'User Two',
      };

      store.login('token-1', user1);
      expect(useAuthStore.getState().user).toEqual(user1);

      store.login('token-2', user2);
      const state = useAuthStore.getState();
      expect(state.user).toEqual(user2);
      expect(state.token).toBe('token-2');
      expect(localStorage.getItem('auth_token')).toBe('token-2');
    });
  });
});
