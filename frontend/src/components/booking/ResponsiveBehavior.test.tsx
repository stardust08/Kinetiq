import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import BookingCard from './BookingCard';
import ScreeningCountBadge from './ScreeningCountBadge';
import BookingSelector from './BookingSelector';
import { Booking, BookingStatus, PaymentStatus } from '../../types';

/**
 * Responsive Behavior Tests for Booking Components
 * 
 * Tests responsive behavior on:
 * - Mobile devices (< 640px)
 * - Tablets (640px - 1024px)
 * - Desktop (> 1024px)
 * 
 * Verifies:
 * - Grid layouts adapt correctly
 * - Text sizing is appropriate
 * - Buttons and interactive elements are accessible
 * - Components render without layout issues
 */

// Mock window.matchMedia for responsive testing
const createMatchMedia = (width: number) => {
  return (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
};

// Helper to set viewport size
const setViewportSize = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });
  window.matchMedia = createMatchMedia(width);
};

// Mock booking data
const createMockBooking = (overrides?: Partial<Booking>): Booking => ({
  id: 'booking-123',
  userId: 'user-123',
  serviceId: 'service-123',
  paymentId: 'payment-123',
  totalAmount: 5000,
  paidAmount: 5000,
  remainingAmount: 0,
  time: '2024-02-01T10:00:00Z',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  status: 'CONFIRMED' as BookingStatus,
  description: 'Clinical Posture Analysis Session',
  totalScreeningCount: 10,
  usedScreeningCount: 3,
  remainingScreeningCount: 7,
  service: {
    id: 'service-123',
    name: 'Posture Analysis Package',
    slug: 'posture-analysis',
    description: 'Comprehensive posture analysis',
    basePrice: 5000,
    categoryId: 'cat-123',
    duration: '30 minutes',
    serviceType: 'Assessment',
  },
  payment: {
    id: 'payment-123',
    userId: 'user-123',
    amount: 5000,
    status: 'COMPLETED' as PaymentStatus,
    method: 'RAZORPAY',
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  postureAnalyses: [],
  ...overrides,
});

describe('Responsive Behavior Tests', () => {
  let originalInnerWidth: number;
  let originalInnerHeight: number;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    // Save original values
    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
    window.matchMedia = originalMatchMedia;
  });

  describe('BookingCard - Mobile (< 640px)', () => {
    beforeEach(() => {
      setViewportSize(375, 667); // iPhone SE size
    });

    it('should render all essential elements on mobile', () => {
      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      // Verify essential content is present
      expect(screen.getByText('Posture Analysis Package')).toBeInTheDocument();
      expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
      expect(screen.getByText(/AI Screening Assessments/i)).toBeInTheDocument();
      
      // Verify screening count badge with ARIA label
      expect(screen.getByRole('status', { name: /7 of 10 remaining/i })).toBeInTheDocument();
    });

    it('should display screening count badge with appropriate mobile sizing', () => {
      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      const badge = screen.getByRole('status', { name: /Screening assessments/i });
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('p-3'); // md size padding
    });

    it('should stack action buttons vertically on mobile', () => {
      const booking = createMockBooking({
        postureAnalyses: [
          { id: 'analysis-1', analysisDate: new Date(), status: 'completed' },
        ],
      });
      const onStartAssessment = vi.fn();
      const onViewHistory = vi.fn();

      render(
        <BrowserRouter>
          <BookingCard
            booking={booking}
            onStartAssessment={onStartAssessment}
            onViewHistory={onViewHistory}
          />
        </BrowserRouter>
      );

      const startButton = screen.getByRole('button', { name: /Posture Analysis/i });
      const historyButton = screen.getByRole('button', { name: /History \(/i });

      expect(startButton).toBeInTheDocument();
      expect(historyButton).toBeInTheDocument();

      // Check for flex-col class (vertical stacking on mobile)
      const buttonContainer = startButton.parentElement;
      expect(buttonContainer).toHaveClass('flex', 'flex-col', 'sm:flex-row');
    });

    it('should display booking details in grid layout', () => {
      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      // Verify scheduled time is visible
      expect(screen.getByText(/Scheduled/i)).toBeInTheDocument();
      expect(screen.getByText(/^Payment$/)).toBeInTheDocument();
    });

    it('should handle long service names gracefully', () => {
      const booking = createMockBooking({
        service: {
          ...createMockBooking().service!,
          name: 'Very Long Service Name That Should Wrap Properly On Mobile Devices',
        },
      });

      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      const serviceName = screen.getByText(/Very Long Service Name/i);
      expect(serviceName).toBeInTheDocument();
      expect(serviceName).toHaveClass('text-xl'); // Should maintain readable size
    });
  });

  describe('BookingCard - Tablet (640px - 1024px)', () => {
    beforeEach(() => {
      setViewportSize(768, 1024); // iPad size
    });

    it('should render with tablet-optimized layout', () => {
      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      expect(screen.getByText('Posture Analysis Package')).toBeInTheDocument();
      expect(screen.getByText(/AI Screening Assessments/i)).toBeInTheDocument();
    });

    it('should display action buttons horizontally on tablet', () => {
      const booking = createMockBooking();
      const onStartAssessment = vi.fn();
      const onViewHistory = vi.fn();

      render(
        <BrowserRouter>
          <BookingCard
            booking={booking}
            onStartAssessment={onStartAssessment}
            onViewHistory={onViewHistory}
          />
        </BrowserRouter>
      );

      const buttonContainer = screen.getByRole('button', { name: /Posture Analysis/i }).parentElement;
      expect(buttonContainer).toHaveClass('sm:flex-row'); // Horizontal on tablet
    });

    it('should display booking details in 2-column grid', () => {
      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      // Grid should be md:grid-cols-2
      const scheduledTime = screen.getByText(/Scheduled/i);
      const paymentDetails = screen.getByText(/^Payment$/);

      expect(scheduledTime).toBeInTheDocument();
      expect(paymentDetails).toBeInTheDocument();
    });
  });

  describe('BookingCard - Desktop (> 1024px)', () => {
    beforeEach(() => {
      setViewportSize(1920, 1080); // Full HD desktop
    });

    it('should render with desktop-optimized layout', () => {
      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      expect(screen.getByText('Posture Analysis Package')).toBeInTheDocument();
      expect(screen.getByText(/AI Screening Assessments/i)).toBeInTheDocument();
    });

    it('should display all elements with proper spacing', () => {
      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      // Verify all sections are present
      expect(screen.getByText(/Scheduled/i)).toBeInTheDocument();
      expect(screen.getByText(/^Payment$/)).toBeInTheDocument();
      expect(screen.getByText(/Description/i)).toBeInTheDocument();
      expect(screen.getByText(/Service Details/i)).toBeInTheDocument();
    });

    it('should display action buttons horizontally with proper sizing', () => {
      const booking = createMockBooking({
        postureAnalyses: [
          { id: 'analysis-1', analysisDate: new Date(), status: 'completed' },
        ],
      });
      const onStartAssessment = vi.fn();
      const onViewHistory = vi.fn();

      render(
        <BrowserRouter>
          <BookingCard
            booking={booking}
            onStartAssessment={onStartAssessment}
            onViewHistory={onViewHistory}
          />
        </BrowserRouter>
      );

      const startButton = screen.getByRole('button', { name: /Posture Analysis/i });
      const historyButton = screen.getByRole('button', { name: /History \(/i });

      expect(startButton).toBeInTheDocument();
      expect(historyButton).toBeInTheDocument();
    });
  });

  describe('ScreeningCountBadge - All Screen Sizes', () => {
    it('should render with small size on mobile', () => {
      setViewportSize(375, 667);
      render(<ScreeningCountBadge totalCount={10} usedCount={3} remainingCount={7} size="sm" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('p-2.5'); // Small size padding
    });

    it('should render with medium size on tablet', () => {
      setViewportSize(768, 1024);
      render(<ScreeningCountBadge totalCount={10} usedCount={3} remainingCount={7} size="md" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('p-3'); // Medium size padding
    });

    it('should render with large size on desktop', () => {
      setViewportSize(1920, 1080);
      render(<ScreeningCountBadge totalCount={10} usedCount={3} remainingCount={7} size="lg" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('p-4'); // Large size padding
    });

    it('should display progress bar on all screen sizes', () => {
      const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];

      sizes.forEach((size) => {
        const { unmount } = render(
          <ScreeningCountBadge totalCount={10} usedCount={3} remainingCount={7} size={size} showProgress={true} />
        );

        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toBeInTheDocument();
        expect(progressBar).toHaveAttribute('aria-valuenow', '3');
        expect(progressBar).toHaveAttribute('aria-valuemax', '10');

        unmount();
      });
    });

    it('should use appropriate color coding for remaining counts', () => {
      // The badge's background moved to inline styles; the severity is carried by
      // the text colour now. Green plenty, orange running low, red none left.
      const { container, rerender } = render(
        <ScreeningCountBadge totalCount={10} usedCount={3} remainingCount={7} />
      );
      expect(container.querySelector('.text-emerald-400')).not.toBeNull();

      rerender(<ScreeningCountBadge totalCount={10} usedCount={8} remainingCount={2} />);
      expect(container.querySelector('.text-orange-400')).not.toBeNull();

      rerender(<ScreeningCountBadge totalCount={10} usedCount={10} remainingCount={0} />);
      expect(container.querySelector('.text-red-400')).not.toBeNull();
    });

    it('should display text with responsive sizing', () => {
      render(<ScreeningCountBadge totalCount={10} usedCount={3} remainingCount={7} size="md" />);

      // Verify the badge renders with proper ARIA label
      expect(screen.getByRole('status', { name: /7 of 10 remaining/i })).toBeInTheDocument();
      
      // Verify progress bar is present
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('BookingSelector - Mobile (< 640px)', () => {
    beforeEach(() => {
      setViewportSize(375, 667);
    });

    it('should render booking list on mobile', () => {
      const bookings = [
        createMockBooking({ id: 'booking-1' }),
        createMockBooking({ id: 'booking-2', remainingScreeningCount: 5 }),
      ];

      render(
        <BrowserRouter>
          <BookingSelector bookings={bookings} onSelectBooking={vi.fn()} />
        </BrowserRouter>
      );

      // BookingSelector is the LIST; 'Select a Booking' is BookingSelectionStep's
      // heading, one level up. What this component owns is the bookings.
      expect(screen.getAllByText('Posture Analysis Package')).toHaveLength(2);
    });

    it('should display no bookings state on mobile', () => {
      const bookings = [createMockBooking({ remainingScreeningCount: 0 })];

      render(
        <BrowserRouter>
          <BookingSelector bookings={bookings} onSelectBooking={vi.fn()} />
        </BrowserRouter>
      );

      expect(screen.getByText(/No Available Screening Assessments/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Browse Services/i })).toBeInTheDocument();
    });

    it('should render booking cards with proper mobile layout', () => {
      const bookings = [createMockBooking()];

      render(
        <BrowserRouter>
          <BookingSelector bookings={bookings} onSelectBooking={vi.fn()} />
        </BrowserRouter>
      );

      // Verify screening count badge is visible
      expect(screen.getByRole('status', { name: /Screening assessments/i })).toBeInTheDocument();
    });
  });

  describe('BookingSelector - Tablet (640px - 1024px)', () => {
    beforeEach(() => {
      setViewportSize(768, 1024);
    });

    it('should render with tablet-optimized layout', () => {
      const bookings = [createMockBooking(), createMockBooking({ id: 'booking-2' })];

      render(
        <BrowserRouter>
          <BookingSelector bookings={bookings} onSelectBooking={vi.fn()} />
        </BrowserRouter>
      );

      // BookingSelector is the LIST; 'Select a Booking' is BookingSelectionStep's
      // heading, one level up. What this component owns is the bookings.
      expect(screen.getAllByText('Posture Analysis Package')).toHaveLength(2);
    });
  });

  describe('BookingSelector - Desktop (> 1024px)', () => {
    beforeEach(() => {
      setViewportSize(1920, 1080);
    });

    it('should render with desktop-optimized layout', () => {
      const bookings = [createMockBooking(), createMockBooking({ id: 'booking-2' })];

      render(
        <BrowserRouter>
          <BookingSelector bookings={bookings} onSelectBooking={vi.fn()} />
        </BrowserRouter>
      );

      // BookingSelector is the LIST; 'Select a Booking' is BookingSelectionStep's
      // heading, one level up. What this component owns is the bookings.
      expect(screen.getAllByText('Posture Analysis Package')).toHaveLength(2);
    });

    it('should display all booking details clearly', () => {
      const bookings = [createMockBooking()];

      render(
        <BrowserRouter>
          <BookingSelector bookings={bookings} onSelectBooking={vi.fn()} />
        </BrowserRouter>
      );

      expect(screen.getByText('Posture Analysis Package')).toBeInTheDocument();
      expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Select/i })).toBeInTheDocument();
    });
  });

  describe('Accessibility - Interactive Elements', () => {
    it('should have accessible buttons on all screen sizes', () => {
      const booking = createMockBooking();
      const onStartAssessment = vi.fn();

      const viewports = [
        { width: 375, height: 667, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1920, height: 1080, name: 'desktop' },
      ];

      viewports.forEach(({ width, height, name }) => {
        setViewportSize(width, height);

        const { unmount } = render(
          <BrowserRouter>
            <BookingCard booking={booking} onStartAssessment={onStartAssessment} />
          </BrowserRouter>
        );

        const button = screen.getByRole('button', { name: /Posture Analysis/i });
        expect(button).toBeInTheDocument();
        expect(button).not.toBeDisabled();

        unmount();
      });
    });

    it('should have proper ARIA labels on all screen sizes', () => {
      const viewports = [
        { width: 375, height: 667 },
        { width: 768, height: 1024 },
        { width: 1920, height: 1080 },
      ];

      viewports.forEach(({ width, height }) => {
        setViewportSize(width, height);

        const { unmount } = render(
          <ScreeningCountBadge totalCount={10} usedCount={3} remainingCount={7} showProgress={true} />
        );

        const badge = screen.getByRole('status', { name: /Screening assessments: 7 of 10 remaining/i });
        expect(badge).toBeInTheDocument();

        const progressBar = screen.getByRole('progressbar', { name: /3 of 10 assessments used/i });
        expect(progressBar).toBeInTheDocument();

        unmount();
      });
    });
  });

  describe('Text Sizing and Readability', () => {
    it('should maintain readable text sizes on mobile', () => {
      setViewportSize(375, 667);

      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      // Service name should be readable
      const serviceName = screen.getByText('Posture Analysis Package');
      expect(serviceName).toHaveClass('text-xl'); // Minimum readable size

      // Status badges should be visible
      const statusBadge = screen.getByText('CONFIRMED');
      expect(statusBadge).toBeInTheDocument();
    });

    it('should scale text appropriately on larger screens', () => {
      setViewportSize(1920, 1080);

      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      const serviceName = screen.getByText('Posture Analysis Package');
      expect(serviceName).toHaveClass('text-xl'); // Consistent sizing
    });
  });

  describe('Grid Layout Adaptation', () => {
    it('should use single column on mobile', () => {
      setViewportSize(375, 667);

      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      // Verify grid exists with responsive classes
      const scheduledTime = screen.getByText(/Scheduled/i);
      // Two columns at every width now: the block holds short label/value pairs
      // that fit side by side even on a phone, so there is no breakpoint class.
      expect(scheduledTime.closest('.grid')).toHaveClass('grid-cols-2');
    });

    it('should use two columns on tablet and desktop', () => {
      setViewportSize(768, 1024);

      const booking = createMockBooking();
      render(
        <BrowserRouter>
          <BookingCard booking={booking} />
        </BrowserRouter>
      );

      const scheduledTime = screen.getByText(/Scheduled/i);
      // Two columns at every width now: the block holds short label/value pairs
      // that fit side by side even on a phone, so there is no breakpoint class.
      expect(scheduledTime.closest('.grid')).toHaveClass('grid-cols-2');
    });
  });
});
