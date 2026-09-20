import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Header } from './header';
import { BrowserRouter } from 'react-router-dom';
import { useCartStore } from '../../store/cartStore';

// Mock the AuthButton component
vi.mock('../../components/layout/AuthButton', () => ({
  AuthButton: () => <button>Mocked AuthButton</button>,
}));

// Mock the cart store
vi.mock('../../store/cartStore', () => ({
  useCartStore: vi.fn(),
}));

describe('Header', () => {
  beforeEach(() => {
    // Reset cart store mock before each test
    vi.mocked(useCartStore).mockReturnValue(0);
  });

  it('renders the header with logo and navigation', () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    // Check for logo text
    expect(screen.getByText('Neura AI')).toBeInTheDocument();

    // Check for navigation links
    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText("Who It's For")).toBeInTheDocument();
  });

  it('renders the AuthButton component', () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    // Verify AuthButton is rendered
    expect(screen.getByText('Mocked AuthButton')).toBeInTheDocument();
  });

  it('renders the Get Started button', () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  it('renders cart icon', () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    // Cart icon button should be present
    const cartButton = screen.getByRole('button', { name: '' });
    expect(cartButton).toBeInTheDocument();
  });

  it('does not show item count badge when cart is empty', () => {
    vi.mocked(useCartStore).mockReturnValue(0);

    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    // Badge should not be visible
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows item count badge when cart has items', () => {
    vi.mocked(useCartStore).mockReturnValue(3);

    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    // Badge should show the count
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('updates item count badge when cart changes', () => {
    const { rerender } = render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    // Initially no badge
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    // Update mock to return 1 item
    vi.mocked(useCartStore).mockReturnValue(1);

    rerender(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    // Badge should now show 1
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
