// =========================
// Enums
// =========================

export type UserRole = 'USER' | 'CLINICIAN' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type PaymentType = 'FULL' | 'PARTIAL';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

// =========================
// Re-exports from other type files
// =========================

// Import and re-export service types
import type { Service as ServiceType } from './service';
import type { MetricsPayload, QualityFlags } from './metrics';
export type { Service, ServiceInfo } from './service';

// Import and re-export posture response types
export type {
  StartAnalysisResponse,
  ProcessFrameResponse,
  PostureMetrics,
  PostureAnalysisResponse,
  ValidateBookingResponse,
  ScreeningCountInfo,
  BookingWithScreeningCount
} from './posture-responses';

// =========================
// Core Domain Types
// =========================

export interface User {
  id: string;
  email?: string;
  name?: string;
  role: UserRole;
  phone: string;
  status: UserStatus;
  profileImage?: string;
  sessionCount: number;
  notificationPreference?: Record<string, any>;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  status?: string;
  serviceCount: number;
  createdAt: string;
}

export interface CartItem {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  cartValue: number;
  itemCount: number;
  updatedAt: string;
}

export interface Payment {
  id: string | null;   // null for draft (cart-synthesized) bookings
  userId: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: PaymentStatus;
  paymentMethod?: string;
  transactionId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Booking {
  id: string;
  userId: string;
  serviceId: string;
  paymentId: string | null;   // null for draft (cart-synthesized) bookings
  clinicianId?: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  time: string | null;         // null for draft bookings (time not yet selected)
  status: BookingStatus;
  description?: string;
  createdAt: string;
  // Screening count fields
  totalScreeningCount: number;
  usedScreeningCount: number;
  remainingScreeningCount: number;
  service?: ServiceType;
  payment?: Payment;
  postureAnalyses?: PostureAnalysisSummary[];
  isDraft?: boolean;            // true = synthesized from cart, no real DB record
}

export interface PostureAnalysisSummary {
  id: string;
  analysisDate: string;
  status: string;
}

/**
 * A stored posture analysis.
 *
 * The flat numeric fields below are the LEGACY columns. They are retained so existing
 * readers keep working, but they are filled conservatively: a legacy column receives a
 * value only where the v2 metric measures the same quantity in the same unit, so most
 * of them are NULL on any analysis recorded after the measurement rewrite. New readers
 * should use `metricsJson`, which carries every metric with its own unit, normal range,
 * citation and measurement status.
 */
export interface PostureAnalysis {
  id: string;
  userId: string;
  bookingId: string;
  analysisDate: string;
  status: string;

  /** v2 metric payload. Present on analyses recorded after the measurement rewrite. */
  metricsJson?: MetricsPayload | null;
  /** Capture-quality warnings, e.g. an assumed aspect ratio. */
  qualityFlags?: QualityFlags | null;
  /** 2 or higher means metricsJson is authoritative and the legacy columns are not. */
  schemaVersion?: number;
  
  // I. Global Posture (8 metrics)
  fhdPixels: number;
  cervicalAngle: number;
  headLateralFlexion: number;
  headRotation: number;
  thoracicKyphosisAngle: number;
  lumbarLordosisAngle: number;
  trunkLateralShift: number;
  trunkAngle: number;
  
  // II. Shoulder & Arm (6 metrics)
  leftShoulderAngle: number;
  rightShoulderAngle: number;
  shoulderHeightDiff: number;
  roundedShoulderAngle: number;
  leftElbowAngle: number;
  rightElbowAngle: number;
  
  // III. Pelvis & Hip (5 metrics)
  leftHipAngle: number;
  rightHipAngle: number;
  pelvicObliquity: number;
  pelvicTiltAngle: number;
  hipHeightDiff: number;
  
  // IV. Lower Extremity (9 metrics)
  leftKneeAngle: number;
  rightKneeAngle: number;
  kneeVarusValgus: number;
  kneeFlexionNeutral: number;
  qAngleLeft: number;
  qAngleRight: number;
  footProgressionAngle: number;
  pronationSupinationLeft: number;
  pronationSupinationRight: number;
  
