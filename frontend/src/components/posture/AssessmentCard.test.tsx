import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AssessmentCard from './AssessmentCard';
import { PostureAnalysis } from '../../types';

describe('AssessmentCard', () => {
  const mockAssessment: PostureAnalysis = {
    id: 'test-assessment-1',
    userId: 'user-1',
    bookingId: 'booking-1',
    analysisDate: '2024-01-15T10:30:00Z',
    status: 'completed',
    
    // Global Posture
    fhdPixels: 45.5,
    cervicalAngle: 35.2,
    headLateralFlexion: 2.1,
    headRotation: 1.5,
    thoracicKyphosisAngle: 40.0,
    lumbarLordosisAngle: 35.0,
    trunkLateralShift: 3.2,
    trunkAngle: 1.8,
    
    // Shoulder & Arm
    leftShoulderAngle: 85.0,
    rightShoulderAngle: 87.0,
    shoulderHeightDiff: 12.5,
    roundedShoulderAngle: 15.0,
    leftElbowAngle: 175.0,
    rightElbowAngle: 176.0,
    
    // Pelvis & Hip
    leftHipAngle: 180.0,
    rightHipAngle: 179.0,
    pelvicObliquity: 2.5,
    pelvicTiltAngle: 8.3,
    hipHeightDiff: 5.0,
    
    // Lower Extremity
    leftKneeAngle: 180.0,
    rightKneeAngle: 179.5,
    kneeVarusValgus: 1.2,
    kneeFlexionNeutral: 0.5,
    qAngleLeft: 15.0,
    qAngleRight: 14.5,
    footProgressionAngle: 5.0,
    pronationSupinationLeft: 2.0,
    pronationSupinationRight: 1.8,
    
    // Body Proportions
    shoulderWidth: 450.0,
    hipWidth: 380.0,
    torsoLength: 520.0,
    leftArmLength: 680.0,
    rightArmLength: 682.0,
    leftLegLength: 920.0,
    rightLegLength: 918.0,
  };

  const mockOnViewDetails = vi.fn();

  it('renders assessment card with correct date', () => {
    render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Posture Analysis Package"
        onViewDetails={mockOnViewDetails}
      />
    );

    expect(screen.getByText('January 15, 2024')).toBeInTheDocument();
  });

  it('displays booking name', () => {
    render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Posture Analysis Package"
        onViewDetails={mockOnViewDetails}
      />
    );

    expect(screen.getByText(/Posture Analysis Package/)).toBeInTheDocument();
  });

  it('displays status badge with correct styling', () => {
    const { rerender } = render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    const completedBadge = screen.getByText('completed');
    expect(completedBadge).toHaveClass('bg-green-100', 'text-green-800');

    // Test failed status
    const failedAssessment = { ...mockAssessment, status: 'failed' };
    rerender(
      <AssessmentCard
        assessment={failedAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    const failedBadge = screen.getByText('failed');
    expect(failedBadge).toHaveClass('bg-red-100', 'text-red-800');

    // Test cancelled status
    const cancelledAssessment = { ...mockAssessment, status: 'cancelled' };
    rerender(
      <AssessmentCard
        assessment={cancelledAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    const cancelledBadge = screen.getByText('cancelled');
    expect(cancelledBadge).toHaveClass('bg-gray-100', 'text-gray-800');
  });

  it('displays key metrics with correct values and units', () => {
    render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    // Check Forward Head metric
    expect(screen.getByText('Forward Head')).toBeInTheDocument();
    expect(screen.getByText('45.5')).toBeInTheDocument();
    
    // Check Cervical Angle metric
    expect(screen.getByText('Cervical Angle')).toBeInTheDocument();
    expect(screen.getByText('35.2')).toBeInTheDocument();
    
    // Check Shoulder Height Diff metric
    expect(screen.getByText('Shoulder Height Diff')).toBeInTheDocument();
    expect(screen.getByText('12.5')).toBeInTheDocument();
    
    // Check Pelvic Tilt metric
    expect(screen.getByText('Pelvic Tilt')).toBeInTheDocument();
    expect(screen.getByText('8.3')).toBeInTheDocument();
  });

  it('calls onViewDetails when View Details button is clicked', () => {
    render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    const viewDetailsButton = screen.getByRole('button', { name: /View details/i });
    fireEvent.click(viewDetailsButton);

    expect(mockOnViewDetails).toHaveBeenCalledTimes(1);
  });

  it('formats time correctly', () => {
    render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    // The time should be formatted as HH:MM AM/PM
    const timeElement = screen.getByText(/\d{1,2}:\d{2}\s?(AM|PM)/i);
    expect(timeElement).toBeInTheDocument();
  });

  it('displays metrics with one decimal place precision', () => {
    const assessmentWithDecimals: PostureAnalysis = {
      ...mockAssessment,
      fhdPixels: 45.567,
      cervicalAngle: 35.234,
      shoulderHeightDiff: 12.999,
      pelvicTiltAngle: 8.111,
    };

    render(
      <AssessmentCard
        assessment={assessmentWithDecimals}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    expect(screen.getByText('45.6')).toBeInTheDocument();
    expect(screen.getByText('35.2')).toBeInTheDocument();
    expect(screen.getByText('13.0')).toBeInTheDocument();
    expect(screen.getByText('8.1')).toBeInTheDocument();
  });

  it('applies hover effect classes', () => {
    const { container } = render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('hover:shadow-md', 'transition-shadow');
  });

  it('renders with responsive grid layout for metrics', () => {
    const { container } = render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    const metricsGrid = container.querySelector('.grid');
    expect(metricsGrid).toHaveClass('grid-cols-2', 'md:grid-cols-4');
  });

  it('handles missing booking name gracefully', () => {
    render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName=""
        onViewDetails={mockOnViewDetails}
      />
    );

    // Should still render without crashing
    expect(screen.getByText('January 15, 2024')).toBeInTheDocument();
  });

  it('displays correct units for each metric', () => {
    render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    // Check for pixel units
    const pixelUnits = screen.getAllByText('px');
    expect(pixelUnits).toHaveLength(2); // Forward Head and Shoulder Height Diff

    // Check for degree units
    const degreeUnits = screen.getAllByText('°');
    expect(degreeUnits).toHaveLength(2); // Cervical Angle and Pelvic Tilt
  });

  it('has accessible button with aria-label', () => {
    render(
      <AssessmentCard
        assessment={mockAssessment}
        bookingName="Test Service"
        onViewDetails={mockOnViewDetails}
      />
    );

    const button = screen.getByRole('button', { 
      name: /View details for assessment from/i 
    });
    expect(button).toBeInTheDocument();
  });
});
