/**
 * Range-of-motion screening flow.
 *
 * Four steps, mirroring the posture and gait pages so a clinic learns one flow rather
 * than three: choose a booking, read the instructions, perform the movements, read the
 * result.
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import BookingSelectionStep from '../components/booking/BookingSelectionStep';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { BackButton } from '../components/layout/BackButton';
import ROMCapture from '../components/rom/ROMCapture';
import ROMMetricsDisplay from '../components/rom/ROMMetricsDisplay';
import * as romApi from '../api/rom';
import type { ROMAnalysis, ROMCaptureResult } from '../api/rom';
import { ROM_MOVEMENTS, HOLD_SECONDS } from '../lib/romMovements';
import { previousValuesFor } from '../lib/previousAssessment';

type Step = 'select_booking' | 'instructions' | 'capturing' | 'analysing' | 'complete';

export default function ROMAnalysisPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookingIdFromUrl = searchParams.get('bookingId');

  const [step, setStep] = useState<Step>(bookingIdFromUrl ? 'instructions' : 'select_booking');
  const [bookingId, setBookingId] = useState<string | null>(bookingIdFromUrl);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<ROMAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Finalising is the only call that costs the patient a screening credit, and the
  // capture fires its completion callback from an effect. A ref rather than state
  // because a second call would land before a re-render could gate it.
  const submittingRef = useRef(false);

  // Previous screenings, so the report can judge a change against the minimal
  // detectable change rather than against zero.
  const { data: history } = useQuery({
    queryKey: ['rom', 'my-analyses'],
    queryFn: () => romApi.getMyAnalyses({ limit: 25 }),
    staleTime: 5 * 60 * 1000,
  });

  const begin = useCallback(async () => {
    if (!bookingId) return;
    setError(null);
    try {
      const session = await romApi.startAnalysis(bookingId);
      setSessionId(session.sessionId);
      setStep('capturing');
    } catch (err) {
      // The api client's interceptor rejects with an ApiError carrying the server's
      // message, NOT the raw axios error - so reading err.response.data.detail found
      // nothing and every failure showed the generic fallback. A patient whose booking
      // had been cancelled was told only "Could not start the screening", with no hint
      // of why or what to do about it.
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not start the screening.',
      );
    }
  }, [bookingId]);

  const handleCancel = useCallback(() => {
    // Tell the backend the session is over. No screening credit is spent until
    // finalize, so nothing is refunded here and nothing breaks if the call fails -
    // which is exactly why it is fire-and-forget. What it buys is that the server
    // stops holding an open session for a patient who has left, rather than waiting
    // for one that will never be finalised.
    if (sessionId) {
      romApi.cancelAnalysis(sessionId).catch(() => {
        /* the session is abandoned either way */
      });
    }
    setSessionId(null);
    setStep('instructions');
  }, [sessionId]);

  const handleComplete = useCallback(
    async (capture: ROMCaptureResult) => {
      if (!bookingId || !sessionId) return;
      if (submittingRef.current) return;
      submittingRef.current = true;
      setStep('analysing');
      try {
        const analysis = await romApi.finalizeAnalysis({
          sessionId,
          bookingId,
          romData: capture,
        });
        setResult(analysis);
        setStep('complete');
      } catch (err) {
        // The backend rejects a capture it could not measure and does NOT deduct a
        // screening count for it, so returning the patient to the instructions is safe.
        // The message comes off the ApiError the client throws.
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'The capture could not be analysed. No screening count was used.',
        );
        setStep('instructions');
        // Released only on failure: a successful analysis is terminal, and re-sending
        // the same capture would consume a second screening credit for one assessment.
        submittingRef.current = false;
      }
    },
    [bookingId, sessionId],
  );

  return (
    <div className="min-h-screen bg-[#030712] py-8">
      <div className="max-w-5xl mx-auto px-4">
        <BackButton />
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Range of Motion' },
          ]}
        />

        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold text-white">Range of Motion Screening</h1>
          <p className="text-sm text-slate-400 mt-1">
            {ROM_MOVEMENTS.length} joint movements, each held for {HOLD_SECONDS} seconds.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {step === 'select_booking' && (
          <BookingSelectionStep
            onBookingSelected={(id) => {
              setBookingId(id);
              setStep('instructions');
            }}
          />
        )}

        {step === 'instructions' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white mb-3">Before you start</h2>
              <ul className="space-y-2 text-sm text-slate-300 list-disc pl-5">
                <li>Stand where your <strong>whole body</strong> is in frame, head to feet.</li>
                <li>Wear fitted clothing — loose layers move the detected joint positions.</li>
                <li>
                  Move each joint <strong>as far as is comfortable</strong> and hold still. The
                  screening measures where you stop, not how you get there.
                </li>
                <li>
                  You will be asked to turn between movements. The capture will not start until
                  you are facing the right way — it checks, and tells you if you are not.
                </li>
                <li>Stop immediately if anything hurts.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold text-white mb-3">What will be measured</h2>
              <ol className="space-y-1.5 text-sm text-slate-300">
                {ROM_MOVEMENTS.map((m, i) => (
                  <li key={m.id} className="flex gap-3">
                    <span className="text-slate-500 tabular-nums">{i + 1}.</span>
                    <span>
                      {m.icon} {m.title}
                      <span className="text-slate-500"> — {m.view.replace('side', ' side')} view</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <button
              onClick={begin}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold"
            >
              Start screening
            </button>
          </div>
        )}

        {step === 'capturing' && (
          <ROMCapture
            onComplete={handleComplete}
            onError={setError}
            onCancel={handleCancel}
          />
        )}

        {step === 'analysing' && (
          <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
            <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-300">Measuring…</p>
          </div>
        )}

        {step === 'complete' && result?.metricsJson && (
          <div className="space-y-6">
            <ROMMetricsDisplay
              payload={result.metricsJson}
              qualityFlags={result.qualityFlags}
              previousValues={previousValuesFor(result, history ?? [])}
            />
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 rounded-lg border border-white/15 text-slate-200 text-sm"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
