/**
 * Clinician API: own calendar, own caseload, patient records.
 *
 * Everything under `/me` acts on the calling clinician. The rest takes an explicit id
 * and is available to admins too.
 */

import { apiClient } from './client';
import type {
  AvailabilityWindow,
  CaseloadPatient,
  ClinicianProfile,
  PatientRecord,
  ReviewQueueEntry,
  ScheduleEntry,
  TimeOffEntry,
} from '../types/consultation';
import type { Booking } from '../types';

const CLINICIAN_BASE_URL = '/api/clinician';

export const getMyProfile = async (): Promise<ClinicianProfile> => {
  const response = await apiClient.get<{ data: ClinicianProfile }>(
    `${CLINICIAN_BASE_URL}/me`,
  );
  return response.data.data;
};

export const updateMyProfile = async (payload: {
  specialisation?: string;
  qualifications?: string;
  yearsExperience?: number;
  bio?: string;
  languages?: string;
  consultationModes?: string;
  isAcceptingPatients?: boolean;
  timezone?: string;
  slotDurationMinutes?: number;
  maxDailyBookings?: number;
}): Promise<ClinicianProfile> => {
  const response = await apiClient.patch<{ data: ClinicianProfile }>(
    `${CLINICIAN_BASE_URL}/me`,
    payload,
  );
  return response.data.data;
};

/**
 * Replace the whole working week.
 *
 * A whole-week replace, not per-row edits: the editor is a weekly grid, and sending
 * partial updates is how a day quietly disappears.
 */
export const setMyAvailability = async (
  windows: Array<Pick<AvailabilityWindow, 'dayOfWeek' | 'startMinute' | 'endMinute'>>,
): Promise<ClinicianProfile> => {
  const response = await apiClient.put<{ data: ClinicianProfile }>(
    `${CLINICIAN_BASE_URL}/me/availability`,
    { windows },
  );
  return response.data.data;
};

export const addTimeOff = async (payload: {
  startAt: string;
  endAt: string;
  reason?: string;
}): Promise<TimeOffEntry> => {
  const response = await apiClient.post<{ data: TimeOffEntry }>(
    `${CLINICIAN_BASE_URL}/me/time-off`,
    payload,
  );
  return response.data.data;
};

export const removeTimeOff = async (timeOffId: string): Promise<void> => {
  await apiClient.delete(`${CLINICIAN_BASE_URL}/me/time-off/${timeOffId}`);
};

/** Appointments, each saying whether a consultation is open and the patient waiting. */
export const getMySchedule = async (params?: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  limit?: number;
}): Promise<ScheduleEntry[]> => {
  const response = await apiClient.get<{ data: ScheduleEntry[] }>(
    `${CLINICIAN_BASE_URL}/me/schedule`,
    { params },
  );
  return response.data.data;
};

export const getMyPatients = async (search?: string): Promise<CaseloadPatient[]> => {
  const response = await apiClient.get<{ data: CaseloadPatient[] }>(
    `${CLINICIAN_BASE_URL}/me/patients`,
    { params: search ? { search } : undefined },
  );
  return response.data.data;
};

/**
 * Draft plans awaiting review.
 *
 * Every row is a patient who finished a screening and cannot see their programme yet,
 * which makes this the clinician's real to-do list.
 */
export const getReviewQueue = async (): Promise<ReviewQueueEntry[]> => {
  const response = await apiClient.get<{ data: ReviewQueueEntry[] }>(
    `${CLINICIAN_BASE_URL}/me/review-queue`,
  );
  return response.data.data;
};

export const getPatientRecord = async (patientId: string): Promise<PatientRecord> => {
  const response = await apiClient.get<{ data: PatientRecord }>(
    `${CLINICIAN_BASE_URL}/patients/${patientId}`,
  );
  return response.data.data;
};

/** Bookable slots for one clinician on one date. Patients may call this. */
export const getClinicianSlots = async (
  clinicianId: string,
  date: string,
  durationMinutes = 30,
): Promise<{ clinicianId: string; date: string; slots: Array<{ slotTime: string }> }> => {
  const response = await apiClient.get<{
    data: { clinicianId: string; date: string; slots: Array<{ slotTime: string }> };
  }>(`${CLINICIAN_BASE_URL}/${clinicianId}/slots`, {
    params: { date, durationMinutes },
  });
  return response.data.data;
};

/**
 * Book an appointment for a patient. Clinician or admin.
 *
 * The follow-up path: finish a consultation and book the patient back in without
 * sending them through checkout.
 */
export const bookForPatient = async (payload: {
  patientId: string;
  serviceId: string;
  slotTime: string;
  clinicianId?: string;
  description?: string;
}): Promise<Booking> => {
  const response = await apiClient.post<{ data: Booking }>(
    `${CLINICIAN_BASE_URL}/bookings`,
    payload,
  );
  return response.data.data;
};
