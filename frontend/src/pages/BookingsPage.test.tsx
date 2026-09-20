import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookingsPage from './BookingsPage';
import * as bookingsAPI from '../api/bookings';
import * as paymentsAPI from '../api/payments';
import { Booking } from '../types';

// Mock the API modules
vi.mock('../api/bookings', () => ({
  getAll: vi.fn(),
}));

vi.mock('../api/payments', () => ({
  payRemaining: vi.fn(),
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Helper to render with providers.
//
// The body of this helper, the mockBooking fixture, the describe block, the beforeEach
// and the whole of the first test were destroyed by a bad edit: the helper ended up
// calling ITSELF with an unclosed <QueryClientProvider>, and one test's assertions were
// left dangling inside it. That single broken JSX tag produced 179 TypeScript errors -
// every one of them a cascade from this file - and the errors went unnoticed because
// `vite build` transpiles without typechecking.
const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{component}</BrowserRouter>
    </QueryClientProvider>
  );
};

// Reconstructed from what the surviving tests spread from and assert against:
// a confirmed, part-paid booking for "Test Service" at 1000 total / 500 paid.
const mockBooking: Booking = {
  id: 'booking-1',
  userId: 'user-1',
  serviceId: 'service-1',
  paymentId: 'payment-1',
  totalAmount: 1000,
  paidAmount: 500,
  remainingAmount: 500,
  time: '2026-02-15T10:00:00Z',
  status: 'CONFIRMED',
  createdAt: '2026-01-01T00:00:00Z',
  totalScreeningCount: 3,
  usedScreeningCount: 0,
  remainingScreeningCount: 3,
  service: {
    id: 'service-1',
    name: 'Test Service',
    price: 1000,
    description: 'A test service',
  } as Booking['service'],
  payment: { paymentType: 'PARTIAL' } as Booking['payment'],
};

describe('BookingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display a booking with its payment breakdown', async () => {
    vi.mocked(bookingsAPI.getAll).mockResolvedValue([mockBooking]);

    renderWithProviders(<BookingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('Payment: PARTIAL')).toBeInTheDocument();
    expect(screen.getByText(/Total: ₹1000.00/)).toBeInTheDocument();
    expect(screen.getByText(/Paid: ₹500.00/)).toBeInTheDocument();
    expect(screen.getByText(/Remaining: ₹500.00/)).toBeInTheDocument();
  });

  
  it('should display empty state when no bookings', async () => {
    vi.mocked(bookingsAPI.getAll).mockResolvedValue([]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('No bookings found')).toBeInTheDocument();
    });

    expect(screen.getByText('Browse Services')).toBeInTheDocument();
  });

  it('should filter bookings by status', async () => {
    const confirmedBooking = { ...mockBooking, status: 'CONFIRMED' as const };
    const completedBooking = { 
      ...mockBooking, 
      id: 'booking-2',
      status: 'COMPLETED' as const,
      service: { ...mockBooking.service!, name: 'Completed Service' },
    };

    vi.mocked(bookingsAPI.getAll).mockResolvedValue([confirmedBooking, completedBooking]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Initially shows all bookings
    expect(screen.getByText('Test Service')).toBeInTheDocument();
    expect(screen.getByText('Completed Service')).toBeInTheDocument();

    // Filter by CONFIRMED
    const confirmedButton = screen.getByRole('button', { name: 'Confirmed' });
    fireEvent.click(confirmedButton);

    expect(screen.getByText('Test Service')).toBeInTheDocument();
    expect(screen.queryByText('Completed Service')).not.toBeInTheDocument();
  });

  it('should filter bookings by COMPLETED status', async () => {
    const confirmedBooking = { ...mockBooking, status: 'CONFIRMED' as const };
    const completedBooking = { 
      ...mockBooking, 
      id: 'booking-2',
      status: 'COMPLETED' as const,
      service: { ...mockBooking.service!, name: 'Completed Service' },
    };

    vi.mocked(bookingsAPI.getAll).mockResolvedValue([confirmedBooking, completedBooking]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Filter by COMPLETED
    const completedButton = screen.getByRole('button', { name: 'Completed' });
    fireEvent.click(completedButton);

    expect(screen.queryByText('Test Service')).not.toBeInTheDocument();
    expect(screen.getByText('Completed Service')).toBeInTheDocument();
  });

  it('should filter bookings by PENDING status', async () => {
    const pendingBooking = { 
      ...mockBooking, 
      status: 'PENDING' as const,
      service: { ...mockBooking.service!, name: 'Pending Service' },
    };
    const confirmedBooking = { 
      ...mockBooking, 
      id: 'booking-2',
      status: 'CONFIRMED' as const,
      service: { ...mockBooking.service!, name: 'Confirmed Service' },
    };

    vi.mocked(bookingsAPI.getAll).mockResolvedValue([pendingBooking, confirmedBooking]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Pending Service')).toBeInTheDocument();
    });

    // Filter by PENDING
    const pendingButton = screen.getByRole('button', { name: 'Pending' });
    fireEvent.click(pendingButton);

    expect(screen.getByText('Pending Service')).toBeInTheDocument();
    expect(screen.queryByText('Confirmed Service')).not.toBeInTheDocument();
  });

  it('should filter bookings by CANCELLED status', async () => {
    const cancelledBooking = { 
      ...mockBooking, 
      status: 'CANCELLED' as const,
      service: { ...mockBooking.service!, name: 'Cancelled Service' },
    };
    const confirmedBooking = { 
      ...mockBooking, 
      id: 'booking-2',
      status: 'CONFIRMED' as const,
      service: { ...mockBooking.service!, name: 'Confirmed Service' },
    };

    vi.mocked(bookingsAPI.getAll).mockResolvedValue([cancelledBooking, confirmedBooking]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Cancelled Service')).toBeInTheDocument();
    });

    // Filter by CANCELLED
    const cancelledButton = screen.getByRole('button', { name: 'Cancelled' });
    fireEvent.click(cancelledButton);

    expect(screen.getByText('Cancelled Service')).toBeInTheDocument();
    expect(screen.queryByText('Confirmed Service')).not.toBeInTheDocument();
  });

  it('should show empty state for filtered status with no bookings', async () => {
    const confirmedBooking = { ...mockBooking, status: 'CONFIRMED' as const };

    vi.mocked(bookingsAPI.getAll).mockResolvedValue([confirmedBooking]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Filter by CANCELLED (no cancelled bookings exist)
    const cancelledButton = screen.getByRole('button', { name: 'Cancelled' });
    fireEvent.click(cancelledButton);

    expect(screen.queryByText('Test Service')).not.toBeInTheDocument();
    expect(screen.getByText('No cancelled bookings')).toBeInTheDocument();
  });

  it('should switch between filters correctly', async () => {
    const pendingBooking = { 
      ...mockBooking, 
      status: 'PENDING' as const,
      service: { ...mockBooking.service!, name: 'Pending Service' },
    };
    const confirmedBooking = { 
      ...mockBooking, 
      id: 'booking-2',
      status: 'CONFIRMED' as const,
      service: { ...mockBooking.service!, name: 'Confirmed Service' },
    };
    const completedBooking = { 
      ...mockBooking, 
      id: 'booking-3',
      status: 'COMPLETED' as const,
      service: { ...mockBooking.service!, name: 'Completed Service' },
    };

    vi.mocked(bookingsAPI.getAll).mockResolvedValue([pendingBooking, confirmedBooking, completedBooking]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Pending Service')).toBeInTheDocument();
    });

    // Initially shows all bookings
    expect(screen.getByText('Pending Service')).toBeInTheDocument();
    expect(screen.getByText('Confirmed Service')).toBeInTheDocument();
    expect(screen.getByText('Completed Service')).toBeInTheDocument();

    // Filter by PENDING
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }));
    expect(screen.getByText('Pending Service')).toBeInTheDocument();
    expect(screen.queryByText('Confirmed Service')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed Service')).not.toBeInTheDocument();

    // Switch to CONFIRMED
    fireEvent.click(screen.getByRole('button', { name: 'Confirmed' }));
    expect(screen.queryByText('Pending Service')).not.toBeInTheDocument();
    expect(screen.getByText('Confirmed Service')).toBeInTheDocument();
    expect(screen.queryByText('Completed Service')).not.toBeInTheDocument();

    // Switch back to All Bookings
    fireEvent.click(screen.getByRole('button', { name: 'All Bookings' }));
    expect(screen.getByText('Pending Service')).toBeInTheDocument();
    expect(screen.getByText('Confirmed Service')).toBeInTheDocument();
    expect(screen.getByText('Completed Service')).toBeInTheDocument();
  });

  it('should handle pay remaining button click', async () => {
    vi.mocked(bookingsAPI.getAll).mockResolvedValue([mockBooking]);
    vi.mocked(paymentsAPI.payRemaining).mockResolvedValue({
      paymentId: 'payment-123',
      gatewayUrl: 'https://gateway.example.com',
      transactionId: 'txn-123',
      amount: 500,
    });

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    const payButton = screen.getByRole('button', { name: 'Pay Remaining' });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(paymentsAPI.payRemaining).toHaveBeenCalledWith('payment-123');
    });
  });

  it('should navigate to home when browse services clicked', async () => {
    vi.mocked(bookingsAPI.getAll).mockResolvedValue([]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('No bookings found')).toBeInTheDocument();
    });

    const browseButton = screen.getByRole('button', { name: 'Browse Services' });
    fireEvent.click(browseButton);

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should display booking with no remaining amount', async () => {
    const fullPaidBooking = {
      ...mockBooking,
      paidAmount: 1000,
      remainingAmount: 0,
      payment: {
        ...mockBooking.payment!,
        paidAmount: 1000,
        remainingAmount: 0,
        status: 'COMPLETED' as const,
      },
    };

    vi.mocked(bookingsAPI.getAll).mockResolvedValue([fullPaidBooking]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(screen.queryByText('Pay Remaining')).not.toBeInTheDocument();
    expect(screen.queryByText(/Remaining:/)).not.toBeInTheDocument();
  });

  it('should display booking description when available', async () => {
    const bookingWithDescription = {
      ...mockBooking,
      description: 'Special instructions for this booking',
    };

    vi.mocked(bookingsAPI.getAll).mockResolvedValue([bookingWithDescription]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Special instructions for this booking')).toBeInTheDocument();
    });
  });

  it('should handle API error gracefully', async () => {
    vi.mocked(bookingsAPI.getAll).mockRejectedValue(new Error('API Error'));

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('No bookings found')).toBeInTheDocument();
    });
  });

  it('should open booking details modal when view details clicked', async () => {
    vi.mocked(bookingsAPI.getAll).mockResolvedValue([mockBooking]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    const viewDetailsButton = screen.getByRole('button', { name: /view details/i });
    fireEvent.click(viewDetailsButton);

    await waitFor(() => {
      expect(screen.getByText('Booking Details')).toBeInTheDocument();
    });

    // Modal should show booking ID
    expect(screen.getByText(mockBooking.id)).toBeInTheDocument();
  });

  it('should close booking details modal when close button clicked', async () => {
    vi.mocked(bookingsAPI.getAll).mockResolvedValue([mockBooking]);

    renderWithProviders(
<BookingsPage />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Open modal
    const viewDetailsButton = screen.getByRole('button', { name: /view details/i });
    fireEvent.click(viewDetailsButton);

    await waitFor(() => {
      expect(screen.getByText('Booking Details')).toBeInTheDocument();
    });

    // Close modal
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Booking Details')).not.toBeInTheDocument();
    });
  });
});
