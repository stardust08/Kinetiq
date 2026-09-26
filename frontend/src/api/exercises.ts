/**
 * Exercise catalogue and prescription API.
 *
 * The distinction that runs through this file: `getSuggestions` is what a screening
 * *suggests*, computed live and stored nowhere, and a plan is what a clinician has
 * *prescribed*. A patient sees suggestions labelled as such, and only sees a plan once
 * its status is ACTIVE - the backend hides drafts from them entirely.
 */

import { apiClient } from './client';
import type {
  AdherenceSummary,
  AnalysisType,
  Exercise,
  ExercisePlan,
  ExercisePlanItem,
  PlanStatus,
  SuggestionsResult,
} from '../types/consultation';

const EXERCISE_BASE_URL = '/api/exercises';

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const getCatalogue = async (params?: {
  bodyRegion?: string;
  difficulty?: string;
  search?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Exercise[]> => {
  const response = await apiClient.get<{ data: Exercise[] }>(
    `${EXERCISE_BASE_URL}/catalogue`,
    { params },
  );
  return response.data.data;
};

export const getExercise = async (idOrSlug: string): Promise<Exercise> => {
  const response = await apiClient.get<{ data: Exercise }>(
    `${EXERCISE_BASE_URL}/catalogue/${idOrSlug}`,
  );
  return response.data.data;
};

/**
 * Edit a catalogue entry. Admin only.
 *
 * Only deployment-owned fields are accepted - chiefly the video. Instructions, cautions
 * and citations come from the code library and are not editable over HTTP.
 */
export const updateExercise = async (
  exerciseId: string,
  payload: {
    videoUrl?: string;
    videoProvider?: string;
    thumbnailUrl?: string;
    durationSeconds?: number;
    isActive?: boolean;
    equipment?: string;
    defaultSets?: number;
    defaultReps?: number;
    defaultHoldSeconds?: number;
    defaultFrequencyPerWeek?: number;
  },
): Promise<Exercise> => {
  const response = await apiClient.patch<{ data: Exercise }>(
    `${EXERCISE_BASE_URL}/catalogue/${exerciseId}`,
    payload,
  );
  return response.data.data;
};

/** Seed or refresh the catalogue from the code library. Admin only. */
export const syncCatalogue = async (): Promise<{
  created: number;
  updated: number;
  retired: number;
}> => {
  const response = await apiClient.post<{
    data: { created: number; updated: number; retired: number };
  }>(`${EXERCISE_BASE_URL}/catalogue/sync`);
  return response.data.data;
};

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/**
 * What this screening suggests. Read-only and safe to call on every render.
 *
 * Drives the recommended-exercises panel on every report - posture, gait and range of
 * motion alike.
 */
export const getSuggestions = async (
  analysisType: AnalysisType,
  analysisId: string,
): Promise<SuggestionsResult> => {
  const response = await apiClient.get<{ data: SuggestionsResult }>(
    `${EXERCISE_BASE_URL}/suggestions/${analysisType}/${analysisId}`,
  );
  return response.data.data;
};

/** Rebuild the draft plan for an analysis. Clinician or admin only. */
export const regeneratePlan = async (
  analysisType: AnalysisType,
  analysisId: string,
): Promise<ExercisePlan | null> => {
  const response = await apiClient.post<{ data: ExercisePlan | null }>(
    `${EXERCISE_BASE_URL}/suggestions/${analysisType}/${analysisId}/regenerate`,
  );
  return response.data.data;
};

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const getPlans = async (params?: {
  patientId?: string;
  status?: PlanStatus;
  limit?: number;
  offset?: number;
}): Promise<ExercisePlan[]> => {
  const response = await apiClient.get<{ data: ExercisePlan[] }>(
    `${EXERCISE_BASE_URL}/plans`,
    { params },
  );
  return response.data.data;
};

export const getPlan = async (planId: string): Promise<ExercisePlan> => {
  const response = await apiClient.get<{ data: ExercisePlan }>(
    `${EXERCISE_BASE_URL}/plans/${planId}`,
  );
  return response.data.data;
};

export const getAdherence = async (planId: string): Promise<AdherenceSummary> => {
  const response = await apiClient.get<{ data: AdherenceSummary }>(
    `${EXERCISE_BASE_URL}/plans/${planId}/adherence`,
  );
  return response.data.data;
};

export const updatePlan = async (
  planId: string,
  payload: {
    title?: string;
    summary?: string;
    clinicianNotes?: string;
    durationWeeks?: number;
  },
): Promise<ExercisePlan> => {
  const response = await apiClient.patch<{ data: ExercisePlan }>(
    `${EXERCISE_BASE_URL}/plans/${planId}`,
    payload,
  );
  return response.data.data;
};

/**
 * Prescribe the plan: DRAFT becomes ACTIVE and the patient can finally see it.
 *
 * Clinician or admin only. This is the moment a machine suggestion becomes clinical
 * advice, which is why the reviewer's name is recorded against it.
 */
export const activatePlan = async (
  planId: string,
  clinicianNotes?: string,
): Promise<ExercisePlan> => {
  const response = await apiClient.post<{ data: ExercisePlan }>(
    `${EXERCISE_BASE_URL}/plans/${planId}/activate`,
    { clinicianNotes },
  );
  return response.data.data;
};

export const setPlanStatus = async (
  planId: string,
  status: PlanStatus,
): Promise<ExercisePlan> => {
  const response = await apiClient.patch<{ data: ExercisePlan }>(
    `${EXERCISE_BASE_URL}/plans/${planId}/status`,
    { status },
  );
  return response.data.data;
};

// ---------------------------------------------------------------------------
// Plan items
// ---------------------------------------------------------------------------

export const addPlanItem = async (
  planId: string,
  payload: {
    exerciseId?: string;
    exerciseSlug?: string;
    sets?: number;
    reps?: number;
    holdSeconds?: number;
    frequencyPerWeek?: number;
    reason?: string;
    clinicianNote?: string;
  },
): Promise<{ id: string }> => {
  const response = await apiClient.post<{ data: { id: string } }>(
    `${EXERCISE_BASE_URL}/plans/${planId}/items`,
    payload,
  );
  return response.data.data;
};

export const updatePlanItem = async (
  planId: string,
  itemId: string,
  payload: Partial<
    Pick<
      ExercisePlanItem,
      'sets' | 'reps' | 'holdSeconds' | 'frequencyPerWeek' | 'durationWeeks' | 'displayOrder' | 'clinicianNote' | 'isRemoved'
    >
  >,
): Promise<{ id: string }> => {
  const response = await apiClient.patch<{ data: { id: string } }>(
    `${EXERCISE_BASE_URL}/plans/${planId}/items/${itemId}`,
    payload,
  );
  return response.data.data;
};

/** Strike an exercise off. A soft delete - the clinical decision stays on the record. */
export const removePlanItem = async (
  planId: string,
  itemId: string,
): Promise<{ id: string; isRemoved: boolean }> => {
  const response = await apiClient.delete<{ data: { id: string; isRemoved: boolean } }>(
    `${EXERCISE_BASE_URL}/plans/${planId}/items/${itemId}`,
  );
  return response.data.data;
};

/** Patient logs having done an exercise, with optional pain and difficulty. */
export const logCompletion = async (
  itemId: string,
  payload: {
    setsDone?: number;
    repsDone?: number;
    painScore?: number;
    difficultyRating?: number;
    notes?: string;
  },
): Promise<{ id: string; completedAt: string }> => {
  const response = await apiClient.post<{
    data: { id: string; completedAt: string };
  }>(`${EXERCISE_BASE_URL}/plan-items/${itemId}/complete`, payload);
  return response.data.data;
};
