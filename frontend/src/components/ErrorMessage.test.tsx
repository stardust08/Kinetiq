import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorMessage } from './ErrorMessage';

describe('ErrorMessage', () => {
  it('renders error message with default variant', () => {
    render(<ErrorMessage message="Something went wrong" />);
    
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders error message with custom title', () => {
    render(<ErrorMessage message="Failed to load" title="Loading Error" />);
    
    expect(screen.getByText('Loading Error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('renders retry button when onRetry is provided', () => {
    const onRetry = vi.fn();
    render(<ErrorMessage message="Failed to load" onRetry={onRetry} />);
    
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorMessage message="Failed to load" onRetry={onRetry} />);
    
    const retryButton = screen.getByRole('button', { name: /retry/i });
    await user.click(retryButton);
    
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render retry button when onRetry is not provided', () => {
    render(<ErrorMessage message="Failed to load" />);
    
    const retryButton = screen.queryByRole('button', { name: /retry/i });
    expect(retryButton).not.toBeInTheDocument();
  });

  it('renders compact variant', () => {
    render(<ErrorMessage message="Failed to load" variant="compact" />);
    
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    // Compact variant doesn't show title
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  it('renders compact variant with retry button', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorMessage message="Failed to load" variant="compact" onRetry={onRetry} />);
    
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
    
    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
