import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BookingSelector from './BookingSelector';
import { Booking } from '../../types';

// Mock the UI components
vi.mock('../../app/components/ui/card', () => ({
  Card: ({ children, className, onClick, style }: any) => (
    <div className={className} onClick={onClick} style={style} data-testid="card">
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('../../app/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, size }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      data-testid="button"
    >
      {children}
    </button>
  ),
}));

vi.mock('../../app/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

vi.mock('./ScreeningCountBadge', () => ({
  default: ({ totalCount, usedCount, remainingCount }: any) => (
    <div data-testid="screening-count-badge">
      {remainingCount} of {totalCount} remaining ({usedCount} used)
    </div>
  ),
}));

describe('BookingSelector', () => {
  const mockBookings: Booking[] = [
    {
      id: 'booking-1',
      userId: 'user-1',
      serviceId: 'service-1',
      paymentId: 'payment-1',
      totalAmount: 1000,
      paidAmount: 1000,
      remainingAmount: 0,
      time: '2024-01-15T10:00:00Z',
      status: 'CONFIRMED',
      createdAt: '2024-01-10T10:00:00Z',
      totalScreeningCount: 10,
      usedScreeningCount: 3,
      remainingScreeningCount: 7,
      service: {
        id: 'service-1',
        categoryId: 'cat-1',
        name: 'Posture Analysis Package',
        slug: 'posture-analysis',
        basePrice: 1000,
        paymentType: 'FULL',
        reviewCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    },
    {
      id: 'booking-2',
      userId: 'user-1',
      serviceId: 'service-2',
      paymentId: 'payment-2',
      totalAmount: 500,
      paidAmount: 500,
      remainingAmount: 0,
      time: '2024-01-20T14:00:00Z',
      status: 'CONFIRMED',
      createdAt: '2024-01-12T10:00:00Z',
      totalScreeningCount: 5,
      usedScreeningCount: 2,
      remainingScreeningCount: 3,
      service: {
        id: 'service-2',
        categoryId: 'cat-1',
        name: 'Basic Assessment',
        slug: 'basic-assessment',
        basePrice: 500,
        paymentType: 'FULL',
        reviewCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    },
    {
      id: 'booking-3',
      userId: 'user-1',
      serviceId: 'service-3',
      paymentId: 'payment-3',
      totalAmount: 800,
      paidAmount: 800,
      remainingAmount: 0,
      time: '2024-01-25T16:00:00Z',
      status: 'CONFIRMED',
      createdAt: '2024-01-14T10:00:00Z',
      totalScreeningCount: 8,
      usedScreeningCount: 8,
      remainingScreeningCount: 0, // No remaining counts
      service: {
        id: 'service-3',
        categoryId: 'cat-1',
        name: 'Exhausted Package',
        slug: 'exhausted-package',
        basePrice: 800,
        paymentType: 'FULL',
        reviewCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    },
  ];

  const mockOnSelectBooking = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders list of bookings with remaining counts > 0', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    // Should show 2 bookings (booking-1 and booking-2), not booking-3
    expect(screen.getByText('Posture Analysis Package')).toBeInTheDocument();
    expect(screen.getByText('Basic Assessment')).toBeInTheDocument();
    expect(screen.queryByText('Exhausted Package')).not.toBeInTheDocument();
  });

  it('displays screening count info for each booking', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    const badges = screen.getAllByTestId('screening-count-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('7 of 10 remaining (3 used)');
    expect(badges[1]).toHaveTextContent('3 of 5 remaining (2 used)');
  });

  it('calls onSelectBooking when a booking is clicked', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    const cards = screen.getAllByTestId('card');
    fireEvent.click(cards[0]);

    expect(mockOnSelectBooking).toHaveBeenCalledWith('booking-1');
  });

  it('calls onSelectBooking when select button is clicked', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    const buttons = screen.getAllByTestId('button');
    // Filter to get only the Select buttons (not the Browse Services button)
    const selectButtons = buttons.filter(btn => 
      btn.textContent === 'Select' || btn.textContent === 'Selected'
    );
    
    fireEvent.click(selectButtons[0]);

    expect(mockOnSelectBooking).toHaveBeenCalledWith('booking-1');
  });

  it('highlights selected booking', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        selectedBookingId="booking-1"
        onSelectBooking={mockOnSelectBooking}
      />
    );

    const selectedTexts = screen.getAllByText('Selected');
    expect(selectedTexts.length).toBeGreaterThan(0);
    
    // Selection is shown with an inline border and background rather than a ring
    // utility, so className carries none of it. The "Selected" label above is what a
    // patient actually sees, and it is asserted already.
    const cards = screen.getAllByTestId('card');
    // The selected card gets a 2px brand border inline; the unselected ones get 1px.
    expect(cards[0].getAttribute('style')).toContain('2px solid');
    expect(cards[1].getAttribute('style')).toContain('1px solid');
  });

  it('shows "No Available Screening Assessments" when no valid bookings', () => {
    const exhaustedBookings = [mockBookings[2]]; // Only booking with 0 remaining

    render(
      <BookingSelector
        bookings={exhaustedBookings}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    expect(screen.getByText('No Available Screening Assessments')).toBeInTheDocument();
    expect(screen.getByText(/You don't have any bookings with remaining screening counts/)).toBeInTheDocument();
    expect(screen.getByText('Browse Services')).toBeInTheDocument();
  });

  it('shows "No Available Screening Assessments" when bookings array is empty', () => {
    render(
      <BookingSelector
        bookings={[]}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    expect(screen.getByText('No Available Screening Assessments')).toBeInTheDocument();
  });

  it('disables interaction when disabled prop is true', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        onSelectBooking={mockOnSelectBooking}
        disabled={true}
      />
    );

    const cards = screen.getAllByTestId('card');
    fireEvent.click(cards[0]);

    // Should not call onSelectBooking when disabled
    expect(mockOnSelectBooking).not.toHaveBeenCalled();

    // Buttons should be disabled
    const buttons = screen.getAllByTestId('button');
    const selectButtons = buttons.filter(btn => 
      btn.textContent === 'Select' || btn.textContent === 'Selected'
    );
    selectButtons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('displays booking status badge', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    const statusBadges = screen.getAllByText('CONFIRMED');
    expect(statusBadges.length).toBeGreaterThan(0);
  });

  it('displays booking date', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    expect(screen.getByText(/Booked on Jan 15, 2024/)).toBeInTheDocument();
    expect(screen.getByText(/Booked on Jan 20, 2024/)).toBeInTheDocument();
  });

  it('displays note about count deduction', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    expect(screen.getByText(/One screening count will be deducted/)).toBeInTheDocument();
  });

  it('prevents event propagation when clicking select button', () => {
    const { container } = render(
      <BookingSelector
        bookings={mockBookings}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    const buttons = screen.getAllByTestId('button');
    const selectButtons = buttons.filter(btn => 
      btn.textContent === 'Select' || btn.textContent === 'Selected'
    );

    // Click the button
    fireEvent.click(selectButtons[0]);

    // Should only be called once (from button click, not card click)
    expect(mockOnSelectBooking).toHaveBeenCalledTimes(1);
  });

  it('handles bookings without service data gracefully', () => {
    const bookingsWithoutService: Booking[] = [
      {
        ...mockBookings[0],
        service: undefined,
      },
    ];

    render(
      <BookingSelector
        bookings={bookingsWithoutService}
        onSelectBooking={mockOnSelectBooking}
      />
    );

    expect(screen.getByText('Service')).toBeInTheDocument();
  });

  it('shows correct button text for selected vs unselected bookings', () => {
    render(
      <BookingSelector
        bookings={mockBookings}
        selectedBookingId="booking-1"
        onSelectBooking={mockOnSelectBooking}
      />
    );

    const buttons = screen.getAllByTestId('button');
    const selectButtons = buttons.filter(btn => 
      btn.textContent === 'Select' || btn.textContent === 'Selected'
    );

    expect(selectButtons[0]).toHaveTextContent('Selected');
    expect(selectButtons[1]).toHaveTextContent('Select');
  });
});
