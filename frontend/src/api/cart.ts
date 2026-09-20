import { apiClient } from './client';
import { Cart, AddToCartRequest, UpdateCartItemRequest } from '../types';

/**
 * Cart API functions for managing shopping cart operations
 */

/**
 * Get the current user's cart
 * @returns Promise with cart data including items, total, and item count
 */
export const getCart = async (): Promise<Cart> => {
  // Check if user has auth token before making request
  const token = localStorage.getItem('auth_token');
  if (!token) {
    // Return empty cart if not authenticated
    return { items: [], cartValue: 0, itemCount: 0, id: '', userId: '', updatedAt: new Date().toISOString() };
  }
  
  const response = await apiClient.get<{ data: Cart }>('/api/cart');
  return response.data.data;
};

/**
 * Add an item to the cart
 * @param serviceId - UUID of the service to add
 * @param quantity - Quantity to add (default: 1)
 * @returns Promise with updated cart data
 */
export const addItem = async (serviceId: string, quantity: number = 1): Promise<Cart> => {
  const response = await apiClient.post<{ data: Cart; message: string }>(
    '/api/cart/items',
    { serviceId, quantity }
  );
  return response.data.data;
};

/**
 * Update the quantity of a cart item
 * @param itemId - UUID of the cart item to update
 * @param quantity - New quantity (must be at least 1)
 * @returns Promise with updated cart data
 */
export const updateItem = async (itemId: string, quantity: number): Promise<Cart> => {
  const response = await apiClient.put<{ data: Cart; message: string }>(
    `/api/cart/items/${itemId}`,
    { quantity }
  );
  return response.data.data;
};

/**
 * Remove an item from the cart
 * @param itemId - UUID of the cart item to remove
 * @returns Promise with updated cart data
 */
export const removeItem = async (itemId: string): Promise<Cart> => {
  const response = await apiClient.delete<{ data: Cart; message: string }>(
    `/api/cart/items/${itemId}`
  );
  return response.data.data;
};

/**
 * Clear all items from the cart
 * @returns Promise with empty cart data
 */
export const clearCart = async (): Promise<Cart> => {
  const response = await apiClient.delete<{ data: Cart; message: string }>('/api/cart');
  return response.data.data;
};

/**
 * Cart API object for convenient access to all cart operations
 */
export const cartAPI = {
  get: getCart,
  addItem,
  updateItem,
  removeItem,
  clear: clearCart,
};
