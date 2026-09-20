import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import AssessmentHistoryPage from './AssessmentHistoryPage';
import * as postureApi from '../api/posture';
import * as bookingsApi from '../api/bookings';

// Mock the API modules
vi.mock('../api/posture');
vi.mock('../api/bookings');

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
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('AssessmentHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postureApi.getMyAssessments).mockResolvedValue([]);
    vi.mocked(bookingsApi.bookingAPI.getAll).mockResolvedValue([]);
  });

  it('renders the page title', () => {
    render(<AssessmentHistoryPage />, { wrapper: createWrapper() });
    
    expect(screen.getByText('Assessment History')).toBeInTheDocument();
    expect(screen.getByText('View and compare your posture analysis assessments')).toBeInTheDocument();
  });

  it('fetches assessments on mount', async () => {
    render(<AssessmentHistoryPage />, { wrapper: createWrapper() });
    
    expect(postureApi.getMyAssessments).toHaveBeenCalledWith({ bookingId: undefined });
  });

  it('fetches bookings on mount', async () => {
    render(<AssessmentHistoryPage />, { wrapper: createWrapper() });
    
    expect(bookingsApi.bookingAPI.getAll).toHaveBeenCalled();
  });
});
