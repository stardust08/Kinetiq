import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import InvalidBookingState from './InvalidBookingState';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderComponent = (props = {}) => {
  return render(
    <BrowserRouter>
      <InvalidBookingState {...props} />
    </BrowserRouter>
  );
};

describe('InvalidBookingState', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders with default unknown reason', () => {
    renderComponent();
    expect(screen.getByText('This booking cannot be used for screening')).toBeInTheDocument();
    expect(screen.getByText('Please select a different booking or create a new one.')).toBeInTheDocument();
  });

  it('renders expired booking message', () => {
    renderComponent({ reason: 'expired' });
    expect(screen.getByText('This booking has expired')).toBeInTheDocument();
    expect(screen.getByText('The booking date has passed. Please create a new booking to continue.')).toBeInTheDocument();
  });

  it('renders cancelled booking message', () => {
    renderComponent({ reason: 'cancelled' });
    expect(screen.getByText('This booking has been cancelled')).toBeInTheDocument();
    expect(screen.getByText('This booking was cancelled and cannot be used for assessments.')).toBeInTheDocument();
  });

  it('renders invalid status message', () => {
    renderComponent({ reason: 'invalid_status' });
    expect(screen.getByText('This booking is not available for screening')).toBeInTheDocument();
    expect(screen.getByText('Only confirmed or completed bookings can be used for screening assessments.')).toBeInTheDocument();
  });

  it('renders not found message', () => {
    renderComponent({ reason: 'not_found' });
    expect(screen.getByText('Booking not found')).toBeInTheDocument();
    expect(screen.getByText(/does not exist or you do not have permission/)).toBeInTheDocument();
  });

  it('renders custom message when provided', () => {
    const customMessage = 'Custom error message';
    renderComponent({ message: customMessage });
    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });

  it('displays booking ID when provided', () => {
    const bookingId = 'booking-123-abc';
    renderComponent({ bookingId });
    expect(screen.getByText('Booking ID')).toBeInTheDocument();
    expect(screen.getByText(bookingId)).toBeInTheDocument();
  });

  it('does not display booking ID section when not provided', () => {
    renderComponent();
    expect(screen.queryByText('Booking ID')).not.toBeInTheDocument();
  });

  it('shows retry button when onRetry is provided', () => {
    const onRetry = vi.fn();
    renderComponent({ onRetry });
    const retryButton = screen.getByText('Try Again');
    expect(retryButton).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    renderComponent({ onRetry });
    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not show retry button when onRetry is not provided', () => {
    renderComponent();
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
  });

  it('navigates to bookings page when View My Bookings is clicked', () => {
    renderComponent();
    const viewBookingsButton = screen.getByText('View My Bookings');
    fireEvent.click(viewBookingsButton);
    expect(mockNavigate).toHaveBeenCalledWith('/bookings');
  });

  it('renders AlertCircle icon', () => {
    const { container } = renderComponent();
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('applies correct styling classes', () => {
    const { container } = renderComponent({ bookingId: 'test-123' });
    
    // Check for card structure
    expect(container.querySelector('.py-12')).toBeInTheDocument();
    expect(container.querySelector('.text-center')).toBeInTheDocument();
    
    // Check for booking ID styling
    expect(container.querySelector('.font-mono')).toBeInTheDocument();
  });

  it('handles all reason types correctly', () => {
    const reasons: Array<'expired' | 'cancelled' | 'invalid_status' | 'not_found' | 'unknown'> = [
      'expired',
      'cancelled',
      'invalid_status',
      'not_found',
      'unknown',
    ];

    reasons.forEach((reason) => {
      const { unmount } = renderComponent({ reason });
      // Should render without errors - check for the View My Bookings button
      expect(screen.getByText('View My Bookings')).toBeInTheDocument();
      unmount();
    });
  });

  it('renders responsive button layout', () => {
    const onRetry = vi.fn();
    const { container } = renderComponent({ onRetry });
    
    // Check for flex container with responsive classes
    const buttonContainer = container.querySelector('.flex.flex-col.sm\\:flex-row');
    expect(buttonContainer).toBeInTheDocument();
  });
});
