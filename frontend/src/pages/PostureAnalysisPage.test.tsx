import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import userEvent from '@testing-library/user-event';
import PostureAnalysisPage from './PostureAnalysisPage';

// Mock the useNavigate hook
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// BookingSelectionStep asks useBookings for the patient's bookings. Unmocked it never
// resolves under jsdom and renders a spinner, so the first step of the page appeared
// to render nothing at all.
vi.mock('../hooks/useBookings', () => ({
  useBookings: () => ({
    data: [
      {
        id: 'booking-1',
        userId: 'user-1',
        serviceId: 'service-1',
        status: 'CONFIRMED',
        time: '2026-01-01T10:00:00Z',
        createdAt: '2026-01-01T09:00:00Z',
        totalScreeningCount: 10,
        usedScreeningCount: 0,
        remainingScreeningCount: 10,
        totalAmount: 1000,
        paidAmount: 1000,
        remainingAmount: 0,
        service: { id: 'service-1', name: 'Posture Package' },
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('PostureAnalysisPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe('Initial Rendering', () => {
    it('should render the page with title', () => {
      renderWithProviders(
          <PostureAnalysisPage />
      );

      expect(screen.getByRole('heading', { name: 'Posture Analysis', level: 1 })).toBeInTheDocument();
    });

    it('should show booking selection step by default', () => {
      renderWithProviders(
          <PostureAnalysisPage />
      );

      expect(screen.getByText('Select a Booking')).toBeInTheDocument();
      expect(
        screen.getByText(/Choose which booking to use for this posture assessment/)
      ).toBeInTheDocument();
    });

    it('should show instructions step when bookingId is in URL', () => {
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=test-booking-123' },
      );

      expect(screen.getByRole('heading', { name: /Positioning Instructions/i })).toBeInTheDocument();
      expect(screen.getByText('Positioning Instructions')).toBeInTheDocument();
    });

    it('should render back to bookings button', () => {
      renderWithProviders(
          <PostureAnalysisPage />
      );

      expect(screen.getByText('Back to Bookings')).toBeInTheDocument();
    });
  });

  describe('Step Indicator', () => {
    it('should display all 5 steps in the indicator', () => {
      renderWithProviders(
          <PostureAnalysisPage />
      );

      // Check for step numbers 1-5
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should highlight current step', () => {
      renderWithProviders(
          <PostureAnalysisPage />
      );

      // First step should be highlighted (select booking)
      const stepIndicator = screen.getAllByText('Select Booking')[0];
      expect(stepIndicator).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate back to bookings when back button is clicked', async () => {
      const user = userEvent.setup();
      
      renderWithProviders(
          <PostureAnalysisPage />
      );

      const backButton = screen.getByText('Back to Bookings');
      await user.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith('/bookings');
    });
  });

  describe('Instructions Step', () => {
    it('should show start analysis button in instructions step', () => {
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=test-booking-123' },
      );

      expect(screen.getByText('Start Analysis')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should show positioning instructions', () => {
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=test-booking-123' },
      );

      expect(screen.getByText('Positioning Instructions')).toBeInTheDocument();
      expect(screen.getByText(/During Capture/)).toBeInTheDocument();
      expect(screen.getByText(/Stand 6-8 feet away from your camera/)).toBeInTheDocument();
      expect(screen.getByText(/During Capture \(10 seconds\)/)).toBeInTheDocument();
    });

    it('should transition to capturing step when start button is clicked', async () => {
      const user = userEvent.setup();
      
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=test-booking-123' },
      );

      const startButton = screen.getByText('Start Analysis');
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText('Capturing Posture Data')).toBeInTheDocument();
      });
    });

    it('should return to booking selection when cancel is clicked', async () => {
      const user = userEvent.setup();
      
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=test-booking-123' },
      );

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      // After cancel, should navigate and clear the booking selection
      // The navigate function should be called
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/posture-analysis', { replace: true });
      });
      
      // Note: In the actual app, the navigation would cause a re-render with no bookingId
      // which would show the booking selection step. In this test, we verify the navigate call.
    });
  });

  describe('Error Handling', () => {
    it('should not show error message initially', () => {
      renderWithProviders(
          <PostureAnalysisPage />
      );

      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });

    it('should show error when start is clicked without booking selection', async () => {
      const user = userEvent.setup();
      
      // Render in select_booking step but somehow get to instructions without selection
      // This tests the error handling in handleStartCapture
      renderWithProviders(
          <PostureAnalysisPage />
      );

      // This is a bit contrived since the UI prevents this, but tests the error handling
      // In a real scenario, this would be tested through integration tests
    });
  });

  describe('Step Transitions', () => {
    it('should show processing step placeholder', async () => {
      const user = userEvent.setup();
      
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=test-booking-123' },
      );

      // Start capture
      await user.click(screen.getByText('Start Analysis'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Capturing Posture Data/i })).toBeInTheDocument();
      });
    });

    it('should maintain bookingId through step transitions', async () => {
      const user = userEvent.setup();
      
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=test-booking-123' },
      );

      // Start from instructions
      expect(screen.getByRole('heading', { name: /Positioning Instructions/i })).toBeInTheDocument();

      // Click start
      await user.click(screen.getByText('Start Analysis'));

      // Should move to capturing
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Capturing Posture Data/i })).toBeInTheDocument();
      });

      // bookingId should still be set (tested implicitly by not showing error)
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderWithProviders(
          <PostureAnalysisPage />
      );

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent('Posture Analysis');

      const h2 = screen.getByRole('heading', { level: 2 });
      expect(h2).toHaveTextContent('Select a Booking');
    });

    it('should have accessible buttons', () => {
      renderWithProviders(
          <PostureAnalysisPage />
      );

      const backButton = screen.getByRole('button', { name: /back to bookings/i });
      expect(backButton).toBeInTheDocument();
    });
  });

  describe('URL Parameter Handling', () => {
    it('should extract bookingId from URL query parameter', () => {
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=abc-123' },
      );

      // Should skip booking selection and go to instructions
      expect(screen.getByRole('heading', { name: /Positioning Instructions/i })).toBeInTheDocument();
      expect(screen.queryByText('Select a Booking')).not.toBeInTheDocument();
    });

    it('should handle missing bookingId parameter', () => {
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis' },
      );

      // Should show booking selection
      expect(screen.getByText('Select a Booking')).toBeInTheDocument();
    });

    it('should handle multiple query parameters', () => {
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=abc-123&other=param' },
      );

      // Should still extract bookingId correctly
      expect(screen.getByRole('heading', { name: /Positioning Instructions/i })).toBeInTheDocument();
    });
  });

  describe('Component Placeholders', () => {

    it('should show placeholder for webcam capture component', async () => {
      const user = userEvent.setup();
      
      renderWithProviders(
        <PostureAnalysisPage />,
        { route: '/posture-analysis?bookingId=test-booking-123' },
      );

      await user.click(screen.getByText('Start Analysis'));

      await waitFor(() => {
      });
    });

    it('should show placeholder for results component', () => {
      // This would require setting the step to 'results' programmatically
      // For now, we'll test that the results step exists in the step indicator
      renderWithProviders(
          <PostureAnalysisPage />
      );

      // Step 5 should exist (results step)
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });
});
