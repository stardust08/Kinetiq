import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from './cartStore';
import type { CartItem } from '../types';

describe('Cart Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useCartStore.setState({
      items: [],
      total: 0,
      itemCount: 0,
    });
  });

  describe('Initial State', () => {
    it('should have empty items array initially', () => {
      const state = useCartStore.getState();
      expect(state.items).toEqual([]);
    });

    it('should have zero total initially', () => {
      const state = useCartStore.getState();
      expect(state.total).toBe(0);
    });

    it('should have zero itemCount initially', () => {
      const state = useCartStore.getState();
      expect(state.itemCount).toBe(0);
    });
  });

  describe('addItem Action', () => {
    it('should add item to cart', () => {
      const mockItem: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Test Service',
        quantity: 1,
        price: 100,
        subtotal: 100,
      };

      useCartStore.getState().addItem(mockItem);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0]).toEqual(mockItem);
      expect(state.total).toBe(100);
      expect(state.itemCount).toBe(1);
    });

    it('should add multiple items to cart', () => {
      const item1: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 2,
        price: 50,
        subtotal: 100,
      };
      const item2: CartItem = {
        id: 'item-2',
        serviceId: 'service-2',
        serviceName: 'Service 2',
        quantity: 1,
        price: 75,
        subtotal: 75,
      };

      useCartStore.getState().addItem(item1);
      useCartStore.getState().addItem(item2);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(2);
      expect(state.total).toBe(175);
      expect(state.itemCount).toBe(2);
    });
  });

  describe('removeItem Action', () => {
    it('should remove item from cart', () => {
      const item1: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 1,
        price: 100,
        subtotal: 100,
      };
      const item2: CartItem = {
        id: 'item-2',
        serviceId: 'service-2',
        serviceName: 'Service 2',
        quantity: 1,
        price: 50,
        subtotal: 50,
      };

      useCartStore.getState().addItem(item1);
      useCartStore.getState().addItem(item2);
      useCartStore.getState().removeItem('item-1');

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe('item-2');
      expect(state.total).toBe(50);
      expect(state.itemCount).toBe(1);
    });

    it('should handle removing non-existent item', () => {
      const item: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 1,
        price: 100,
        subtotal: 100,
      };

      useCartStore.getState().addItem(item);
      useCartStore.getState().removeItem('non-existent-id');

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.total).toBe(100);
      expect(state.itemCount).toBe(0);
    });

    it('should remove all items when called multiple times', () => {
      const item1: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 1,
        price: 100,
        subtotal: 100,
      };
      const item2: CartItem = {
        id: 'item-2',
        serviceId: 'service-2',
        serviceName: 'Service 2',
        quantity: 1,
        price: 50,
        subtotal: 50,
      };

      useCartStore.getState().addItem(item1);
      useCartStore.getState().addItem(item2);
      useCartStore.getState().removeItem('item-1');
      useCartStore.getState().removeItem('item-2');

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
      expect(state.total).toBe(0);
      expect(state.itemCount).toBe(0);
    });
  });

  describe('updateQuantity Action', () => {
    it('should update item quantity and recalculate subtotal', () => {
      const item: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 1,
        price: 100,
        subtotal: 100,
      };

      useCartStore.getState().addItem(item);
      useCartStore.getState().updateQuantity('item-1', 3);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(3);
      expect(state.items[0].subtotal).toBe(300);
      expect(state.total).toBe(300);
    });

    it('should update quantity to zero', () => {
      const item: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 2,
        price: 50,
        subtotal: 100,
      };

      useCartStore.getState().addItem(item);
      useCartStore.getState().updateQuantity('item-1', 0);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(0);
      expect(state.items[0].subtotal).toBe(0);
      expect(state.total).toBe(0);
    });

    it('should recalculate total for multiple items', () => {
      const item1: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 1,
        price: 100,
        subtotal: 100,
      };
      const item2: CartItem = {
        id: 'item-2',
        serviceId: 'service-2',
        serviceName: 'Service 2',
        quantity: 2,
        price: 50,
        subtotal: 100,
      };

      useCartStore.getState().addItem(item1);
      useCartStore.getState().addItem(item2);
      useCartStore.getState().updateQuantity('item-1', 5);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(5);
      expect(state.items[0].subtotal).toBe(500);
      expect(state.total).toBe(600);
    });

    it('should handle updating non-existent item', () => {
      const item: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 1,
        price: 100,
        subtotal: 100,
      };

      useCartStore.getState().addItem(item);
      useCartStore.getState().updateQuantity('non-existent-id', 5);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(1);
      expect(state.total).toBe(100);
    });
  });

  describe('clearCart Action', () => {
    it('should clear all items from cart', () => {
      const item1: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 1,
        price: 100,
        subtotal: 100,
      };
      const item2: CartItem = {
        id: 'item-2',
        serviceId: 'service-2',
        serviceName: 'Service 2',
        quantity: 2,
        price: 50,
        subtotal: 100,
      };

      useCartStore.getState().addItem(item1);
      useCartStore.getState().addItem(item2);
      useCartStore.getState().clearCart();

      const state = useCartStore.getState();
      expect(state.items).toEqual([]);
      expect(state.total).toBe(0);
      expect(state.itemCount).toBe(0);
    });

    it('should handle clearing empty cart', () => {
      useCartStore.getState().clearCart();

      const state = useCartStore.getState();
      expect(state.items).toEqual([]);
      expect(state.total).toBe(0);
      expect(state.itemCount).toBe(0);
    });
  });

  describe('syncWithServer Action', () => {
    it('should sync cart with server data', () => {
      const serverCart = {
        items: [
          {
            id: 'item-1',
            serviceId: 'service-1',
            serviceName: 'Service 1',
            quantity: 2,
            price: 100,
            subtotal: 200,
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
        cartValue: 275,
      };

      useCartStore.getState().syncWithServer(serverCart);

      const state = useCartStore.getState();
      expect(state.items).toEqual(serverCart.items);
      expect(state.total).toBe(275);
      expect(state.itemCount).toBe(2);
    });

    it('should replace existing cart with server data', () => {
      const localItem: CartItem = {
        id: 'local-item',
        serviceId: 'local-service',
        serviceName: 'Local Service',
        quantity: 1,
        price: 50,
        subtotal: 50,
      };

      useCartStore.getState().addItem(localItem);

      const serverCart = {
        items: [
          {
            id: 'server-item',
            serviceId: 'server-service',
            serviceName: 'Server Service',
            quantity: 3,
            price: 100,
            subtotal: 300,
          },
        ],
        cartValue: 300,
      };

      useCartStore.getState().syncWithServer(serverCart);

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].id).toBe('server-item');
      expect(state.total).toBe(300);
      expect(state.itemCount).toBe(1);
    });

    it('should handle syncing empty cart from server', () => {
      const item: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 1,
        price: 100,
        subtotal: 100,
      };

      useCartStore.getState().addItem(item);

      const serverCart = {
        items: [],
        cartValue: 0,
      };

      useCartStore.getState().syncWithServer(serverCart);

      const state = useCartStore.getState();
      expect(state.items).toEqual([]);
      expect(state.total).toBe(0);
      expect(state.itemCount).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle items with decimal prices', () => {
      const item: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 3,
        price: 19.99,
        subtotal: 59.97,
      };

      useCartStore.getState().addItem(item);

      const state = useCartStore.getState();
      expect(state.total).toBeCloseTo(59.97, 2);
    });

    it('should handle large quantities', () => {
      const item: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 1,
        price: 10,
        subtotal: 10,
      };

      useCartStore.getState().addItem(item);
      useCartStore.getState().updateQuantity('item-1', 1000);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(1000);
      expect(state.items[0].subtotal).toBe(10000);
      expect(state.total).toBe(10000);
    });

    it('should handle negative quantities in updateQuantity', () => {
      const item: CartItem = {
        id: 'item-1',
        serviceId: 'service-1',
        serviceName: 'Service 1',
        quantity: 5,
        price: 100,
        subtotal: 500,
      };

      useCartStore.getState().addItem(item);
      useCartStore.getState().updateQuantity('item-1', -2);

      const state = useCartStore.getState();
      expect(state.items[0].quantity).toBe(-2);
      expect(state.items[0].subtotal).toBe(-200);
      expect(state.total).toBe(-200);
    });
  });
});