  // V. Body Proportions (7 metrics)
  shoulderWidth: number;
  hipWidth: number;
  torsoLength: number;
  leftArmLength: number;
  rightArmLength: number;
  leftLegLength: number;
  rightLegLength: number;
  
  // Raw data
  landmarksData?: Record<string, any>;
  capturedPoses?: string; // Comma-separated list: "front,side,back"

  // Captured pose images (base64 data URIs)
  images?: {
    front: string | null;
    side: string | null;
    back: string | null;
  };

  // Per-pose image + skeleton data returned by get_analysis_by_id
  poses?: {
    [poseType: string]: {
      imageData: string | null;
      landmarks2D: Array<{ x: number; y: number; z: number; visibility?: number }> | null;
      landmarks3D: Array<{ x: number; y: number; z: number; visibility?: number }> | null;
      visibility: number;
      frameIndex: number;
    } | null;
  };

  // Relations
  booking?: Booking;
}

export interface Report {
  id: string;
  userId: string;
  bookingId: string;
  reportUrl: string;
  description?: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  serviceId: string;
  amount: number;
  createdAt: string;
  startAt: string;
  expirationAt: string;
  service?: ServiceType;
}

// =========================
// API Response Types
// =========================

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
}

// Auth API Responses
export interface LoginResponse {
  token: string | null;
  user: User | null;
  requiresProfileCompletion?: boolean;
  phone?: string;
}

export interface OtpResponse {
  message: string;
  expiresAt: string;
}

// Cart API Responses
export interface AddToCartRequest {
  serviceId: string;
  quantity: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
}

// Booking API Responses
export interface CreateBookingRequest {
  serviceId: string;
  time: string;
  description?: string;
}

export interface AssignClinicianRequest {
  clinicianId: string;
}

// Payment API Responses
export interface InitiatePaymentResponse {
  paymentId: string;
  bookingId: string;
  totalAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  status: PaymentStatus;
}

export interface PayRemainingRequest {
  amount: number;
  paymentMethod?: string;
}

export interface PaymentCompleteResponse {
  paymentId: string;
  status: PaymentStatus;
  paidAmount: number;
  remainingAmount: number;
  completedAt?: string;
}

// =========================
// Posture Analysis API Types
// =========================

/**
 * Request to start a new posture analysis session
 */
export interface StartAnalysisRequest {
  bookingId: string;
}

/**
 * Request to process a single video frame
 */
export interface ProcessFrameRequest {
  sessionId: string;
  frameData: string;
  frameNumber: number;
  poseType?: 'front' | 'side' | 'back';
}

/**
 * Request to finalize and save analysis
 */
export interface FinalizeAnalysisRequest {
  sessionId: string;
  bookingId: string;
  landmarksData: Record<string, any>;
}

/**
 * Request to cancel analysis session
 */
export interface CancelAnalysisRequest {
  sessionId: string;
}

/**
 * Analysis step enum for UI flow
 */
export type AnalysisStep = 
  | 'idle'
  | 'selecting_booking'
  | 'validating'
  | 'instructions'
  | 'capturing'
  | 'processing'
  | 'complete'
  | 'error';

/**
 * Analysis state for usePostureAnalysis hook
 */
export interface AnalysisState {
  step: AnalysisStep;
  sessionId: string | null;
  bookingId: string | null;
  progress: number;
  frameCount: number;
  collectedFrames: Array<{ frameData: string; frameNumber: number; landmarks?: any }>;
  error: string | null;
  analysisResult: PostureAnalysis | null;
}

// =========================
// Component Props Interfaces
// =========================

/**
 * Props for WebcamCapture component
 */
export interface WebcamCaptureProps {
  /** Callback when capture is complete with all frames */
  onCaptureComplete: (frames: string[]) => void;
  /** Callback when an error occurs */
  onError: (error: string) => void;
  /** Callback when user cancels */
  onCancel: () => void;
  /** Booking ID for the analysis session */
  bookingId: string;
}

