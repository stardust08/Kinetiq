import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import BookingCard from './BookingCard';
import { Booking } from '../../types';

const mockBooking: Booking = {
  id: 'booking-123',
  userId: 'user-1',
  serviceId: 'service-1',
  paymentId: 'payment-1',
  totalAmount: 1000,
  paidAmount: 500,
  remainingAmount: 500,
  time: '2024-02-15T10:00:00Z',
  status: 'CONFIRMED',
  description: 'Test booking description',
  createdAt: '2024-01-01T00:00:00Z',
  totalScreeningCount: 10,
  usedScreeningCount: 3,
  remainingScreeningCount: 7,
  service: {
    id: 'service-1',
    categoryId: 'cat-1',
    name: 'Test Service',
    slug: 'test-service',
    basePrice: 1000,
    paymentType: 'PARTIAL',
    duration: '60 minutes',
    serviceType: 'Online',
    reviewCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
  },
  payment: {
    id: 'payment-1',
    userId: 'user-1',
    totalAmount: 1000,
    paidAmount: 500,
    remainingAmount: 500,
    status: 'PARTIAL',
    createdAt: '2024-01-01T00:00:00Z',
  },
  postureAnalyses: [
    {
      id: 'analysis-1',
      analysisDate: '2024-01-15T10:00:00Z',
      status: 'completed',
    },
    {
      id: 'analysis-2',
      analysisDate: '2024-01-20T10:00:00Z',
      status: 'completed',
    },
  ],
};

