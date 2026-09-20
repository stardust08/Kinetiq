import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { payRemaining, initiate, verify } from '../api/payments';
import { Booking } from '../types';
import { toast } from 'sonner';
import BookingList from '../components/booking/BookingList';
import BookingDetailsModal from '../components/booking/BookingDetailsModal';
import { Breadcrumb } from '../components/layout/Breadcrumb';
import { MockPaymentGateway } from '../utils/mockPaymentGateway';
import { BOOKINGS_QUERY_KEY } from '../hooks/useBookings';

export default function BookingsPage() {
  const queryClient = useQueryClient();
  const [payingRemaining, setPayingRemaining] = useState<string | null>(null);
  const [completingPayment, setCompletingPayment] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handlePayRemaining = async (paymentId: string, bookingId: string) => {
    setPayingRemaining(bookingId);
    try {
      await payRemaining(paymentId);
      toast.success('Redirecting to payment gateway...');
      
      // In a real app, redirect to payment gateway
      // For now, simulate payment and refresh bookings
      setTimeout(() => {
        toast.success('Payment completed successfully!');
        setPayingRemaining(null);
      }, 2000);
    } catch (error: any) {
      console.error('Payment failed:', error);
      toast.error(error.response?.data?.message || 'Payment failed');
      setPayingRemaining(null);
    }
  };

  const handleCompletePayment = async (paymentId: string, bookingId: string) => {
    setCompletingPayment(bookingId);
    try {
      const paymentResponse = await initiate(paymentId);
      toast.success('Redirecting to payment gateway...');

      MockPaymentGateway.openPaymentWindow(
        paymentResponse.gatewayUrl,
        async (result) => {
          try {
            if (result.success) {
              await verify(paymentId, result.transactionId, result.status);
              toast.success('Payment completed! Booking confirmed.');
              queryClient.invalidateQueries({ queryKey: BOOKINGS_QUERY_KEY });
            } else {
              toast.error(result.message || 'Payment failed');
            }
          } catch (error: any) {
            toast.error(error.response?.data?.message || 'Payment verification failed');
          } finally {
            setCompletingPayment(null);
          }
        }
      );
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to initiate payment');
      setCompletingPayment(null);
    }
  };

  const handleViewDetails = (booking: Booking) => {
    setSelectedBooking(booking);
    setModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#030712] py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <Breadcrumb
          items={[
            { label: 'My Bookings' }
          ]}
          className="mb-6"
        />
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">My Bookings</h1>
          <p className="text-slate-400">View and manage your service bookings</p>
        </div>

        {/* Bookings List */}
        <BookingList
          onPayRemaining={handlePayRemaining}
          payingRemaining={payingRemaining}
          onViewDetails={handleViewDetails}
          onCompletePayment={handleCompletePayment}
          completingPayment={completingPayment}
        />

        {/* Booking Details Modal */}
        <BookingDetailsModal
          booking={selectedBooking}
          open={modalOpen}
          onOpenChange={setModalOpen}
        />
      </div>
    </div>
  );
}
