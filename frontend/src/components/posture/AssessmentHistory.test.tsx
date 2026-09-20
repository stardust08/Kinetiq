import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import AssessmentHistory from './AssessmentHistory';
import { PostureAnalysis, Booking } from '../../types';

/**
 * How many assessments are on screen.
 *
 * The component used to print "N assessments found" and these tests read the filter
 * results off that line. It was removed, so the count is taken from the cards
 * themselves - each renders exactly one "View Details" button. That is a better thing
 * to assert anyway: it counts what the patient can actually see and open, rather than
 * a summary that could disagree with the list beneath it.
 */
function visibleAssessments() {
  return screen.queryAllByRole('button', { name: /View details for assessment/i });
}



// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper to create mock assessment
const createMockAssessment = (overrides: Partial<PostureAnalysis> = {}): PostureAnalysis => ({
  id: `assessment-${Math.random()}`,
  userId: 'user-1',
  bookingId: 'booking-1',
  analysisDate: new Date('2024-01-15T10:00:00Z').toISOString(),
  status: 'completed',
  fhdPixels: 25.5,
  cervicalAngle: 40.0,
  headLateralFlexion: 2.0,
  headRotation: 1.5,
  thoracicKyphosisAngle: 30.0,
  lumbarLordosisAngle: 40.0,
  trunkLateralShift: 5.0,
  trunkAngle: 2.0,
  leftShoulderAngle: 90.0,
  rightShoulderAngle: 90.0,
  shoulderHeightDiff: 5.0,
  roundedShoulderAngle: 10.0,
  leftElbowAngle: 180.0,
  rightElbowAngle: 180.0,
  leftHipAngle: 180.0,
  rightHipAngle: 180.0,
  pelvicObliquity: 1.0,
  pelvicTiltAngle: 2.0,
  hipHeightDiff: 3.0,
  leftKneeAngle: 180.0,
  rightKneeAngle: 180.0,
  kneeVarusValgus: 0.0,
  kneeFlexionNeutral: 180.0,
  qAngleLeft: 12.0,
  qAngleRight: 12.0,
  footProgressionAngle: 5.0,
  pronationSupinationLeft: 0.0,
  pronationSupinationRight: 0.0,
  shoulderWidth: 400.0,
  hipWidth: 350.0,
  torsoLength: 500.0,
  leftArmLength: 600.0,
  rightArmLength: 600.0,
  leftLegLength: 900.0,
  rightLegLength: 900.0,
  ...overrides,
});

// Helper to create mock booking
const createMockBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'booking-1',
  userId: 'user-1',
  serviceId: 'service-1',
  paymentId: 'payment-1',
  totalAmount: 100,
  paidAmount: 100,
  remainingAmount: 0,
  time: '2024-01-01T10:00:00Z',
  status: 'CONFIRMED',
  createdAt: new Date('2024-01-01T09:00:00Z').toISOString(),
  totalScreeningCount: 10,
  usedScreeningCount: 2,
  remainingScreeningCount: 8,
  service: {
    id: 'service-1',
    name: 'Posture Analysis Package',
    slug: 'posture-analysis',
    categoryId: 'cat-1',
    basePrice: 100,
    paymentType: 'FULL',
    createdAt: new Date('2024-01-01').toISOString(),
  },
  ...overrides,
});

