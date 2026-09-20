import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import BookingList from './BookingList';
import * as bookingApi from '../../api/bookings';
import type { Booking } from '../../types';

// Mock the booking API
vi.mock('../../api/bookings');

// Mock react-router-dom navigate
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
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Create a wrapper with QueryClient and Router
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('BookingList', () => {
  const mockBookings: Booking[] = [
    {
      id: 'booking-1',
      userId: 'user-1',
      serviceId: 'service-1',
      paymentId: 'payment-1',
      totalAmount: 1000,
      paidAmount: 500,
      remainingAmount: 500,
      time: '2024-01-15T10:00:00Z',
      status: 'CONFIRMED',
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
    },
    {
      id: 'booking-2',
      userId: 'user-1',
      serviceId: 'service-2',
      paymentId: 'payment-2',
      totalAmount: 2000,
      paidAmount: 2000,
      remainingAmount: 0,
      time: '2024-01-20T14:00:00Z',
      status: 'PENDING',
      createdAt: '2024-01-02T00:00:00Z',
      totalScreeningCount: 5,
      usedScreeningCount: 5,
      remainingScreeningCount: 0,
      service: {
        id: 'service-2',
        categoryId: 'cat-1',
        name: 'Another Service',
        slug: 'another-service',
        basePrice: 2000,
        paymentType: 'FULL',
        reviewCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
      payment: {
        id: 'payment-2',
        userId: 'user-1',
        totalAmount: 2000,
        paidAmount: 2000,
        remainingAmount: 0,
        status: 'COMPLETED',
        createdAt: '2024-01-02T00:00:00Z',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
  });

  it('should display loading state initially', () => {
    vi.mocked(bookingApi.getAll).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<BookingList />, { wrapper: createWrapper() });

    // Should show skeleton loaders
    expect(screen.getByRole('button', { name: /all bookings/i })).toBeDisabled();
  });

  it('should display bookings after loading', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    render(<BookingList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(screen.getByText('Another Service')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all bookings/i })).not.toBeDisabled();
  });

  it('should display empty state when no bookings', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue([]);

    render(<BookingList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/no bookings found/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/you haven't made any bookings yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse services/i })).toBeInTheDocument();
  });

  it('should navigate to home when clicking Browse Services in empty state', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue([]);
    const user = userEvent.setup();

    render(<BookingList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/no bookings found/i)).toBeInTheDocument();
    });

    const browseButton = screen.getByRole('button', { name: /browse services/i });
    await user.click(browseButton);

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('should display error state on fetch failure', async () => {
    const errorMessage = 'Failed to fetch bookings';
    vi.mocked(bookingApi.getAll).mockRejectedValue(new Error(errorMessage));

    render(<BookingList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/failed to load bookings/i)).toBeInTheDocument();
    });

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('should filter bookings by status', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);
    const user = userEvent.setup();

    render(<BookingList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Initially shows all bookings
    expect(screen.getByText('Test Service')).toBeInTheDocument();
    expect(screen.getByText('Another Service')).toBeInTheDocument();

    // Filter by CONFIRMED status
    const confirmedButton = screen.getByRole('button', { name: /^confirmed$/i });
    await user.click(confirmedButton);

    // Should only show CONFIRMED booking
    expect(screen.getByText('Test Service')).toBeInTheDocument();
    expect(screen.queryByText('Another Service')).not.toBeInTheDocument();

    // Filter by PENDING status
    const pendingButton = screen.getByRole('button', { name: /^pending$/i });
    await user.click(pendingButton);

    // Should only show PENDING booking
    expect(screen.queryByText('Test Service')).not.toBeInTheDocument();
    expect(screen.getByText('Another Service')).toBeInTheDocument();
  });

  it('should show empty state for filtered status with no results', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);
    const user = userEvent.setup();

    render(<BookingList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Filter by CANCELLED status (no bookings with this status)
    const cancelledButton = screen.getByRole('button', { name: /cancelled/i });
    await user.click(cancelledButton);

    await waitFor(() => {
      expect(screen.getByText(/no cancelled bookings found/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /view all bookings/i })).toBeInTheDocument();
  });

  it('should call onViewDetails when view details is clicked', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);
    const onViewDetails = vi.fn();
    const user = userEvent.setup();

    render(<BookingList onViewDetails={onViewDetails} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    const viewDetailsButtons = screen.getAllByRole('button', { name: /view details/i });
    await user.click(viewDetailsButtons[0]);

    expect(onViewDetails).toHaveBeenCalledWith(mockBookings[0]);
  });

  it('should call onPayRemaining when pay remaining is clicked', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);
    const onPayRemaining = vi.fn();
    const user = userEvent.setup();

    render(<BookingList onPayRemaining={onPayRemaining} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    const payButton = screen.getByRole('button', { name: /pay remaining/i });
    await user.click(payButton);

    expect(onPayRemaining).toHaveBeenCalledWith('payment-1', 'booking-1');
  });

  it('should disable pay remaining button when payment is processing', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    render(
      <BookingList
        onPayRemaining={vi.fn()}
        payingRemaining="booking-1"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    const payButton = screen.getByRole('button', { name: /processing/i });
    expect(payButton).toBeDisabled();
  });

  it('should refetch bookings when refresh button is clicked', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);
    const user = userEvent.setup();

    render(<BookingList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(bookingApi.getAll).toHaveBeenCalledTimes(1);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(bookingApi.getAll).toHaveBeenCalledTimes(2);
    });
  });

  it('should display screening count information for bookings', async () => {
    vi.mocked(bookingApi.getAll).mockResolvedValue(mockBookings);

    render(<BookingList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // Check for screening count badge - verify the badge is rendered with correct aria-label
    const badges = screen.getAllByRole('status');
    expect(badges.length).toBeGreaterThan(0);
    
    // Check that the first badge has the correct aria-label
    expect(badges[0]).toHaveAttribute('aria-label', 'Screening assessments: 7 of 10 remaining');
  });
});
