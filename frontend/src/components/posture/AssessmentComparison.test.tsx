import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AssessmentComparison from './AssessmentComparison';
import { PostureAnalysis } from '../../types';

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

// Helper function to create mock assessment
function createMockAssessment(overrides: Partial<PostureAnalysis> = {}): PostureAnalysis {
  return {
    id: 'test-id',
    userId: 'user-1',
    bookingId: 'booking-1',
    analysisDate: '2024-01-15T10:00:00Z',
    status: 'completed',
    // Global Posture
    fhdPixels: 45.0,
    cervicalAngle: 40.0,
    headLateralFlexion: 2.0,
    headRotation: 1.0,
    thoracicKyphosisAngle: 30.0,
    lumbarLordosisAngle: 40.0,
    trunkLateralShift: 5.0,
    trunkAngle: 2.0,
    // Shoulder & Arm
    leftShoulderAngle: 90.0,
    rightShoulderAngle: 90.0,
    shoulderHeightDiff: 5.0,
    roundedShoulderAngle: 10.0,
    leftElbowAngle: 180.0,
    rightElbowAngle: 180.0,
    // Pelvis & Hip
    leftHipAngle: 180.0,
    rightHipAngle: 180.0,
    pelvicObliquity: 1.0,
    pelvicTiltAngle: 2.0,
    hipHeightDiff: 5.0,
    // Lower Extremity
    leftKneeAngle: 180.0,
    rightKneeAngle: 180.0,
    kneeVarusValgus: 2.0,
    kneeFlexionNeutral: 180.0,
    qAngleLeft: 12.0,
    qAngleRight: 12.0,
    footProgressionAngle: 5.0,
    pronationSupinationLeft: 2.0,
    pronationSupinationRight: 2.0,
    // Body Proportions
    shoulderWidth: 400.0,
    hipWidth: 350.0,
    torsoLength: 500.0,
    leftArmLength: 600.0,
    rightArmLength: 600.0,
    leftLegLength: 900.0,
    rightLegLength: 900.0,
    landmarksData: {},
    booking: {
      id: 'booking-1',
      userId: 'user-1',
      serviceId: 'service-1',
      paymentId: 'payment-1',
      totalAmount: 100,
      paidAmount: 100,
      remainingAmount: 0,
      time: '2024-01-15T09:00:00Z',
      status: 'COMPLETED',
      createdAt: '2024-01-10T10:00:00Z',
      totalScreeningCount: 5,
      usedScreeningCount: 1,
      remainingScreeningCount: 4,
      service: {
        id: 'service-1',
        name: 'Posture Analysis Package',
        slug: 'posture-analysis',
        categoryId: 'cat-1',
        basePrice: 100,
        paymentType: 'FULL' as const,
        createdAt: '2024-01-01T00:00:00Z',
        reviewCount: 0,
      },
    },
    ...overrides,
  };
}

