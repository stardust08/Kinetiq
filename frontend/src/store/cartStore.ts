import { create } from 'zustand';
import { CartItem } from '../types';

interface CartState {
  items: CartItem[];
  total: number;
  itemCount: number;
  isLoading: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  syncWithServer: (serverCart: any) => void;
  setLoading: (loading: boolean) => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  total: 0,
  itemCount: 0,
  isLoading: false,
  addItem: (item) => set((state) => ({
    items: [...state.items, item],
    total: state.total + item.subtotal,
    itemCount: state.itemCount + 1,
  })),
  removeItem: (itemId) => set((state) => {
    const item = state.items.find(i => i.id === itemId);
    return {
      items: state.items.filter(i => i.id !== itemId),
      total: state.total - (item?.subtotal || 0),
      itemCount: state.itemCount - 1,
    };
  }),
  updateQuantity: (itemId, quantity) => set((state) => {
    const items = state.items.map(item =>
      item.id === itemId
        ? { ...item, quantity, subtotal: item.price * quantity }
        : item
    );
    return {
      items,
      total: items.reduce((sum, item) => sum + item.subtotal, 0),
    };
  }),
  clearCart: () => set({ items: [], total: 0, itemCount: 0 }),
  syncWithServer: (serverCart) => set({
    items: serverCart.items || [],
    total: serverCart.cartValue || 0,
    itemCount: serverCart.items?.length || 0,
  }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
