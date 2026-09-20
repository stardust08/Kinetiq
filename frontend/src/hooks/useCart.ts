import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCartStore } from '../store/cartStore';
import * as cartApi from '../api/cart';
import { BOOKINGS_QUERY_KEY } from './useBookings';

/**
 * Custom hook for cart operations
 * Provides cart management with server synchronization
 */
export const useCart = () => {
  const queryClient = useQueryClient();
  const {
    items,
    total,
    itemCount,
    addItem: storeAddItem,
    removeItem: storeRemoveItem,
    updateQuantity: storeUpdateQuantity,
    clearCart: storeClearCart,
    syncWithServer,
  } = useCartStore();

  // Invalidate My Bookings so draft PENDING entries stay in sync with cart state
  const invalidateBookings = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: BOOKINGS_QUERY_KEY });
  }, [queryClient]);

  /**
   * Fetch cart from server and sync with local store
   */
  const fetchCart = useCallback(async () => {
    const cart = await cartApi.getCart();
    syncWithServer(cart);
    return cart;
  }, [syncWithServer]);

  /**
   * Add item to cart
   * @param serviceId - UUID of the service to add
   * @param quantity - Quantity to add (default: 1)
   */
  const addToCart = useCallback(async (serviceId: string, quantity: number = 1) => {
    const cart = await cartApi.addItem(serviceId, quantity);
    syncWithServer(cart);
    invalidateBookings(); // new draft PENDING entry should appear in My Bookings
    return cart;
  }, [syncWithServer, invalidateBookings]);

  /**
   * Remove item from cart
   * @param itemId - UUID of the cart item to remove
   */
  const removeFromCart = useCallback(async (itemId: string) => {
    const cart = await cartApi.removeItem(itemId);
    syncWithServer(cart);
    invalidateBookings(); // draft PENDING entry should disappear from My Bookings
    return cart;
  }, [syncWithServer, invalidateBookings]);

  /**
   * Update cart item quantity
   * @param itemId - UUID of the cart item to update
   * @param quantity - New quantity (must be at least 1)
   */
  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    const cart = await cartApi.updateItem(itemId, quantity);
    syncWithServer(cart);
    invalidateBookings();
    return cart;
  }, [syncWithServer, invalidateBookings]);

  /**
   * Clear entire cart
   */
  const clearCart = useCallback(async () => {
    const cart = await cartApi.clearCart();
    syncWithServer(cart);
    invalidateBookings(); // all draft entries should disappear
    return cart;
  }, [syncWithServer, invalidateBookings]);

  return {
    // State
    items,
    total,
    itemCount,
    
    // Actions
    fetchCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
  };
};
