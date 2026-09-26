import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import VideoCallRoom from '../components/video/VideoCallRoom';
import { useVideoCall } from '../hooks/useVideoCall';
import { useAuthStore, useIsStaff } from '../store/authStore';
import type { AnalysisType } from '../types/consultation';
import {
  createSession,
  enableScreening,
  endSession,
  getSessionForBooking,
  revokeScreening,
  saveClinicalNotes,
} from '../api/video';

/**
 * The consultation.
 *
 * Reached two ways, and the difference is the whole product rule:
 *
 *   /consultation/:sessionId          - staff, who already opened the room
 *   /consultation/booking/:bookingId  - a patient, who waits for one to be opened
 *
 * A patient cannot create a consultation, so on the booking route this page polls for
 * one and shows a waiting room until it appears. Staff arriving on the booking route
 * create it. That asymmetry is deliberate: an appointment starts when the clinician is
 * ready for it.
 *
 * When a screening is unlocked, the patient's browser is handed a one-shot token and
 * navigated to the capture page, which posts that token with `start-analysis`. The
 * capture runs in its own route rather than inside this page because the capture UI
 * needs the full viewport for the skeleton overlay - but the call stays live in the
 * background, and the capture page carries a link back.
 */
export default function ConsultationPage() {
  const { sessionId: routeSessionId, bookingId } = useParams<{
    sessionId?: string;
    bookingId?: string;
  }>();
  const navigate = useNavigate();
  const isStaff = useIsStaff();
  const user = useAuthStore((state) => state.user);

  const [sessionId, setSessionId] = useState<string | null>(routeSessionId ?? null);
  const [resolving, setResolving] = useState(!routeSessionId);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState<string | null>(null);

  const call = useVideoCall(sessionId);

  // ---- Find or open the consultation ------------------------------------

  const resolveSession = useCallback(async () => {
    if (routeSessionId || !bookingId) return;
    setResolveError(null);
    try {
      if (isStaff) {
        // Idempotent server-side: a clinician who clicks twice lands in the same room
        // rather than in a second one their patient is not in.
        const created = await createSession(bookingId);
        setSessionId(created.id);
      } else {
        const existing = await getSessionForBooking(bookingId);
        if (existing) setSessionId(existing.id);
      }
    } catch (error) {
      setResolveError(
        error instanceof Error
          ? error.message
          : 'Could not open the consultation for this booking.',
      );
    } finally {
      setResolving(false);
    }
  }, [bookingId, isStaff, routeSessionId]);

  useEffect(() => {
    void resolveSession();
  }, [resolveSession]);

  // A patient waiting for their clinician. Polling rather than a socket because there is
  // no room to hold a socket open on yet - the session does not exist.
  useEffect(() => {
    if (sessionId || isStaff || !bookingId) return;
    const timer = window.setInterval(() => {
      void getSessionForBooking(bookingId)
        .then((session) => {
          if (session) setSessionId(session.id);
        })
        .catch(() => {
          /* transient; the next tick tries again */
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [bookingId, isStaff, sessionId]);

  // Join as soon as we have a room.
  useEffect(() => {
    if (sessionId && call.status === 'idle') {
      void call.join();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, call.status]);

  useEffect(() => {
    if (call.session?.clinicalNotes) setNotes(call.session.clinicalNotes);
  }, [call.session?.clinicalNotes]);

  // ---- Actions -----------------------------------------------------------

  const handleEnableScreening = useCallback(
    async (type: AnalysisType) => {
      if (!sessionId) return;
      setBusy(true);
      try {
        await enableScreening(sessionId, type);
        // The patient's browser learns over the socket and receives the token; nothing
        // more to do here.
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  const handleRevokeScreening = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await revokeScreening(sessionId);
    } finally {
      setBusy(false);
    }
  }, [sessionId]);

  const handleEndForAll = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await endSession(sessionId, notes || undefined);
      call.leave();
    } finally {
      setBusy(false);
    }
  }, [call, notes, sessionId]);

  const handleSaveNotes = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      await saveClinicalNotes(sessionId, notes);
      setNotesSaved(new Date().toLocaleTimeString());
    } finally {
      setBusy(false);
    }
  }, [notes, sessionId]);

  const handleLeave = useCallback(() => {
    call.leave();
    navigate(isStaff ? '/clinician/schedule' : '/bookings');
  }, [call, isStaff, navigate]);

  /**
   * Send the patient to the capture page with their authorisation.
   *
   * The token travels in router state rather than in the URL: a query string lands in
   * browser history and in any logging proxy between here and the server, and this one
   * authorises writing to a clinical record.
   */
  const handleBeginScreening = useCallback(
    (type: AnalysisType, token: string) => {
      const route =
        type === 'ROM'
          ? '/rom-analysis'
          : type === 'GAIT'
            ? '/gait-analysis'
            : '/posture-analysis';
      navigate(route, {
        state: {
          screeningToken: token,
          bookingId: call.session?.bookingId ?? bookingId,
          consultationId: sessionId,
          supervised: true,
        },
      });
    },
    [bookingId, call.session?.bookingId, navigate, sessionId],
  );

  // ---- Render ------------------------------------------------------------

  const shell = (children: React.ReactNode) => (
    <main
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '24px 16px 48px',
        display: 'grid',
        gap: 16,
      }}
    >
      <header style={{ display: 'grid', gap: 4 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Video consultation</h1>
        {call.session?.booking?.service?.name && (
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
            {call.session.booking.service.name}
            {call.session.booking.time
              ? ` · ${new Date(call.session.booking.time).toLocaleString()}`
              : ''}
          </p>
        )}
      </header>
      {children}
    </main>
  );

  if (resolving) {
    return shell(
      <p style={{ color: '#64748b', fontSize: 14 }}>Opening the consultation…</p>,
    );
  }

  if (resolveError) {
    return shell(
      <div
        style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 10,
          color: '#991b1b',
          fontSize: 14,
          padding: 14,
        }}
      >
        {resolveError}
      </div>,
    );
  }

  if (!sessionId) {
    // A patient whose clinician has not opened the room yet. Not an error.
    return shell(
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 24,
          display: 'grid',
          gap: 10,
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: 17, margin: 0 }}>Your clinician has not joined yet</h2>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          Keep this page open. It will connect on its own as soon as they start the
          call - there is nothing you need to do.
        </p>
      </div>,
    );
  }

  return shell(
    <>
      <VideoCallRoom
        call={call}
        busy={busy}
        onEnableScreening={handleEnableScreening}
        onRevokeScreening={handleRevokeScreening}
        onEndForAll={handleEndForAll}
        onLeave={handleLeave}
        onBeginScreening={handleBeginScreening}
      />

      {isStaff && call.permissions?.canWriteClinicalNotes && (
        <section
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 16,
            display: 'grid',
            gap: 10,
          }}
        >
          <div>
            <strong style={{ fontSize: 14 }}>Clinical notes</strong>
            <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
              Kept on the consultation record. The patient does not see these; the chat
              is not saved at all.
            </p>
          </div>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={5}
            placeholder="Observations, advice given, plan for next session…"
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontFamily: 'inherit',
              fontSize: 14,
              padding: 10,
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => void handleSaveNotes()}
              disabled={busy}
              style={{
                background: '#0e7490',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: busy ? 'wait' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                padding: '9px 16px',
              }}
            >
              Save notes
            </button>
            {notesSaved && (
              <span style={{ color: '#047857', fontSize: 13 }}>
                Saved at {notesSaved}
              </span>
            )}
          </div>
        </section>
      )}

      {user && (
        <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>
          Audio and video travel directly between participants. Nothing about this call
          is recorded or stored on our servers.
        </p>
      )}
    </>,
  );
}
