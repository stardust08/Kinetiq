import { useEffect, useRef } from 'react';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { getCart } from '../api/cart';

/**
 * Hook to initialize cart data from server when user is authenticated
 * This ensures cart badge shows correct count on page load/refresh
 */
export const useCartInitialization = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const syncWithServer = useCartStore((state) => state.syncWithServer);
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Only run once on mount
    if (hasInitialized.current) {
      return;
    }
    
    hasInitialized.current = true;

    const initializeCart = async () => {
      // If not authenticated, just clear the cart - don't call API
      if (!isAuthenticated) {
        syncWithServer({ items: [], cartValue: 0 });
        return;
      }

      // User is authenticated, fetch cart from server
      try {
        const cart = await getCart();
        syncWithServer(cart);
      } catch (error: any) {
        // Silently handle errors - just show empty cart
        console.error('Failed to load cart:', error);
        syncWithServer({ items: [], cartValue: 0 });
      }
    };

    initializeCart();
  }, []); // Empty dependency array - run only once
};
