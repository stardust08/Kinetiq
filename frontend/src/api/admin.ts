/**
 * Admin API: the cross-platform view.
 *
 * Note that `getPatients` returns counts only. Clinical data lives behind
 * `getPatientRecord`, so browsing the patient list does not hand an admin every
 * patient's measurements on the way past.
 */

import { apiClient } from './client';
import type {
  AdminBookingEntry,
  AdminPatientListEntry,
  AdminUser,
  PatientRecord,
  PlatformStats,
} from '../types/consultation';

const ADMIN_BASE_URL = '/api/admin';

export const getStats = async (): Promise<PlatformStats> => {
  const response = await apiClient.get<{ data: PlatformStats }>(`${ADMIN_BASE_URL}/stats`);
  return response.data.data;
};

export const getUsers = async (params?: {
  role?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ users: AdminUser[]; total: number; limit: number; offset: number }> => {
  const response = await apiClient.get<{
    data: { users: AdminUser[]; total: number; limit: number; offset: number };
  }>(`${ADMIN_BASE_URL}/users`, { params });
  return response.data.data;
};

export const getUser = async (userId: string): Promise<AdminUser> => {
  const response = await apiClient.get<{ data: AdminUser }>(
    `${ADMIN_BASE_URL}/users/${userId}`,
  );
  return response.data.data;
};

export const setUserStatus = async (
  userId: string,
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED',
): Promise<AdminUser> => {
  const response = await apiClient.patch<{ data: AdminUser }>(
    `${ADMIN_BASE_URL}/users/${userId}/status`,
    { status },
  );
  return response.data.data;
};

/**
 * Change a role.
 *
 * Promoting to clinician creates their profile and calendar too. Demoting a clinician
 * who still has upcoming appointments is refused with a 409 - reassign them first.
 */
export const setUserRole = async (
  userId: string,
  role: string,
): Promise<AdminUser> => {
  const response = await apiClient.patch<{ data: AdminUser }>(
    `${ADMIN_BASE_URL}/users/${userId}/role`,
    { role },
  );
  return response.data.data;
};

export const getClinicians = async (params?: {
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<AdminUser[]> => {
  const response = await apiClient.get<{ data: AdminUser[] }>(
    `${ADMIN_BASE_URL}/clinicians`,
    { params },
  );
  return response.data.data;
};

export const createClinician = async (payload: {
  name?: string;
  phone: string;
  email?: string;
  specialisation?: string;
  qualifications?: string;
  registrationNo?: string;
  yearsExperience?: number;
  bio?: string;
  languages?: string;
  timezone?: string;
  slotDurationMinutes?: number;
  maxDailyBookings?: number;
}): Promise<AdminUser> => {
  const response = await apiClient.post<{ data: AdminUser }>(
    `${ADMIN_BASE_URL}/clinicians`,
    payload,
  );
  return response.data.data;
};

export const getPatients = async (params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  patients: AdminPatientListEntry[];
  total: number;
  limit: number;
  offset: number;
}> => {
  const response = await apiClient.get<{
    data: {
      patients: AdminPatientListEntry[];
      total: number;
      limit: number;
      offset: number;
    };
  }>(`${ADMIN_BASE_URL}/patients`, { params });
  return response.data.data;
};

export const getPatientRecord = async (patientId: string): Promise<PatientRecord> => {
  const response = await apiClient.get<{ data: PatientRecord }>(
    `${ADMIN_BASE_URL}/patients/${patientId}`,
  );
  return response.data.data;
};

export const getBookings = async (params?: {
  status?: string;
  clinicianId?: string;
  patientId?: string;
  unassignedOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  bookings: AdminBookingEntry[];
  total: number;
  limit: number;
  offset: number;
}> => {
  const response = await apiClient.get<{
    data: {
      bookings: AdminBookingEntry[];
      total: number;
      limit: number;
      offset: number;
    };
  }>(`${ADMIN_BASE_URL}/bookings`, { params });
  return response.data.data;
};

/** Assign, or pass null to unassign and return the booking to the queue. */
export const assignBooking = async (
  bookingId: string,
  clinicianId: string | null,
): Promise<unknown> => {
  const response = await apiClient.patch<{ data: unknown }>(
    `${ADMIN_BASE_URL}/bookings/${bookingId}/assign`,
    { clinicianId },
  );
  return response.data.data;
};

/**
 * Upload the demonstration video for an exercise.
 *
 * The library ships without video URLs, so this is how a deployment fills them in. MP4,
 * WebM or MOV only: anything else gives a player that shows nothing and reports no error.
 */
export const uploadExerciseVideo = async (
  exerciseId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ id: string; slug: string; videoUrl: string; sizeBytes: number }> => {
  const form = new FormData();
  form.append('file', file);
  const response = await apiClient.post<{
    data: { id: string; slug: string; videoUrl: string; sizeBytes: number };
  }>(`${ADMIN_BASE_URL}/exercises/${exerciseId}/video`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // A 200 MB upload on a clinic connection takes minutes; the client's 30-second
    // default would abort it well before the server had a chance to reject it.
    timeout: 10 * 60 * 1000,
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return response.data.data;
};
