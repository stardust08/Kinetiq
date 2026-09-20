/**
 * Posture Analysis Response Types
 * 
 * TypeScript interfaces for all API response types related to posture analysis.
 * These types match the backend Pydantic schemas defined in the design document.
 */

/**
 * Response when starting a posture analysis session
 */
export interface StartAnalysisResponse {
  sessionId: string;
  bookingId: string;
  remainingCount: number;
  expiresAt: string;
}

/**
 * Response after processing a single video frame
 */
export interface ProcessFrameResponse {
  landmarks?: Record<string, any>;
  visibility: number;
  progress: number;
  message?: string;
}

/**
 * All 33 clinical posture metrics
 * Organized by anatomical category
 * 
 * Note: The spec lists 33 numbered items, but some items represent pairs (left/right),
 * resulting in 35 individual fields in this interface.
 */
export interface PostureMetrics {
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
}

/**
 * Complete posture analysis response with all metrics and metadata
 */
export interface PostureAnalysisResponse {
  id: string;
  userId: string;
  bookingId: string;
  analysisDate: string;
  metrics: PostureMetrics;
  landmarksData?: Record<string, any>;
  status: string;
  
  // Computed fields for clinical interpretation
  normalRanges?: Record<string, { min: number; max: number }>;
  deviations?: Record<string, string>;
}

/**
 * Response for booking validation before starting analysis
 */
export interface ValidateBookingResponse {
  valid: boolean;
  remainingCount: number;
  totalCount: number;
  usedCount: number;
  message?: string;
}

/**
 * Screening count information for a booking
 */
export interface ScreeningCountInfo {
  totalCount: number;
  usedCount: number;
  remainingCount: number;
}

/**
 * Booking with screening count information
 * Extended from base Booking type with screening count details
 */
export interface BookingWithScreeningCount {
  id: string;
  userId: string;
  serviceId: string;
  paymentId: string;
  clinicianId?: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  time: string;
  status: string;
  description?: string;
  createdAt: string;
  
  // Screening count information
  screeningCount: ScreeningCountInfo;
  
  // Relations
  service?: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    basePrice: number;
    salePrice?: number;
    includedScreeningCount?: number;
  };
  payment?: {
    id: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    status: string;
  };
}
