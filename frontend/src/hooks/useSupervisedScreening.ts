import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useScreeningStore } from '../store/screeningStore';
import type { AnalysisType } from '../types/consultation';

export interface SupervisedScreeningContext {
  /** True when this capture was unlocked by a clinician in a consultation. */
  supervised: boolean;
  consultationId: string | null;
  /** Booking the consultation authorised, if it named one. */
  bookingId: string | null;
  type: AnalysisType | null;
}

/**
 * Picks up a screening authorisation handed over by the consultation page.
 *
 * The consultation navigates to a capture route with the one-shot token in router
 * *state* rather than in the URL - a query string lands in browser history and in every
 * logging proxy between here and the server, and this token authorises writing to a
 * clinical record.
 *
 * Mount this once per capture page. It moves the token into the store the API layer
 * reads, and clears it when the page unmounts so it cannot leak into an unrelated
 * capture the patient starts later.
 */
export function useSupervisedScreening(): SupervisedScreeningContext {
  const location = useLocation();
  const setAuthorisation = useScreeningStore((state) => state.set);
  const clear = useScreeningStore((state) => state.clear);
  const supervised = useScreeningStore((state) => state.supervised);
  const consultationId = useScreeningStore((state) => state.consultationId);
  const bookingId = useScreeningStore((state) => state.bookingId);
  const type = useScreeningStore((state) => state.type);

  useEffect(() => {
    const state = location.state as
      | {
          screeningToken?: string;
          bookingId?: string;
          consultationId?: string;
          supervised?: boolean;
        }
      | null;

    if (state?.screeningToken) {
      setAuthorisation({
        token: state.screeningToken,
        // The server checks the type against what was actually unlocked, so guessing
        // wrong here produces a clear refusal rather than a mismatched capture.
        type: (type ?? 'POSTURE') as AnalysisType,
        bookingId: state.bookingId ?? null,
        consultationId: state.consultationId ?? null,
      });
    }

    return () => {
      // One capture, one authorisation. Leaving it in the store would let the next
      // capture the patient opens inherit permission from a consultation that has since
      // moved on.
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return { supervised, consultationId, bookingId, type };
}

export default useSupervisedScreening;
