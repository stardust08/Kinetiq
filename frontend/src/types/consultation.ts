/**
 * Video consultation and exercise prescription types.
 *
 * Mirrors the payloads in backend/app/api/video and backend/app/api/exercise.
 */

export type AnalysisType = 'POSTURE' | 'GAIT' | 'ROM';

export type VideoSessionStatus =
  | 'SCHEDULED'
  | 'WAITING'
  | 'LIVE'
  | 'ENDED'
  | 'CANCELLED';

export type ParticipantRole = 'PATIENT' | 'CLINICIAN' | 'ADMIN' | 'OBSERVER';

export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export type Severity = 'borderline' | 'mild' | 'moderate' | 'marked';

export type BodyRegion =
  | 'CERVICAL'
  | 'SHOULDER'
  | 'ELBOW'
  | 'THORACIC'
  | 'LUMBAR'
  | 'PELVIS'
  | 'HIP'
  | 'KNEE'
  | 'ANKLE'
  | 'FOOT'
  | 'FULL_BODY';

export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

// ---------------------------------------------------------------------------
// Consultation
// ---------------------------------------------------------------------------

/**
 * The current screening authorisation on a consultation.
 *
 * Note there is no token here. The token is returned exactly once, to the staff member
 * who unlocked the capture, and delivered to the patient over the signalling socket -
 * putting it in the session payload would hand it to everybody on every poll.
 */
export interface ScreeningAuthorisation {
  enabled: boolean;
  type: AnalysisType | null;
  enabledAt: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
}

export interface ConsultationParticipantSummary {
  userId: string;
  role: ParticipantRole;
  connectionId: string;
  joinedAt: string;
}

export interface VideoSession {
  id: string;
  bookingId: string;
  roomName: string;
  status: VideoSessionStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  screening: ScreeningAuthorisation;
  patient: { id: string; name?: string | null; profileImage?: string | null; phone?: string } | null;
  clinician: { id: string; name?: string | null; profileImage?: string | null } | null;
  booking: {
    id: string;
    time: string;
    status: string;
    remainingScreeningCount: number;
    service: { id: string; name: string } | null;
  } | null;
  /** Staff only; null for a patient. */
  clinicalNotes: string | null;
  activeParticipants: ConsultationParticipantSummary[];
  createdAt: string | null;
}

/**
 * What the server says this viewer may do.
 *
 * Used only to decide which controls to draw. Every one of these is re-checked on the
 * endpoint that acts, so a patient who edits them in a debugger gains nothing.
 */
export interface ConsultationPermissions {
  canStartScreening: boolean;
  canEndSession: boolean;
  canWriteClinicalNotes: boolean;
  canInviteParticipants: boolean;
  canShareScreen: boolean;
  canChat: boolean;
  canPerformScreening: boolean;
}

export interface JoinConsultationResult {
  session: VideoSession;
  iceServers: RTCIceServer[];
  role: ParticipantRole;
  permissions: ConsultationPermissions;
}

export interface ConsultationEvent {
  id: string;
  type: string;
  userId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Signalling messages
// ---------------------------------------------------------------------------

export interface RemotePeer {
  connectionId: string;
  userId: string;
  userName: string;
  role: ParticipantRole;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  joinedAt: string;
}

export interface ChatMessage {
  connectionId: string;
  userId: string;
  userName: string;
  role: ParticipantRole;
  text: string;
  at: string;
}

/** Everything the server can send down the signalling socket. */
export type SignalMessage =
  | {
      type: 'room-state';
      connectionId: string;
      self: RemotePeer;
      peers: RemotePeer[];
      /** Connection ids this client must send an offer to. */
      shouldOffer: string[];
      chat: ChatMessage[];
      at: string;
    }
  | { type: 'peer-joined'; peer: RemotePeer; at: string }
  | { type: 'peer-left'; connectionId: string; userId: string; at: string }
  | { type: 'peer-unavailable'; connectionId: string; at: string }
  | {
      type: 'peer-media-state';
      connectionId: string;
      isAudioMuted: boolean;
      isVideoMuted: boolean;
      at: string;
    }
  | { type: 'peer-screen-share'; connectionId: string; isSharing: boolean; at: string }
  | {
      type: 'offer' | 'answer' | 'renegotiate';
      from: string;
      fromUserId: string;
      payload: RTCSessionDescriptionInit;
      at: string;
    }
  | {
      type: 'ice-candidate';
      from: string;
      fromUserId: string;
      payload: RTCIceCandidateInit;
      at: string;
    }
  | (ChatMessage & { type: 'chat' })
  | {
      type: 'screening-authorisation';
      enabled: boolean;
      screeningType: AnalysisType | null;
      enabledBy: string | null;
      at: string;
    }
  | { type: 'screening-token'; token: string; screeningType: AnalysisType; at: string }
  | {
      type: 'screening-started' | 'screening-progress' | 'screening-finished';
      connectionId: string;
      userId: string;
      payload: Record<string, unknown> | null;
      at: string;
    }
  | { type: 'session-ended'; endedBy: string | null; at: string }
  | { type: 'leave-ack'; at: string }
  | { type: 'pong'; at: string }
  | { type: 'error'; code: string; message: string; at: string };

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string | null;
  slug: string;
  name: string;
  summary?: string | null;
  bodyRegion: BodyRegion;
  difficulty: Difficulty;
  equipment: string[];
  instructions: string[];
  cautions?: string | null;
  reference?: string | null;
  videoUrl?: string | null;
  /** youtube | vimeo | mp4 | hls. Chooses which player to mount. */
  videoProvider?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  isActive?: boolean;
}

