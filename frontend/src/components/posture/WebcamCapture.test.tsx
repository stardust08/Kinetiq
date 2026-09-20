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

    it('should show start capture button', () => {
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.getByText('Start Capture')).toBeInTheDocument();
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

    it('should disable start button initially', () => {
      render(<WebcamCapture {...defaultProps} />);
      const startButton = screen.getByText('Start Capture');
      expect(startButton).toBeDisabled();
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
    it('should show start capture button', () => {
      render(<WebcamCapture {...defaultProps} />);
      expect(screen.getByText('Start Capture')).toBeInTheDocument();
    });

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

  describe('Error Handling', () => {
    it('should show start button as disabled when not ready', () => {
      render(<WebcamCapture {...defaultProps} />);
      const startButton = screen.getByText('Start Capture');
      expect(startButton).toBeDisabled();
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
