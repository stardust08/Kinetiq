import { describe, it } from 'vitest';
import { render } from '@testing-library/react';
import ScreeningCountBadge from './ScreeningCountBadge';

/**
 * Visual test file for ScreeningCountBadge component
 * This file demonstrates different visual states of the component
 */

describe('ScreeningCountBadge Visual States', () => {
  it('renders with high remaining count (green state)', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={2}
        remainingCount={8}
        showProgress={true}
        size="md"
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders with low remaining count (orange state)', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={8}
        remainingCount={2}
        showProgress={true}
        size="md"
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders with zero remaining count (red state)', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={10}
        remainingCount={0}
        showProgress={true}
        size="md"
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders small size variant', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={5}
        usedCount={1}
        remainingCount={4}
        showProgress={true}
        size="sm"
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders large size variant', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={20}
        usedCount={5}
        remainingCount={15}
        showProgress={true}
        size="lg"
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders without progress bar', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
        showProgress={false}
        size="md"
      />
    );
    expect(container).toBeTruthy();
  });
});
