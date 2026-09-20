import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { BackButton } from './BackButton';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('BackButton', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders with default label', () => {
    renderWithRouter(<BackButton />);
    
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    renderWithRouter(<BackButton label="Back to Bookings" />);
    
    expect(screen.getByText('Back to Bookings')).toBeInTheDocument();
  });

  it('renders arrow icon', () => {
    const { container } = renderWithRouter(<BackButton />);
    
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('navigates to specific route when "to" prop is provided', () => {
    renderWithRouter(<BackButton to="/bookings" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(mockNavigate).toHaveBeenCalledWith('/bookings');
  });

  it('navigates back in history when no "to" prop', () => {
    renderWithRouter(<BackButton />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('calls custom onClick handler when provided', () => {
    const mockOnClick = vi.fn();
    renderWithRouter(<BackButton onClick={mockOnClick} />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(mockOnClick).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('custom onClick overrides "to" prop', () => {
    const mockOnClick = vi.fn();
    renderWithRouter(<BackButton to="/bookings" onClick={mockOnClick} />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(mockOnClick).toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    renderWithRouter(<BackButton className="custom-class" />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('has proper hover styles', () => {
    renderWithRouter(<BackButton />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('text-blue-600', 'hover:text-blue-800');
  });
});
