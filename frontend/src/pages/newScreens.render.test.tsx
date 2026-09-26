/**
 * Smoke-renders every screen added for roles, consultations and prescriptions.
 *
 * Typechecking proves these files are consistent; it does not prove they mount. A
 * component can typecheck perfectly and still throw on first render - a hook called
 * conditionally, a `.map` on something that arrives undefined, a store selector that
 * returns null where the JSX assumes an object. Every one of those is invisible until
 * something renders the page, and until this file existed nothing ever had.
 *
 * So these are deliberately shallow: mount each screen with its API mocked, assert
 * something recognisable appears, and assert it did not throw. Behaviour is covered
 * where it lives - useVideoCall.test.ts, RoleRoute.test.tsx, and the backend e2e.
 *
 * Both the empty and the populated state are rendered, because the empty state is the
 * one a fresh deployment actually shows and the one most likely to be broken.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { createTestQueryClient } from '../test/queryWrapper';
import { useAuthStore } from '../store/authStore';
import { ROLE } from '../types/roles';
import type { User } from '../types';

// ---------------------------------------------------------------------------
// API doubles
// ---------------------------------------------------------------------------

const adminApi = {
  getStats: vi.fn(),
  getUsers: vi.fn(),
  getUser: vi.fn(),
  setUserStatus: vi.fn(),
  setUserRole: vi.fn(),
  getClinicians: vi.fn(),
  createClinician: vi.fn(),
  getPatients: vi.fn(),
  getPatientRecord: vi.fn(),
  getBookings: vi.fn(),
  assignBooking: vi.fn(),
  uploadExerciseVideo: vi.fn(),
};

const clinicianApi = {
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  setMyAvailability: vi.fn(),
  addTimeOff: vi.fn(),
  removeTimeOff: vi.fn(),
  getMySchedule: vi.fn(),
  getMyPatients: vi.fn(),
  getReviewQueue: vi.fn(),
  getPatientRecord: vi.fn(),
  getClinicianSlots: vi.fn(),
  bookForPatient: vi.fn(),
};

const exerciseApi = {
  getCatalogue: vi.fn(),
  getExercise: vi.fn(),
  updateExercise: vi.fn(),
  syncCatalogue: vi.fn(),
  getSuggestions: vi.fn(),
  regeneratePlan: vi.fn(),
  getPlans: vi.fn(),
  getPlan: vi.fn(),
  getAdherence: vi.fn(),
  updatePlan: vi.fn(),
  activatePlan: vi.fn(),
  setPlanStatus: vi.fn(),
  addPlanItem: vi.fn(),
  updatePlanItem: vi.fn(),
  removePlanItem: vi.fn(),
  logCompletion: vi.fn(),
};

const videoApi = {
  createSession: vi.fn(),
  listSessions: vi.fn(),
  getSession: vi.fn(),
  getSessionForBooking: vi.fn(),
  joinSession: vi.fn(),
  endSession: vi.fn(),
  saveClinicalNotes: vi.fn(),
  getSessionEvents: vi.fn(),
  enableScreening: vi.fn(),
  revokeScreening: vi.fn(),
  signallingUrl: vi.fn(() => 'ws://test/ws'),
};

vi.mock('../api/admin', () => adminApi);
vi.mock('../api/clinician', () => clinicianApi);
vi.mock('../api/exercises', () => exerciseApi);
vi.mock('../api/video', () => videoApi);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Render a page that reads a route parameter.
 *
 * `renderWithProviders` mounts the element directly inside a MemoryRouter, so
 * `useParams()` returns an empty object - the parameter is only bound when the element
 * sits under a matching <Route>. Pages keyed on an id then read `undefined`, disable
 * their query, and render their loading state forever, which looks like the page being
 * broken rather than the test being wrong.
 */
function renderAtRoute(
  element: React.ReactElement,
  { path, route }: { path: string; route: string },
) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The page's own heading, not the navigation link that shares its label. */
const heading = (name: RegExp | string) => screen.getByRole('heading', { name });
const findHeading = (name: RegExp | string) =>
  screen.findByRole('heading', { name });

const asUser = (role: string, id = 'u1'): User =>
  ({
    id,
    name: 'Test Person',
    phone: '+910000000000',
    role: role as User['role'],
    status: 'ACTIVE',
    sessionCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
  }) as User;

const signIn = (role: string, id = 'u1') =>
  useAuthStore.setState({ user: asUser(role, id), token: 't', isAuthenticated: true });

