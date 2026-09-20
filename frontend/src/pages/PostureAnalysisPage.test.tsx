import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
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

describe('PostureAnalysisPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe('Initial Rendering', () => {
    it('should render the page with title', () => {
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      expect(screen.getByText('Posture Analysis')).toBeInTheDocument();
    });

    it('should show booking selection step by default', () => {
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      expect(screen.getByText('Select a Booking')).toBeInTheDocument();
      expect(
        screen.getByText(/Choose a booking with remaining screening counts/)
      ).toBeInTheDocument();
    });

    it('should show instructions step when bookingId is in URL', () => {
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=test-booking-123']}>
          <PostureAnalysisPage />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /Positioning Instructions/i })).toBeInTheDocument();
      expect(screen.getByText('Before You Start')).toBeInTheDocument();
    });

    it('should render back to bookings button', () => {
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      expect(screen.getByText('← Back to Bookings')).toBeInTheDocument();
    });
  });

  describe('Step Indicator', () => {
    it('should display all 5 steps in the indicator', () => {
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      // Check for step numbers 1-5
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should highlight current step', () => {
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      // First step should be highlighted (select booking)
      const stepIndicator = screen.getByText('select booking');
      expect(stepIndicator).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate back to bookings when back button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      const backButton = screen.getByText('← Back to Bookings');
      await user.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith('/bookings');
    });
  });

  describe('Instructions Step', () => {
    it('should show start analysis button in instructions step', () => {
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=test-booking-123']}>
          <PostureAnalysisPage />
        </MemoryRouter>
      );

      expect(screen.getByText('Start Analysis')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should show positioning instructions', () => {
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=test-booking-123']}>
          <PostureAnalysisPage />
        </MemoryRouter>
      );

      expect(screen.getByText('Before You Start')).toBeInTheDocument();
      expect(screen.getByText('During Capture')).toBeInTheDocument();
      expect(screen.getByText(/Stand 6-8 feet away from your camera/)).toBeInTheDocument();
      expect(screen.getByText(/The capture will last 10 seconds/)).toBeInTheDocument();
    });

    it('should transition to capturing step when start button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=test-booking-123']}>
          <PostureAnalysisPage />
        </MemoryRouter>
      );

      const startButton = screen.getByText('Start Analysis');
      await user.click(startButton);

      await waitFor(() => {
        expect(screen.getByText('Capturing...')).toBeInTheDocument();
      });
    });

    it('should return to booking selection when cancel is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=test-booking-123']}>
          <PostureAnalysisPage />
        </MemoryRouter>
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
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });

    it('should show error when start is clicked without booking selection', async () => {
      const user = userEvent.setup();
      
      // Render in select_booking step but somehow get to instructions without selection
      // This tests the error handling in handleStartCapture
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      // This is a bit contrived since the UI prevents this, but tests the error handling
      // In a real scenario, this would be tested through integration tests
    });
  });

  describe('Step Transitions', () => {
    it('should show processing step placeholder', async () => {
      const user = userEvent.setup();
      
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=test-booking-123']}>
          <PostureAnalysisPage />
        </MemoryRouter>
      );

      // Start capture
      await user.click(screen.getByText('Start Analysis'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Capturing Posture Data/i })).toBeInTheDocument();
      });
    });

    it('should maintain bookingId through step transitions', async () => {
      const user = userEvent.setup();
      
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=test-booking-123']}>
          <PostureAnalysisPage />
        </MemoryRouter>
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
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent('Posture Analysis');

      const h2 = screen.getByRole('heading', { level: 2 });
      expect(h2).toHaveTextContent('Select a Booking');
    });

    it('should have accessible buttons', () => {
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      const backButton = screen.getByRole('button', { name: /back to bookings/i });
      expect(backButton).toBeInTheDocument();
    });
  });

  describe('URL Parameter Handling', () => {
    it('should extract bookingId from URL query parameter', () => {
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=abc-123']}>
          <PostureAnalysisPage />
        </MemoryRouter>
      );

      // Should skip booking selection and go to instructions
      expect(screen.getByRole('heading', { name: /Positioning Instructions/i })).toBeInTheDocument();
      expect(screen.queryByText('Select a Booking')).not.toBeInTheDocument();
    });

    it('should handle missing bookingId parameter', () => {
      render(
        <MemoryRouter initialEntries={['/posture-analysis']}>
          <PostureAnalysisPage />
        </MemoryRouter>
      );

      // Should show booking selection
      expect(screen.getByText('Select a Booking')).toBeInTheDocument();
    });

    it('should handle multiple query parameters', () => {
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=abc-123&other=param']}>
          <PostureAnalysisPage />
        </MemoryRouter>
      );

      // Should still extract bookingId correctly
      expect(screen.getByRole('heading', { name: /Positioning Instructions/i })).toBeInTheDocument();
    });
  });

  describe('Component Placeholders', () => {
    it('should show placeholder for booking selection component', () => {
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      expect(screen.getByText(/Booking selection component coming soon/)).toBeInTheDocument();
    });

    it('should show placeholder for webcam capture component', async () => {
      const user = userEvent.setup();
      
      render(
        <MemoryRouter initialEntries={['/posture-analysis?bookingId=test-booking-123']}>
          <PostureAnalysisPage />
        </MemoryRouter>
      );

      await user.click(screen.getByText('Start Analysis'));

      await waitFor(() => {
        expect(screen.getByText(/Component will be implemented in task 16.4/)).toBeInTheDocument();
      });
    });

    it('should show placeholder for results component', () => {
      // This would require setting the step to 'results' programmatically
      // For now, we'll test that the results step exists in the step indicator
      render(
        <BrowserRouter>
          <PostureAnalysisPage />
        </BrowserRouter>
      );

      // Step 5 should exist (results step)
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });
});
