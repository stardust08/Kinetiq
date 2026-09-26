import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '../types';
import { ROLE, homePathForRole, roleLabel } from '../types/roles';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  /** Refresh the stored user after a profile edit or a role change. */
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (token, user) => {
        localStorage.setItem('auth_token', token);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('auth_token');
        set({ user: null, token: null, isAuthenticated: false });
      },
      setUser: (user) => set({ user }),
    }),
    { name: 'auth-storage' }
  )
);

/**
 * Role selectors.
 *
 * Exported as functions over the store rather than as computed state so a component
 * re-renders on the role changing and nothing else. They are also the only sanctioned
 * way to ask about a role: `user?.role === 'USER'` compiles, reads as a comparison
 * against a generic user, and is how a check ends up misspelled somewhere.
 *
 * None of these is a security boundary. Every one of them has a counterpart on the
 * server, which is where the decision is actually made - these only decide what to draw.
 */

export const useCurrentRole = (): UserRole | null =>
  useAuthStore((state) => state.user?.role ?? null);

export const useIsPatient = (): boolean =>
  useAuthStore((state) => state.user?.role === ROLE.PATIENT);

export const useIsClinician = (): boolean =>
  useAuthStore((state) => state.user?.role === ROLE.CLINICIAN);

export const useIsAdmin = (): boolean =>
  useAuthStore((state) => state.user?.role === ROLE.ADMIN);

/** Clinician or admin: anyone who may act on another person's clinical record. */
export const useIsStaff = (): boolean =>
  useAuthStore(
    (state) =>
      state.user?.role === ROLE.CLINICIAN || state.user?.role === ROLE.ADMIN
  );

/** The human-facing name of the signed-in user's role. Never the stored value. */
export const useRoleLabel = (): string =>
  useAuthStore((state) => roleLabel(state.user?.role));

/** Where this user belongs after signing in. */
export const useHomePath = (): string =>
  useAuthStore((state) => homePathForRole(state.user?.role));

/** Non-reactive read, for use outside React (interceptors, route loaders). */
export const getCurrentRole = (): UserRole | null =>
  useAuthStore.getState().user?.role ?? null;
