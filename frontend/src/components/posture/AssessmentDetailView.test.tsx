import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AssessmentDetailView from './AssessmentDetailView';
import { PostureAnalysis } from '../../types';

// Mock child components
vi.mock('./MetricsDisplay', () => ({
  default: ({ analysis, remainingScreeningCount }: any) => (
    <div data-testid="metrics-display">
      <div>Analysis ID: {analysis.id}</div>
      {remainingScreeningCount !== undefined && (
        <div>Remaining: {remainingScreeningCount}</div>
      )}
    </div>
  ),
}));

vi.mock('./SkeletonVisualization', () => ({
  default: ({ analysis, width, height }: any) => (
    <div data-testid="skeleton-visualization">
      <div>Analysis ID: {analysis.id}</div>
      <div>Size: {width}x{height}</div>
    </div>
  ),
}));

describe('AssessmentDetailView', () => {
  const mockAnalysis: PostureAnalysis = {
    id: 'analysis-123',
    userId: 'user-456',
    bookingId: 'booking-789',
    analysisDate: '2024-01-15T10:30:00Z',
    status: 'completed',
    
    // Global Posture
    fhdPixels: 45.2,
    cervicalAngle: 40.5,
    headLateralFlexion: 2.3,
    headRotation: -1.5,
    thoracicKyphosisAngle: 35.0,
    lumbarLordosisAngle: 42.0,
    trunkLateralShift: 5.0,
    trunkAngle: 1.2,
    
    // Shoulder & Arm
    leftShoulderAngle: 88.5,
    rightShoulderAngle: 90.2,
    shoulderHeightDiff: 8.0,
    roundedShoulderAngle: 12.0,
    leftElbowAngle: 178.5,
    rightElbowAngle: 179.0,
    
    // Pelvis & Hip
    leftHipAngle: 180.0,
    rightHipAngle: 179.5,
    pelvicObliquity: 1.5,
    pelvicTiltAngle: -2.0,
    hipHeightDiff: 5.0,
    
    // Lower Extremity
    leftKneeAngle: 178.0,
    rightKneeAngle: 179.0,
    kneeVarusValgus: 2.0,
    kneeFlexionNeutral: 180.0,
    qAngleLeft: 12.0,
    qAngleRight: 13.0,
    footProgressionAngle: 5.0,
    pronationSupinationLeft: 2.0,
    pronationSupinationRight: 1.5,
    
    // Body Proportions
    shoulderWidth: 450.0,
    hipWidth: 380.0,
    torsoLength: 520.0,
    leftArmLength: 680.0,
    rightArmLength: 682.0,
    leftLegLength: 920.0,
    rightLegLength: 918.0,
    
    landmarksData: {
      pose: {
        0: [100, 200, 0, 0.95],
        11: [150, 300, 0, 0.98],
        12: [250, 300, 0, 0.97],
      },
    },
    
    booking: {
      id: 'booking-789',
      userId: 'user-456',
      serviceId: 'service-001',
      paymentId: 'payment-001',
      totalAmount: 100,
      paidAmount: 100,
      remainingAmount: 0,
      time: '2024-01-10T14:00:00Z',
      status: 'CONFIRMED',
      createdAt: '2024-01-05T10:00:00Z',
      totalScreeningCount: 10,
      usedScreeningCount: 3,
      remainingScreeningCount: 7,
      service: {
        id: 'service-001',
        name: 'Posture Analysis Package',
        slug: 'posture-analysis-package',
        categoryId: 'cat-001',
        basePrice: 100,
        paymentType: 'FULL',
        reviewCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
      },
    },
  };

  it('renders assessment details correctly', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    expect(screen.getByText('Assessment Details')).toBeInTheDocument();
    expect(screen.getByText(/January 15, 2024/)).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('displays booking information when available', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    expect(screen.getByText('Booking Information')).toBeInTheDocument();
    expect(screen.getByText('Posture Analysis Package')).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 10 used/)).toBeInTheDocument();
    expect(screen.getByText(/\(7 remaining\)/)).toBeInTheDocument();
  });

  it('does not display booking section when booking is not available', () => {
    const analysisWithoutBooking = { ...mockAnalysis, booking: undefined };
    render(<AssessmentDetailView analysis={analysisWithoutBooking} />);
    
    expect(screen.queryByText('Booking Information')).not.toBeInTheDocument();
  });

  it('renders back button when onBack is provided', () => {
    const onBack = vi.fn();
    render(<AssessmentDetailView analysis={mockAnalysis} onBack={onBack} />);
    
    const backButton = screen.getByLabelText('Go back');
    expect(backButton).toBeInTheDocument();
    
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does not render back button when onBack is not provided', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    expect(screen.queryByLabelText('Go back')).not.toBeInTheDocument();
  });

  it('renders compare button when onCompare is provided', () => {
    const onCompare = vi.fn();
    render(<AssessmentDetailView analysis={mockAnalysis} onCompare={onCompare} />);
    
    const compareButton = screen.getByLabelText('Compare with other assessments');
    expect(compareButton).toBeInTheDocument();
    expect(compareButton).toHaveTextContent('📊 Compare');
    
    fireEvent.click(compareButton);
    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it('does not render compare button when onCompare is not provided', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    expect(screen.queryByLabelText('Compare with other assessments')).not.toBeInTheDocument();
  });

  it('displays metrics tab by default', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    const metricsTab = screen.getByText('📊 Clinical Metrics');
    expect(metricsTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('metrics-display')).toBeInTheDocument();
  });

  it('switches to visualization tab when clicked', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    const visualizationTab = screen.getByText('🦴 3D Skeleton');
    fireEvent.click(visualizationTab);
    
    expect(visualizationTab).toHaveAttribute('aria-current', 'page');
    // The tab no longer renders a skeleton inline. It shows one card per captured
    // pose, each with its own control to open that pose in the 3D viewer.
    expect(screen.getAllByRole('button', { name: '🔭 3D' }).length).toBeGreaterThan(1);
    expect(screen.queryByTestId('metrics-display')).not.toBeInTheDocument();
  });

  it('switches back to metrics tab when clicked', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    // Switch to visualization
    const visualizationTab = screen.getByText('🦴 3D Skeleton');
    fireEvent.click(visualizationTab);
    expect(screen.queryByTestId('metrics-display')).not.toBeInTheDocument();
    
    // Switch back to metrics
    const metricsTab = screen.getByText('📊 Clinical Metrics');
    fireEvent.click(metricsTab);
    expect(screen.getByTestId('metrics-display')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '🔭 3D' })).toBeNull();
  });

  it('passes correct props to MetricsDisplay', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    const metricsDisplay = screen.getByTestId('metrics-display');
    expect(metricsDisplay).toHaveTextContent('Analysis ID: analysis-123');
    expect(metricsDisplay).toHaveTextContent('Remaining: 7');
  });

  it('offers one 3D view per captured pose', () => {
    // SkeletonVisualization is no longer rendered inline with the analysis passed to
    // it. Each pose gets a thumbnail and its own viewer control, so what replaced the
    // prop assertion is that every pose is offered.
    render(<AssessmentDetailView analysis={mockAnalysis} />);

    fireEvent.click(screen.getByText('🦴 3D Skeleton'));

    expect(screen.getByAltText(/Front posture/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '🔭 3D' })).toHaveLength(4);
  });

  it('displays assessment information section', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    expect(screen.getByText('About This Assessment')).toBeInTheDocument();
    expect(screen.getByText(/Assessment ID:/)).toBeInTheDocument();
    expect(screen.getAllByText(/analysis-123/).length).toBeGreaterThan(0);
    expect(screen.getByText(/33 clinical posture measurements/)).toBeInTheDocument();
  });

  it('displays landmarks information when available', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    expect(screen.getByText(/33 pose landmarks \+ virtual neck landmark/)).toBeInTheDocument();
  });

  it('does not display landmarks information when not available', () => {
    const analysisWithoutLandmarks = { ...mockAnalysis, landmarksData: undefined };
    render(<AssessmentDetailView analysis={analysisWithoutLandmarks} />);
    
    expect(screen.queryByText(/33 pose landmarks \+ virtual neck landmark/)).not.toBeInTheDocument();
  });

  it('displays medical disclaimer', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    expect(screen.getByText(/⚠️ Medical Disclaimer:/)).toBeInTheDocument();
    expect(screen.getByText(/for informational purposes only/)).toBeInTheDocument();
  });

  it('displays correct status badge color for completed status', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    const statusBadge = screen.getByText('completed');
    expect(statusBadge).toHaveClass('bg-green-100', 'text-green-800');
  });

  it('displays correct status badge color for failed status', () => {
    const failedAnalysis = { ...mockAnalysis, status: 'failed' };
    render(<AssessmentDetailView analysis={failedAnalysis} />);
    
    const statusBadge = screen.getByText('failed');
    expect(statusBadge).toHaveClass('bg-red-100', 'text-red-800');
  });

  it('displays correct status badge color for cancelled status', () => {
    const cancelledAnalysis = { ...mockAnalysis, status: 'cancelled' };
    render(<AssessmentDetailView analysis={cancelledAnalysis} />);
    
    const statusBadge = screen.getByText('cancelled');
    expect(statusBadge).toHaveClass('bg-gray-100', 'text-gray-800');
  });

  it('formats date and time correctly', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    // Check for date format (January 15, 2024)
    expect(screen.getByText(/January 15, 2024/)).toBeInTheDocument();
    
    // Check for time format (should be present) - using more specific text
    expect(screen.getByText(/January 15, 2024 at/)).toBeInTheDocument();
  });

  it('displays visualization instructions', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    // Switch to visualization tab
    const visualizationTab = screen.getByText('🦴 3D Skeleton');
    fireEvent.click(visualizationTab);
    
    // The heading and rotate hint belonged to the inline viewer. The tab now tells
    // the clinician how to open a pose and what the viewer offers once open.
    expect(screen.getByText(/Click/)).toBeInTheDocument();
    expect(screen.getByText(/Photo On\/Off/)).toBeInTheDocument();
  });

  it('renders all booking information fields', () => {
    render(<AssessmentDetailView analysis={mockAnalysis} />);
    
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('Booking Date')).toBeInTheDocument();
    expect(screen.getByText('Screening Counts')).toBeInTheDocument();
  });

  it('handles missing service name gracefully', () => {
    const analysisWithoutServiceName = {
      ...mockAnalysis,
      booking: {
        ...mockAnalysis.booking!,
        service: undefined,
      },
    };
    
    render(<AssessmentDetailView analysis={analysisWithoutServiceName} />);
    
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });
});
