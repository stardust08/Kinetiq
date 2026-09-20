import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BookingAssessmentsPage from './BookingAssessmentsPage';
import * as postureApi from '../api/posture';
import * as bookingsApi from '../api/bookings';

// Mock the API modules
vi.mock('../api/posture');
vi.mock('../api/bookings');

const mockBooking = {
  id: 'booking-1',
  userId: 'user-1',
  serviceId: 'service-1',
  paymentId: 'payment-1',
  time: '2024-01-15T10:00:00Z',
  status: 'CONFIRMED',
  totalScreeningCount: 10,
  usedScreeningCount: 3,
  remainingScreeningCount: 7,
  service: {
    id: 'service-1',
    name: 'Posture Analysis Package',
    slug: 'posture-analysis',
    basePrice: 100,
  },
};

const createWrapper = (initialRoute = '/bookings/booking-1/assessments') => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/bookings/:bookingId/assessments" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('BookingAssessmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postureApi.getMyAssessments).mockResolvedValue([]);
  });

  it('shows loading state initially', () => {
    vi.mocked(bookingsApi.bookingAPI.getById).mockImplementation(() => new Promise(() => {}));
    
    render(<BookingAssessmentsPage />, { wrapper: createWrapper() });
    
    // Check for loading spinner by class
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error state when booking not found', async () => {
    vi.mocked(bookingsApi.bookingAPI.getById).mockRejectedValue(new Error('Not found'));
    
    render(<BookingAssessmentsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByText('Booking Not Found')).toBeInTheDocument();
    });
  });

  it('renders booking details and assessments when loaded', async () => {
    vi.mocked(bookingsApi.bookingAPI.getById).mockResolvedValue(mockBooking);
    
    render(<BookingAssessmentsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Posture Analysis Package/ })).toBeInTheDocument();
    });
  });

  it('fetches assessments for the booking', async () => {
    vi.mocked(bookingsApi.bookingAPI.getById).mockResolvedValue(mockBooking);
    
    render(<BookingAssessmentsPage />, { wrapper: createWrapper() });
    
    await waitFor(() => {
      expect(postureApi.getMyAssessments).toHaveBeenCalledWith({ bookingId: 'booking-1' });
    });
  });
});
