import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BookingConfirmation from './BookingConfirmation';
import { Booking, Payment } from '../../types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('BookingConfirmation', () => {
  const mockPayment: Payment = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: 'user-123',
    totalAmount: 1500,
    paidAmount: 1500,
    remainingAmount: 0,
    status: 'COMPLETED',
    transactionId: 'TXN123456',
    createdAt: '2024-01-15T10:00:00Z',
  };

  const mockBookings: Booking[] = [
    {
      id: 'booking-1',
      userId: 'user-123',
      serviceId: 'service-1',
      paymentId: mockPayment.id,
      totalAmount: 1000,
      paidAmount: 1000,
      remainingAmount: 0,
      time: '2024-01-20T14:00:00Z',
      status: 'CONFIRMED',
      createdAt: '2024-01-15T10:00:00Z',
      service: {
        id: 'service-1',
        categoryId: 'cat-1',
        name: 'Physiotherapy Session',
        slug: 'physiotherapy-session',
        basePrice: 1000,
        paymentType: 'FULL',
        reviewCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    },
    {
      id: 'booking-2',
      userId: 'user-123',
      serviceId: 'service-2',
      paymentId: mockPayment.id,
      totalAmount: 500,
      paidAmount: 500,
      remainingAmount: 0,
      time: '2024-01-20T15:00:00Z',
      status: 'CONFIRMED',
      createdAt: '2024-01-15T10:00:00Z',
      service: {
        id: 'service-2',
        categoryId: 'cat-1',
        name: 'Consultation',
        slug: 'consultation',
        basePrice: 500,
        paymentType: 'FULL',
        reviewCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders success message', () => {
    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    expect(screen.getByText('Booking Confirmed!')).toBeInTheDocument();
    expect(screen.getByText('Your booking has been successfully confirmed')).toBeInTheDocument();
  });

  it('displays payment details', () => {
    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    expect(screen.getByText(/Payment ID/i)).toBeInTheDocument();
    expect(screen.getAllByText('₹1500.00').length).toBeGreaterThan(0);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });

  it('displays all bookings', () => {
    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    expect(screen.getByText('Physiotherapy Session')).toBeInTheDocument();
    expect(screen.getByText('Consultation')).toBeInTheDocument();
  });

  it('shows remaining amount warning for partial payments', () => {
    const partialPayment: Payment = {
      ...mockPayment,
      paidAmount: 750,
      remainingAmount: 750,
      status: 'PARTIAL',
    };

    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={partialPayment} />
      </BrowserRouter>
    );

    expect(screen.getByText(/remaining balance/i)).toBeInTheDocument();
    expect(screen.getAllByText('₹750.00').length).toBeGreaterThan(0);
  });

  it('navigates to bookings page when clicking View My Bookings', () => {
    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    const viewBookingsButton = screen.getByText('View My Bookings');
    fireEvent.click(viewBookingsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/bookings');
  });

  it('triggers print when clicking Print button', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    const printButton = screen.getByText('Print');
    fireEvent.click(printButton);

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('triggers download when clicking Download Receipt button', () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    const downloadButton = screen.getByText('Download Receipt');
    fireEvent.click(downloadButton);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('displays transaction ID when available', () => {
    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    expect(screen.getByText('Transaction ID')).toBeInTheDocument();
    expect(screen.getByText('TXN123456')).toBeInTheDocument();
  });

  it('displays next steps information', () => {
    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    expect(screen.getByText('Next Steps')).toBeInTheDocument();
    expect(screen.getByText(/confirmation email/i)).toBeInTheDocument();
    expect(screen.getByText(/clinician will be assigned/i)).toBeInTheDocument();
  });

  it('shows additional next step for partial payments', () => {
    const partialPayment: Payment = {
      ...mockPayment,
      paidAmount: 750,
      remainingAmount: 750,
      status: 'PARTIAL',
    };

    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={partialPayment} />
      </BrowserRouter>
    );

    expect(screen.getByText(/Complete your remaining payment/i)).toBeInTheDocument();
  });

  it('displays individual booking IDs', () => {
    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    // The booking IDs should be displayed (shortened to 8 chars)
    const container = screen.getByText('Physiotherapy Session').closest('.bg-gray-50');
    expect(container).toBeInTheDocument();
    expect(container?.textContent).toContain('Booking ID:');
  });

  it('displays booking description when available', () => {
    const bookingsWithDescription: Booking[] = [
      {
        ...mockBookings[0],
        description: 'Lower back pain treatment',
      },
    ];

    render(
      <BrowserRouter>
        <BookingConfirmation bookings={bookingsWithDescription} payment={mockPayment} />
      </BrowserRouter>
    );

    // Check that the description is displayed
    const container = screen.getByText('Physiotherapy Session').closest('.bg-gray-50');
    expect(container?.textContent).toContain('Lower back pain treatment');
  });

  it('displays payment method when available', () => {
    const paymentWithMethod: Payment = {
      ...mockPayment,
      paymentMethod: 'Credit Card',
    };

    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={paymentWithMethod} />
      </BrowserRouter>
    );

    expect(screen.getByText('Payment Method')).toBeInTheDocument();
    expect(screen.getByText('Credit Card')).toBeInTheDocument();
  });

  it('displays completed at timestamp when available', () => {
    const paymentWithCompletedAt: Payment = {
      ...mockPayment,
      completedAt: '2024-01-15T10:05:00Z',
    };

    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={paymentWithCompletedAt} />
      </BrowserRouter>
    );

    expect(screen.getByText('Completed At')).toBeInTheDocument();
  });

  it('does not display payment method when not available', () => {
    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    expect(screen.queryByText('Payment Method')).not.toBeInTheDocument();
  });

  it('does not display completed at when not available', () => {
    render(
      <BrowserRouter>
        <BookingConfirmation bookings={mockBookings} payment={mockPayment} />
      </BrowserRouter>
    );

    expect(screen.queryByText('Completed At')).not.toBeInTheDocument();
  });
});
