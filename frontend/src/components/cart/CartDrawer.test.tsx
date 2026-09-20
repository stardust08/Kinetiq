import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartDrawer } from './CartDrawer';
import { useCartStore } from '../../store/cartStore';
import { cartAPI } from '../../api/cart';
import { toast } from 'sonner';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../api/cart');
vi.mock('sonner');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('CartDrawer', () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    // Reset store state before each test
    useCartStore.setState({
      items: [],
      total: 0,
      itemCount: 0,
    });
    mockOnOpenChange.mockClear();
    mockNavigate.mockClear();
    vi.clearAllMocks();
  });

  it('should render empty cart message when cart is empty', () => {
    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
  });

  it('should display cart items when cart has items', () => {
    useCartStore.setState({
      items: [
        {
          id: 'item-1',
          serviceId: 'service-1',
          serviceName: 'Test Service',
          quantity: 2,
          price: 50,
          subtotal: 100,
        },
      ],
      total: 100,
      itemCount: 1,
    });

    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('Test Service')).toBeInTheDocument();
    expect(screen.getByText('₹50.00')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('₹100.00')).toHaveLength(3); // Item subtotal, subtotal row, and total row
  });

  it('should display price, quantity, and subtotal for each item', () => {
    useCartStore.setState({
      items: [
        {
          id: 'item-1',
          serviceId: 'service-1',
          serviceName: 'Therapy Session',
          quantity: 3,
          price: 75.5,
          subtotal: 226.5,
        },
      ],
      total: 226.5,
      itemCount: 1,
    });

    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    // Verify service name
    expect(screen.getByText('Therapy Session')).toBeInTheDocument();
    // Verify price × quantity format
    expect(screen.getByText('₹75.50')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    // Verify subtotal appears (item subtotal, subtotal row, and total row)
    expect(screen.getAllByText('₹226.50')).toHaveLength(3);
  });

  it('should display total amount', () => {
    useCartStore.setState({
      items: [
        {
          id: 'item-1',
          serviceId: 'service-1',
          serviceName: 'Service 1',
          quantity: 1,
          price: 50,
          subtotal: 50,
        },
        {
          id: 'item-2',
          serviceId: 'service-2',
          serviceName: 'Service 2',
          quantity: 1,
          price: 75,
          subtotal: 75,
        },
      ],
      total: 125,
      itemCount: 2,
    });

    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    // Total appears in both subtotal and total rows
    expect(screen.getAllByText('₹125.00').length).toBeGreaterThanOrEqual(1);
  });

  it('should display cart total prominently in footer', () => {
    useCartStore.setState({
      items: [
        {
          id: 'item-1',
          serviceId: 'service-1',
          serviceName: 'Test Service',
          quantity: 2,
          price: 45.99,
          subtotal: 91.98,
        },
      ],
      total: 91.98,
      itemCount: 1,
    });

    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    // Verify "Total" label is present
    expect(screen.getByText('Total')).toBeInTheDocument();
    // Verify total amount is displayed with proper formatting (appears twice: item subtotal and footer total)
    const totalElements = screen.getAllByText('₹91.98');
    expect(totalElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should display zero total when cart is empty', () => {
    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText('Total')).toBeInTheDocument();
    // Zero appears in both subtotal and total rows
    expect(screen.getAllByText('₹0.00').length).toBeGreaterThanOrEqual(1);
  });

  it('should call removeItem when remove button is clicked', async () => {
    const user = userEvent.setup();
    const mockSyncWithServer = vi.fn();

    const mockUpdatedCart = {
      id: 'cart-1',
      userId: 'user-1',
      items: [],
      cartValue: 0,
      itemCount: 0,
      updatedAt: new Date().toISOString(),
    };

    vi.mocked(cartAPI.removeItem).mockResolvedValue(mockUpdatedCart);

    useCartStore.setState({
      items: [
        {
          id: 'item-1',
          serviceId: 'service-1',
          serviceName: 'Test Service',
          quantity: 1,
          price: 50,
          subtotal: 50,
        },
      ],
      total: 50,
      itemCount: 1,
      syncWithServer: mockSyncWithServer,
    });

    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    const removeButton = screen.getByRole('button', { name: /remove/i });
    await user.click(removeButton);

    await waitFor(() => {
      expect(cartAPI.removeItem).toHaveBeenCalledWith('item-1');
      expect(mockSyncWithServer).toHaveBeenCalledWith(mockUpdatedCart);
      expect(toast.success).toHaveBeenCalledWith('Item removed from cart');
    });
  });

  it('should show error toast when remove item fails', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(cartAPI.removeItem).mockRejectedValue(new Error('API Error'));

    useCartStore.setState({
      items: [
        {
          id: 'item-1',
          serviceId: 'service-1',
          serviceName: 'Test Service',
          quantity: 1,
          price: 50,
          subtotal: 50,
        },
      ],
      total: 50,
      itemCount: 1,
    });

    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    const removeButton = screen.getByRole('button', { name: /remove/i });
    await user.click(removeButton);

    await waitFor(() => {
      expect(cartAPI.removeItem).toHaveBeenCalledWith('item-1');
      expect(toast.error).toHaveBeenCalledWith('Failed to remove item from cart');
    });

    consoleErrorSpy.mockRestore();
  });

  it('should disable checkout button when cart is empty', () => {
    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    const checkoutButton = screen.getByRole('button', {
      name: /proceed to checkout/i,
    });
    expect(checkoutButton).toBeDisabled();
  });

  it('should enable checkout button when cart has items', () => {
    useCartStore.setState({
      items: [
        {
          id: 'item-1',
          serviceId: 'service-1',
          serviceName: 'Test Service',
          quantity: 1,
          price: 50,
          subtotal: 50,
        },
      ],
      total: 50,
      itemCount: 1,
    });

    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    const checkoutButton = screen.getByRole('button', {
      name: /proceed to checkout/i,
    });
    expect(checkoutButton).not.toBeDisabled();
  });

  it('should navigate to checkout page and close drawer when checkout button is clicked', async () => {
    const user = userEvent.setup();

    useCartStore.setState({
      items: [
        {
          id: 'item-1',
          serviceId: 'service-1',
          serviceName: 'Test Service',
          quantity: 1,
          price: 50,
          subtotal: 50,
        },
      ],
      total: 50,
      itemCount: 1,
    });

    render(<CartDrawer open={true} onOpenChange={mockOnOpenChange} />);

    const checkoutButton = screen.getByRole('button', {
      name: /proceed to checkout/i,
    });
    await user.click(checkoutButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith('/checkout');
  });
});
