import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookingSelectionStep from './BookingSelectionStep';
import * as useBookingsHook from '../../hooks/useBookings';
import type { Booking } from '../../types';

// Mock the hooks
vi.mock('../../hooks/useBookings');

// Mock child components
vi.mock('./BookingSelector', () => ({
  default: ({ bookings, selectedBookingId, onSelectBooking }: any) => (
    <div data-testid="booking-selector">
      <div>Bookings: {bookings.length}</div>
      <div>Selected: {selectedBookingId || 'none'}</div>
      {bookings.map((booking: Booking) => (
        <button
          key={booking.id}
          onClick={() => onSelectBooking(booking.id)}
          data-testid={`select-booking-${booking.id}`}
        >
          Select {booking.service?.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./NoBookingsState', () => ({
  default: () => <div data-testid="no-bookings-state">No Bookings</div>,
}));

vi.mock('./NoCountsState', () => ({
  default: ({ bookings }: any) => (
    <div data-testid="no-counts-state">
      No Counts (Total bookings: {bookings?.length || 0})
    </div>
  ),
}));

vi.mock('../../app/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader">Loading...</div>,
}));

// Helper to create a test booking
const createMockBooking = (overrides?: Partial<Booking>): Booking => ({
  id: 'booking-1',
  userId: 'user-1',
  serviceId: 'service-1',
  paymentId: 'payment-1',
  totalAmount: 100,
  paidAmount: 100,
  remainingAmount: 0,
  time: '2024-01-15T10:00:00Z',
  status: 'CONFIRMED',
  createdAt: '2024-01-10T10:00:00Z',
  totalScreeningCount: 10,
  usedScreeningCount: 3,
  remainingScreeningCount: 7,
  service: {
    id: 'service-1',
    name: 'Posture Analysis Package',
    slug: 'posture-analysis',
    categoryId: 'cat-1',
    basePrice: 100,
    reviewCount: 0,
    createdAt: '2024-01-01T00:00:00Z',
  },
  ...overrides,
});

// Helper to create QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Helper to render with providers
const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
};

describe('BookingSelectionStep', () => {
  const mockOnBookingSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should display loading spinner while fetching bookings', () => {
      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: [],
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      expect(screen.getByTestId('loader')).toBeInTheDocument();
      expect(screen.getByText('Loading your bookings...')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should display error message when fetch fails', () => {
      const mockRefetch = vi.fn();
      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: [],
        isLoading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      expect(screen.getByText('Failed to Load Bookings')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should call refetch when Try Again button is clicked', async () => {
      const user = userEvent.setup();
      const mockRefetch = vi.fn();
      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: [],
        isLoading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      const tryAgainButton = screen.getByText('Try Again');
      await user.click(tryAgainButton);

      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('should handle non-Error error objects', () => {
      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: [],
        isLoading: false,
        error: 'String error' as any,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
    });
  });

  describe('No Bookings State', () => {
    it('should display NoBookingsState when bookings array is empty', () => {
      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      expect(screen.getByTestId('no-bookings-state')).toBeInTheDocument();
    });

    it('should display NoBookingsState when bookings is undefined', () => {
      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: undefined as any,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      expect(screen.getByTestId('no-bookings-state')).toBeInTheDocument();
    });
  });

  describe('No Counts State', () => {
    it('should display NoCountsState when all bookings have zero remaining counts', () => {
      const bookingsWithNoCounts = [
        createMockBooking({
          id: 'booking-1',
          totalScreeningCount: 5,
          usedScreeningCount: 5,
          remainingScreeningCount: 0,
        }),
        createMockBooking({
          id: 'booking-2',
          totalScreeningCount: 3,
          usedScreeningCount: 3,
          remainingScreeningCount: 0,
        }),
      ];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: bookingsWithNoCounts,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      expect(screen.getByTestId('no-counts-state')).toBeInTheDocument();
      expect(screen.getByText(/Total bookings: 2/)).toBeInTheDocument();
    });
  });

  describe('Booking Selection', () => {
    it('should display BookingSelector with valid bookings', () => {
      const mockBookings = [
        createMockBooking({ id: 'booking-1', remainingScreeningCount: 5 }),
        createMockBooking({ id: 'booking-2', remainingScreeningCount: 3 }),
      ];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      expect(screen.getByTestId('booking-selector')).toBeInTheDocument();
      expect(screen.getByText('Bookings: 2')).toBeInTheDocument();
    });

    it('should display header and description', () => {
      const mockBookings = [createMockBooking()];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      expect(screen.getByText('Select a Booking')).toBeInTheDocument();
      expect(
        screen.getByText(/Choose which booking to use for this posture assessment/)
      ).toBeInTheDocument();
    });

    it('should handle booking selection', async () => {
      const user = userEvent.setup();
      const mockBookings = [
        createMockBooking({ id: 'booking-1', remainingScreeningCount: 5 }),
      ];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      // Initially no booking selected
      expect(screen.getByText('Selected: none')).toBeInTheDocument();

      // Select a booking
      const selectButton = screen.getByTestId('select-booking-booking-1');
      await user.click(selectButton);

      // Booking should be selected
      await waitFor(() => {
        expect(screen.getByText('Selected: booking-1')).toBeInTheDocument();
      });
    });

    it('should initialize with preSelectedBookingId if provided', () => {
      const mockBookings = [
        createMockBooking({ id: 'booking-1', remainingScreeningCount: 5 }),
      ];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep
          onBookingSelected={mockOnBookingSelected}
          preSelectedBookingId="booking-1"
        />
      );

      expect(screen.getByText('Selected: booking-1')).toBeInTheDocument();
    });
  });

  describe('Continue Button', () => {
    it('should be disabled when no booking is selected', () => {
      const mockBookings = [createMockBooking()];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      const continueButton = screen.getByText('Continue to Instructions');
      expect(continueButton).toBeDisabled();
    });

    it('should be enabled when a booking is selected', async () => {
      const user = userEvent.setup();
      const mockBookings = [
        createMockBooking({ id: 'booking-1', remainingScreeningCount: 5 }),
      ];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      // Select a booking
      const selectButton = screen.getByTestId('select-booking-booking-1');
      await user.click(selectButton);

      // Continue button should be enabled
      const continueButton = screen.getByText('Continue to Instructions');
      await waitFor(() => {
        expect(continueButton).not.toBeDisabled();
      });
    });

    it('should call onBookingSelected when Continue button is clicked', async () => {
      const user = userEvent.setup();
      const mockBookings = [
        createMockBooking({ id: 'booking-1', remainingScreeningCount: 5 }),
      ];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      // Select a booking
      const selectButton = screen.getByTestId('select-booking-booking-1');
      await user.click(selectButton);

      // Click continue
      const continueButton = screen.getByText('Continue to Instructions');
      await user.click(continueButton);

      expect(mockOnBookingSelected).toHaveBeenCalledWith('booking-1');
      expect(mockOnBookingSelected).toHaveBeenCalledTimes(1);
    });

    it('should not call onBookingSelected if no booking is selected', async () => {
      const user = userEvent.setup();
      const mockBookings = [createMockBooking()];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      const continueButton = screen.getByText('Continue to Instructions');
      
      // Button is disabled, but try to click anyway
      await user.click(continueButton);

      expect(mockOnBookingSelected).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle bookings with some having counts and some without', () => {
      const mockBookings = [
        createMockBooking({
          id: 'booking-1',
          remainingScreeningCount: 5,
        }),
        createMockBooking({
          id: 'booking-2',
          remainingScreeningCount: 0,
        }),
        createMockBooking({
          id: 'booking-3',
          remainingScreeningCount: 3,
        }),
      ];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      // Should show booking selector (not no-counts state)
      expect(screen.getByTestId('booking-selector')).toBeInTheDocument();
      // All bookings passed to selector (filtering happens in BookingSelector)
      expect(screen.getByText('Bookings: 3')).toBeInTheDocument();
    });

    it('should handle changing selection', async () => {
      const user = userEvent.setup();
      const mockBookings = [
        createMockBooking({ id: 'booking-1', remainingScreeningCount: 5 }),
        createMockBooking({ id: 'booking-2', remainingScreeningCount: 3 }),
      ];

      vi.mocked(useBookingsHook.useBookings).mockReturnValue({
        bookings: mockBookings,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      renderWithProviders(
        <BookingSelectionStep onBookingSelected={mockOnBookingSelected} />
      );

      // Select first booking
      await user.click(screen.getByTestId('select-booking-booking-1'));
      await waitFor(() => {
        expect(screen.getByText('Selected: booking-1')).toBeInTheDocument();
      });

      // Change to second booking
      await user.click(screen.getByTestId('select-booking-booking-2'));
      await waitFor(() => {
        expect(screen.getByText('Selected: booking-2')).toBeInTheDocument();
      });

      // Click continue with second booking
      await user.click(screen.getByText('Continue to Instructions'));
      expect(mockOnBookingSelected).toHaveBeenCalledWith('booking-2');
    });
  });
});