/**
 * Props for MetricsDisplay component
 */
export interface MetricsDisplayProps {
  /** Complete posture analysis with all 33 metrics */
  analysis: PostureAnalysis;
  /** Optional remaining screening count to display */
  remainingScreeningCount?: number;
}

/**
 * Props for AnalysisProgress component
 */
export interface AnalysisProgressProps {
  /** Current frame count */
  frameCount: number;
  /** Total frames to capture (default: 450) */
  totalFrames?: number;
  /** Elapsed time in seconds */
  elapsedTime: number;
  /** Total duration in seconds (default: 15) */
  totalDuration?: number;
  /** Current status message */
  statusMessage?: string;
  /** Whether the capture is currently active */
  isCapturing?: boolean;
}

/**
 * Props for BookingSelectionStep component
 */
export interface BookingSelectionStepProps {
  /** Callback when user confirms booking selection */
  onBookingSelected: (bookingId: string) => void;
  /** Optional pre-selected booking ID from URL */
  preSelectedBookingId?: string;
}

/**
 * Props for BookingSelector component
 */
export interface BookingSelectorProps {
  /** List of bookings to display */
  bookings: Booking[];
  /** Currently selected booking ID */
  selectedBookingId?: string;
  /** Callback when a booking is selected */
  onSelectBooking: (bookingId: string) => void;
}

/**
 * Props for BookingCard component
 */
export interface BookingCardProps {
  /** Booking data to display */
  booking: Booking;
  /** Whether this booking is selected */
  isSelected?: boolean;
  /** Callback when booking is clicked */
  onClick?: () => void;
  /** Whether to show action buttons */
  showActions?: boolean;
}

/**
 * Props for ScreeningCountBadge component
 */
export interface ScreeningCountBadgeProps {
  /** Total allocated screening count */
  totalCount: number;
  /** Used screening count */
  usedCount: number;
  /** Remaining screening count */
  remainingCount: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show progress bar */
  showProgress?: boolean;
}

/**
 * Props for InstructionsPanel component
 * No props - displays static instructions
 */
export interface InstructionsPanelProps {}

/**
 * Props for SkeletonVisualization component
 */
export interface SkeletonVisualizationProps {
  /** Landmarks data for 3D rendering */
  landmarksData: Record<string, any>;
  /** View angle (anterior, lateral, posterior) */
  viewAngle?: 'anterior' | 'lateral' | 'posterior';
  /** Whether to show rotation controls */
  showControls?: boolean;
  /** Width of the visualization */
  width?: number;
  /** Height of the visualization */
  height?: number;
}

/**
 * Props for AssessmentHistory component
 */
export interface AssessmentHistoryProps {
  /** Optional booking ID to filter assessments */
  bookingId?: string;
  /** Number of items per page */
  pageSize?: number;
}

/**
 * Props for AssessmentCard component
 */
export interface AssessmentCardProps {
  /** Assessment data to display */
  assessment: PostureAnalysis;
  /** Whether to show booking info */
  showBookingInfo?: boolean;
  /** Callback when "View Details" is clicked */
  onViewDetails?: (assessmentId: string) => void;
}

/**
 * Props for AssessmentDetailView component
 */
export interface AssessmentDetailViewProps {
  /** Assessment ID to display */
  assessmentId: string;
  /** Whether to show comparison option */
  showComparisonOption?: boolean;
}

/**
 * Props for AssessmentComparison component
 */
export interface AssessmentComparisonProps {
  /** Array of assessment IDs to compare */
  assessmentIds: string[];
  /** Maximum number of assessments to compare */
  maxComparisons?: number;
}

/**
 * Props for NoBookingsState component
 * No props - displays static empty state
 */
export interface NoBookingsStateProps {}

/**
 * Props for NoCountsState component
 */
export interface NoCountsStateProps {
  /** List of bookings (to show summary) */
  bookings: Booking[];
}
