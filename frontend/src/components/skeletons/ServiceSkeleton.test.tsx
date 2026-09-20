import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ServiceSkeleton, ServiceSkeletonList } from './ServiceSkeleton';

describe('ServiceSkeleton', () => {
  it('renders a single service skeleton', () => {
    render(<ServiceSkeleton />);
    
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders skeleton with card wrapper', () => {
    const { container } = render(<ServiceSkeleton />);
    
    const card = container.querySelector('.p-3');
    expect(card).toBeInTheDocument();
  });

  it('renders skeleton with correct layout structure', () => {
    const { container } = render(<ServiceSkeleton />);
    
    // Check for flex container
    const flexContainer = container.querySelector('.flex.gap-3.items-start');
    expect(flexContainer).toBeInTheDocument();
    
    // Check for circular image skeleton
    const circularSkeleton = container.querySelector('.rounded-full');
    expect(circularSkeleton).toBeInTheDocument();
  });
});

describe('ServiceSkeletonList', () => {
  it('renders default number of skeletons (3)', () => {
    const { container } = render(<ServiceSkeletonList />);
    
    const cards = container.querySelectorAll('.p-3');
    expect(cards.length).toBe(3);
  });

  it('renders custom number of skeletons', () => {
    const { container } = render(<ServiceSkeletonList count={5} />);
    
    const cards = container.querySelectorAll('.p-3');
    expect(cards.length).toBe(5);
  });

  it('renders zero skeletons when count is 0', () => {
    const { container } = render(<ServiceSkeletonList count={0} />);
    
    const cards = container.querySelectorAll('.p-3');
    expect(cards.length).toBe(0);
  });
});
