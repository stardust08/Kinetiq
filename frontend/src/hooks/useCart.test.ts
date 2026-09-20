import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createQueryWrapper } from '../test/queryWrapper';
import { useCart } from './useCart';
import { useCartStore } from '../store/cartStore';
import * as cartApi from '../api/cart';
import type { Cart } from '../types';

// Mock the cart API
vi.mock('../api/cart');

describe('useCart', () => {
  const mockCart: Cart = {
    id: 'cart-1',
    userId: 'user-1',
    items: [
      {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Test Service',
        quantity: 2,
        price: 100,
        subtotal: 200,
      },
    ],
    cartValue: 200,
    itemCount: 1,
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    // Clear store state before each test
    useCartStore.setState({
      items: [],
      total: 0,
      itemCount: 0,
    });
    vi.clearAllMocks();
  });

  it('should return initial empty cart state', () => {
    const { result } = renderHook(() => useCart(), { wrapper: createQueryWrapper() });

    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.itemCount).toBe(0);
  });

  it('should fetch cart from server', async () => {
    vi.mocked(cartApi.getCart).mockResolvedValue(mockCart);

    const { result } = renderHook(() => useCart(), { wrapper: createQueryWrapper() });

    await act(async () => {
      const cart = await result.current.fetchCart();
      expect(cart).toEqual(mockCart);
    });

    expect(cartApi.getCart).toHaveBeenCalled();
    expect(result.current.items).toEqual(mockCart.items);
    expect(result.current.total).toBe(mockCart.cartValue);
    expect(result.current.itemCount).toBe(mockCart.itemCount);
  });

  it('should add item to cart', async () => {
    const updatedCart: Cart = {
      ...mockCart,
      items: [
        ...mockCart.items,
        {
          id: 'item-2',
          serviceId: 'service-2',
          serviceName: 'Another Service',
          quantity: 1,
          price: 150,
          subtotal: 150,
        },
      ],
      cartValue: 350,
      itemCount: 2,
    };

    vi.mocked(cartApi.addItem).mockResolvedValue(updatedCart);

    const { result } = renderHook(() => useCart(), { wrapper: createQueryWrapper() });

    await act(async () => {
      const cart = await result.current.addToCart('service-2', 1);
      expect(cart).toEqual(updatedCart);
    });

    expect(cartApi.addItem).toHaveBeenCalledWith('service-2', 1);
    expect(result.current.items).toHaveLength(2);
    expect(result.current.total).toBe(350);
    expect(result.current.itemCount).toBe(2);
  });

  it('should remove item from cart', async () => {
    // Set initial cart state
    useCartStore.setState({
      items: mockCart.items,
      total: mockCart.cartValue,
      itemCount: mockCart.itemCount,
    });

    const emptyCart: Cart = {
      ...mockCart,
      items: [],
      cartValue: 0,
      itemCount: 0,
    };

    vi.mocked(cartApi.removeItem).mockResolvedValue(emptyCart);

    const { result } = renderHook(() => useCart(), { wrapper: createQueryWrapper() });

    await act(async () => {
      const cart = await result.current.removeFromCart('item-1');
      expect(cart).toEqual(emptyCart);
    });

    expect(cartApi.removeItem).toHaveBeenCalledWith('item-1');
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.itemCount).toBe(0);
  });

  it('should update item quantity', async () => {
    // Set initial cart state
    useCartStore.setState({
      items: mockCart.items,
      total: mockCart.cartValue,
      itemCount: mockCart.itemCount,
    });

    const updatedCart: Cart = {
      ...mockCart,
      items: [
        {
          ...mockCart.items[0],
          quantity: 5,
          subtotal: 500,
        },
      ],
      cartValue: 500,
    };

    vi.mocked(cartApi.updateItem).mockResolvedValue(updatedCart);

    const { result } = renderHook(() => useCart(), { wrapper: createQueryWrapper() });

    await act(async () => {
      const cart = await result.current.updateQuantity('item-1', 5);
      expect(cart).toEqual(updatedCart);
    });

    expect(cartApi.updateItem).toHaveBeenCalledWith('item-1', 5);
    expect(result.current.items[0].quantity).toBe(5);
    expect(result.current.items[0].subtotal).toBe(500);
    expect(result.current.total).toBe(500);
  });

  it('should clear cart', async () => {
    // Set initial cart state
    useCartStore.setState({
      items: mockCart.items,
      total: mockCart.cartValue,
      itemCount: mockCart.itemCount,
    });

    const emptyCart: Cart = {
      ...mockCart,
      items: [],
      cartValue: 0,
      itemCount: 0,
    };

    vi.mocked(cartApi.clearCart).mockResolvedValue(emptyCart);

    const { result } = renderHook(() => useCart(), { wrapper: createQueryWrapper() });

    expect(result.current.items).toHaveLength(1);

    await act(async () => {
      const cart = await result.current.clearCart();
      expect(cart).toEqual(emptyCart);
    });

    expect(cartApi.clearCart).toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.itemCount).toBe(0);
  });
});
