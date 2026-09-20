import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NoCountsState from './NoCountsState';
import type { Booking } from '../../types';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('NoCountsState', () => {
  const mockBookings: Booking[] = [
    {
      id: '1',
      userId: 'user1',
      serviceId: 'service1',
      paymentId: 'payment1',
      totalAmount: 100,
      paidAmount: 100,
      remainingAmount: 0,
      time: '2024-01-15T10:00:00Z',
      status: 'CONFIRMED',
      createdAt: '2024-01-10T10:00:00Z',
      totalScreeningCount: 10,
      usedScreeningCount: 10,
      remainingScreeningCount: 0,
    },
    {
      id: '2',
      userId: 'user1',
      serviceId: 'service2',
      paymentId: 'payment2',
      totalAmount: 150,
      paidAmount: 150,
      remainingAmount: 0,
      time: '2024-01-20T14:00:00Z',
      status: 'CONFIRMED',
      createdAt: '2024-01-12T10:00:00Z',
      totalScreeningCount: 5,
      usedScreeningCount: 5,
      remainingScreeningCount: 0,
    },
  ];

  const renderComponent = (bookings?: Booking[]) => {
    return render(
      <BrowserRouter>
        <NoCountsState bookings={bookings} />
      </BrowserRouter>
    );
  };

  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders the empty state message', () => {
    renderComponent(mockBookings);
    
    expect(screen.getByText('All screening counts used')).toBeInTheDocument();
    expect(screen.getByText(/You've used all 15 of your allocated AI screening assessments/)).toBeInTheDocument();
  });

  it('displays the Activity icon', () => {
    const { container } = renderComponent(mockBookings);
    
    const icon = container.querySelector('svg.lucide-activity');
    expect(icon).toBeInTheDocument();
  });

  it('displays the count summary when bookings are provided', () => {
    renderComponent(mockBookings);
    
    expect(screen.getByText('Total allocated:')).toBeInTheDocument();
    expect(screen.getAllByText('15')).toHaveLength(2); // In message and summary
    expect(screen.getByText('Used:')).toBeInTheDocument();
    expect(screen.getByText('Remaining:')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument(); // Remaining
  });

  it('calculates total used counts correctly', () => {
    renderComponent(mockBookings);
    
    // Should show 15 (10 + 5)
    expect(screen.getByText(/You've used all 15 of your allocated AI screening assessments/)).toBeInTheDocument();
  });

  it('renders the Purchase New Service button', () => {
    renderComponent(mockBookings);
    
    const button = screen.getByRole('button', { name: /purchase new service/i });
    expect(button).toBeInTheDocument();
  });

  it('navigates to home page when Purchase New Service button is clicked', () => {
    renderComponent(mockBookings);
    
    const button = screen.getByRole('button', { name: /purchase new service/i });
    fireEvent.click(button);
    
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('handles empty bookings array', () => {
    renderComponent([]);
    
    expect(screen.getByText('All screening counts used')).toBeInTheDocument();
    expect(screen.getByText(/You've used all 0 of your allocated AI screening assessments/)).toBeInTheDocument();
  });

  it('handles undefined bookings prop', () => {
    renderComponent();
    
    expect(screen.getByText('All screening counts used')).toBeInTheDocument();
    expect(screen.getByText(/You've used all 0 of your allocated AI screening assessments/)).toBeInTheDocument();
  });

  it('displays shopping cart icon in button', () => {
    const { container } = renderComponent(mockBookings);
    
    const icon = container.querySelector('svg.lucide-shopping-cart');
    expect(icon).toBeInTheDocument();
  });

  it('applies correct styling classes', () => {
    const { container } = renderComponent(mockBookings);
    
    // Check for Card component with centered content
    const card = container.querySelector('.py-12.text-center');
    expect(card).toBeInTheDocument();
    
    // Check for summary box
    const summaryBox = container.querySelector('.bg-gray-50.border.border-gray-200.rounded-lg');
    expect(summaryBox).toBeInTheDocument();
  });

  it('displays remaining count in red', () => {
    const { container } = renderComponent(mockBookings);
    
    const remainingText = container.querySelector('.text-red-600');
    expect(remainingText).toBeInTheDocument();
    expect(remainingText?.textContent).toBe('0');
  });
});