describe('BookingCard', () => {
  it('renders booking details correctly', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.getByText('Test Service')).toBeInTheDocument();
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('Payment: PARTIAL')).toBeInTheDocument();
    expect(screen.getByText('Booking ID')).toBeInTheDocument();
    expect(screen.getByText('booking-...')).toBeInTheDocument();
  });

  it('displays payment information', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.getByText('₹1000.00')).toBeInTheDocument();
    expect(screen.getByText(/Paid: ₹500.00/)).toBeInTheDocument();
    expect(screen.getByText(/Due: ₹500.00/)).toBeInTheDocument();
  });

  it('displays scheduled time', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText(/Feb/)).toBeInTheDocument();
  });

  it('displays description when provided', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.getByText('Test booking description')).toBeInTheDocument();
  });

  it('displays service details when available', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.getByText(/Duration:/)).toBeInTheDocument();
    expect(screen.getByText('60 minutes')).toBeInTheDocument();
    expect(screen.getByText(/Type:/)).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('shows pay remaining button for partial payments', () => {
    const onPayRemaining = vi.fn();
    renderWithProviders(
      <BookingCard 
        booking={mockBooking} 
        onPayRemaining={onPayRemaining}
      />
    );

    const payButton = screen.getByText('Pay Remaining');
    expect(payButton).toBeInTheDocument();

    fireEvent.click(payButton);
    expect(onPayRemaining).toHaveBeenCalledWith('payment-1', 'booking-123');
  });

  it('does not show pay remaining button when payment is completed', () => {
    const completedBooking = {
      ...mockBooking,
      remainingAmount: 0,
      paidAmount: 1000,
      payment: {
        ...mockBooking.payment!,
        status: 'COMPLETED' as const,
        remainingAmount: 0,
      },
    };

    renderWithProviders(<BookingCard booking={completedBooking} />);

    expect(screen.queryByText('Pay Remaining')).not.toBeInTheDocument();
  });

  it('does not show pay remaining button when onPayRemaining is not provided', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.queryByText('Pay Remaining')).not.toBeInTheDocument();
  });

  it('shows processing state when paying remaining', () => {
    const onPayRemaining = vi.fn();
    renderWithProviders(
      <BookingCard 
        booking={mockBooking} 
        onPayRemaining={onPayRemaining}
        payingRemaining={true}
      />
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    const payButton = screen.getByRole('button', { name: /processing/i });
    expect(payButton).toBeDisabled();
  });

  it('displays created date', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    // The footer formats with month: 'short' and no "Booked on" prefix, so the
    // created date reads "Jan 1, 2024".
    expect(screen.getByText('Jan 1, 2024')).toBeInTheDocument();
  });

  it('handles booking without service details', () => {
    const bookingWithoutService = {
      ...mockBooking,
      service: undefined,
    };

    renderWithProviders(<BookingCard booking={bookingWithoutService} />);

    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.queryByText(/Service Details/)).not.toBeInTheDocument();
  });

  it('handles booking without description', () => {
    const bookingWithoutDescription = {
      ...mockBooking,
      description: undefined,
    };

    renderWithProviders(<BookingCard booking={bookingWithoutDescription} />);

    expect(screen.queryByText('Description')).not.toBeInTheDocument();
  });

  it('displays correct badge variants for different statuses', () => {
    const { rerender } = renderWithProviders(<BookingCard booking={mockBooking} />);
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();

    const completedBooking = { ...mockBooking, status: 'COMPLETED' as const };
    rerender(<BookingCard booking={completedBooking} />);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();

    const cancelledBooking = { ...mockBooking, status: 'CANCELLED' as const };
    rerender(<BookingCard booking={cancelledBooking} />);
    expect(screen.getByText('CANCELLED')).toBeInTheDocument();
  });

  it('shows view details button when onViewDetails is provided', () => {
    const onViewDetails = vi.fn();
    renderWithProviders(
      <BookingCard 
        booking={mockBooking} 
        onViewDetails={onViewDetails}
      />
    );

    const viewButton = screen.getByText('Details');
    expect(viewButton).toBeInTheDocument();

    fireEvent.click(viewButton);
    expect(onViewDetails).toHaveBeenCalledWith(mockBooking);
  });

  it('does not show view details button when onViewDetails is not provided', () => {
    renderWithProviders(<BookingCard booking={mockBooking} />);

    expect(screen.queryByText('Details')).not.toBeInTheDocument();
  });

  describe('Posture Analysis Actions', () => {
    it('shows start assessment button when onStartAssessment is provided and counts remain', () => {
      const onStartAssessment = vi.fn();
      renderWithProviders(
        <BookingCard 
          booking={mockBooking} 
          onStartAssessment={onStartAssessment}
        />
      );

      const startButton = screen.getByText('Posture Analysis');
      expect(startButton).toBeInTheDocument();
      expect(startButton).not.toBeDisabled();

      fireEvent.click(startButton);
      expect(onStartAssessment).toHaveBeenCalledWith('booking-123');
    });

    it('disables start assessment button when no counts remaining', () => {
      const onStartAssessment = vi.fn();
      const bookingWithNoCounts = {
        ...mockBooking,
        remainingScreeningCount: 0,
        usedScreeningCount: 10,
      };

      renderWithProviders(
        <BookingCard 
          booking={bookingWithNoCounts} 
          onStartAssessment={onStartAssessment}
        />
      );

      const startButton = screen.getByText('No Assessments Left');
      expect(startButton).toBeDisabled();
    });

    it('shows view history button when onViewHistory is provided and analyses exist', () => {
      const onViewHistory = vi.fn();
      renderWithProviders(
        <BookingCard 
          booking={mockBooking} 
          onViewHistory={onViewHistory}
        />
      );

      const historyButton = screen.getByRole('button', { name: /History \(3\)/ });
      expect(historyButton).toBeInTheDocument();

      fireEvent.click(historyButton);
      expect(onViewHistory).toHaveBeenCalledWith('booking-123');
    });

    it('does not show view history button when no analyses exist', () => {
      const onViewHistory = vi.fn();
      // The card decides from usedScreeningCount, not from a postureAnalyses array -
      // the list view does not fetch the analyses at all, so an empty array here said
      // nothing and the button rendered anyway.
      const bookingWithNoAnalyses = {
        ...mockBooking,
        usedScreeningCount: 0,
        postureAnalyses: [],
      };

      renderWithProviders(
        <BookingCard 
          booking={bookingWithNoAnalyses} 
          onViewHistory={onViewHistory}
        />
      );

      expect(screen.queryByRole('button', { name: /History/ })).not.toBeInTheDocument();
    });

    it('does not show posture analysis actions when totalScreeningCount is 0', () => {
      const onStartAssessment = vi.fn();
      const onViewHistory = vi.fn();
      const bookingWithNoScreening = {
        ...mockBooking,
        totalScreeningCount: 0,
        usedScreeningCount: 0,
        remainingScreeningCount: 0,
      };

      renderWithProviders(
        <BookingCard 
          booking={bookingWithNoScreening} 
          onStartAssessment={onStartAssessment}
          onViewHistory={onViewHistory}
        />
      );

      expect(screen.queryByText('Posture Analysis')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /History/ })).not.toBeInTheDocument();
    });

    it('shows both buttons when both handlers are provided', () => {
      const onStartAssessment = vi.fn();
      const onViewHistory = vi.fn();

      renderWithProviders(
        <BookingCard 
          booking={mockBooking} 
          onStartAssessment={onStartAssessment}
          onViewHistory={onViewHistory}
        />
      );

      expect(screen.getByText('Posture Analysis')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /History \(3\)/ })).toBeInTheDocument();
    });
  });
});
