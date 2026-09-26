/**
 * Tests for the role-based route guard.
 *
 * Three outcomes, and conflating any two of them produces a confusing app:
 * not signed in goes to the landing page; signed in with the wrong role goes to that
 * user's OWN home, not a dead end; the right role goes through.
 *
 * This is a convenience, not a security boundary - every endpoint behind these pages
 * re-checks the role server-side - so what is asserted here is navigation, not access.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { RoleRoute } from './Router';
import { useAuthStore } from '../store/authStore';
import { ROLE } from '../types/roles';
import type { User } from '../types';

const asUser = (role: string): User =>
  ({
    id: 'u1',
    name: 'Test',
    phone: '+910000000000',
    role: role as User['role'],
    status: 'ACTIVE',
    sessionCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
  }) as User;

function renderAt(path: string, allow: readonly string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>public landing</div>} />
        <Route path="/admin" element={<div>admin home</div>} />
        <Route path="/clinician" element={<div>clinician home</div>} />
        <Route
          path="/guarded"
          element={
            <RoleRoute allow={allow as never}>
              <div>guarded content</div>
            </RoleRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
});

describe('RoleRoute', () => {
  it('sends an anonymous visitor to the landing page', () => {
    renderAt('/guarded', [ROLE.ADMIN]);
    expect(screen.getByText('public landing')).toBeInTheDocument();
    expect(screen.queryByText('guarded content')).not.toBeInTheDocument();
  });

  it('lets an allowed role through', () => {
    useAuthStore.setState({
      user: asUser(ROLE.ADMIN),
      token: 't',
      isAuthenticated: true,
    });
    renderAt('/guarded', [ROLE.ADMIN]);
    expect(screen.getByText('guarded content')).toBeInTheDocument();
  });

  it('sends a signed-in user with the wrong role to their own home, not a dead end', () => {
    // A patient who follows a link to /admin has done nothing wrong.
    useAuthStore.setState({
      user: asUser(ROLE.CLINICIAN),
      token: 't',
      isAuthenticated: true,
    });
    renderAt('/guarded', [ROLE.ADMIN]);
    expect(screen.getByText('clinician home')).toBeInTheDocument();
    expect(screen.queryByText('guarded content')).not.toBeInTheDocument();
  });

  it('sends a patient with the wrong role to the public home', () => {
    useAuthStore.setState({
      user: asUser(ROLE.PATIENT),
      token: 't',
      isAuthenticated: true,
    });
    renderAt('/guarded', [ROLE.ADMIN]);
    expect(screen.getByText('public landing')).toBeInTheDocument();
  });

  it('admits any of several allowed roles', () => {
    for (const role of [ROLE.CLINICIAN, ROLE.ADMIN]) {
      useAuthStore.setState({
        user: asUser(role),
        token: 't',
        isAuthenticated: true,
      });
      const { unmount } = renderAt('/guarded', [ROLE.CLINICIAN, ROLE.ADMIN]);
      expect(screen.getByText('guarded content')).toBeInTheDocument();
      unmount();
    }
  });

  it('refuses a user whose role is missing', () => {
    // Fail closed: an authenticated session with no parseable role is not authorised.
    useAuthStore.setState({
      user: { ...asUser(ROLE.ADMIN), role: undefined as never },
      token: 't',
      isAuthenticated: true,
    });
    renderAt('/guarded', [ROLE.ADMIN]);
    expect(screen.queryByText('guarded content')).not.toBeInTheDocument();
  });
});