const STATS = {
  users: { patients: 12, clinicians: 3, admins: 1, newThisWeek: 2 },
  bookings: {
    total: 40,
    confirmed: 20,
    completed: 15,
    cancelled: 5,
    upcoming: 8,
    unassigned: 2,
    today: 3,
  },
  screenings: { posture: 10, gait: 4, rom: 6, thisWeek: 5 },
  consultations: { live: 1, completed: 9 },
  exercisePlans: { awaitingReview: 2, active: 7, completed: 3 },
};

const EXERCISE = {
  id: 'ex1',
  slug: 'chin-tuck',
  name: 'Chin tuck',
  summary: 'Retrains the deep neck flexors.',
  bodyRegion: 'CERVICAL' as const,
  difficulty: 'BEGINNER' as const,
  equipment: [],
  instructions: ['Sit tall.', 'Draw your chin back.'],
  cautions: null,
  reference: 'Kendall',
  videoUrl: null,
  videoProvider: null,
  thumbnailUrl: null,
  durationSeconds: null,
  isActive: true,
};

const PLAN_ITEM = {
  id: 'item1',
  sets: 3,
  reps: 10,
  holdSeconds: 5,
  frequencyPerWeek: 7,
  durationWeeks: null,
  priority: 30,
  displayOrder: 0,
  source: 'AUTO' as const,
  reason: 'Shoulder flexion measured 118°, short of 165°.',
  triggerMetricKeys: ['rom_shoulder_flexion_right'],
  clinicianNote: null,
  isRemoved: false,
  exercise: EXERCISE,
};

const PLAN = {
  id: 'plan1',
  patientId: 'u1',
  bookingId: 'bk1',
  analysisType: 'ROM' as const,
  analysisId: 'an1',
  status: 'ACTIVE' as const,
  title: 'Joint range exercise programme',
  summary: 'Your joint range screening found 2 measurements outside range.',
  clinicianNotes: 'Start gently.',
  findings: [],
  engineVersion: 1,
  durationWeeks: 4,
  reviewedAt: '2026-01-02T00:00:00Z',
  activatedAt: '2026-01-02T00:00:00Z',
  completedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  reviewedBy: { id: 'clin1', name: 'Dr Reed' },
  patient: null,
  items: [PLAN_ITEM],
};

const ADHERENCE = {
  planId: 'plan1',
  status: 'ACTIVE' as const,
  activatedAt: '2026-01-02T00:00:00Z',
  daysActive: 3,
  overallAdherencePercent: 50,
  totalCompleted: 3,
  totalExpected: 6,
  items: [],
};

const CLINICIAN_PROFILE = {
  id: 'clin1',
  name: 'Dr Reed',
  email: 'reed@example.com',
  phone: '+910000000001',
  profileImage: null,
  status: 'ACTIVE',
  profile: {
    id: 'prof1',
    specialisation: 'Musculoskeletal',
    qualifications: 'MSc',
    registrationNo: 'REG1',
    yearsExperience: 8,
    bio: null,
    languages: ['English'],
    consultationModes: ['video'],
    isAcceptingPatients: true,
    timezone: 'Asia/Kolkata',
    slotDurationMinutes: 30,
    maxDailyBookings: null,
  },
  availability: [
    {
      id: 'a1',
      dayOfWeek: 1,
      dayName: 'Tuesday',
      startMinute: 540,
      endMinute: 720,
      startLabel: '09:00',
      endLabel: '12:00',
      isActive: true,
    },
  ],
  timeOff: [],
};

const SCHEDULE_ENTRY = {
  id: 'bk1',
  time: '2026-03-03T09:00:00Z',
  status: 'CONFIRMED',
  description: null,
  remainingScreeningCount: 2,
  usedScreeningCount: 1,
  patient: { id: 'p1', name: 'Sam Patient', phone: '+910000000002', profileImage: null },
  service: { id: 's1', name: 'ROM Assessment', duration: '60 min' },
  consultation: {
    id: 'sess1',
    status: 'WAITING' as const,
    screeningEnabled: false,
    patientWaiting: true,
  },
};

