/**
 * Tests for the role model.
 *
 * Cheap tests guarding an expensive mistake. The patient role is stored as `USER` - a
 * name that predates there being any other role - and every one of these exists because
 * a wrong answer either shows a patient the word "User" or sends a clinician to the
 * wrong front door.
 *
 * Mirrors backend/app/core/test_authz.py::TestRole. If one changes, change both.
 */

import { describe, expect, it } from 'vitest';
import {
  ROLE,
  STAFF_ROLES,
  homePathForRole,
  isAdmin,
  isClinician,
  isPatient,
  isStaff,
  roleLabel,
} from './roles';

describe('the stored role values', () => {
  it('spells the patient role USER', () => {
    // Renaming it would rewrite every existing row and invalidate every issued JWT.
    expect(ROLE.PATIENT).toBe('USER');
  });

  it('never shows a patient the word "User"', () => {
    expect(roleLabel('USER')).toBe('Patient');
    expect(roleLabel('CLINICIAN')).toBe('Clinician');
    expect(roleLabel('ADMIN')).toBe('Administrator');
  });

  it('labels an unknown role without crashing', () => {
    expect(roleLabel(undefined)).toBe('Unknown');
    expect(roleLabel(null)).toBe('Unknown');
  });
});

describe('the predicates', () => {
  it('identifies each role', () => {
    expect(isPatient('USER')).toBe(true);
    expect(isClinician('CLINICIAN')).toBe(true);
    expect(isAdmin('ADMIN')).toBe(true);
  });

  it('treats clinicians and admins as staff, and patients as not', () => {
    expect(isStaff('CLINICIAN')).toBe(true);
    expect(isStaff('ADMIN')).toBe(true);
    expect(isStaff('USER')).toBe(false);
  });

  it('fails closed for a missing role', () => {
    expect(isStaff(null)).toBe(false);
    expect(isStaff(undefined)).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isPatient(null)).toBe(false);
  });

  it('lists exactly clinician and admin as staff', () => {
    expect([...STAFF_ROLES].sort()).toEqual(['ADMIN', 'CLINICIAN']);
  });
});

describe('the front door for each role', () => {
  it('sends each role somewhere useful', () => {
    // A clinician landing on the patient marketing page has to find their schedule by
    // hand, which is why each role gets its own home.
    expect(homePathForRole('ADMIN')).toBe('/admin');
    expect(homePathForRole('CLINICIAN')).toBe('/clinician');
    expect(homePathForRole('USER')).toBe('/');
  });

  it('sends an unknown role to the public home rather than nowhere', () => {
    expect(homePathForRole(null)).toBe('/');
    expect(homePathForRole(undefined)).toBe('/');
  });
});
