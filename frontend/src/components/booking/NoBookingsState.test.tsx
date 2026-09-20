import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import NoBookingsState from './NoBookingsState';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('NoBookingsState', () => {
  const renderComponent = () => {
    return render(
      <BrowserRouter>
        <NoBookingsState />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the empty state message', () => {
    renderComponent();
    
    expect(screen.getByText('No bookings found')).toBeInTheDocument();
    expect(screen.getByText('Purchase a service plan to get started')).toBeInTheDocument();
  });

  it('displays the package icon', () => {
    const { container } = renderComponent();
    
    const icon = container.querySelector('svg.lucide-package');
    expect(icon).toBeInTheDocument();
  });

  it('renders the Browse Services button', () => {
    renderComponent();
    
    const button = screen.getByRole('button', { name: /browse services/i });
    expect(button).toBeInTheDocument();
  });

  it('navigates to home page when Browse Services button is clicked', () => {
    renderComponent();
    
    const button = screen.getByRole('button', { name: /browse services/i });
    fireEvent.click(button);
    
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('applies correct styling classes', () => {
    const { container } = renderComponent();
    
    // Check for Card component
    const card = container.querySelector('.py-12.text-center');
    expect(card).toBeInTheDocument();
  });
});