/**
 * One measurement that landed outside its expected range.
 *
 * `actionable` is false for a deviation smaller than the metric's own measurement
 * repeatability. Such a finding is shown to a clinician and drives no exercises - see
 * backend/app/core/exercise/engine.py.
 */
export interface Finding {
  metricKey: string;
  clinicalName: string;
  value: number;
  unit: string;
  normalRange: [number, number];
  direction: 'below' | 'above';
  deviation: number;
  severity: Severity;
  exceedsMdc: boolean | null;
  mdc95: number | null;
  actionable: boolean;
  statement: string;
  side: 'left' | 'right' | 'none';
}

export interface ExercisePlanItem {
  id: string;
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  frequencyPerWeek: number;
  durationWeeks: number | null;
  priority: number;
  displayOrder: number;
  source: 'AUTO' | 'MANUAL';
  reason: string | null;
  triggerMetricKeys: string[];
  clinicianNote: string | null;
  isRemoved: boolean;
  exercise: Exercise | null;
}

export interface ExercisePlan {
  id: string;
  patientId: string;
  bookingId: string;
  analysisType: AnalysisType;
  analysisId: string;
  status: PlanStatus;
  title: string | null;
  summary: string | null;
  clinicianNotes: string | null;
  findings: Finding[] | null;
  engineVersion: number;
  durationWeeks: number;
  reviewedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  reviewedBy: { id: string; name?: string | null } | null;
  patient: { id: string; name?: string | null } | null;
  items: ExercisePlanItem[];
}

/** A suggestion computed live from an analysis and stored nowhere. */
export interface Suggestion {
  exerciseSlug: string;
  name: string;
  bodyRegion: BodyRegion;
  difficulty: Difficulty;
  priority: number;
  severity: Severity;
  reason: string;
  triggerMetricKeys: string[];
  sides: Array<'left' | 'right'>;
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  frequencyPerWeek: number;
  exercise: Exercise | null;
}

export interface SuggestionsResult {
  engineVersion: number;
  analysisType: AnalysisType;
  title: string;
  summary: string;
  findings: Finding[];
  prescriptions: Suggestion[];
  /** The stored plan, if one exists. Null until a screening has generated one. */
  plan: ExercisePlan | null;
}

export interface AdherenceItem {
  itemId: string;
  exerciseName: string | null;
  completed: number;
  expected: number;
  adherencePercent: number;
  lastCompletedAt: string | null;
  averagePainScore: number | null;
}

export interface AdherenceSummary {
  planId: string;
  status: PlanStatus;
  activatedAt: string | null;
  daysActive: number;
  overallAdherencePercent: number;
  totalCompleted: number;
  totalExpected: number;
  items: AdherenceItem[];
}

// ---------------------------------------------------------------------------
// Clinician
// ---------------------------------------------------------------------------

export interface AvailabilityWindow {
  id?: string;
  dayOfWeek: number;
  dayName?: string;
  startMinute: number;
  endMinute: number;
  startLabel?: string;
  endLabel?: string;
  isActive?: boolean;
}

export interface TimeOffEntry {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
}

