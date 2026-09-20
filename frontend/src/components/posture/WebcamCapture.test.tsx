import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WebcamCapture from './WebcamCapture';

// Mock react-webcam
vi.mock('react-webcam', () => {
  const React = require('react');
  return {
    default: React.forwardRef((props: any, ref: any) => {
      // Expose getScreenshot method on ref
      React.useImperativeHandle(ref, () => ({
        getScreenshot: () => 'data:image/jpeg;base64,mockImageData'
      }));

      return (
        <div data-testid="mock-webcam">
          <video data-testid="webcam-video" />
        </div>
      );
    })
  };
});

// MediaPipe cannot load in jsdom, so without this the component sits in its "Loading
// AI Model..." branch forever and never renders the webcam, the capture controls or
// anything else these tests look for. That accounted for every failure in this file.
const processFrame = vi.fn(() => null);
vi.mock('../../hooks/useMediaPipePose', () => ({
  useMediaPipePose: () => ({
    poseLandmarker: {},
    isLoading: false,
    error: null,
    processFrame,
    calculateVisibility: () => 1,
    getVisibilityMessage: () => '',
  }),
}));

describe('WebcamCapture', () => {
  const mockOnCaptureComplete = vi.fn();
  const mockOnError = vi.fn();
  const mockOnCancel = vi.fn();
  const mockBookingId = 'test-booking-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  const defaultProps = {
    bookingId: mockBookingId,
    onCaptureComplete: mockOnCaptureComplete,
    onError: mockOnError,
    onCancel: mockOnCancel
  };

  describe('Initialization', () => {
    it('should render webcam component', () => {
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.getByTestId('mock-webcam')).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.getByText('Initializing camera...')).toBeInTheDocument();
    });

    it('starts each phase automatically rather than waiting for a button', () => {
      // There is no "Start Capture" control any more - an effect begins the phase as
      // soon as the subject is in frame and facing the right way. Asserted as an
      // absence so that reintroducing a manual start is a deliberate decision.
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.queryByText('Start Capture')).not.toBeInTheDocument();
    });

    it('should show cancel button', () => {
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('Webcam Permissions', () => {
    it('should start with webcam not ready', () => {
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.getByText('Initializing camera...')).toBeInTheDocument();
    });

    it('offers a way out before anything is captured', () => {
      // What replaced the disabled start button: the patient can always abandon the
      // capture, which is the control that actually matters to them.
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('Pose Guide Overlay', () => {
    it('should render webcam container', () => {
      render(<WebcamCapture {...defaultProps} />);
      // Check that the component renders
      expect(screen.getByTestId('mock-webcam')).toBeInTheDocument();
    });
  });

  describe('Capture Controls', () => {
    it('should call onCancel when cancel button is clicked', () => {
      render(<WebcamCapture {...defaultProps} />);
      
      const cancelButton = screen.getByText('Cancel');
      cancelButton.click();

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Progress Display', () => {
    it('should not show progress bar initially', () => {
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.queryByText(/% Complete/)).not.toBeInTheDocument();
    });
  });

  describe('Instructions', () => {
    it('should show loading state initially', () => {
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.getByText('Initializing camera...')).toBeInTheDocument();
    });
  });


  describe('Development Mode', () => {
    it('should show debug info in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(<WebcamCapture {...defaultProps} />);
      
      expect(screen.getByText(`Booking ID: ${mockBookingId}`)).toBeInTheDocument();
      expect(screen.getByText(/Webcam Ready:/)).toBeInTheDocument();
      expect(screen.getByText(/Capturing:/)).toBeInTheDocument();
      expect(screen.getByText(/Frames Captured:/)).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });
  });
});
