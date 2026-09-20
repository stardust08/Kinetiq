import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from './client';
import MockAdapter from 'axios-mock-adapter';

describe('API Client - Token Persistence Integration', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    localStorage.clear();
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Authorization Header', () => {
    it('includes auth token from localStorage in request headers', async () => {
      const token = 'test-token-123';
      localStorage.setItem('auth_token', token);

      mock.onGet('/api/test').reply((config) => {
        expect(config.headers?.Authorization).toBe(`Bearer ${token}`);
        return [200, { success: true }];
      });

      await apiClient.get('/api/test');
    });

    it('does not include Authorization header when no token exists', async () => {
      mock.onGet('/api/test').reply((config) => {
        expect(config.headers?.Authorization).toBeUndefined();
        return [200, { success: true }];
      });

      await apiClient.get('/api/test');
    });

    it('updates Authorization header when token changes', async () => {
      const token1 = 'token-1';
      const token2 = 'token-2';

      // First request with token1
      localStorage.setItem('auth_token', token1);
      mock.onGet('/api/test1').reply((config) => {
        expect(config.headers?.Authorization).toBe(`Bearer ${token1}`);
        return [200, { success: true }];
      });
      await apiClient.get('/api/test1');

      // Second request with token2
      localStorage.setItem('auth_token', token2);
      mock.onGet('/api/test2').reply((config) => {
        expect(config.headers?.Authorization).toBe(`Bearer ${token2}`);
        return [200, { success: true }];
      });
      await apiClient.get('/api/test2');
    });

    it('removes Authorization header after token is cleared', async () => {
      const token = 'test-token';
      localStorage.setItem('auth_token', token);

      // First request with token
      mock.onGet('/api/test1').reply((config) => {
        expect(config.headers?.Authorization).toBe(`Bearer ${token}`);
        return [200, { success: true }];
      });
      await apiClient.get('/api/test1');

      // Clear token
      localStorage.removeItem('auth_token');

      // Second request without token
      mock.onGet('/api/test2').reply((config) => {
        expect(config.headers?.Authorization).toBeUndefined();
        return [200, { success: true }];
      });
      await apiClient.get('/api/test2');
    });
  });

  describe('401 Unauthorized Handling', () => {
    it('clears token from localStorage on 401 response', async () => {
      const token = 'expired-token';
      localStorage.setItem('auth_token', token);

      // Mock window.location.href
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { ...originalLocation, href: '' } as any;

      mock.onGet('/api/protected').reply(401, { message: 'Unauthorized' });

      try {
        await apiClient.get('/api/protected');
      } catch (error) {
        // Expected to fail
      }

      expect(localStorage.getItem('auth_token')).toBeNull();

      // Restore window.location
      window.location = originalLocation;
    });

    it('redirects to /login on 401 response', async () => {
      const token = 'expired-token';
      localStorage.setItem('auth_token', token);

      // Mock window.location.href
      const originalLocation = window.location;
      delete (window as any).location;
      const mockLocation = { ...originalLocation, href: '' };
      window.location = mockLocation as any;

      mock.onGet('/api/protected').reply(401, { message: 'Unauthorized' });

      try {
        await apiClient.get('/api/protected');
      } catch (error) {
        // Expected to fail
      }

      expect(mockLocation.href).toBe('/login');

      // Restore window.location
      window.location = originalLocation;
    });
  });

  describe('Token Persistence Across Requests', () => {
    it('uses persisted token for multiple sequential requests', async () => {
      const token = 'persistent-token';
      localStorage.setItem('auth_token', token);

      // Setup multiple endpoints
      mock.onGet('/api/user').reply((config) => {
        expect(config.headers?.Authorization).toBe(`Bearer ${token}`);
        return [200, { id: '1', name: 'Test User' }];
      });

      mock.onGet('/api/posts').reply((config) => {
        expect(config.headers?.Authorization).toBe(`Bearer ${token}`);
        return [200, [{ id: '1', title: 'Post 1' }]];
      });

      mock.onPost('/api/comments').reply((config) => {
        expect(config.headers?.Authorization).toBe(`Bearer ${token}`);
        return [201, { id: '1', text: 'Comment' }];
      });

      // Make multiple requests
      await apiClient.get('/api/user');
      await apiClient.get('/api/posts');
      await apiClient.post('/api/comments', { text: 'Comment' });
    });

    it('maintains token across different HTTP methods', async () => {
      const token = 'test-token';
      localStorage.setItem('auth_token', token);

      const verifyToken = (config: any) => {
        expect(config.headers?.Authorization).toBe(`Bearer ${token}`);
        return [200, { success: true }];
      };

      mock.onGet('/api/test').reply(verifyToken);
      mock.onPost('/api/test').reply(verifyToken);
      mock.onPut('/api/test').reply(verifyToken);
      mock.onDelete('/api/test').reply(verifyToken);
      mock.onPatch('/api/test').reply(verifyToken);

      await apiClient.get('/api/test');
      await apiClient.post('/api/test', {});
      await apiClient.put('/api/test', {});
      await apiClient.delete('/api/test');
      await apiClient.patch('/api/test', {});
    });
  });
});
