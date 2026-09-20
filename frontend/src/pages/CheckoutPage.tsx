import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { Button } from '../app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../app/components/ui/card';
import { Progress } from '../app/components/ui/progress';
import { Calendar } from '../app/components/ui/calendar';
import { Label } from '../app/components/ui/label';
import { Separator } from '../app/components/ui/separator';
import { checkout } from '../api/bookings';
import { initiate as initiatePayment, verify as verifyPayment } from '../api/payments';
import { MockPaymentGateway } from '../utils/mockPaymentGateway';
import { toast } from 'sonner';
import { Loader2, ShoppingCart, Calendar as CalendarIcon, CreditCard, CheckCircle2, Trash2, Plus, Minus } from 'lucide-react';
import { getAvailableSlots, lockSlot, releaseSlot } from '../components/slot/slots';

type CheckoutStep = 'cart' | 'datetime' | 'payment' | 'confirmation';
type PaymentState = 'idle' | 'initiating' | 'processing' | 'verifying' | 'success' | 'failed';


export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items, total, clearCart, updateQuantity, removeItem } = useCartStore();
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('cart');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [bookingData, setBookingData] = useState<any>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // Slot-related state
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [lockId, setLockId] = useState<string | null>(null);

  const EVENING_START_HOUR = 16;

  const morningAfternoonSlots = useMemo(
    () => availableSlots.filter(slot => new Date(slot.slotTime).getHours() < EVENING_START_HOUR),
    [availableSlots]
  );

  const eveningSlots = useMemo(
    () => availableSlots.filter(slot => new Date(slot.slotTime).getHours() >= EVENING_START_HOUR),
    [availableSlots]
  );
  const [lockExpiry, setLockExpiry] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [countdownInterval, setCountdownInterval] = useState<any>(null);


  const steps = [
    { id: 'cart', label: 'Cart Review', icon: ShoppingCart },
    { id: 'datetime', label: 'Date & Time', icon: CalendarIcon },
    { id: 'payment', label: 'Payment', icon: CreditCard },
    { id: 'confirmation', label: 'Confirmation', icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);
  const progressValue = ((currentStepIndex + 1) / steps.length) * 100;

  const canProceedFromCart = () => {
    return items.length > 0;
  };

 const canProceedFromDateTime = () => {
  return selectedDate !== undefined && selectedSlot !== null && lockId !== null;
};

  const handleNextStep = () => {
    if (currentStep === 'cart') {
      if (!canProceedFromCart()) {
        toast.error('Your cart is empty');
        return;
      }
      setCurrentStep('datetime');
    } else if (currentStep === 'datetime') {
      if (!canProceedFromDateTime()) {
        toast.error('Please select date and time');
        return;
      }
      setCurrentStep('payment');
    }
  };

  const handlePreviousStep = () => {
    if (currentStep === 'datetime') {
      setCurrentStep('cart');
    } else if (currentStep === 'payment') {
      setCurrentStep('datetime');
    }
  };

  const canGoBack = () => {
    return currentStep !== 'cart' && currentStep !== 'confirmation';
  };

  const canGoForward = () => {
    if (currentStep === 'cart') return canProceedFromCart();
    if (currentStep === 'datetime') return canProceedFromDateTime();
    return false;
  };

  // Fetch available slots when date changes
  useEffect(() => {
    if (selectedDate && items.length > 0) {
      fetchAvailableSlots();
    }
  }, [selectedDate, items]);

  // Cleanup countdown interval on unmount
  useEffect(() => {
    return () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
  }, [countdownInterval]);

  const fetchAvailableSlots = async () => {
    setLoadingSlots(true);
    try {
      const serviceId = items[0].serviceId;
      const y = selectedDate!.getFullYear();
      const m = String(selectedDate!.getMonth() + 1).padStart(2, '0');
      const d = String(selectedDate!.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const data = await getAvailableSlots(serviceId, dateStr);
      setAvailableSlots(data.slots);
    } catch (error) {
      console.error('Failed to fetch slots:', error);
      toast.error('Failed to load available slots');
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleSlotSelect = async (slotTime: string) => {
    // Release previous lock if exists
    if (lockId) {
      try {
        await releaseSlot(lockId);
      } catch (error) {
        console.error('Failed to release previous lock:', error);
      }
    }

    setLoadingSlots(true);

    try {
      const serviceId = items[0].serviceId;

      // Lock the slot
      const lockData = await lockSlot(serviceId, slotTime);

      // Save lock details
      setSelectedSlot(slotTime);
      setLockId(lockData.lockId);
      setLockExpiry(new Date(lockData.expiresAt));

      // Start countdown
      startCountdownTimer(lockData.expiresAt);

      toast.success('Slot reserved for 5 minutes!');

    } catch (error: any) {
      console.error('Failed to lock slot:', error);
      const errorMessage = error.response?.data?.error || 'Failed to reserve slot';
      toast.error(errorMessage);

      setSelectedSlot(null);
      setLockId(null);
    } finally {
      setLoadingSlots(false);
    }
  };

  const startCountdownTimer = (expiryTime: string) => {
    // Clear existing interval
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }

    // Create new interval
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const expiry = new Date(expiryTime).getTime();
      const remaining = Math.floor((expiry - now) / 1000);

      if (remaining <= 0) {
        // Lock expired
        clearInterval(interval);
        setLockId(null);
        setSelectedSlot(null);
        setLockExpiry(null);
        setCountdown(0);
        toast.error('Slot lock expired. Please select a new slot.');
      } else {
        setCountdown(remaining);
      }
    }, 1000);

    setCountdownInterval(interval);
  };

  const handleCheckout = async () => {
    // Validate slot selection and lock
    if (!selectedDate || !selectedSlot || !lockId) {
      toast.error('Please select a date and time slot');
      return;
    }

    // Check if lock has expired
    if (lockExpiry && new Date() > lockExpiry) {
      toast.error('Your slot reservation has expired. Please select a new slot.');
      setLockId(null);
      setSelectedSlot(null);
      return;
    }

    setLoading(true);
    setPaymentState('initiating');
    setPaymentError(null);

    try {
      // Use selectedSlot directly as scheduledTime (already in ISO format)
      const scheduledTime = selectedSlot;

      // Create bookings from cart with lockId
      const checkoutResponse = await checkout(scheduledTime, lockId);
      setBookingData(checkoutResponse);

      // Initiate payment
      setPaymentState('processing');
      const paymentResponse = await initiatePayment(checkoutResponse.payment.id);

      toast.success('Redirecting to payment gateway...');

      // Use mock payment gateway to process payment
      MockPaymentGateway.openPaymentWindow(
        paymentResponse.gatewayUrl,
        async (result) => {
          setPaymentState('verifying');

          try {
            if (result.success) {
              // Verify payment with backend
              await verifyPayment(
                checkoutResponse.payment.id,
                result.transactionId,
                result.status
              );

              setPaymentState('success');
              // Clear cart and show confirmation
              clearCart();
              setCurrentStep('confirmation');
              toast.success('Payment successful!');
            } else {
              // Handle payment failure
              setPaymentState('failed');
              setPaymentError(result.message || 'Payment failed');
              toast.error(result.message || 'Payment failed');
            }
          } catch (error: any) {
            console.error('Payment verification failed:', error);
            setPaymentState('failed');
            const errorMessage = error.response?.data?.message || 'Payment verification failed';
            setPaymentError(errorMessage);
            toast.error(errorMessage);
          } finally {
            setLoading(false);
          }
        }
      );
    } catch (error: any) {
      console.error('Checkout failed:', error);
      setPaymentState('failed');
      const errorMessage = error.response?.data?.message || 'Checkout failed';
      setPaymentError(errorMessage);
      toast.error(errorMessage);
      setLoading(false);
    }
  };

  const renderCartStep = () => {
    const handleQuantityChange = (itemId: string, newQuantity: number) => {
      if (newQuantity < 1) return;
      updateQuantity(itemId, newQuantity);
      toast.success('Quantity updated');
    };

    const handleRemoveItem = (itemId: string, serviceName: string) => {
      removeItem(itemId);
      toast.success(`${serviceName} removed from cart`);
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2 text-white">Review Your Cart</h2>
          <p className="text-slate-400">Review your items before proceeding to checkout</p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl p-12 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <ShoppingCart className="h-16 w-16 mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400 text-lg mb-4">Your cart is empty</p>
            <Button onClick={() => navigate('/')}>Continue Shopping</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div className="p-6">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2 text-white">{item.serviceName}</h3>
                        <div className="flex items-center gap-4 text-sm text-slate-400 mb-3">
                          <span>₹{item.price.toFixed(2)} per service</span>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-300">Quantity:</span>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0"
                              onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-12 text-center font-semibold">{item.quantity}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0"
                              onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-3">
                        <p className="text-xl font-bold text-emerald-400">
                          ₹{item.subtotal.toFixed(2)}
                        </p>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemoveItem(item.id, item.serviceName)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="p-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Items in cart</span>
                    <span>{items.length} service(s)</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg">
                    <span className="font-semibold text-white">Total Amount</span>
                    <span className="text-2xl font-bold text-emerald-400">₹{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="lg" onClick={handleNextStep} disabled={!canGoForward()}>
                Continue to Date & Time
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderDateTimeStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 text-white">Select Date & Time</h2>
        <p className="text-slate-400">Choose when you'd like your service</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-transparent border-0" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
          <CardHeader>
            <CardTitle className="text-white">Select Date</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              className="rounded-md border"
            />
          </CardContent>
        </Card>

        <Card className="bg-transparent border-0" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
          <CardHeader>
            <CardTitle className="text-white">Select Time Slot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedDate ? (
              <div className="text-center py-8">
                <p className="text-slate-400">Please select a date first</p>
              </div>
            ) : loadingSlots ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p className="text-slate-400">Loading available slots...</p>
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400">No available slots for this date</p>
                <p className="text-sm text-slate-500 mt-2">Please select a different date</p>
              </div>
            ) : (
              <>
                {(() => {
                  const now = new Date();
                  const isToday = selectedDate &&
                    selectedDate.getFullYear() === now.getFullYear() &&
                    selectedDate.getMonth() === now.getMonth() &&
                    selectedDate.getDate() === now.getDate();

                  const renderSlot = (slot: any) => {
                    const slotTime = new Date(slot.slotTime);
                    const timeString = slotTime.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    });
                    const isSelected = selectedSlot === slot.slotTime;
                    const isPast = isToday && (
                      slotTime.getHours() < now.getHours() ||
                      (slotTime.getHours() === now.getHours() && slotTime.getMinutes() < now.getMinutes())
                    );
                    const isDisabled = isPast || (lockId !== null && !isSelected);

                    return (
                      <button
                        key={slot.slotTime}
                        onClick={() => handleSlotSelect(slot.slotTime)}
                        disabled={isDisabled}
                        className={`
                          p-3 rounded-lg border-2 transition-all
                          ${isSelected
                            ? 'border-[#2F86C7] bg-[#2F86C7]/10 text-white font-semibold'
                            : isPast
                              ? 'border-white/5 bg-white/2 text-slate-700'
                              : 'border-white/10 hover:border-[#2F86C7]/40 hover:bg-[#2F86C7]/8 text-slate-300'
                          }
                          ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                        style={isSelected ? { boxShadow: "0 0 12px rgba(47,134,199,0.25)" } : undefined}
                      >
                        {timeString}
                      </button>
                    );
                  };

                  return (
                    <>
                      {morningAfternoonSlots.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-slate-500 mb-2">Morning & Afternoon</h4>
                          <div className="grid grid-cols-3 gap-2">
                            {morningAfternoonSlots.map(renderSlot)}
                          </div>
                        </div>
                      )}
                      {eveningSlots.length > 0 && (
                        <div className={morningAfternoonSlots.length > 0 ? 'mt-4' : ''}>
                          <h4 className="text-sm font-medium text-slate-500 mb-2">Evening</h4>
                          <div className="grid grid-cols-3 gap-2">
                            {eveningSlots.map(renderSlot)}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}


                {selectedSlot && lockId && (
                  <div className="mt-4 p-4" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "0.75rem" }}>
                    <p className="text-sm font-medium text-emerald-300">Slot Reserved:</p>
                    <p className="text-lg font-semibold text-emerald-200">
                      {new Date(selectedSlot).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </p>
                    <p className="text-sm text-emerald-400 mt-2">
                      ⏱️ Lock expires in: {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={handlePreviousStep} disabled={!canGoBack()}>
          Back to Cart
        </Button>
        <Button size="lg" onClick={handleNextStep} disabled={!canGoForward()}>
          Continue to Payment
        </Button>
      </div>
    </div>
  );

  const renderPaymentStep = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 text-white">Payment</h2>
        <p className="text-slate-400">Review and complete your payment</p>
      </div>

      {/* Payment Error Display */}
      {paymentError && paymentState === 'failed' && (
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "1rem" }}>
          <div className="p-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                  <span className="text-red-400 text-xl">✕</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-300 mb-1">Payment Failed</h3>
                <p className="text-red-400 text-sm">{paymentError}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  onClick={() => {
                    setPaymentError(null);
                    setPaymentState('idle');
                  }}
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-transparent border-0" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
          <CardHeader>
            <CardTitle className="text-white">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-slate-300">{item.serviceName} × {item.quantity}</span>
                  <span className="font-medium text-slate-300">₹{item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span className="text-white">Total</span>
              <span className="text-emerald-400">₹{total.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-transparent border-0" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
          <CardHeader>
            <CardTitle className="text-white">Booking Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-slate-500">Date & Time</Label>
              <p className="font-medium text-white">
                {selectedDate?.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              {selectedSlot && (
                <p className="font-medium text-white">
                  {new Date(selectedSlot).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </p>
              )}
            </div>
            <Separator />
            <div>
              <Label className="text-sm text-slate-500">Items</Label>
              <p className="font-medium text-white">{items.length} service(s)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div style={{ background: "rgba(47,134,199,0.04)", border: "1px solid rgba(47,134,199,0.15)", borderRadius: "1rem" }}>
        <div className="p-6">
          <p className="text-sm text-slate-300 mb-4">
            By proceeding, you agree to our terms and conditions. You will be redirected to our secure payment gateway.
          </p>
          <Button
            size="lg"
            className="w-full"
            onClick={handleCheckout}
            disabled={loading || paymentState === 'processing' || paymentState === 'verifying'}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {paymentState === 'initiating' && 'Initiating Payment...'}
                {paymentState === 'processing' && 'Processing Payment...'}
                {paymentState === 'verifying' && 'Verifying Payment...'}
              </>
            ) : (
              'Proceed to Payment'
            )}
          </Button>
        </div>
      </div>

      <div className="flex justify-start">
        <Button
          variant="outline"
          onClick={handlePreviousStep}
          disabled={loading || paymentState === 'processing' || paymentState === 'verifying' || !canGoBack()}
        >
          Back to Date & Time
        </Button>
      </div>
    </div>
  );

  const renderConfirmationStep = () => (
    <div className="space-y-6">
      <div style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "1.5rem" }}>
        <div className="py-12 text-center px-6">
          <CheckCircle2 className="h-20 w-20 mx-auto text-emerald-400 mb-4" />
          <h2 className="text-3xl font-bold text-white mb-2">Booking Confirmed!</h2>
          <p className="text-emerald-300 text-lg mb-6">
            Your booking has been successfully confirmed and payment completed
          </p>

          {bookingData && (
            <div className="rounded-lg p-6 mb-6 text-left max-w-md mx-auto" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0.75rem" }}>
              <h3 className="font-semibold text-lg mb-4 text-white">Booking Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Payment ID:</span>
                  <span className="font-medium text-white">{bookingData.payment.id.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Amount:</span>
                  <span className="font-medium text-white">₹{bookingData.payment.totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Paid Amount:</span>
                  <span className="font-medium text-emerald-400">₹{bookingData.payment.paidAmount.toFixed(2)}</span>
                </div>
                {bookingData.payment.remainingAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Remaining Amount:</span>
                    <span className="font-medium text-orange-400">₹{bookingData.payment.remainingAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-medium text-emerald-400 capitalize">{bookingData.payment.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Bookings:</span>
                  <span className="font-medium text-white">{bookingData.bookings.length} service(s)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Scheduled Time:</span>
                  <span className="font-medium text-white">
                    {selectedDate?.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })} at {selectedSlot && new Date(selectedSlot).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <Button size="lg" onClick={() => navigate('/bookings')}>
              View My Bookings
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative overflow-hidden min-h-screen bg-[#030712] py-8">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(47,134,199,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(47,134,199,0.04) 1px, transparent 1px)", backgroundSize: "60px 60px", maskImage: "radial-gradient(ellipse 100% 50% at 50% 0%, black 20%, transparent 100%)" }} />
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStepIndex === index;
              const isCompleted = currentStepIndex > index;

              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${isActive
                        ? 'bg-[#2F86C7] text-white'
                        : isCompleted
                          ? 'bg-emerald-500 text-white'
                          : 'bg-white/8 text-slate-500 border border-white/10'
                        }`}
                      style={isActive ? { boxShadow: "0 0 16px rgba(47,134,199,0.4)" } : undefined}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <span
                      className={`text-sm font-medium ${isActive ? 'text-[#2F86C7]' : isCompleted ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`h-1 flex-1 mx-2 ${isCompleted ? 'bg-emerald-500/50' : 'bg-white/8'
                        }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={progressValue} className="h-2 bg-white/8" />
        </div>

        {/* Loading Overlay */}
        {(paymentState === 'processing' || paymentState === 'verifying') && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <Card className="w-96" style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-16 w-16 mx-auto text-[#2F86C7] animate-spin mb-4" />
                <h3 className="text-xl font-semibold mb-2 text-white">
                  {paymentState === 'processing' && 'Processing Payment...'}
                  {paymentState === 'verifying' && 'Verifying Payment...'}
                </h3>
                <p className="text-slate-400 text-sm">
                  Please wait while we process your payment securely
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step Content */}
        <div>
          {currentStep === 'cart' && renderCartStep()}
          {currentStep === 'datetime' && renderDateTimeStep()}
          {currentStep === 'payment' && renderPaymentStep()}
          {currentStep === 'confirmation' && renderConfirmationStep()}
        </div>
      </div>
    </div>
  );
}
