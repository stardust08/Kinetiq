'use client';

import { useCartStore } from '../../store/cartStore';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '../../app/components/ui/sheet';
import { Button } from '../../app/components/ui/button';
import { Trash2 } from 'lucide-react';
import { cartAPI } from '../../api/cart';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BOOKINGS_QUERY_KEY } from '../../hooks/useBookings';

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  const { items, total, syncWithServer } = useCartStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleRemoveItem = async (itemId: string) => {
    try {
      const updatedCart = await cartAPI.removeItem(itemId);
      syncWithServer(updatedCart);
      toast.success('Item removed from cart', { closeButton: true });
      // Sync My Bookings: the draft PENDING entry for this cart item should disappear
      queryClient.invalidateQueries({ queryKey: BOOKINGS_QUERY_KEY });
    } catch (error) {
      console.error('Failed to remove item:', error);
      toast.error('Failed to remove item from cart');
    }
  };

  const handleCheckout = () => {
    onOpenChange(false); // Close the drawer
    navigate('/checkout'); // Navigate to checkout page
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col !w-full sm:!max-w-md">
        <SheetHeader className="border-b pb-4">
          <SheetTitle className="text-2xl font-semibold text-white">Shopping Cart</SheetTitle>
          {items.length > 0 && (
            <p className="text-sm text-slate-400 mt-1">
              {items.length} {items.length === 1 ? 'item' : 'items'} in your cart
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-6 px-4 -mx-4">
          {items.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mb-4 text-slate-600">
                  <svg
                    className="mx-auto h-24 w-24"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                    />
                  </svg>
                </div>
                <p className="text-slate-300 text-lg font-medium mb-2">
                  Your cart is empty
                </p>
                <p className="text-slate-500 text-sm">
                  Add services to get started
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-4 rounded-xl p-4 transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-base mb-2 text-slate-100">
                      {item.serviceName}
                    </h4>
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
                      <span className="font-medium text-slate-300">₹{item.price.toFixed(2)}</span>
                      <span className="text-slate-500">×</span>
                      <span>{item.quantity}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold text-emerald-400">
                        ₹{item.subtotal.toFixed(2)}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-3"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <SheetFooter className="flex-col gap-4 border-t pt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Subtotal</span>
              <span className="font-medium text-slate-200">₹{total.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="text-lg font-semibold text-slate-100">Total</span>
              <span className="text-2xl font-bold text-emerald-400">₹{total.toFixed(2)}</span>
            </div>
          </div>
          <Button
            className="w-full font-semibold py-6 text-base rounded-lg shadow-md hover:shadow-lg transition-all"
            size="lg"
            onClick={handleCheckout}
            disabled={items.length === 0}
          >
            Proceed to Checkout
          </Button>
          {items.length > 0 && (
            <p className="text-xs text-center text-slate-500">
              Taxes and shipping calculated at checkout
            </p>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
