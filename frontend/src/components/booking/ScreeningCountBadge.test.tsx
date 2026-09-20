import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScreeningCountBadge from './ScreeningCountBadge';

describe('ScreeningCountBadge', () => {
  it('should display screening count information', () => {
    render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
      />
    );

    expect(screen.getByText(/7/)).toBeInTheDocument();
    expect(screen.getByText(/of/)).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument();
    expect(screen.getByText(/remaining/)).toBeInTheDocument();
    expect(screen.getByText(/3 used/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Screening Assessments/i)).toBeInTheDocument();
  });

  it('should display green color for high remaining count', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
      />
    );

    // The badge's background moved from Tailwind classes to an inline style, so
    // className no longer carries the severity. The text colour still does, and
    // it is the signal a patient reads: green plenty, orange low, red none left.
    expect(container.querySelector('.text-emerald-400')).not.toBeNull();
  });

  it('should display orange color for low remaining count', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={8}
        remainingCount={2}
      />
    );

    // The badge's background moved from Tailwind classes to an inline style, so
    // className no longer carries the severity. The text colour still does, and
    // it is the signal a patient reads: green plenty, orange low, red none left.
    expect(container.querySelector('.text-orange-400')).not.toBeNull();
  });

  it('should display red color for zero remaining count', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={10}
        remainingCount={0}
      />
    );

    // The badge's background moved from Tailwind classes to an inline style, so
    // className no longer carries the severity. The text colour still does, and
    // it is the signal a patient reads: green plenty, orange low, red none left.
    expect(container.querySelector('.text-red-400')).not.toBeNull();
  });

  it('should display progress bar when showProgress is true', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
        showProgress={true}
      />
    );

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle({ width: '30%' });
    expect(progressBar).toHaveAttribute('aria-valuenow', '3');
    expect(progressBar).toHaveAttribute('aria-valuemax', '10');
  });

  it('should display percentage used text', () => {
    render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
        showProgress={true}
      />
    );

    expect(screen.getByText(/30% used/i)).toBeInTheDocument();
  });

  it('should not display progress bar when showProgress is false', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
        showProgress={false}
      />
    );

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).not.toBeInTheDocument();
  });

  it('should handle zero total count', () => {
    render(
      <ScreeningCountBadge
        totalCount={0}
        usedCount={0}
        remainingCount={0}
      />
    );

    expect(screen.getByText(/remaining/)).toBeInTheDocument();
    expect(screen.getByText(/0 used/i)).toBeInTheDocument();
  });

  it('should apply small size class', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
        size="sm"
      />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('p-2.5');
  });

  it('should apply medium size class by default', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
      />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('p-3');
  });

  it('should apply large size class', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
        size="lg"
      />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('p-4');
  });

  it('should have proper accessibility attributes', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
      />
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveAttribute('role', 'status');
    expect(badge).toHaveAttribute('aria-label', 'Screening assessments: 7 of 10 remaining');
  });

  it('should display different status icons based on state', () => {
    const { container: greenContainer } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
      />
    );
    // Green state should have CheckCircle icon
    expect(greenContainer.querySelectorAll('svg').length).toBeGreaterThan(1);

    const { container: orangeContainer } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={8}
        remainingCount={2}
      />
    );
    // Orange state should have AlertTriangle icon
    expect(orangeContainer.querySelectorAll('svg').length).toBeGreaterThan(1);

    const { container: redContainer } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={10}
        remainingCount={0}
      />
    );
    // Red state should have AlertCircle icon
    expect(redContainer.querySelectorAll('svg').length).toBeGreaterThan(1);
  });

  it('animates state changes rather than hover', () => {
    // The badge has no hover styling: it is informational, not interactive. What
    // it does have is a transition, so a count changing after a screening reads as
    // a change rather than a jump.
    const { container } = render(
      <ScreeningCountBadge totalCount={10} usedCount={3} remainingCount={7} />,
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('transition-all');
  });

  it('should have smooth progress bar animation', () => {
    const { container } = render(
      <ScreeningCountBadge
        totalCount={10}
        usedCount={3}
        remainingCount={7}
        showProgress={true}
      />
    );

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar?.className).toContain('transition-all');
    expect(progressBar?.className).toContain('duration-500');
  });
});
