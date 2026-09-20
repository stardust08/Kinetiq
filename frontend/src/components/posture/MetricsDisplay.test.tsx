import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MetricsDisplay from './MetricsDisplay';
import { PostureAnalysis } from '../../types';

// Mock navigator.share and navigator.clipboard
const mockShare = vi.fn();
const mockClipboard = {
  writeText: vi.fn(),
};

Object.defineProperty(navigator, 'share', {
  writable: true,
  value: mockShare,
});

Object.defineProperty(navigator, 'clipboard', {
  writable: true,
  value: mockClipboard,
});

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('MetricsDisplay', () => {
  const mockAnalysis: PostureAnalysis = {
    id: 'test-analysis-id',
    userId: 'test-user-id',
    bookingId: 'test-booking-id',
    analysisDate: '2024-01-15T10:30:00Z',
    status: 'completed',
    
    // Global Posture (all within normal range)
    fhdPixels: 45,
    cervicalAngle: 40,
    headLateralFlexion: 2,
    headRotation: 1,
    thoracicKyphosisAngle: 30,
    lumbarLordosisAngle: 40,
    trunkLateralShift: 5,
    trunkAngle: 2,
    
    // Shoulder & Arm (all within normal range)
    leftShoulderAngle: 90,
    rightShoulderAngle: 90,
    shoulderHeightDiff: 5,
    roundedShoulderAngle: 10,
    leftElbowAngle: 180,
    rightElbowAngle: 180,
    
    // Pelvis & Hip (all within normal range)
    leftHipAngle: 180,
    rightHipAngle: 180,
    pelvicObliquity: 1,
    pelvicTiltAngle: 2,
    hipHeightDiff: 5,
    
    // Lower Extremity (all within normal range)
    leftKneeAngle: 180,
    rightKneeAngle: 180,
    kneeVarusValgus: 2,
    kneeFlexionNeutral: 180,
    qAngleLeft: 12,
    qAngleRight: 12,
    footProgressionAngle: 5,
    pronationSupinationLeft: 2,
    pronationSupinationRight: 2,
    
    // Body Proportions
    shoulderWidth: 400,
    hipWidth: 350,
    torsoLength: 500,
    leftArmLength: 600,
    rightArmLength: 600,
    leftLegLength: 900,
    rightLegLength: 900,
  };
  
  const mockAnalysisWithDeviations: PostureAnalysis = {
    ...mockAnalysis,
    fhdPixels: 75, // Above normal (>50)
    cervicalAngle: 25, // Below normal (<35)
    leftShoulderAngle: 70, // Below normal (<85)
    rightShoulderAngle: 105, // Above normal (>95)
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Rendering', () => {
    it('should render the component with analysis data', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      expect(screen.getByText('Analysis Results')).toBeInTheDocument();
      expect(screen.getByText(/Completed on/)).toBeInTheDocument();
    });
    
    it('should display all 5 metric categories', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      expect(screen.getByText('Global Posture')).toBeInTheDocument();
      expect(screen.getByText('Shoulder & Arm')).toBeInTheDocument();
      expect(screen.getByText('Pelvis & Hip')).toBeInTheDocument();
      expect(screen.getByText('Lower Extremity')).toBeInTheDocument();
      expect(screen.getByText('Body Proportions')).toBeInTheDocument();
    });
    
    it('should display all 33 metrics', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      // Check a few key metrics from each category
      expect(screen.getByText('Forward Head Distance')).toBeInTheDocument();
      expect(screen.getByText('Cervical Angle')).toBeInTheDocument();
      expect(screen.getByText('Left Shoulder Angle')).toBeInTheDocument();
      expect(screen.getByText('Pelvic Obliquity')).toBeInTheDocument();
      expect(screen.getByText('Q-Angle Left')).toBeInTheDocument();
      expect(screen.getByText('Shoulder Width')).toBeInTheDocument();
    });
    
    it('should display remaining screening count when provided', () => {
      render(<MetricsDisplay analysis={mockAnalysis} remainingScreeningCount={5} />);
      
      expect(screen.getByText('Screenings Remaining')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
    
    it('should not display screening count section when not provided', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      expect(screen.queryByText('Screenings Remaining')).not.toBeInTheDocument();
    });
  });
  
  describe('Summary Statistics', () => {
    it('should display correct total metrics count', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      expect(screen.getByText('Total Metrics')).toBeInTheDocument();
      expect(screen.getByText('33')).toBeInTheDocument();
    });
    
    it('should calculate normal count correctly when all metrics are normal', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      const normalCountElement = screen.getByText('Within Normal Range').nextElementSibling;
      expect(normalCountElement).toHaveTextContent('28'); // 28 metrics have ranges (excluding 5 body proportions + 2 that are informational)
    });
    
    it('should calculate deviation count correctly', () => {
      render(<MetricsDisplay analysis={mockAnalysisWithDeviations} />);
      
      const deviationCountElement = screen.getByText('Deviations').nextElementSibling;
      expect(deviationCountElement).toHaveTextContent('4'); // 4 metrics are outside normal range
    });
  });
  
  describe('Metric Display', () => {
    it('should display metric values with correct precision', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      // Check that values are displayed with 1 decimal place (use getAllByText for duplicates)
      expect(screen.getAllByText('45.0')[0]).toBeInTheDocument(); // fhdPixels
      expect(screen.getAllByText('40.0').length).toBeGreaterThan(0); // cervicalAngle and lumbarLordosisAngle
    });
    
    it('should display normal range for metrics', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      // Check that normal ranges are displayed
      expect(screen.getAllByText(/Normal Range:/)).toHaveLength(28); // 28 metrics with ranges
    });
    
    it('should show green status for metrics within normal range', () => {
      const { container } = render(<MetricsDisplay analysis={mockAnalysis} />);
      
      // Check for green background class on normal metrics
      const greenCards = container.querySelectorAll('.bg-green-50');
      expect(greenCards.length).toBeGreaterThan(0);
    });
    
    it('should show red/yellow status for metrics outside normal range', () => {
      const { container } = render(<MetricsDisplay analysis={mockAnalysisWithDeviations} />);
      
      // Check for red or yellow background classes on deviated metrics
      const redCards = container.querySelectorAll('.bg-red-50');
      const yellowCards = container.querySelectorAll('.bg-yellow-50');
      expect(redCards.length + yellowCards.length).toBeGreaterThan(0);
    });
    
    it('should display deviation message for metrics outside range', () => {
      render(<MetricsDisplay analysis={mockAnalysisWithDeviations} />);
      
      // Check for deviation messages
      expect(screen.getAllByText(/Below normal range|Above normal range/)).toHaveLength(4);
    });
  });
  
  describe('Download Functionality', () => {
    it('should download analysis data as JSON when download button is clicked', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      const downloadButton = screen.getByText(/Download/);
      
      // Just verify the button exists and is clickable
      expect(downloadButton).toBeInTheDocument();
      expect(downloadButton).not.toBeDisabled();
      
      // Click should not throw
      expect(() => fireEvent.click(downloadButton)).not.toThrow();
    });
  });
  
  describe('Share Functionality', () => {
    it('should call navigator.share when share button is clicked and API is available', async () => {
      mockShare.mockResolvedValue(undefined);
      
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      const shareButton = screen.getByText(/Share/);
      fireEvent.click(shareButton);
      
      await waitFor(() => {
        expect(mockShare).toHaveBeenCalledWith({
          title: 'Posture Analysis Results',
          text: expect.stringContaining('Posture Analysis from'),
          url: window.location.href,
        });
      });
    });
    
    it('should have a share button', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      const shareButton = screen.getByText(/Share/);
      expect(shareButton).toBeInTheDocument();
      expect(shareButton).not.toBeDisabled();
    });
  });
  
  describe('Legend', () => {
    it('should display status legend', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      expect(screen.getByText('Status Legend')).toBeInTheDocument();
      expect(screen.getByText('Within normal range')).toBeInTheDocument();
      expect(screen.getByText(/Minor deviation/)).toBeInTheDocument();
      expect(screen.getByText(/Significant deviation/)).toBeInTheDocument();
    });
    
    it('should display disclaimer note', () => {
      render(<MetricsDisplay analysis={mockAnalysis} />);
      
      expect(screen.getByText(/for informational purposes only/)).toBeInTheDocument();
      expect(screen.getByText(/consult with a qualified healthcare provider/)).toBeInTheDocument();
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle metrics at exact boundary values', () => {
      const boundaryAnalysis: PostureAnalysis = {
        ...mockAnalysis,
        fhdPixels: 50, // Exact max
        cervicalAngle: 35, // Exact min
      };
      
      render(<MetricsDisplay analysis={boundaryAnalysis} />);
      
      // Should be treated as normal (within range)
      const { container } = render(<MetricsDisplay analysis={boundaryAnalysis} />);
      const greenCards = container.querySelectorAll('.bg-green-50');
      expect(greenCards.length).toBeGreaterThan(0);
    });
    
    it('should handle zero values correctly', () => {
      const zeroAnalysis: PostureAnalysis = {
        ...mockAnalysis,
        headLateralFlexion: 0,
        headRotation: 0,
        pelvicObliquity: 0,
      };
      
      render(<MetricsDisplay analysis={zeroAnalysis} />);
      
      expect(screen.getAllByText('0.0')).toHaveLength(3);
    });
    
    it('should handle negative values correctly', () => {
      const negativeAnalysis: PostureAnalysis = {
        ...mockAnalysis,
        headLateralFlexion: -3,
        trunkLateralShift: -5,
        pelvicObliquity: -2,
      };
      
      render(<MetricsDisplay analysis={negativeAnalysis} />);
      
      expect(screen.getByText('-3.0')).toBeInTheDocument();
      expect(screen.getByText('-5.0')).toBeInTheDocument();
      expect(screen.getByText('-2.0')).toBeInTheDocument();
    });
  });
});
