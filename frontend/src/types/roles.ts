/**
 * The three roles, and the one piece of naming trickery in the system.
 *
 * The backend stores the patient role as `USER` - the name predates there being any
 * other role, and renaming it would rewrite every existing row and invalidate every
 * token already issued. So `USER` stays on the wire and nothing in the UI ever renders
 * it: `roleLabel()` is the only place allowed to turn a role into words.
 *
 * Mirrors backend/app/core/roles.py. If one changes, change both.
 */

import type { UserRole } from './index';

export const ROLE = {
  /** The patient role. Stored as `USER`; never shown to a human as "User". */
  PATIENT: 'USER',
  CLINICIAN: 'CLINICIAN',
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

/** Roles that may act on somebody else's clinical record. */
export const STAFF_ROLES: readonly Role[] = [ROLE.CLINICIAN, ROLE.ADMIN];

export function roleLabel(role: UserRole | null | undefined): string {
  switch (role) {
    case ROLE.PATIENT:
      return 'Patient';
    case ROLE.CLINICIAN:
      return 'Clinician';
    case ROLE.ADMIN:
      return 'Administrator';
    default:
      return 'Unknown';
  }
}

export function isPatient(role: UserRole | null | undefined): boolean {
  return role === ROLE.PATIENT;
}

export function isClinician(role: UserRole | null | undefined): boolean {
  return role === ROLE.CLINICIAN;
}

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === ROLE.ADMIN;
}

/** Clinician or admin. The distinction that matters most often is staff vs patient. */
export function isStaff(role: UserRole | null | undefined): boolean {
  return role === ROLE.CLINICIAN || role === ROLE.ADMIN;
}

/**
 * Where a role lands after signing in.
 *
 * A clinician sent to the patient home page sees a marketing site and has to find their
 * schedule by hand, so each role gets its own front door.
 */
export function homePathForRole(role: UserRole | null | undefined): string {
  if (role === ROLE.ADMIN) return '/admin';
  if (role === ROLE.CLINICIAN) return '/clinician';
  return '/';
}
