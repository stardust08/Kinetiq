import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CategorySkeleton, CategorySkeletonGrid } from './CategorySkeleton';

describe('CategorySkeleton', () => {
  it('renders a single category skeleton', () => {
    render(<CategorySkeleton />);
    
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBe(2); // One for image, one for text
  });

  it('renders skeleton with correct structure', () => {
    const { container } = render(<CategorySkeleton />);
    
    const wrapper = container.querySelector('.space-y-2');
    expect(wrapper).toBeInTheDocument();
  });
});

describe('CategorySkeletonGrid', () => {
  it('renders default number of skeletons (6)', () => {
    render(<CategorySkeletonGrid />);
    
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBe(12); // 6 categories × 2 skeletons each
  });

  it('renders custom number of skeletons', () => {
    render(<CategorySkeletonGrid count={4} />);
    
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBe(8); // 4 categories × 2 skeletons each
  });

  it('renders zero skeletons when count is 0', () => {
    render(<CategorySkeletonGrid count={0} />);
    
    const skeletons = screen.queryAllByTestId('skeleton');
    expect(skeletons.length).toBe(0);
  });
});