const PATIENT_RECORD = {
  patient: {
    id: 'p1',
    name: 'Sam Patient',
    phone: '+910000000002',
    email: null,
    profileImage: null,
    createdAt: '2026-01-01T00:00:00Z',
  },
  bookings: [
    {
      id: 'bk1',
      time: '2026-03-03T09:00:00Z',
      status: 'CONFIRMED',
      remainingScreeningCount: 2,
      usedScreeningCount: 1,
      service: { id: 's1', name: 'ROM Assessment' },
    },
  ],
  analyses: {
    posture: [],
    gait: [],
    rom: [
      {
        id: 'an1',
        type: 'ROM' as const,
        bookingId: 'bk1',
        analysisDate: '2026-03-03T09:30:00Z',
        status: 'completed',
      },
    ],
  },
  exercisePlans: [
    {
      id: 'plan1',
      analysisType: 'ROM' as const,
      analysisId: 'an1',
      status: 'DRAFT' as const,
      title: 'Joint range programme',
      itemCount: 4,
      createdAt: '2026-03-03T09:31:00Z',
      activatedAt: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false });

  adminApi.getStats.mockResolvedValue(STATS);
  adminApi.getBookings.mockResolvedValue({
    bookings: [],
    total: 0,
    limit: 25,
    offset: 0,
  });
  adminApi.getPatients.mockResolvedValue({
    patients: [],
    total: 0,
    limit: 25,
    offset: 0,
  });
  adminApi.getClinicians.mockResolvedValue([]);
  adminApi.getPatientRecord.mockResolvedValue(PATIENT_RECORD);

  clinicianApi.getMySchedule.mockResolvedValue([]);
  clinicianApi.getMyPatients.mockResolvedValue([]);
  clinicianApi.getReviewQueue.mockResolvedValue([]);
  clinicianApi.getMyProfile.mockResolvedValue(CLINICIAN_PROFILE);
  clinicianApi.getPatientRecord.mockResolvedValue(PATIENT_RECORD);

  exerciseApi.getCatalogue.mockResolvedValue([EXERCISE]);
  exerciseApi.getPlans.mockResolvedValue([]);
  exerciseApi.getPlan.mockResolvedValue(PLAN);
  exerciseApi.getAdherence.mockResolvedValue(ADHERENCE);
  exerciseApi.getSuggestions.mockResolvedValue({
    engineVersion: 1,
    analysisType: 'ROM',
    title: 'Joint range exercise programme',
    summary: 'Your joint range screening found 1 measurement outside its range.',
    findings: [],
    prescriptions: [],
    plan: null,
  });

  videoApi.getSessionForBooking.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Clinician screens
// ---------------------------------------------------------------------------

describe('clinician screens mount', () => {
  it('the dashboard renders with nothing to do', async () => {
    signIn(ROLE.CLINICIAN);
    const { default: Page } = await import('./clinician/DashboardPage');
    renderWithProviders(<Page />);

    expect(await screen.findByText('Your clinic')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Nothing waiting/i)).toBeInTheDocument(),
    );
  });

  it('the dashboard surfaces a waiting patient', async () => {
    signIn(ROLE.CLINICIAN);
    clinicianApi.getMySchedule.mockResolvedValue([SCHEDULE_ENTRY]);
    const { default: Page } = await import('./clinician/DashboardPage');
    renderWithProviders(<Page />);

    // The one genuinely time-critical thing on this page.
    expect(
      await screen.findByText(/A patient is waiting for you/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Sam Patient').length).toBeGreaterThan(0);
    expect(screen.getByText('Join now')).toBeInTheDocument();
  });

  it('the dashboard lists plans awaiting review', async () => {
    signIn(ROLE.CLINICIAN);
    clinicianApi.getReviewQueue.mockResolvedValue([
      {
        id: 'plan1',
        analysisType: 'ROM',
        analysisId: 'an1',
        title: 'Joint range programme',
        summary: null,
        createdAt: '2026-03-03T09:31:00Z',
        itemCount: 4,
        findingCount: 2,
        patient: { id: 'p1', name: 'Sam Patient' },
      },
    ]);
    const { default: Page } = await import('./clinician/DashboardPage');
    renderWithProviders(<Page />);

    expect(await screen.findByText(/awaiting your review/i)).toBeInTheDocument();
    // Awaited: that heading renders whether or not the queue has loaded, so asserting
    // on it alone would pass against an empty list.
    const row = (await screen.findByText('Sam Patient')).closest('a');
    expect(row?.textContent).toMatch(/2 findings/);
    expect(row?.textContent).toMatch(/4 exercises/);
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('the schedule renders empty and populated', async () => {
    signIn(ROLE.CLINICIAN);
    const { default: Page } = await import('./clinician/SchedulePage');
    const view = renderWithProviders(<Page />);
    expect(await findHeading('Schedule')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Nothing booked in this period/i)).toBeInTheDocument(),
    );
    view.unmount();

    clinicianApi.getMySchedule.mockResolvedValue([SCHEDULE_ENTRY]);
    renderWithProviders(<Page />);
    expect(await screen.findByText('Patient waiting')).toBeInTheDocument();
  });

  it('the patient list renders empty and populated', async () => {
    signIn(ROLE.CLINICIAN);
    const { default: Page } = await import('./clinician/PatientsPage');
    const view = renderWithProviders(<Page />);
    expect(await findHeading('My patients')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/No patients assigned to you/i)).toBeInTheDocument(),
    );
    view.unmount();

    clinicianApi.getMyPatients.mockResolvedValue([
      {
        id: 'p1',
        name: 'Sam Patient',
        phone: '+910000000002',
        email: null,
        profileImage: null,
        bookingCount: 2,
        lastSeen: null,
        nextAppointment: '2026-03-03T09:00:00Z',
        remainingScreenings: 2,
        screeningCounts: { posture: 1, gait: 0, rom: 2 },
        draftPlans: 1,
      },
    ]);
    renderWithProviders(<Page />);
    expect(await screen.findByText('Sam Patient')).toBeInTheDocument();
  });

  it('the patient record renders', async () => {
    signIn(ROLE.CLINICIAN);
    const { default: Page } = await import('./clinician/PatientDetailPage');
    renderAtRoute(<Page />, {
      path: '/clinician/patients/:patientId',
      route: '/clinician/patients/p1',
    });

    await waitFor(() => expect(screen.getByText('Appointments')).toBeInTheDocument());
    expect(screen.getByText(/Screenings \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Awaiting review/i)).toBeInTheDocument();
  });

  it('the availability editor renders the week', async () => {
    signIn(ROLE.CLINICIAN);
    const { default: Page } = await import('./clinician/AvailabilityPage');
    renderWithProviders(<Page />);

    expect(await screen.findByText('My working hours')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Tuesday')).toBeInTheDocument());
    // Every day of the week is offered, not only the configured ones.
    expect(screen.getByText('Sunday')).toBeInTheDocument();
    expect(screen.getByText('Time off')).toBeInTheDocument();
  });

  it('the plan review screen renders a draft and offers to prescribe it', async () => {
    signIn(ROLE.CLINICIAN);
    exerciseApi.getPlan.mockResolvedValue({
      ...PLAN,
      status: 'DRAFT',
      items: [PLAN_ITEM, { ...PLAN_ITEM, id: 'item2' }],
      findings: [
        {
          metricKey: 'rom_shoulder_flexion_right',
          clinicalName: 'Shoulder flexion (right)',
          value: 118,
          unit: 'degrees',
          normalRange: [165, 180],
          direction: 'below',
          deviation: 47,
          severity: 'marked',
          exceedsMdc: true,
          mdc95: 1.4,
          actionable: true,
          statement: 'Shoulder flexion (right) measured 118°, short of 165°.',
          side: 'right',
        },
        {
          metricKey: 'rom_cervical_lateral_flexion',
          clinicalName: 'Cervical lateral flexion',
          value: 44.5,
          unit: 'degrees',
          normalRange: [45, 45],
          direction: 'below',
          deviation: 0.5,
          severity: 'borderline',
          exceedsMdc: false,
          mdc95: 0.987,
          actionable: false,
          statement: 'Cervical lateral flexion measured 44.5°.',
          side: 'none',
        },
      ],
    });

    const { default: Page } = await import('./clinician/PlanReviewPage');
    renderAtRoute(<Page />, {
      path: '/clinician/plans/:planId',
      route: '/clinician/plans/plan1',
    });

    expect(
      await screen.findByText(/Draft — not visible to the patient/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Prescribe to patient')).toBeInTheDocument();
    // The borderline finding is shown to the clinician, separated from the rest.
    expect(screen.getByText(/Borderline — not acted on/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Admin screens
// ---------------------------------------------------------------------------

describe('admin screens mount', () => {
  it('the dashboard renders the queues that need attention', async () => {
    signIn(ROLE.ADMIN);
    const { default: Page } = await import('./admin/DashboardPage');
    renderWithProviders(<Page />);

    expect(await screen.findByText('Platform overview')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Unassigned bookings')).toBeInTheDocument(),
    );
    expect(screen.getByText('Plans awaiting review')).toBeInTheDocument();
  });

  it('the patient list renders empty and populated', async () => {
    signIn(ROLE.ADMIN);
    const { default: Page } = await import('./admin/PatientsPage');
    const view = renderWithProviders(<Page />);
    expect(await findHeading('Patients')).toBeInTheDocument();
    view.unmount();

    adminApi.getPatients.mockResolvedValue({
      patients: [
        {
          id: 'p1',
          name: 'Sam Patient',
          phone: '+910000000002',
          email: null,
          role: 'USER',
          roleLabel: 'Patient',
          status: 'ACTIVE',
          profileImage: null,
          sessionCount: 0,
          createdAt: '2026-01-01T00:00:00Z',
          stats: {
            bookings: 2,
            postureAnalyses: 1,
            gaitAnalyses: 0,
            romAnalyses: 2,
            activePlans: 1,
          },
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
    });
    renderWithProviders(<Page />);
    expect(await screen.findByText('Sam Patient')).toBeInTheDocument();
  });

  it('the clinician list renders and offers to add one', async () => {
    signIn(ROLE.ADMIN);
    const { default: Page } = await import('./admin/CliniciansPage');
    renderWithProviders(<Page />);

    expect(await findHeading('Clinicians')).toBeInTheDocument();
    expect(screen.getByText('Add clinician')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/No clinicians yet/i)).toBeInTheDocument(),
    );
  });

  it('the bookings screen renders the assignment control', async () => {
    signIn(ROLE.ADMIN);
    adminApi.getBookings.mockResolvedValue({
      bookings: [
        {
          id: 'bk1',
          time: '2026-03-03T09:00:00Z',
          status: 'CONFIRMED',
          description: null,
          totalAmount: 500,
          paidAmount: 500,
          remainingAmount: 0,
          totalScreeningCount: 3,
          usedScreeningCount: 1,
          remainingScreeningCount: 2,
          createdAt: '2026-01-01T00:00:00Z',
          patient: { id: 'p1', name: 'Sam Patient', phone: '+910000000002' },
          clinician: null,
          service: { id: 's1', name: 'ROM Assessment' },
          payment: { id: 'pay1', status: 'COMPLETED' },
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });
    adminApi.getClinicians.mockResolvedValue([
      {
        id: 'clin1',
        name: 'Dr Reed',
        phone: '+910000000001',
        email: null,
        role: 'CLINICIAN',
        roleLabel: 'Clinician',
        status: 'ACTIVE',
        profileImage: null,
        sessionCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const { default: Page } = await import('./admin/BookingsPage');
    renderWithProviders(<Page />);

    expect(await findHeading('Bookings')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Unassigned')).toBeInTheDocument());
    expect(screen.getByText('Dr Reed')).toBeInTheDocument();
  });

  it('the exercise library renders and flags the empty catalogue', async () => {
    signIn(ROLE.ADMIN);
    exerciseApi.getCatalogue.mockResolvedValue([]);
    const { default: Page } = await import('./admin/ExercisesPage');
    renderWithProviders(<Page />);

    expect(await findHeading('Exercise library')).toBeInTheDocument();
    // The state a fresh deployment is actually in, with the instruction to fix it.
    await waitFor(() =>
      expect(screen.getByText(/The catalogue is empty/i)).toBeInTheDocument(),
    );
  });

  it('the exercise library renders an entry with no video', async () => {
    signIn(ROLE.ADMIN);
    const { default: Page } = await import('./admin/ExercisesPage');
    renderWithProviders(<Page />);

    expect(await screen.findByText('Chin tuck')).toBeInTheDocument();
    // The library ships without videos, so this is the normal state and it must read
    // as such rather than as a broken player.
    expect(screen.getByText(/No video for this exercise yet/i)).toBeInTheDocument();
    expect(screen.getByText('Upload video')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Patient screens
// ---------------------------------------------------------------------------

describe('patient screens mount', () => {
  it('the plan page explains itself when there is no plan', async () => {
    signIn(ROLE.PATIENT);
    const { default: Page } = await import('./MyExercisePlanPage');
    renderWithProviders(<Page />);

    expect(await screen.findByText('My exercise plan')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No plan yet')).toBeInTheDocument());
    // And says why nothing arrives automatically.
    expect(screen.getByText(/your clinician has\s+reviewed/i)).toBeInTheDocument();
  });

  it('the plan page renders an active plan with its exercises and adherence', async () => {
    signIn(ROLE.PATIENT);
    exerciseApi.getPlans.mockResolvedValue([PLAN]);
    const { default: Page } = await import('./MyExercisePlanPage');
    renderWithProviders(<Page />);

    expect(
      await screen.findByText('Joint range exercise programme'),
    ).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Chin tuck')).toBeInTheDocument();
    expect(screen.getByText(/Prescribed by Dr Reed/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Done so far: 3 of 6/)).toBeInTheDocument(),
    );
  });

  it('the consultation page tells a waiting patient there is nothing to do', async () => {
    signIn(ROLE.PATIENT);
    const { default: Page } = await import('./ConsultationPage');
    renderAtRoute(<Page />, {
      path: '/consultation/booking/:bookingId',
      route: '/consultation/booking/bk1',
    });

    expect(
      await screen.findByText(/Your clinician has not joined yet/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/there is nothing you need to do/i)).toBeInTheDocument();
    // A patient must never be able to open a consultation themselves.
    expect(videoApi.createSession).not.toHaveBeenCalled();
  });

  it('the consultation page opens the room for staff', async () => {
    signIn(ROLE.CLINICIAN);
    videoApi.createSession.mockResolvedValue({ id: 'sess1' });
    videoApi.joinSession.mockRejectedValue(new Error('no media in jsdom'));

    const { default: Page } = await import('./ConsultationPage');
    renderAtRoute(<Page />, {
      path: '/consultation/booking/:bookingId',
      route: '/consultation/booking/bk1',
    });

    // Called with the booking id alone; the scheduledAt override is not passed here.
    await waitFor(() => expect(videoApi.createSession).toHaveBeenCalledWith('bk1'));
  });
});

// ---------------------------------------------------------------------------
// The suggestions panel that goes on every report
// ---------------------------------------------------------------------------

describe('the suggested-exercises panel', () => {
  it('says plainly when a screening found nothing to act on', async () => {
    signIn(ROLE.PATIENT);
    const { default: Panel } = await import('../components/exercise/SuggestedExercises');
    renderWithProviders(<Panel analysisType="ROM" analysisId="an1" />);

    expect(await screen.findByText('Suggested exercises')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText(/Nothing in this screening calls for a specific exercise/i),
      ).toBeInTheDocument(),
    );
    // A result, not a gap - and it says so.
    expect(screen.getByText(/That is a result, not a gap/i)).toBeInTheDocument();
  });

  it('labels suggestions as suggestions, not a prescription', async () => {
    signIn(ROLE.PATIENT);
    exerciseApi.getSuggestions.mockResolvedValue({
      engineVersion: 1,
      analysisType: 'ROM',
      title: 'Joint range exercise programme',
      summary: 'Your joint range screening found 1 measurement outside its range.',
      findings: [],
      prescriptions: [
        {
          exerciseSlug: 'chin-tuck',
          name: 'Chin tuck',
          bodyRegion: 'CERVICAL',
          difficulty: 'BEGINNER',
          priority: 30,
          severity: 'moderate',
          reason: 'Neck side-bending is restricted.',
          triggerMetricKeys: ['rom_cervical_lateral_flexion'],
          sides: [],
          sets: 3,
          reps: 10,
          holdSeconds: 5,
          frequencyPerWeek: 7,
          exercise: EXERCISE,
        },
      ],
      plan: null,
    });

    const { default: Panel } = await import('../components/exercise/SuggestedExercises');
    renderWithProviders(<Panel analysisType="ROM" analysisId="an1" />);

    expect(await screen.findByText('Chin tuck')).toBeInTheDocument();
    // The distinction the whole DRAFT/ACTIVE design exists to preserve.
    expect(screen.getByText(/not a\s+prescription/i)).toBeInTheDocument();
  });

  it('reports a failure instead of rendering an empty panel', async () => {
    signIn(ROLE.PATIENT);
    exerciseApi.getSuggestions.mockRejectedValue(new Error('Analysis not found'));

    const { default: Panel } = await import('../components/exercise/SuggestedExercises');
    renderWithProviders(<Panel analysisType="ROM" analysisId="missing" />);

    await waitFor(() =>
      expect(screen.getByText('Analysis not found')).toBeInTheDocument(),
    );
  });
});
