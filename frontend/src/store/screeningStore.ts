import { create } from 'zustand';
import type { AnalysisType } from '../types/consultation';

/**
 * The authorisation for the capture currently in progress.
 *
 * A supervised screening is started by a clinician in a video consultation, which hands
 * the patient's browser a one-shot token and navigates to the capture page. That page
 * then makes two calls minutes apart - `start-analysis` and `finalize-analysis` - and
 * both must present the token.
 *
 * Why a store rather than props: the token enters at the consultation page, is needed by
 * three separate capture pages, and is read by the API layer underneath each of them.
 * Threading it through would mean touching every component between, and any one that
 * forgot would produce a capture the patient completes and the server then refuses.
 *
 * Deliberately NOT persisted. It lives for one capture: a token surviving a page reload
 * in localStorage would outlive the consultation that justified it, and the whole point
 * of the token is that it expires with the appointment.
 */
interface ScreeningAuthorisationState {
  token: string | null;
  type: AnalysisType | null;
  bookingId: string | null;
  consultationId: string | null;
  /** False when the deployment allows unsupervised self-screening. */
  supervised: boolean;

  set: (authorisation: {
    token: string;
    type: AnalysisType;
    bookingId?: string | null;
    consultationId?: string | null;
  }) => void;
  clear: () => void;
}

export const useScreeningStore = create<ScreeningAuthorisationState>((set) => ({
  token: null,
  type: null,
  bookingId: null,
  consultationId: null,
  supervised: false,

  set: ({ token, type, bookingId = null, consultationId = null }) =>
    set({ token, type, bookingId, consultationId, supervised: true }),

  clear: () =>
    set({
      token: null,
      type: null,
      bookingId: null,
      consultationId: null,
      supervised: false,
    }),
}));

/**
 * The token to send with a screening request, if one is held.
 *
 * Read from outside React because the API layer needs it, and the API layer is not a
 * component. Returns undefined rather than null so it can be spread into a request body
 * without adding an explicit `screeningToken: null` that the server would have to ignore.
 */
export const currentScreeningToken = (): string | undefined =>
  useScreeningStore.getState().token ?? undefined;

export const currentConsultationId = (): string | null =>
  useScreeningStore.getState().consultationId;