export interface ClinicianProfile {
  id: string;
  name?: string | null;
  email?: string | null;
  phone: string;
  profileImage?: string | null;
  status: string;
  profile: {
    id: string;
    specialisation: string | null;
    qualifications: string | null;
    registrationNo: string | null;
    yearsExperience: number | null;
    bio: string | null;
    languages: string[];
    consultationModes: string[];
    isAcceptingPatients: boolean;
    timezone: string;
    slotDurationMinutes: number;
    maxDailyBookings: number | null;
  };
  availability: AvailabilityWindow[];
  timeOff: TimeOffEntry[];
}

export interface ScheduleEntry {
  id: string;
  time: string;
  status: string;
  description: string | null;
  remainingScreeningCount: number;
  usedScreeningCount: number;
  patient: {
    id: string;
    name?: string | null;
    phone: string;
    profileImage?: string | null;
  } | null;
  service: { id: string; name: string; duration?: string | null } | null;
  consultation: {
    id: string;
    status: VideoSessionStatus;
    screeningEnabled: boolean;
    /** The patient is in the room and nobody has joined them yet. */
    patientWaiting: boolean;
  } | null;
}

export interface CaseloadPatient {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
  profileImage?: string | null;
  bookingCount: number;
  lastSeen: string | null;
  nextAppointment: string | null;
  remainingScreenings: number;
  screeningCounts: { posture: number; gait: number; rom: number };
  draftPlans: number;
}

export interface AnalysisSummary {
  id: string;
  type: AnalysisType;
  bookingId: string;
  analysisDate: string;
  status?: string | null;
  schemaVersion?: number | null;
}

export interface PatientRecord {
  patient: {
    id: string;
    name?: string | null;
    phone: string;
    email?: string | null;
    profileImage?: string | null;
    createdAt: string;
  } | null;
  bookings: Array<{
    id: string;
    time: string;
    status: string;
    remainingScreeningCount: number;
    usedScreeningCount: number;
    service: { id: string; name: string } | null;
    clinician?: { id: string; name?: string | null } | null;
  }>;
  analyses: {
    posture: AnalysisSummary[];
    gait: AnalysisSummary[];
    rom: AnalysisSummary[];
  };
  exercisePlans: Array<{
    id: string;
    analysisType: AnalysisType;
    analysisId: string;
    status: PlanStatus;
    title: string | null;
    summary?: string | null;
    itemCount: number;
    createdAt: string;
    activatedAt: string | null;
  }>;
  consultations?: Array<{
    id: string;
    status: VideoSessionStatus;
    startedAt: string | null;
    endedAt: string | null;
    clinician: { id: string; name?: string | null } | null;
  }>;
}

export interface ReviewQueueEntry {
  id: string;
  analysisType: AnalysisType;
  analysisId: string;
  title: string | null;
  summary: string | null;
  createdAt: string;
  itemCount: number;
  findingCount: number;
  patient: { id: string; name?: string | null } | null;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  name?: string | null;
  email?: string | null;
  phone: string;
  role: string;
  roleLabel: string;
  status: string;
  profileImage?: string | null;
  sessionCount: number;
  createdAt: string;
  clinicianProfile?: {
    id: string;
    specialisation: string | null;
    qualifications: string | null;
    registrationNo: string | null;
    yearsExperience: number | null;
    bio: string | null;
    languages: string[];
    isAcceptingPatients: boolean;
    timezone: string;
    slotDurationMinutes: number;
    maxDailyBookings: number | null;
  };
  stats?: Record<string, number>;
}

export interface AdminPatientListEntry extends AdminUser {
  stats: {
    bookings: number;
    postureAnalyses: number;
    gaitAnalyses: number;
    romAnalyses: number;
    activePlans: number;
  };
}

export interface AdminBookingEntry {
  id: string;
  time: string;
  status: string;
  description: string | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  totalScreeningCount: number;
  usedScreeningCount: number;
  remainingScreeningCount: number;
  createdAt: string;
  patient: { id: string; name?: string | null; phone: string } | null;
  clinician: { id: string; name?: string | null } | null;
  service: { id: string; name: string } | null;
  payment: { id: string; status: string } | null;
}

export interface PlatformStats {
  users: { patients: number; clinicians: number; admins: number; newThisWeek: number };
  bookings: {
    total: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    upcoming: number;
    unassigned: number;
    today: number;
  };
  screenings: { posture: number; gait: number; rom: number; thisWeek: number };
  consultations: { live: number; completed: number };
  exercisePlans: { awaitingReview: number; active: number; completed: number };
}

export interface Paginated<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}
