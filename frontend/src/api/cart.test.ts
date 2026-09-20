import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cartAPI, getCart, addItem, updateItem, removeItem, clearCart } from './cart';
import { apiClient } from './client';
import { Cart } from '../types';

vi.mock('./client');

describe('Cart API', () => {
  const mockCart: Cart = {
    id: 'cart-123',
    userId: 'user-456',
    items: [
      {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Test Service',
        quantity: 1,
        price: 100,
        subtotal: 100,
      },
    ],
    cartValue: 100,
    itemCount: 1,
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // getCart returns an empty cart WITHOUT calling the API when there is no auth
    // token - a signed-out visitor has no cart to fetch. The test predates that
    // guard, so its request was never made.
    localStorage.setItem('auth_token', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getCart', () => {
    it('should fetch the current cart', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mockCart } });

      const result = await getCart();

      expect(apiClient.get).toHaveBeenCalledWith('/api/cart');
      expect(result).toEqual(mockCart);
    });
  });

  describe('addItem', () => {
    it('should add an item to the cart', async () => {
      const updatedCart = { ...mockCart, itemCount: 2, cartValue: 200 };
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: updatedCart, message: 'Item added to cart' },
      });

      const result = await addItem('service-2', 1);

      expect(apiClient.post).toHaveBeenCalledWith('/api/cart/items', {
        serviceId: 'service-2',
        quantity: 1,
      });
      expect(result).toEqual(updatedCart);
    });

    it('should use default quantity of 1', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: mockCart, message: 'Item added to cart' },
      });

      await addItem('service-1');

      expect(apiClient.post).toHaveBeenCalledWith('/api/cart/items', {
        serviceId: 'service-1',
        quantity: 1,
      });
    });
  });

  describe('updateItem', () => {
    it('should update cart item quantity', async () => {
      const updatedCart = { ...mockCart, cartValue: 300 };
      vi.mocked(apiClient.put).mockResolvedValue({
        data: { data: updatedCart, message: 'Cart updated' },
      });

      const result = await updateItem('item-1', 3);

      expect(apiClient.put).toHaveBeenCalledWith('/api/cart/items/item-1', {
        quantity: 3,
      });
      expect(result).toEqual(updatedCart);
    });
  });

  describe('removeItem', () => {
    it('should remove an item from the cart', async () => {
      const emptyCart = { ...mockCart, items: [], cartValue: 0, itemCount: 0 };
      vi.mocked(apiClient.delete).mockResolvedValue({
        data: { data: emptyCart, message: 'Item removed' },
      });

      const result = await removeItem('item-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/cart/items/item-1');
      expect(result).toEqual(emptyCart);
    });
  });

  describe('clearCart', () => {
    it('should clear all items from the cart', async () => {
      const emptyCart = { ...mockCart, items: [], cartValue: 0, itemCount: 0 };
      vi.mocked(apiClient.delete).mockResolvedValue({
        data: { data: emptyCart, message: 'Cart cleared' },
      });

      const result = await clearCart();

      expect(apiClient.delete).toHaveBeenCalledWith('/api/cart');
      expect(result).toEqual(emptyCart);
    });
  });

  describe('cartAPI object', () => {
    it('should expose all cart operations', () => {
      expect(cartAPI.get).toBe(getCart);
      expect(cartAPI.addItem).toBe(addItem);
      expect(cartAPI.updateItem).toBe(updateItem);
      expect(cartAPI.removeItem).toBe(removeItem);
      expect(cartAPI.clear).toBe(clearCart);
    });
  });
});
