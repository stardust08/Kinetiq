/**
 * Component Types Test
 * 
 * Verifies that all component prop interfaces are properly defined and exported.
 */

import { describe, it, expect } from 'vitest';
import type {
  // Analysis types
  AnalysisStep,
  AnalysisState,
  
  // Component prop interfaces
  WebcamCaptureProps,
  MetricsDisplayProps,
  AnalysisProgressProps,
  BookingSelectionStepProps,
  BookingSelectorProps,
  BookingCardProps,
  ScreeningCountBadgeProps,
  InstructionsPanelProps,
  SkeletonVisualizationProps,
  AssessmentHistoryProps,
  AssessmentCardProps,
  AssessmentDetailViewProps,
  AssessmentComparisonProps,
  NoBookingsStateProps,
  NoCountsStateProps,
  
  // Domain types
  PostureAnalysis,
  Booking,
} from './index';

describe('Component Types', () => {
  describe('AnalysisStep enum', () => {
    it('should have all required step values', () => {
      const steps: AnalysisStep[] = [
        'idle',
        'selecting_booking',
        'validating',
        'instructions',
        'capturing',
        'processing',
        'complete',
        'error',
      ];
      
      // Type check - if this compiles, the enum is correct
      expect(steps).toBeDefined();
    });
  });

  describe('AnalysisState interface', () => {
    it('should have all required properties', () => {
      const state: AnalysisState = {
        step: 'idle',
        sessionId: null,
        bookingId: null,
        progress: 0,
        frameCount: 0,
        collectedFrames: [],
        error: null,
        analysisResult: null,
      };
      
      expect(state).toBeDefined();
      expect(state.step).toBe('idle');
    });
  });

  describe('WebcamCaptureProps interface', () => {
    it('should have all required properties', () => {
      const props: WebcamCaptureProps = {
        onCaptureComplete: (frames: string[]) => {},
        onError: (error: string) => {},
        onCancel: () => {},
        bookingId: 'test-booking-id',
      };
      
      expect(props).toBeDefined();
      expect(props.bookingId).toBe('test-booking-id');
    });
  });

  describe('MetricsDisplayProps interface', () => {
    it('should have required analysis property', () => {
      const mockAnalysis: PostureAnalysis = {
        id: 'test-id',
        userId: 'user-id',
        bookingId: 'booking-id',
        analysisDate: '2024-01-01',
        status: 'completed',
        // Global Posture
        fhdPixels: 25,
        cervicalAngle: 40,
        headLateralFlexion: 0,
        headRotation: 0,
        thoracicKyphosisAngle: 30,
        lumbarLordosisAngle: 40,
        trunkLateralShift: 0,
        trunkAngle: 0,
        // Shoulder & Arm
        leftShoulderAngle: 90,
        rightShoulderAngle: 90,
        shoulderHeightDiff: 5,
        roundedShoulderAngle: 10,
        leftElbowAngle: 180,
        rightElbowAngle: 180,
        // Pelvis & Hip
        leftHipAngle: 180,
        rightHipAngle: 180,
        pelvicObliquity: 0,
        pelvicTiltAngle: 0,
        hipHeightDiff: 5,
        // Lower Extremity
        leftKneeAngle: 180,
        rightKneeAngle: 180,
        kneeVarusValgus: 0,
        kneeFlexionNeutral: 180,
        qAngleLeft: 12,
        qAngleRight: 12,
        footProgressionAngle: 5,
        pronationSupinationLeft: 0,
        pronationSupinationRight: 0,
        // Body Proportions
        shoulderWidth: 400,
        hipWidth: 350,
        torsoLength: 500,
        leftArmLength: 600,
        rightArmLength: 600,
        leftLegLength: 900,
        rightLegLength: 900,
      };

      const props: MetricsDisplayProps = {
        analysis: mockAnalysis,
        remainingScreeningCount: 5,
      };
      
      expect(props).toBeDefined();
      expect(props.analysis.id).toBe('test-id');
      expect(props.remainingScreeningCount).toBe(5);
    });
  });

  describe('AnalysisProgressProps interface', () => {
    it('should have all required properties', () => {
      const props: AnalysisProgressProps = {
        frameCount: 150,
        totalFrames: 450,
        elapsedTime: 5,
        totalDuration: 15,
        statusMessage: 'Capturing frames...',
        isCapturing: true,
      };
      
      expect(props).toBeDefined();
      expect(props.frameCount).toBe(150);
      expect(props.totalFrames).toBe(450);
    });

    it('should allow optional properties to be omitted', () => {
      const props: AnalysisProgressProps = {
        frameCount: 150,
        elapsedTime: 5,
      };
      
      expect(props).toBeDefined();
      expect(props.totalFrames).toBeUndefined();
    });
  });

  describe('BookingSelectionStepProps interface', () => {
    it('should have required callback', () => {
      const props: BookingSelectionStepProps = {
        onBookingSelected: (bookingId: string) => {},
        preSelectedBookingId: 'booking-123',
      };
      
      expect(props).toBeDefined();
      expect(props.preSelectedBookingId).toBe('booking-123');
    });
  });

  describe('BookingSelectorProps interface', () => {
    it('should have bookings array and callbacks', () => {
      const props: BookingSelectorProps = {
        bookings: [],
        selectedBookingId: 'booking-123',
        onSelectBooking: (bookingId: string) => {},
      };
      
      expect(props).toBeDefined();
      expect(props.bookings).toEqual([]);
    });
  });

  describe('BookingCardProps interface', () => {
    it('should have booking and optional properties', () => {
      const mockBooking: Booking = {
        id: 'booking-123',
        userId: 'user-123',
        serviceId: 'service-123',
        paymentId: 'payment-123',
        totalAmount: 100,
        paidAmount: 100,
        remainingAmount: 0,
        time: '2024-01-01T10:00:00Z',
        status: 'CONFIRMED',
        createdAt: '2024-01-01T09:00:00Z',
        totalScreeningCount: 10,
        usedScreeningCount: 5,
        remainingScreeningCount: 5,
      };

      const props: BookingCardProps = {
        booking: mockBooking,
        isSelected: true,
        onClick: () => {},
        showActions: true,
      };
      
      expect(props).toBeDefined();
      expect(props.booking.id).toBe('booking-123');
      expect(props.isSelected).toBe(true);
    });
  });

  describe('ScreeningCountBadgeProps interface', () => {
    it('should have count properties', () => {
      const props: ScreeningCountBadgeProps = {
        totalCount: 10,
        usedCount: 5,
        remainingCount: 5,
        size: 'md',
        showProgress: true,
      };
      
      expect(props).toBeDefined();
      expect(props.totalCount).toBe(10);
      expect(props.remainingCount).toBe(5);
    });
  });

  describe('SkeletonVisualizationProps interface', () => {
    it('should have landmarks data and optional properties', () => {
      const props: SkeletonVisualizationProps = {
        landmarksData: { pose: {}, face: {} },
        viewAngle: 'anterior',
        showControls: true,
        width: 800,
        height: 600,
      };
      
      expect(props).toBeDefined();
      expect(props.viewAngle).toBe('anterior');
      expect(props.width).toBe(800);
    });
  });

  describe('AssessmentHistoryProps interface', () => {
    it('should have optional filter properties', () => {
      const props: AssessmentHistoryProps = {
        bookingId: 'booking-123',
        pageSize: 10,
      };
      
      expect(props).toBeDefined();
      expect(props.bookingId).toBe('booking-123');
      expect(props.pageSize).toBe(10);
    });
  });

  describe('AssessmentCardProps interface', () => {
    it('should have assessment and optional properties', () => {
      const mockAssessment: PostureAnalysis = {
        id: 'assessment-123',
        userId: 'user-123',
        bookingId: 'booking-123',
        analysisDate: '2024-01-01',
        status: 'completed',
        fhdPixels: 25,
        cervicalAngle: 40,
        headLateralFlexion: 0,
        headRotation: 0,
        thoracicKyphosisAngle: 30,
        lumbarLordosisAngle: 40,
        trunkLateralShift: 0,
        trunkAngle: 0,
        leftShoulderAngle: 90,
        rightShoulderAngle: 90,
        shoulderHeightDiff: 5,
        roundedShoulderAngle: 10,
        leftElbowAngle: 180,
        rightElbowAngle: 180,
        leftHipAngle: 180,
        rightHipAngle: 180,
        pelvicObliquity: 0,
        pelvicTiltAngle: 0,
        hipHeightDiff: 5,
        leftKneeAngle: 180,
        rightKneeAngle: 180,
        kneeVarusValgus: 0,
        kneeFlexionNeutral: 180,
        qAngleLeft: 12,
        qAngleRight: 12,
        footProgressionAngle: 5,
        pronationSupinationLeft: 0,
        pronationSupinationRight: 0,
        shoulderWidth: 400,
        hipWidth: 350,
        torsoLength: 500,
        leftArmLength: 600,
        rightArmLength: 600,
        leftLegLength: 900,
        rightLegLength: 900,
      };

      const props: AssessmentCardProps = {
        assessment: mockAssessment,
        showBookingInfo: true,
        onViewDetails: (id: string) => {},
      };
      
      expect(props).toBeDefined();
      expect(props.assessment.id).toBe('assessment-123');
    });
  });

  describe('AssessmentDetailViewProps interface', () => {
    it('should have assessment ID', () => {
      const props: AssessmentDetailViewProps = {
        assessmentId: 'assessment-123',
        showComparisonOption: true,
      };
      
      expect(props).toBeDefined();
      expect(props.assessmentId).toBe('assessment-123');
    });
  });

  describe('AssessmentComparisonProps interface', () => {
    it('should have assessment IDs array', () => {
      const props: AssessmentComparisonProps = {
        assessmentIds: ['assessment-1', 'assessment-2'],
        maxComparisons: 3,
      };
      
      expect(props).toBeDefined();
      expect(props.assessmentIds).toHaveLength(2);
      expect(props.maxComparisons).toBe(3);
    });
  });

  describe('NoBookingsStateProps interface', () => {
    it('should be an empty interface', () => {
      const props: NoBookingsStateProps = {};
      
      expect(props).toBeDefined();
    });
  });

  describe('NoCountsStateProps interface', () => {
    it('should have bookings array', () => {
      const props: NoCountsStateProps = {
        bookings: [],
      };
      
      expect(props).toBeDefined();
      expect(props.bookings).toEqual([]);
    });
  });
});
