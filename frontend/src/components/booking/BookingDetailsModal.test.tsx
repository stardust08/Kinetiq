import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookingDetailsModal from './BookingDetailsModal';
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
  createdAt: '2024-02-01T10:00:00Z',
  service: {
    id: 'service-1',
    categoryId: 'cat-1',
    name: 'Test Service',
    slug: 'test-service',
    description: 'Test service description',
    basePrice: 1000,
    paymentType: 'PARTIAL',
    advancePercent: 50,
    duration: '60 minutes',
    serviceType: 'Online',
    reviewCount: 10,
    createdAt: '2024-01-01T10:00:00Z',
  },
  payment: {
    id: 'payment-1',
    userId: 'user-1',
    totalAmount: 1000,
    paidAmount: 500,
    remainingAmount: 500,
    status: 'PARTIAL',
    paymentMethod: 'Credit Card',
    transactionId: 'txn-123',
    createdAt: '2024-02-01T10:00:00Z',
    completedAt: '2024-02-01T10:05:00Z',
  },
};

describe('BookingDetailsModal', () => {
  it('renders nothing when booking is null', () => {
    const { container } = render(
      <BookingDetailsModal
        booking={null}
        open={true}
        onOpenChange={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('displays booking details when open', () => {
    render(
      <BookingDetailsModal
        booking={mockBooking}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Booking Details')).toBeInTheDocument();
    expect(screen.getByText('booking-123')).toBeInTheDocument();
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
  });

  it('displays service information', () => {
    render(
      <BookingDetailsModal
        booking={mockBooking}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Service Information')).toBeInTheDocument();
    expect(screen.getByText('Test Service')).toBeInTheDocument();
    expect(screen.getByText('Test service description')).toBeInTheDocument();
    expect(screen.getByText('60 minutes')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('displays payment information', () => {
    render(
      <BookingDetailsModal
        booking={mockBooking}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Payment Information')).toBeInTheDocument();
    expect(screen.getByText('₹1000.00')).toBeInTheDocument();
    
    // Check for paid and remaining amounts labels
    expect(screen.getByText('Paid Amount')).toBeInTheDocument();
    expect(screen.getByText('Remaining Amount')).toBeInTheDocument();
    
    expect(screen.getByText('Credit Card')).toBeInTheDocument();
    expect(screen.getByText('txn-123')).toBeInTheDocument();
  });

  it('displays booking description', () => {
    render(
      <BookingDetailsModal
        booking={mockBooking}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Additional Notes')).toBeInTheDocument();
    expect(screen.getByText('Test booking description')).toBeInTheDocument();
  });

  it('displays timeline information', () => {
    render(
      <BookingDetailsModal
        booking={mockBooking}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Booking Created')).toBeInTheDocument();
    expect(screen.getByText('Payment Completed')).toBeInTheDocument();
  });

  it('calls onOpenChange when closed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <BookingDetailsModal
        booking={mockBooking}
        open={true}
        onOpenChange={onOpenChange}
      />
    );

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('handles booking without optional fields', () => {
    const minimalBooking: Booking = {
      id: 'booking-456',
      userId: 'user-2',
      serviceId: 'service-2',
      paymentId: 'payment-2',
      totalAmount: 500,
      paidAmount: 500,
      remainingAmount: 0,
      time: '2024-02-20T14:00:00Z',
      status: 'PENDING',
      createdAt: '2024-02-10T10:00:00Z',
    };

    render(
      <BookingDetailsModal
        booking={minimalBooking}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('booking-456')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.queryByText('Additional Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Information')).not.toBeInTheDocument();
  });

  it('does not display remaining amount when zero', () => {
    const fullPaidBooking: Booking = {
      ...mockBooking,
      paidAmount: 1000,
      remainingAmount: 0,
      payment: {
        ...mockBooking.payment!,
        paidAmount: 1000,
        remainingAmount: 0,
        status: 'COMPLETED',
      },
    };

    render(
      <BookingDetailsModal
        booking={fullPaidBooking}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Remaining Amount')).not.toBeInTheDocument();
  });
});