describe('AssessmentHistory', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  const renderComponent = (props: Partial<React.ComponentProps<typeof AssessmentHistory>> = {}) => {
    const defaultProps = {
      assessments: [],
      bookings: [],
      isLoading: false,
      ...props,
    };

    return renderWithProviders(
        <AssessmentHistory {...defaultProps} />
    );
  };

  describe('Rendering', () => {
    it('should render the component with header', () => {
      renderComponent();
      // The page no longer carries an 'Assessment History' heading; the filter
      // panel is the first thing rendered.
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('should show loading spinner when loading with no assessments', () => {
      renderComponent({ isLoading: true, assessments: [] });
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should display assessment count', () => {
      const assessments = [
        createMockAssessment({ id: '1' }),
        createMockAssessment({ id: '2' }),
      ];
      renderComponent({ assessments });
      expect(visibleAssessments()).toHaveLength(2);
    });

    it('should display singular "assessment" for count of 1', () => {
      const assessments = [createMockAssessment()];
      renderComponent({ assessments });
      expect(visibleAssessments()).toHaveLength(1);
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no assessments', () => {
      renderComponent({ assessments: [] });
      expect(screen.getByText('No Assessments Found')).toBeInTheDocument();
      expect(screen.getByText("You haven't completed any posture assessments yet.")).toBeInTheDocument();
    });

    it('should show "Start Your First Assessment" button in empty state', () => {
      renderComponent({ assessments: [] });
      const button = screen.getByText('Start Your First Assessment');
      expect(button).toBeInTheDocument();
      
      fireEvent.click(button);
      expect(mockNavigate).toHaveBeenCalledWith('/posture-analysis');
    });

    it('should show different message when filters return no results', () => {
      const assessments = [createMockAssessment()];
      renderComponent({ assessments });
      
      // Apply a filter that returns no results
      const bookingFilter = screen.getByLabelText('Filter by Booking');
      fireEvent.change(bookingFilter, { target: { value: 'non-existent-booking' } });
      
      expect(screen.getByText('No assessments match your current filters.')).toBeInTheDocument();
    });
  });

  describe('Assessment Cards', () => {
    it('should render assessment cards for each assessment', () => {
      const assessments = [
        createMockAssessment({ id: '1', analysisDate: new Date('2024-01-15').toISOString() }),
        createMockAssessment({ id: '2', analysisDate: new Date('2024-01-16').toISOString() }),
      ];
      renderComponent({ assessments });
      
      expect(screen.getByText('January 15, 2024')).toBeInTheDocument();
      expect(screen.getByText('January 16, 2024')).toBeInTheDocument();
    });

    it('should display booking name in assessment card', () => {
      const assessments = [createMockAssessment({ bookingId: 'booking-1' })];
      const bookings = [createMockBooking({ id: 'booking-1' })];
      renderComponent({ assessments, bookings });
      
      expect(screen.getByText('Posture Analysis Package')).toBeInTheDocument();
    });

    it('should display key metrics in assessment card', () => {
      const assessments = [
        createMockAssessment({
          fhdPixels: 25.5,
          cervicalAngle: 40.0,
          shoulderHeightDiff: 5.0,
          pelvicTiltAngle: 2.0,
        }),
      ];
      renderComponent({ assessments });
      
      expect(screen.getByText('25.5')).toBeInTheDocument();
      expect(screen.getByText('40.0')).toBeInTheDocument();
      expect(screen.getByText('5.0')).toBeInTheDocument();
      expect(screen.getByText('2.0')).toBeInTheDocument();
    });

    it('should navigate to detail view when "View Details" is clicked', () => {
      const assessments = [createMockAssessment({ id: 'assessment-123' })];
      renderComponent({ assessments });
      
      const viewButton = screen.getByText('View Details');
      fireEvent.click(viewButton);
      
      expect(mockNavigate).toHaveBeenCalledWith('/posture-analysis/assessment-123');
    });

    it('should display status badge with correct styling', () => {
      const assessments = [
        createMockAssessment({ id: '1', status: 'completed' }),
      ];
      renderComponent({ assessments });
      
      const statusBadge = screen.getByText('completed');
      expect(statusBadge).toHaveClass('bg-green-100', 'text-green-800');
    });
  });

  describe('Filtering', () => {
    it('should filter assessments by booking', () => {
      const assessments = [
        createMockAssessment({ id: '1', bookingId: 'booking-1' }),
        createMockAssessment({ id: '2', bookingId: 'booking-2' }),
      ];
      const bookings = [
        createMockBooking({ id: 'booking-1', service: { id: 's1', name: 'Service 1', slug: 's1', categoryId: 'c1', basePrice: 100, paymentType: 'FULL', createdAt: '2024-01-01' } }),
        createMockBooking({ id: 'booking-2', service: { id: 's2', name: 'Service 2', slug: 's2', categoryId: 'c1', basePrice: 100, paymentType: 'FULL', createdAt: '2024-01-01' } }),
      ];
      renderComponent({ assessments, bookings });
      
      // Initially both should be visible
      expect(visibleAssessments()).toHaveLength(2);
      
      // Filter by booking-1
      const bookingFilter = screen.getByLabelText('Filter by Booking');
      fireEvent.change(bookingFilter, { target: { value: 'booking-1' } });
      
      expect(visibleAssessments()).toHaveLength(1);
    });

    it('should filter assessments by start date', () => {
      const assessments = [
        createMockAssessment({ id: '1', analysisDate: new Date('2024-01-10').toISOString() }),
        createMockAssessment({ id: '2', analysisDate: new Date('2024-01-20').toISOString() }),
      ];
      renderComponent({ assessments });
      
      const startDateInput = screen.getByLabelText('From Date');
      fireEvent.change(startDateInput, { target: { value: '2024-01-15' } });
      
      expect(visibleAssessments()).toHaveLength(1);
      expect(screen.getByText('January 20, 2024')).toBeInTheDocument();
    });

    it('should filter assessments by end date', () => {
      const assessments = [
        createMockAssessment({ id: '1', analysisDate: new Date('2024-01-10').toISOString() }),
        createMockAssessment({ id: '2', analysisDate: new Date('2024-01-20').toISOString() }),
      ];
      renderComponent({ assessments });
      
      const endDateInput = screen.getByLabelText('To Date');
      fireEvent.change(endDateInput, { target: { value: '2024-01-15' } });
      
      expect(visibleAssessments()).toHaveLength(1);
      expect(screen.getByText('January 10, 2024')).toBeInTheDocument();
    });

    it('should filter assessments by date range', () => {
      const assessments = [
        createMockAssessment({ id: '1', analysisDate: new Date('2024-01-05').toISOString() }),
        createMockAssessment({ id: '2', analysisDate: new Date('2024-01-15').toISOString() }),
        createMockAssessment({ id: '3', analysisDate: new Date('2024-01-25').toISOString() }),
      ];
      renderComponent({ assessments });
      
      const startDateInput = screen.getByLabelText('From Date');
      const endDateInput = screen.getByLabelText('To Date');
      
      fireEvent.change(startDateInput, { target: { value: '2024-01-10' } });
      fireEvent.change(endDateInput, { target: { value: '2024-01-20' } });
      
      expect(visibleAssessments()).toHaveLength(1);
      expect(screen.getByText('January 15, 2024')).toBeInTheDocument();
    });

    it('should show clear filters button when filters are active', () => {
      const assessments = [createMockAssessment()];
      renderComponent({ assessments });
      
      // No clear button initially
      expect(screen.queryByText('Clear Filters')).not.toBeInTheDocument();
      
      // Apply a filter
      const startDateInput = screen.getByLabelText('From Date');
      fireEvent.change(startDateInput, { target: { value: '2024-01-01' } });
      
      // Clear button should appear
      expect(screen.getByText('Clear Filters')).toBeInTheDocument();
    });

    it('should clear all filters when clear button is clicked', () => {
      const assessments = [
        createMockAssessment({ id: '1', bookingId: 'booking-1' }),
        createMockAssessment({ id: '2', bookingId: 'booking-2' }),
      ];
      const bookings = [
        createMockBooking({ id: 'booking-1' }),
        createMockBooking({ id: 'booking-2' }),
      ];
      renderComponent({ assessments, bookings });
      
      // Apply filters
      const bookingFilter = screen.getByLabelText('Filter by Booking') as HTMLSelectElement;
      const startDateInput = screen.getByLabelText('From Date') as HTMLInputElement;
      
      fireEvent.change(bookingFilter, { target: { value: 'booking-1' } });
      fireEvent.change(startDateInput, { target: { value: '2024-01-01' } });
      
      expect(bookingFilter.value).toBe('booking-1');
      expect(startDateInput.value).toBe('2024-01-01');
      
      // Clear filters
      const clearButton = screen.getByText('Clear Filters');
      fireEvent.click(clearButton);
      
      expect(bookingFilter.value).toBe('all');
      expect(startDateInput.value).toBe('');
    });

    it('should reset to page 1 when filters change', () => {
      const assessments = Array.from({ length: 25 }, (_, i) =>
        createMockAssessment({ id: `${i}`, analysisDate: new Date(`2024-01-${i + 1}`).toISOString() })
      );
      renderComponent({ assessments });
      
      // Go to page 2
      const page2Button = screen.getByText('2');
      fireEvent.click(page2Button);
      
      // Apply a filter
      const startDateInput = screen.getByLabelText('From Date');
      fireEvent.change(startDateInput, { target: { value: '2024-01-01' } });
      
      // Should be back on page 1 (Previous button disabled)
      const prevButton = screen.getByText('Previous');
      expect(prevButton).toBeDisabled();
    });
  });

  describe('Pagination', () => {
    it('should paginate assessments with 10 items per page', () => {
      const assessments = Array.from({ length: 25 }, (_, i) =>
        createMockAssessment({ id: `${i}` })
      );
      renderComponent({ assessments });
      
      // Should show 10 items on first page
      const cards = screen.getAllByText('View Details');
      expect(cards).toHaveLength(10);
    });

    it('should show pagination controls when more than 10 assessments', () => {
      const assessments = Array.from({ length: 15 }, (_, i) =>
        createMockAssessment({ id: `${i}` })
      );
      renderComponent({ assessments });
      
      expect(screen.getByText('Previous')).toBeInTheDocument();
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should not show pagination when 10 or fewer assessments', () => {
      const assessments = Array.from({ length: 10 }, (_, i) =>
        createMockAssessment({ id: `${i}` })
      );
      renderComponent({ assessments });
      
      expect(screen.queryByText('Previous')).not.toBeInTheDocument();
      expect(screen.queryByText('Next')).not.toBeInTheDocument();
    });

    it('should navigate to next page when Next is clicked', () => {
      const assessments = Array.from({ length: 15 }, (_, i) =>
        createMockAssessment({ id: `${i}` })
      );
      renderComponent({ assessments });
      
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);
      
      // 15 assessments over 10 per page: the second page holds the remaining 5.
      expect(visibleAssessments()).toHaveLength(5);
    });

    it('should navigate to previous page when Previous is clicked', () => {
      const assessments = Array.from({ length: 15 }, (_, i) =>
        createMockAssessment({ id: `${i}` })
      );
      renderComponent({ assessments });
      
      // Go to page 2
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);
      
      // Go back to page 1
      const prevButton = screen.getByText('Previous');
      fireEvent.click(prevButton);
      
      expect(visibleAssessments()).toHaveLength(10);
    });

    it('should disable Previous button on first page', () => {
      const assessments = Array.from({ length: 15 }, (_, i) =>
        createMockAssessment({ id: `${i}` })
      );
      renderComponent({ assessments });
      
      const prevButton = screen.getByText('Previous');
      expect(prevButton).toBeDisabled();
    });

    it('should disable Next button on last page', () => {
      const assessments = Array.from({ length: 15 }, (_, i) =>
        createMockAssessment({ id: `${i}` })
      );
      renderComponent({ assessments });
      
      // Go to page 2 (last page)
      const page2Button = screen.getByText('2');
      fireEvent.click(page2Button);
      
      const nextButton = screen.getByText('Next');
      expect(nextButton).toBeDisabled();
    });

    it('should show ellipsis for large page counts', () => {
      const assessments = Array.from({ length: 100 }, (_, i) =>
        createMockAssessment({ id: `${i}` })
      );
      renderComponent({ assessments });
      
      // Should show ellipsis between page numbers
      const ellipsis = screen.getAllByText('...');
      expect(ellipsis.length).toBeGreaterThan(0);
    });
  });

  describe('Sorting', () => {
    it('should sort assessments by date (most recent first)', () => {
      const assessments = [
        createMockAssessment({ id: '1', analysisDate: new Date('2024-01-10').toISOString() }),
        createMockAssessment({ id: '2', analysisDate: new Date('2024-01-20').toISOString() }),
        createMockAssessment({ id: '3', analysisDate: new Date('2024-01-15').toISOString() }),
      ];
      renderComponent({ assessments });
      
      const dates = screen.getAllByText(/January \d+, 2024/);
      expect(dates[0]).toHaveTextContent('January 20, 2024');
      expect(dates[1]).toHaveTextContent('January 15, 2024');
      expect(dates[2]).toHaveTextContent('January 10, 2024');
    });
  });

  describe('Load More', () => {
    it('should show load more button when hasMore is true', () => {
      const assessments = [createMockAssessment()];
      const onLoadMore = vi.fn();
      renderComponent({ assessments, hasMore: true, onLoadMore });
      
      expect(screen.getByText('Load More')).toBeInTheDocument();
    });

    it('should call onLoadMore when load more button is clicked', () => {
      const assessments = [createMockAssessment()];
      const onLoadMore = vi.fn();
      renderComponent({ assessments, hasMore: true, onLoadMore });
      
      const loadMoreButton = screen.getByText('Load More');
      fireEvent.click(loadMoreButton);
      
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it('should disable load more button when loading', () => {
      const assessments = [createMockAssessment()];
      const onLoadMore = vi.fn();
      renderComponent({ assessments, hasMore: true, onLoadMore, isLoading: true });
      
      const loadMoreButton = screen.getByText('Loading...');
      expect(loadMoreButton).toBeDisabled();
    });

    it('should not show load more button when hasMore is false', () => {
      const assessments = [createMockAssessment()];
      const onLoadMore = vi.fn();
      renderComponent({ assessments, hasMore: false, onLoadMore });
      
      expect(screen.queryByText('Load More')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels for filter inputs', () => {
      renderComponent();
      
      expect(screen.getByLabelText('Filter by Booking')).toBeInTheDocument();
      expect(screen.getByLabelText('From Date')).toBeInTheDocument();
      expect(screen.getByLabelText('To Date')).toBeInTheDocument();
    });

    it('should have proper button labels', () => {
      const assessments = [createMockAssessment()];
      renderComponent({ assessments });
      
      expect(screen.getByText('View Details')).toBeInTheDocument();
    });
  });
});
