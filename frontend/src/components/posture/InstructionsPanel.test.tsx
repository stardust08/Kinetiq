import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import InstructionsPanel from './InstructionsPanel';

describe('InstructionsPanel', () => {
  it('renders without crashing', () => {
    render(<InstructionsPanel />);
    expect(screen.getByText('Visual Guide')).toBeInTheDocument();
  });

  it('displays all instruction sections', () => {
    render(<InstructionsPanel />);
    
    // Check for main sections
    expect(screen.getByText('Visual Guide')).toBeInTheDocument();
    expect(screen.getByText('Before You Start')).toBeInTheDocument();
    expect(screen.getByText('During Capture (10 seconds)')).toBeInTheDocument();
    expect(screen.getByText('Tips for Best Results')).toBeInTheDocument();
    expect(screen.getByText('Important')).toBeInTheDocument();
  });

  it('displays positioning instructions', () => {
    render(<InstructionsPanel />);
    
    // Check for key positioning instructions
    expect(screen.getByText(/Stand 6-8 feet away from your camera/i)).toBeInTheDocument();
    expect(screen.getByText(/Ensure your full body is visible in the frame/i)).toBeInTheDocument();
    expect(screen.getByText(/Stand in a well-lit area/i)).toBeInTheDocument();
    expect(screen.getByText(/Wear fitted clothing/i)).toBeInTheDocument();
  });

  it('displays during capture instructions', () => {
    render(<InstructionsPanel />);
    
    // Check for capture instructions
    expect(screen.getByText(/Stand still and maintain your natural posture/i)).toBeInTheDocument();
    expect(screen.getByText(/Look straight ahead at the camera/i)).toBeInTheDocument();
    expect(screen.getByText(/Keep your arms relaxed at your sides/i)).toBeInTheDocument();
  });

  it('displays tips for best results', () => {
    render(<InstructionsPanel />);
    
    // Check for tips
    expect(screen.getByText(/Avoid backlighting/i)).toBeInTheDocument();
    expect(screen.getByText(/Use a plain background/i)).toBeInTheDocument();
    expect(screen.getByText(/Remove shoes/i)).toBeInTheDocument();
  });

  it('displays important note about screening count', () => {
    render(<InstructionsPanel />);
    
    // Check for important note
    expect(screen.getByText(/180 frames across three poses/i)).toBeInTheDocument();
    expect(screen.getByText(/One screening count will be deducted/i)).toBeInTheDocument();
  });

  it('displays visual guide with distance indicator', () => {
    render(<InstructionsPanel />);
    
    // Check for distance indicator
    expect(screen.getByText('6-8 feet')).toBeInTheDocument();
  });

  it('has proper styling classes for different sections', () => {
    const { container } = render(<InstructionsPanel />);
    
    // Check for color-coded sections
    expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
    expect(container.querySelector('.bg-yellow-50')).toBeInTheDocument();
    expect(container.querySelector('.bg-green-50')).toBeInTheDocument();
    expect(container.querySelector('.bg-purple-50')).toBeInTheDocument();
  });

  it('displays all checkmark icons for list items', () => {
    const { container } = render(<InstructionsPanel />);
    
    // Check for SVG icons (checkmarks)
    const checkmarkIcons = container.querySelectorAll('svg[fill="currentColor"]');
    expect(checkmarkIcons.length).toBeGreaterThan(0);
  });

  it('displays section header icons', () => {
    const { container } = render(<InstructionsPanel />);
    
    // Check for section header icons
    const headerIcons = container.querySelectorAll('h3 svg');
    expect(headerIcons.length).toBeGreaterThan(0);
  });
});