describe('AssessmentComparison', () => {
  describe('Validation', () => {
    it('should show error when less than 2 assessments provided', () => {
      const assessment = createMockAssessment();
      render(<AssessmentComparison assessments={[assessment]} />);
      
      expect(screen.getByText(/please select at least 2 assessments/i)).toBeInTheDocument();
    });
    
    it('should show error when more than 4 assessments provided', () => {
      const assessments = Array.from({ length: 5 }, (_, i) =>
        createMockAssessment({
          id: `assessment-${i}`,
          analysisDate: `2024-01-${15 + i}T10:00:00Z`,
        })
      );
      
      render(<AssessmentComparison assessments={assessments} />);
      
      expect(screen.getByText(/maximum 4 assessments/i)).toBeInTheDocument();
    });
    
    it('should render successfully with 2 assessments', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          analysisDate: '2024-01-15T10:00:00Z',
        }),
        createMockAssessment({
          id: 'assessment-2',
          analysisDate: '2024-01-20T10:00:00Z',
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      expect(screen.getByText(/assessment comparison/i)).toBeInTheDocument();
    });
  });
  
  describe('Header and Summary', () => {
    it('should display correct date range', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          analysisDate: '2024-01-15T10:00:00Z',
        }),
        createMockAssessment({
          id: 'assessment-2',
          analysisDate: '2024-01-20T10:00:00Z',
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      expect(screen.getByText(/comparing 2 assessments/i)).toBeInTheDocument();
      expect(screen.getByText(/1\/15\/2024/)).toBeInTheDocument();
      expect(screen.getByText(/1\/20\/2024/)).toBeInTheDocument();
    });
    
    it('should display summary statistics', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          fhdPixels: 50.0, // Higher (worse)
          shoulderHeightDiff: 10.0, // Higher (worse)
        }),
        createMockAssessment({
          id: 'assessment-2',
          fhdPixels: 40.0, // Lower (better) - improvement
          shoulderHeightDiff: 5.0, // Lower (better) - improvement
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Should show improvements
      expect(screen.getByText('Improvements')).toBeInTheDocument();
      expect(screen.getByText('Stable')).toBeInTheDocument();
      expect(screen.getByText('Regressions')).toBeInTheDocument();
    });
    
    it('should call onClose when close button clicked', () => {
      const onClose = vi.fn();
      const assessments = [
        createMockAssessment({ id: 'assessment-1' }),
        createMockAssessment({ id: 'assessment-2' }),
      ];
      
      render(<AssessmentComparison assessments={assessments} onClose={onClose} />);
      
      const closeButton = screen.getByLabelText(/close comparison/i);
      fireEvent.click(closeButton);
      
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Category Filtering', () => {
    it('should filter metrics by category', () => {
      const assessments = [
        createMockAssessment({ id: 'assessment-1' }),
        createMockAssessment({ id: 'assessment-2' }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      const categorySelect = screen.getByLabelText(/filter by category/i);
      
      // Change to Global Posture category
      fireEvent.change(categorySelect, { target: { value: 'global' } });
      
      // Should show global posture metrics
      expect(screen.getByText('Forward Head Distance')).toBeInTheDocument();
      expect(screen.getByText('Cervical Angle')).toBeInTheDocument();
      
      // Change to Shoulder & Arm category
      fireEvent.change(categorySelect, { target: { value: 'shoulder' } });
      
      // Should show shoulder metrics
      expect(screen.getByText('Left Shoulder Angle')).toBeInTheDocument();
      expect(screen.getByText('Shoulder Height Diff')).toBeInTheDocument();
    });
    
    it('should show all metrics when "All Metrics" selected', () => {
      const assessments = [
        createMockAssessment({ id: 'assessment-1' }),
        createMockAssessment({ id: 'assessment-2' }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      const categorySelect = screen.getByLabelText(/filter by category/i);
      fireEvent.change(categorySelect, { target: { value: 'all' } });
      
      // Should show metrics from all categories
      expect(screen.getByText('Forward Head Distance')).toBeInTheDocument();
      expect(screen.getByText('Left Shoulder Angle')).toBeInTheDocument();
      expect(screen.getByText('Pelvic Tilt')).toBeInTheDocument();
      expect(screen.getByText('Left Knee Angle')).toBeInTheDocument();
    });
  });
  
  describe('Chart Type Toggle', () => {
    it('should toggle between line and bar chart', () => {
      const assessments = [
        createMockAssessment({ id: 'assessment-1' }),
        createMockAssessment({ id: 'assessment-2' }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Initially should be line chart
      const lineChartButton = screen.getByText(/📈 line chart/i);
      const barChartButton = screen.getByText(/📊 bar chart/i);
      
      expect(lineChartButton).toHaveClass('bg-blue-600');
      expect(barChartButton).not.toHaveClass('bg-blue-600');
      
      // Click bar chart button
      fireEvent.click(barChartButton);
      
      expect(barChartButton).toHaveClass('bg-blue-600');
      expect(lineChartButton).not.toHaveClass('bg-blue-600');
    });
  });
  
  describe('Metric Changes Table', () => {
    it('should display metric changes correctly', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          fhdPixels: 50.0,
          cervicalAngle: 40.0,
        }),
        createMockAssessment({
          id: 'assessment-2',
          fhdPixels: 45.0, // 10% decrease (improvement)
          cervicalAngle: 40.0, // No change
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Find the Forward Head Distance row
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      
      // Should have header row + metric rows
      expect(rows.length).toBeGreaterThan(1);
      
      // Check that initial and latest values are displayed
      expect(screen.getByText('50.0')).toBeInTheDocument();
      expect(screen.getByText('45.0')).toBeInTheDocument();
    });
    
    it('should show trend indicators', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          fhdPixels: 50.0,
        }),
        createMockAssessment({
          id: 'assessment-2',
          fhdPixels: 45.0, // Improvement
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Should show trend arrows
      const table = screen.getByRole('table');
      expect(within(table).getByText('↑')).toBeInTheDocument(); // Improvement arrow
    });
    
    it('should allow viewing chart for specific metric', () => {
      const assessments = [
        createMockAssessment({ id: 'assessment-1' }),
        createMockAssessment({ id: 'assessment-2' }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Click "View" button for first metric
      const viewButtons = screen.getAllByText('View');
      fireEvent.click(viewButtons[0]);
      
      // Should show chart
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
  });
  
  describe('Chart Visualization', () => {
    it('should display line chart when metric selected', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          analysisDate: '2024-01-15T10:00:00Z',
          fhdPixels: 50.0,
        }),
        createMockAssessment({
          id: 'assessment-2',
          analysisDate: '2024-01-20T10:00:00Z',
          fhdPixels: 45.0,
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Click view button for Forward Head Distance
      const viewButtons = screen.getAllByText('View');
      fireEvent.click(viewButtons[0]);
      
      // Should show line chart by default
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      expect(screen.getByText(/forward head distance - trend over time/i)).toBeInTheDocument();
    });
    
    it('should switch to bar chart when toggled', () => {
      const assessments = [
        createMockAssessment({ id: 'assessment-1' }),
        createMockAssessment({ id: 'assessment-2' }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Select a metric
      const viewButtons = screen.getAllByText('View');
      fireEvent.click(viewButtons[0]);
      
      // Switch to bar chart
      const barChartButton = screen.getByText(/📊 bar chart/i);
      fireEvent.click(barChartButton);
      
      // Should show bar chart
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });
  
  describe('Assessment Timeline', () => {
    it('should display all assessments in chronological order', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          analysisDate: '2024-01-20T10:00:00Z', // Later date
        }),
        createMockAssessment({
          id: 'assessment-2',
          analysisDate: '2024-01-15T10:00:00Z', // Earlier date
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Should show timeline section
      expect(screen.getByText('Assessment Timeline')).toBeInTheDocument();
      
      // Should show both dates
      expect(screen.getByText(/january 15, 2024/i)).toBeInTheDocument();
      expect(screen.getByText(/january 20, 2024/i)).toBeInTheDocument();
    });
    
    it('should display assessment numbers in order', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          analysisDate: '2024-01-15T10:00:00Z',
        }),
        createMockAssessment({
          id: 'assessment-2',
          analysisDate: '2024-01-20T10:00:00Z',
        }),
        createMockAssessment({
          id: 'assessment-3',
          analysisDate: '2024-01-25T10:00:00Z',
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Should show numbered badges
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });
  
  describe('Sorting', () => {
    it('should sort assessments by date (oldest first)', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-3',
          analysisDate: '2024-01-25T10:00:00Z',
          fhdPixels: 40.0,
        }),
        createMockAssessment({
          id: 'assessment-1',
          analysisDate: '2024-01-15T10:00:00Z',
          fhdPixels: 50.0,
        }),
        createMockAssessment({
          id: 'assessment-2',
          analysisDate: '2024-01-20T10:00:00Z',
          fhdPixels: 45.0,
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Changes should be calculated from oldest (50.0) to newest (40.0)
      // That's a 20% decrease
      expect(screen.getByText(/-20.0%/)).toBeInTheDocument();
    });
  });
  
  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      const assessments = [
        createMockAssessment({ id: 'assessment-1' }),
        createMockAssessment({ id: 'assessment-2' }),
      ];
      
      render(<AssessmentComparison assessments={assessments} onClose={vi.fn()} />);
      
      expect(screen.getByLabelText(/close comparison/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/filter by category/i)).toBeInTheDocument();
    });
    
    it('should have proper table structure', () => {
      const assessments = [
        createMockAssessment({ id: 'assessment-1' }),
        createMockAssessment({ id: 'assessment-2' }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      
      // Should have column headers
      expect(screen.getByText('Metric')).toBeInTheDocument();
      expect(screen.getByText('Initial')).toBeInTheDocument();
      expect(screen.getByText('Latest')).toBeInTheDocument();
      expect(screen.getByText('Change')).toBeInTheDocument();
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle zero values correctly', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          fhdPixels: 0,
        }),
        createMockAssessment({
          id: 'assessment-2',
          fhdPixels: 10.0,
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Should not crash with division by zero
      expect(screen.getByText('Assessment Comparison')).toBeInTheDocument();
    });
    
    it('should handle missing booking data', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          booking: undefined,
        }),
        createMockAssessment({
          id: 'assessment-2',
          booking: undefined,
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Should show N/A for missing service name
      expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
    });
    
    it('should handle very small changes', () => {
      const assessments = [
        createMockAssessment({
          id: 'assessment-1',
          fhdPixels: 45.0,
        }),
        createMockAssessment({
          id: 'assessment-2',
          fhdPixels: 45.1, // 0.22% change
        }),
      ];
      
      render(<AssessmentComparison assessments={assessments} />);
      
      // Should show stable indicator for small changes
      const table = screen.getByRole('table');
      expect(within(table).getAllByText('→').length).toBeGreaterThan(0); // Stable arrows
    });
  });
});
