import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardShell, { card } from '../../components/dashboard/DashboardShell';
import {
  addTimeOff,
  getMyProfile,
  getReviewQueue,
  removeTimeOff,
  setMyAvailability,
  updateMyProfile,
} from '../../api/clinician';
import type { AvailabilityWindow } from '../../types/consultation';
import { clinicianNav } from './navigation';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const toLabel = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const toMinutes = (label: string) => {
  const [h, m] = label.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * The clinician's working hours.
 *
 * These drive slot generation directly: a day with no window offers no appointments.
 * The one subtlety worth knowing, and it is stated on the page, is that a clinician who
 * has never set any hours falls back to the platform default rather than disappearing
 * from every booking page - but once they set one day, the unset days are closed.
 */
export default function ClinicianAvailabilityPage() {
  const queryClient = useQueryClient();
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [slotMinutes, setSlotMinutes] = useState<number | ''>('');
  const [maxDaily, setMaxDaily] = useState<number | ''>('');
  const [accepting, setAccepting] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [timeOffStart, setTimeOffStart] = useState('');
  const [timeOffEnd, setTimeOffEnd] = useState('');
  const [timeOffReason, setTimeOffReason] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['clinician', 'profile'],
    queryFn: getMyProfile,
  });
  const { data: reviewQueue } = useQuery({
    queryKey: ['clinician', 'review-queue'],
    queryFn: getReviewQueue,
  });

  useEffect(() => {
    if (!profile) return;
    setWindows(profile.availability);
    setSlotMinutes(profile.profile.slotDurationMinutes);
    setMaxDaily(profile.profile.maxDailyBookings ?? '');
    setAccepting(profile.profile.isAcceptingPatients);
  }, [profile]);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['clinician', 'profile'] });

  const saveHours = useMutation({
    mutationFn: () =>
      setMyAvailability(
        windows.map((w) => ({
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        })),
      ),
    onSuccess: () => {
      setFeedback('Hours saved. Patients can book into them straight away.');
      invalidate();
    },
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      updateMyProfile({
        slotDurationMinutes: slotMinutes === '' ? undefined : Number(slotMinutes),
        maxDailyBookings: maxDaily === '' ? undefined : Number(maxDaily),
        isAcceptingPatients: accepting,
      }),
    onSuccess: () => {
      setFeedback('Settings saved.');
      invalidate();
    },
  });

  const bookTimeOff = useMutation({
    mutationFn: () =>
      addTimeOff({
        startAt: new Date(timeOffStart).toISOString(),
        endAt: new Date(timeOffEnd).toISOString(),
        reason: timeOffReason || undefined,
      }),
    onSuccess: () => {
      setTimeOffStart('');
      setTimeOffEnd('');
      setTimeOffReason('');
      setFeedback('Time off added.');
      invalidate();
    },
  });

  const dropTimeOff = useMutation({
    mutationFn: (id: string) => removeTimeOff(id),
    onSuccess: invalidate,
  });

  const addWindow = (day: number) =>
    setWindows((current) => [
      ...current,
      { dayOfWeek: day, startMinute: 9 * 60, endMinute: 17 * 60 },
    ]);

  const updateWindow = (index: number, patch: Partial<AvailabilityWindow>) =>
    setWindows((current) =>
      current.map((w, i) => (i === index ? { ...w, ...patch } : w)),
    );

  const removeWindow = (index: number) =>
    setWindows((current) => current.filter((_, i) => i !== index));

  return (
    <DashboardShell
      title="My working hours"
      subtitle="Patients can only book appointments inside these."
      nav={clinicianNav(reviewQueue?.length ?? 0)}
    >
      {feedback && (
        <p
          style={{
            background: '#ecfdf5',
            border: '1px solid #6ee7b7',
            borderRadius: 8,
            color: '#065f46',
            fontSize: 13,
            margin: 0,
            padding: '9px 12px',
          }}
        >
          {feedback}
        </p>
      )}

      {isLoading ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>
      ) : (
        <>
          <section style={{ ...card, display: 'grid', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, margin: 0 }}>Weekly hours</h2>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
                {windows.length === 0
                  ? 'You have not set any hours, so the platform default of 08:00–20:00 applies. Add a day below and only the days you set will be bookable.'
                  : 'Only the days listed here are bookable. A day with no hours offers no appointments.'}
              </p>
            </div>

            {DAYS.map((dayName, day) => {
              const dayWindows = windows
                .map((w, index) => ({ w, index }))
                .filter(({ w }) => w.dayOfWeek === day);
              return (
                <div
                  key={day}
                  style={{
                    alignItems: 'flex-start',
                    borderTop: '1px solid #f1f5f9',
                    display: 'grid',
                    gap: 8,
                    gridTemplateColumns: '110px 1fr',
                    paddingTop: 10,
                  }}
                >
                  <strong style={{ color: '#334155', fontSize: 13, paddingTop: 6 }}>
                    {dayName}
                  </strong>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {dayWindows.length === 0 && (
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>Not working</span>
                    )}
                    {dayWindows.map(({ w, index }) => (
                      <div
                        key={index}
                        style={{ alignItems: 'center', display: 'flex', gap: 8, flexWrap: 'wrap' }}
                      >
                        <input
                          type="time"
                          value={toLabel(w.startMinute)}
                          onChange={(event) =>
                            updateWindow(index, { startMinute: toMinutes(event.target.value) })
                          }
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: '6px 8px' }}
                        />
                        <span style={{ color: '#94a3b8', fontSize: 13 }}>to</span>
                        <input
                          type="time"
                          value={toLabel(w.endMinute)}
                          onChange={(event) =>
                            updateWindow(index, { endMinute: toMinutes(event.target.value) })
                          }
                          style={{ border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: '6px 8px' }}
                        />
                        <button
                          type="button"
                          onClick={() => removeWindow(index)}
                          style={{
                            background: 'transparent',
                            border: '1px solid #fca5a5',
                            borderRadius: 6,
                            color: '#b91c1c',
                            cursor: 'pointer',
                            fontSize: 12,
                            padding: '5px 10px',
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addWindow(day)}
                      style={{
                        background: 'transparent',
                        border: '1px dashed #cbd5e1',
                        borderRadius: 6,
                        color: '#0e7490',
                        cursor: 'pointer',
                        fontSize: 12,
                        justifySelf: 'start',
                        padding: '5px 10px',
                      }}
                    >
                      + Add hours
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => saveHours.mutate()}
                disabled={saveHours.isPending}
                style={{
                  background: '#0e7490',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '9px 16px',
                }}
              >
                {saveHours.isPending ? 'Saving…' : 'Save hours'}
              </button>
              {saveHours.isError && (
                <span style={{ color: '#b91c1c', fontSize: 13 }}>
                  {saveHours.error instanceof Error
                    ? saveHours.error.message
                    : 'Could not save.'}
                </span>
              )}
            </div>
          </section>

          <section style={{ ...card, display: 'grid', gap: 12 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Appointment settings</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <label style={{ color: '#334155', display: 'grid', fontSize: 12, gap: 4 }}>
                Slot length (minutes)
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={slotMinutes}
                  onChange={(event) =>
                    setSlotMinutes(event.target.value === '' ? '' : Number(event.target.value))
                  }
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: '6px 8px', width: 110 }}
                />
              </label>
              <label style={{ color: '#334155', display: 'grid', fontSize: 12, gap: 4 }}>
                Max bookings a day
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxDaily}
                  placeholder="No limit"
                  onChange={(event) =>
                    setMaxDaily(event.target.value === '' ? '' : Number(event.target.value))
                  }
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: '6px 8px', width: 110 }}
                />
              </label>
              <label
                style={{ alignItems: 'center', color: '#334155', display: 'flex', fontSize: 13, gap: 8, paddingTop: 16 }}
              >
                <input
                  type="checkbox"
                  checked={accepting}
                  onChange={(event) => setAccepting(event.target.checked)}
                />
                Accepting new patients
              </label>
            </div>
            <button
              type="button"
              onClick={() => saveSettings.mutate()}
              disabled={saveSettings.isPending}
              style={{
                background: '#0e7490',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                justifySelf: 'start',
                padding: '9px 16px',
              }}
            >
              Save settings
            </button>
          </section>

          <section style={{ ...card, display: 'grid', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, margin: 0 }}>Time off</h2>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
                Removes slots from your calendar. Refused if you already have
                appointments booked in the period - move those first, because marking
                leave does not move them.
              </p>
            </div>

            {(profile?.timeOff ?? []).map((entry) => (
              <div
                key={entry.id}
                style={{
                  alignItems: 'center',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                }}
              >
                <span style={{ color: '#334155', fontSize: 13 }}>
                  {new Date(entry.startAt).toLocaleString()} →{' '}
                  {new Date(entry.endAt).toLocaleString()}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => dropTimeOff.mutate(entry.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    color: '#334155',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: '5px 10px',
                  }}
                >
                  Remove
                </button>
              </div>
            ))}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <label style={{ color: '#334155', display: 'grid', fontSize: 12, gap: 4 }}>
                From
                <input
                  type="datetime-local"
                  value={timeOffStart}
                  onChange={(event) => setTimeOffStart(event.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: '6px 8px' }}
                />
              </label>
              <label style={{ color: '#334155', display: 'grid', fontSize: 12, gap: 4 }}>
                To
                <input
                  type="datetime-local"
                  value={timeOffEnd}
                  onChange={(event) => setTimeOffEnd(event.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: '6px 8px' }}
                />
              </label>
              <label style={{ color: '#334155', display: 'grid', fontSize: 12, gap: 4, flex: 1, minWidth: 150 }}>
                Reason (optional)
                <input
                  value={timeOffReason}
                  onChange={(event) => setTimeOffReason(event.target.value)}
                  style={{ border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, padding: '6px 8px', width: '100%' }}
                />
              </label>
              <button
                type="button"
                onClick={() => bookTimeOff.mutate()}
                disabled={!timeOffStart || !timeOffEnd || bookTimeOff.isPending}
                style={{
                  background: timeOffStart && timeOffEnd ? '#0e7490' : '#cbd5e1',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  cursor: timeOffStart && timeOffEnd ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '9px 16px',
                }}
              >
                Add
              </button>
            </div>
            {bookTimeOff.isError && (
              <span style={{ color: '#b91c1c', fontSize: 13 }}>
                {bookTimeOff.error instanceof Error
                  ? bookTimeOff.error.message
                  : 'Could not add that.'}
              </span>
            )}
          </section>
        </>
      )}
    </DashboardShell>
  );
}
