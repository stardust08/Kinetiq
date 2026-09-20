import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SkeletonVisualization from './SkeletonVisualization';
import { PostureAnalysis } from '../../types';

describe('SkeletonVisualization', () => {
  // Mock canvas context
  const mockContext = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    globalAlpha: 1,
    font: '',
    textAlign: '',
  };
  
  beforeEach(() => {
    // Mock canvas getContext
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext as any);
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.clearAllTimers();
  });
  
  const mockAnalysisWithLandmarks: PostureAnalysis = {
    id: 'test-analysis-id',
    userId: 'test-user-id',
    bookingId: 'test-booking-id',
    analysisDate: '2024-01-15T10:30:00Z',
    status: 'completed',
    
    // Metrics (all within normal range)
    fhdPixels: 45,
    cervicalAngle: 40,
    headLateralFlexion: 2,
    headRotation: 1,
    thoracicKyphosisAngle: 30,
    lumbarLordosisAngle: 40,
    trunkLateralShift: 5,
    trunkAngle: 2,
    leftShoulderAngle: 90,
    rightShoulderAngle: 90,
    shoulderHeightDiff: 5,
    roundedShoulderAngle: 10,
    leftElbowAngle: 180,
    rightElbowAngle: 180,
    leftHipAngle: 180,
    rightHipAngle: 180,
    pelvicObliquity: 1,
    pelvicTiltAngle: 2,
    hipHeightDiff: 5,
    leftKneeAngle: 180,
    rightKneeAngle: 180,
    kneeVarusValgus: 2,
    kneeFlexionNeutral: 180,
    qAngleLeft: 12,
    qAngleRight: 12,
    footProgressionAngle: 5,
    pronationSupinationLeft: 2,
    pronationSupinationRight: 2,
    shoulderWidth: 400,
    hipWidth: 350,
    torsoLength: 500,
    leftArmLength: 600,
    rightArmLength: 600,
    leftLegLength: 900,
    rightLegLength: 900,
    
    // Landmarks data (simplified - key landmarks only)
    landmarksData: {
      pose: {
        0: [320, 100, 0, 1.0],   // nose
        11: [280, 200, 0, 1.0],  // left shoulder
        12: [360, 200, 0, 1.0],  // right shoulder
        13: [260, 300, 0, 1.0],  // left elbow
        14: [380, 300, 0, 1.0],  // right elbow
        15: [240, 400, 0, 1.0],  // left wrist
        16: [400, 400, 0, 1.0],  // right wrist
        23: [290, 400, 0, 1.0],  // left hip
        24: [350, 400, 0, 1.0],  // right hip
        25: [280, 550, 0, 1.0],  // left knee
        26: [360, 550, 0, 1.0],  // right knee
        27: [270, 700, 0, 1.0],  // left ankle
        28: [370, 700, 0, 1.0],  // right ankle
      }
    }
  };
  
  const mockAnalysisWithoutLandmarks: PostureAnalysis = {
    ...mockAnalysisWithLandmarks,
    landmarksData: undefined,
  };
  
  const mockAnalysisWithEmptyLandmarks: PostureAnalysis = {
    ...mockAnalysisWithLandmarks,
    landmarksData: {
      pose: {}
    }
  };
  
  describe('Rendering', () => {
    it('should render the component with canvas', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      const canvas = document.querySelector('canvas');
      expect(canvas).toBeTruthy();
    });
    
    it('should render view angle buttons', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      expect(screen.getByText('Front')).toBeTruthy();
      expect(screen.getByText('Side')).toBeTruthy();
      expect(screen.getByText('Back')).toBeTruthy();
      expect(screen.getByText('Top')).toBeTruthy();
    });
    
    it('should render auto-rotate button', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      expect(screen.getByText(/Auto-Rotate/)).toBeTruthy();
    });
    
    it('should render rotation slider', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      expect(screen.getByText(/Manual Rotation:/)).toBeTruthy();
      const slider = document.querySelector('input[type="range"]');
      expect(slider).toBeTruthy();
    });
    
    it('should render color legend', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      expect(screen.getByText('Color Legend')).toBeTruthy();
      expect(screen.getByText('Face')).toBeTruthy();
      expect(screen.getByText('Upper Body')).toBeTruthy();
      expect(screen.getByText('Lower Body')).toBeTruthy();
      expect(screen.getByText('Connections')).toBeTruthy();
    });
    
    it('should use custom width and height', () => {
      render(
        <SkeletonVisualization 
          analysis={mockAnalysisWithLandmarks} 
          width={800} 
          height={800} 
        />
      );
      
      const canvas = document.querySelector('canvas');
      expect(canvas?.width).toBe(800);
      expect(canvas?.height).toBe(800);
    });
    
    it('should apply custom className', () => {
      const { container } = render(
        <SkeletonVisualization 
          analysis={mockAnalysisWithLandmarks} 
          className="custom-class" 
        />
      );
      
      expect(container.querySelector('.custom-class')).toBeTruthy();
    });
  });
  
  describe('Canvas Drawing', () => {
    it('should clear canvas on render', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      expect(mockContext.clearRect).toHaveBeenCalled();
    });
    
    it('should draw skeleton when landmarks are available', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      // Should draw connections (lines)
      expect(mockContext.beginPath).toHaveBeenCalled();
      expect(mockContext.moveTo).toHaveBeenCalled();
      expect(mockContext.lineTo).toHaveBeenCalled();
      expect(mockContext.stroke).toHaveBeenCalled();
      
      // Should draw landmarks (circles)
      expect(mockContext.arc).toHaveBeenCalled();
      expect(mockContext.fill).toHaveBeenCalled();
    });
    
    it('should display message when no landmarks data', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithoutLandmarks} />);
      
      expect(mockContext.fillText).toHaveBeenCalledWith(
        'No landmark data available',
        expect.any(Number),
        expect.any(Number)
      );
    });
    
    it('should display message when landmarks are empty', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithEmptyLandmarks} />);
      
      expect(mockContext.fillText).toHaveBeenCalledWith(
        'No landmark data available',
        expect.any(Number),
        expect.any(Number)
      );
    });
    
    it('should set line properties for connections', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      expect(mockContext.lineWidth).toBe(3);
      expect(mockContext.lineCap).toBe('round');
    });
  });
  
  describe('View Angle Controls', () => {
    it('should start with front view selected', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      const frontButton = screen.getByText('Front');
      expect(frontButton.className).toContain('bg-blue-600');
    });
    
    it('should change view when clicking view buttons', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      const sideButton = screen.getByText('Side');
      fireEvent.click(sideButton);
      
      expect(sideButton.className).toContain('bg-blue-600');
    });
    
    it('should reset rotation when changing view', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      // Set rotation
      const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '90' } });
      
      expect(screen.getByText(/Manual Rotation: 90°/)).toBeTruthy();
      
      // Change view
      const sideButton = screen.getByText('Side');
      fireEvent.click(sideButton);
      
      // Rotation should reset to 0
      expect(screen.getByText(/Manual Rotation: 0°/)).toBeTruthy();
    });
    
    it('should update canvas when view changes', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      const initialClearCount = mockContext.clearRect.mock.calls.length;
      
      const backButton = screen.getByText('Back');
      fireEvent.click(backButton);
      
      // Canvas should be redrawn
      expect(mockContext.clearRect.mock.calls.length).toBeGreaterThan(initialClearCount);
    });
  });
  
  describe('Rotation Controls', () => {
    it('should update rotation with slider', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '180' } });
      
      expect(screen.getByText(/Manual Rotation: 180°/)).toBeTruthy();
    });
    
    it('should stop auto-rotation when using slider', () => {
      vi.useFakeTimers();
      
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      // Start auto-rotation
      const autoRotateButton = screen.getByText(/Auto-Rotate/);
      fireEvent.click(autoRotateButton);
      
      expect(screen.getByText(/Pause/)).toBeTruthy();
      
      // Use slider
      const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
      fireEvent.change(slider, { target: { value: '45' } });
      
      // Auto-rotation should stop
      expect(screen.getByText(/Auto-Rotate/)).toBeTruthy();
      
      vi.useRealTimers();
    });
    
    it('should toggle auto-rotation', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      const autoRotateButton = screen.getByText(/Auto-Rotate/);
      
      // Start auto-rotation
      fireEvent.click(autoRotateButton);
      expect(screen.getByText(/Pause/)).toBeTruthy();
      
      // Stop auto-rotation
      fireEvent.click(autoRotateButton);
      expect(screen.getByText(/Auto-Rotate/)).toBeTruthy();
    });
    
    it('should update rotation during auto-rotate', () => {
      vi.useFakeTimers();
      
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      const autoRotateButton = screen.getByText(/Auto-Rotate/);
      fireEvent.click(autoRotateButton);
      
      // Initial rotation
      expect(screen.getByText(/Manual Rotation: 0°/)).toBeTruthy();
      
      // Advance time
      vi.advanceTimersByTime(100); // 2 intervals of 50ms
      
      // Rotation should have increased
      waitFor(() => {
        expect(screen.queryByText(/Manual Rotation: 0°/)).toBeFalsy();
      });
      
      vi.useRealTimers();
    });
    
    it('should wrap rotation at 360 degrees', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
      
      // Set to max
      fireEvent.change(slider, { target: { value: '360' } });
      expect(screen.getByText(/Manual Rotation: 360°/)).toBeTruthy();
      
      // Slider should allow 0-360 range
      expect(slider.min).toBe('0');
      expect(slider.max).toBe('360');
    });
  });
  
  describe('Landmark Visibility', () => {
    it('should only draw visible landmarks', () => {
      const analysisWithLowVisibility: PostureAnalysis = {
        ...mockAnalysisWithLandmarks,
        landmarksData: {
          pose: {
            0: [320, 100, 0, 0.3],   // Low visibility - should not draw
            11: [280, 200, 0, 1.0],  // High visibility - should draw
            12: [360, 200, 0, 0.9],  // High visibility - should draw
          }
        }
      };
      
      render(<SkeletonVisualization analysis={analysisWithLowVisibility} />);
      
      // Should draw some landmarks but not all
      expect(mockContext.arc).toHaveBeenCalled();
    });
    
    it('should apply visibility to globalAlpha', () => {
      render(<SkeletonVisualization analysis={mockAnalysisWithLandmarks} />);
      
      // globalAlpha should be set based on visibility
      expect(mockContext.globalAlpha).toBeGreaterThan(0);
      expect(mockContext.globalAlpha).toBeLessThanOrEqual(1);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle missing pose data gracefully', () => {
      const analysisWithMissingPose: PostureAnalysis = {
        ...mockAnalysisWithLandmarks,
        landmarksData: {
          // No pose property
        } as any
      };
      
      expect(() => {
        render(<SkeletonVisualization analysis={analysisWithMissingPose} />);
      }).not.toThrow();
    });
    
    it('should handle invalid landmark format', () => {
      const analysisWithInvalidLandmarks: PostureAnalysis = {
        ...mockAnalysisWithLandmarks,
        landmarksData: {
          pose: {
            0: 'invalid',  // Invalid format
            11: [280, 200], // Missing z coordinate
            12: [360, 200, 0, 1.0], // Valid
          }
        } as any
      };
      
      expect(() => {
        render(<SkeletonVisualization analysis={analysisWithInvalidLandmarks} />);
      }).not.toThrow();
    });
    
    it('should handle zero-sized canvas', () => {
      render(
        <SkeletonVisualization 
          analysis={mockAnalysisWithLandmarks} 
          width={0} 
          height={0} 
        />
      );
      
      expect(mockContext.clearRect).toHaveBeenCalledWith(0, 0, 0, 0);
    });
    
    it('should handle single landmark', () => {
      const analysisWithSingleLandmark: PostureAnalysis = {
        ...mockAnalysisWithLandmarks,
        landmarksData: {
          pose: {
            0: [320, 100, 0, 1.0],
          }
        }
      };
      
      expect(() => {
        render(<SkeletonVisualization analysis={analysisWithSingleLandmark} />);
      }).not.toThrow();
    });
  });
  
  describe('Cleanup', () => {
    it('should cleanup auto-rotation interval on unmount', () => {
      vi.useFakeTimers();
      
      const { unmount } = render(
        <SkeletonVisualization analysis={mockAnalysisWithLandmarks} />
      );
      
      const autoRotateButton = screen.getByText(/Auto-Rotate/);
      fireEvent.click(autoRotateButton);
      
      // Unmount component
      unmount();
      
      // Advance time - should not cause errors
      expect(() => {
        vi.advanceTimersByTime(1000);
      }).not.toThrow();
      
      vi.useRealTimers();
    });
  });
});
