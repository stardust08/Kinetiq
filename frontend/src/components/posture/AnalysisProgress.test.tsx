import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AnalysisProgress from './AnalysisProgress';

describe('AnalysisProgress', () => {
  describe('Progress Display', () => {
    it('should render progress bar with correct percentage', () => {
      render(
        <AnalysisProgress
          frameCount={150}
          totalFrames={450}
          elapsedTime={5}
          totalDuration={15}
        />
      );

      // Progress should be 33.33% (150/450)
      const progressText = screen.getByText(/33%/);
      expect(progressText).toBeInTheDocument();
    });

    it('should display frame count correctly', () => {
      render(
        <AnalysisProgress
          frameCount={200}
          totalFrames={450}
          elapsedTime={7}
          totalDuration={15}
        />
      );

      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText('/ 450')).toBeInTheDocument();
    });

    it('should display elapsed time correctly', () => {
      render(
        <AnalysisProgress
          frameCount={100}
          totalFrames={450}
          elapsedTime={3}
          totalDuration={15}
        />
      );

      expect(screen.getByText('3s')).toBeInTheDocument();
      expect(screen.getByText('/ 15s')).toBeInTheDocument();
    });

    it('should calculate remaining frames correctly', () => {
      render(
        <AnalysisProgress
          frameCount={350}
          totalFrames={450}
          elapsedTime={12}
          totalDuration={15}
        />
      );

      expect(screen.getByText('100 remaining')).toBeInTheDocument();
    });

    it('should calculate remaining time correctly', () => {
      render(
        <AnalysisProgress
          frameCount={300}
          totalFrames={450}
          elapsedTime={10}
          totalDuration={15}
        />
      );

      expect(screen.getByText('5s remaining')).toBeInTheDocument();
    });
  });

  describe('Status Messages', () => {
    it('should display default status message when capturing', () => {
      render(
        <AnalysisProgress
          frameCount={100}
          totalFrames={450}
          elapsedTime={3}
          totalDuration={15}
          isCapturing={true}
        />
      );

      expect(screen.getByText('Capturing frames...')).toBeInTheDocument();
    });

    it('should display custom status message', () => {
      render(
        <AnalysisProgress
          frameCount={100}
          totalFrames={450}
          elapsedTime={3}
          totalDuration={15}
          statusMessage="Processing your posture..."
        />
      );

      expect(screen.getByText('Processing your posture...')).toBeInTheDocument();
    });

    it('should display completion message when all frames captured', () => {
      render(
        <AnalysisProgress
          frameCount={450}
          totalFrames={450}
          elapsedTime={15}
          totalDuration={15}
        />
      );

      expect(screen.getByText('Capture Complete!')).toBeInTheDocument();
      expect(screen.getByText('All frames captured successfully!')).toBeInTheDocument();
    });
  });

  describe('Progress Bar Styling', () => {
    it('should use blue color when capturing', () => {
      const { container } = render(
        <AnalysisProgress
          frameCount={100}
          totalFrames={450}
          elapsedTime={3}
          totalDuration={15}
          isCapturing={true}
        />
      );

      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveClass('bg-blue-600');
    });

    it('should use green color when complete', () => {
      const { container } = render(
        <AnalysisProgress
          frameCount={450}
          totalFrames={450}
          elapsedTime={15}
          totalDuration={15}
        />
      );

      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveClass('bg-green-500');
    });

    it('should use gray color when not capturing', () => {
      const { container } = render(
        <AnalysisProgress
          frameCount={100}
          totalFrames={450}
          elapsedTime={3}
          totalDuration={15}
          isCapturing={false}
        />
      );

      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveClass('bg-gray-400');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero frames', () => {
      render(
        <AnalysisProgress
          frameCount={0}
          totalFrames={450}
          elapsedTime={0}
          totalDuration={15}
        />
      );

      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should cap progress at 100%', () => {
      render(
        <AnalysisProgress
          frameCount={500}
          totalFrames={450}
          elapsedTime={17}
          totalDuration={15}
        />
      );

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should not show negative remaining values', () => {
      render(
        <AnalysisProgress
          frameCount={500}
          totalFrames={450}
          elapsedTime={17}
          totalDuration={15}
        />
      );

      expect(screen.getByText('0 remaining')).toBeInTheDocument();
      expect(screen.getByText('0s remaining')).toBeInTheDocument();
    });

    it('should handle custom total frames', () => {
      render(
        <AnalysisProgress
          frameCount={300}
          totalFrames={600}
          elapsedTime={10}
          totalDuration={20}
        />
      );

      expect(screen.getByText('/ 600')).toBeInTheDocument();
      expect(screen.getByText('/ 20s')).toBeInTheDocument();
    });
  });

  describe('Capture Rate Display', () => {
    it('should display capture rate when capturing with frames', () => {
      render(
        <AnalysisProgress
          frameCount={90}
          totalFrames={450}
          elapsedTime={3}
          totalDuration={15}
          isCapturing={true}
        />
      );

      // 90 frames / 3 seconds = 30 FPS
      expect(screen.getByText(/Capturing at 30 FPS/)).toBeInTheDocument();
    });

    it('should not display capture rate when not capturing', () => {
      render(
        <AnalysisProgress
          frameCount={90}
          totalFrames={450}
          elapsedTime={3}
          totalDuration={15}
          isCapturing={false}
        />
      );

      expect(screen.queryByText(/Capturing at/)).not.toBeInTheDocument();
    });

    it('should not display capture rate when no frames captured', () => {
      render(
        <AnalysisProgress
          frameCount={0}
          totalFrames={450}
          elapsedTime={0}
          totalDuration={15}
          isCapturing={true}
        />
      );

      expect(screen.queryByText(/Capturing at/)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes on progress bar', () => {
      const { container } = render(
        <AnalysisProgress
          frameCount={150}
          totalFrames={450}
          elapsedTime={5}
          totalDuration={15}
        />
      );

      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '33');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('should have descriptive text for screen readers', () => {
      render(
        <AnalysisProgress
          frameCount={150}
          totalFrames={450}
          elapsedTime={5}
          totalDuration={15}
        />
      );

      expect(screen.getByText('Complete')).toBeInTheDocument();
      expect(screen.getByText('Frames')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
    });
  });

  describe('Visual Feedback', () => {
    it('should show completion alert when done', () => {
      const { container } = render(
        <AnalysisProgress
          frameCount={450}
          totalFrames={450}
          elapsedTime={15}
          totalDuration={15}
        />
      );

      const alert = screen.getByText('All frames captured successfully!');
      expect(alert).toBeInTheDocument();
      
      // Find the parent container with bg-green-50 class
      const alertContainer = container.querySelector('.bg-green-50');
      expect(alertContainer).toBeInTheDocument();
    });

    it('should display icons for visual clarity', () => {
      const { container } = render(
        <AnalysisProgress
          frameCount={150}
          totalFrames={450}
          elapsedTime={5}
          totalDuration={15}
        />
      );

      // Check for SVG icons
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });
  });
});
