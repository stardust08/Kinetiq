import { useNavigate } from 'react-router-dom';
import { Booking, BookingStatus, PaymentStatus } from '../../types';
import { Button } from '../../app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../app/components/ui/card';
import { Badge } from '../../app/components/ui/badge';
import { Separator } from '../../app/components/ui/separator';
import { Loader2, Calendar, CreditCard, AlertCircle, Eye, Activity, History, XCircle, ShoppingCart } from 'lucide-react';
import ScreeningCountBadge from './ScreeningCountBadge';

interface BookingCardProps {
  booking: Booking;
  onPayRemaining?: (paymentId: string, bookingId: string) => void;
  payingRemaining?: boolean;
  onViewDetails?: (booking: Booking) => void;
  onStartAssessment?: (bookingId: string) => void;
  onViewHistory?: (bookingId: string) => void;
  onCancelBooking?: (bookingId: string) => void;
  cancellingBooking?: boolean;
  onCompletePayment?: (paymentId: string, bookingId: string) => void;
  completingPayment?: boolean;
}

export default function BookingCard({
  booking,
  onPayRemaining,
  payingRemaining = false,
  onViewDetails,
  onStartAssessment,
  onViewHistory,
  onCancelBooking,
  cancellingBooking = false,
  onCompletePayment,
  completingPayment = false,
}: BookingCardProps) {
  const navigate = useNavigate();
  const isDraft = booking.isDraft === true;
  const getStatusBadgeVariant = (status: BookingStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return 'default';
      case 'COMPLETED':
        return 'secondary';
      case 'CANCELLED':
        return 'destructive';
      case 'PENDING':
      default:
        return 'outline';
    }
  };

  const getPaymentStatusBadgeVariant = (status: PaymentStatus) => {
    switch (status) {
      case 'COMPLETED':
        return 'default';
      case 'PARTIAL':
        return 'secondary';
      case 'FAILED':
        return 'destructive';
      case 'PENDING':
      default:
        return 'outline';
    }
  };

  const getPaymentStatusLabel = (status: PaymentStatus) => {
    if (status === 'PENDING') return 'NOT PAID';
    return `Payment: ${status}`;
  };

  return (
    /* h-full + flex-col → all cards in the same grid row stretch to equal height */
    <Card className="hover:shadow-lg transition-shadow duration-200 flex flex-col h-full" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <CardHeader className="pb-4 flex-shrink-0">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-xl font-semibold mb-3 text-slate-100 leading-snug line-clamp-2">
              {booking.service?.name || 'Service'}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant={getStatusBadgeVariant(booking.status)} className="font-medium">
                {booking.status}
              </Badge>
              {booking.payment && (
                <Badge variant={getPaymentStatusBadgeVariant(booking.payment.status)} className="font-medium">
                  {getPaymentStatusLabel(booking.payment.status)}
                </Badge>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs font-medium text-slate-500 mb-1">
              {isDraft ? 'Cart Item' : 'Booking ID'}
            </p>
            {isDraft ? (
              <Badge variant="outline" className="text-xs font-medium text-yellow-400 border-yellow-500/40 bg-yellow-500/10">
                In Cart
              </Badge>
            ) : (
              <p className="font-mono text-sm text-slate-400">{booking.id.slice(0, 8)}...</p>
            )}
          </div>
        </div>
      </CardHeader>

      {/*
        flex-1 flex flex-col → CardContent fills remaining card height.
        Sections sit at the top; footer is pinned to the bottom via mt-auto.
      */}
      <CardContent className="pt-0 flex flex-col flex-1">

        {/* ── Variable-height sections ── */}
        <div className="space-y-4">

          {/* Screening Count Badge */}
          {booking.totalScreeningCount > 0 && (
            <div className="animate-in fade-in duration-300">
              <ScreeningCountBadge
                totalCount={booking.totalScreeningCount}
                usedCount={booking.usedScreeningCount}
                remainingCount={booking.remainingScreeningCount}
                showProgress={true}
                size="md"
              />
            </div>
          )}

          {/* Scheduled time + payment details — equal-height info boxes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Calendar className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-400 mb-1">Scheduled</p>
                {booking.time ? (
                  <p className="font-medium text-slate-200 text-xs leading-relaxed">
                    {new Date(booking.time.replace('Z', '').replace(/[+-]\d{2}:\d{2}$/, '')).toLocaleString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                ) : (
                  <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium italic leading-relaxed">
                    Not scheduled yet
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <CreditCard className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-400 mb-1">Payment</p>
                <p className="font-semibold text-slate-200 text-xs">
                  ₹{booking.totalAmount.toFixed(2)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Paid: ₹{booking.paidAmount.toFixed(2)}
                </p>
                {booking.remainingAmount > 0 && (
                  <p className="text-xs font-semibold text-orange-600 dark:text-orange-500 mt-0.5">
                    Due: ₹{booking.remainingAmount.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {booking.description && (
            <div className="p-3 rounded-lg" style={{ background: "rgba(47,134,199,0.06)", border: "1px solid rgba(47,134,199,0.15)" }}>
              <p className="text-xs font-medium text-[#60b5e8] mb-1">Description</p>
              <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">{booking.description}</p>
            </div>
          )}

          {/* Service Details */}
          {booking.service && (booking.service.duration || booking.service.serviceType) && (
            <div className="p-3 rounded-lg" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
              <p className="text-xs font-medium text-violet-400 mb-2">Service Details</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {booking.service.duration && (
                  <div>
                    <span className="text-slate-500">Duration: </span>
                    <span className="font-medium text-slate-200">{booking.service.duration}</span>
                  </div>
                )}
                {booking.service.serviceType && (
                  <div>
                    <span className="text-slate-500">Type: </span>
                    <span className="font-medium text-slate-200">{booking.service.serviceType}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pay Remaining */}
          {booking.remainingAmount > 0 && booking.payment?.status === 'PARTIAL' && onPayRemaining && (
            <div className="flex flex-col gap-2 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">Payment Pending</p>
              </div>
              <p className="text-xs text-orange-700 dark:text-orange-300">
                ₹{booking.remainingAmount.toFixed(2)} remaining to pay
              </p>
              <Button
                onClick={() => booking.paymentId && onPayRemaining(booking.paymentId, booking.id)}
                disabled={payingRemaining || !booking.paymentId}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium"
                size="sm"
              >
                {payingRemaining ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Pay Remaining'}
              </Button>
            </div>
          )}

          {/* PENDING action block — stacked column layout */}
          {booking.status === 'PENDING' && (
            isDraft ? (
              /* Draft: in cart, no payment yet → go to checkout */
              <div className="flex flex-col gap-2.5 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
                  <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">In Cart — Payment Pending</p>
                </div>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Schedule a time and complete payment to confirm
                </p>
                <Button
                  onClick={() => navigate('/checkout')}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium"
                  size="sm"
                >
                  Schedule &amp; Pay
                </Button>
              </div>
            ) : onCompletePayment && booking.paymentId ? (
              /* Real PENDING: payment gateway was closed → retry */
              <div className="flex flex-col gap-2.5 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
                  <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">Payment Pending</p>
                </div>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Complete payment to confirm your booking
                </p>
                <Button
                  onClick={() => onCompletePayment(booking.paymentId!, booking.id)}
                  disabled={completingPayment}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium"
                  size="sm"
                >
                  {completingPayment ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Complete Payment'}
                </Button>
              </div>
            ) : null
          )}

          {/* Posture Analysis Actions — real bookings only */}
          {!isDraft && booking.totalScreeningCount > 0 && (onStartAssessment || onViewHistory) && (
            <div className="flex flex-col sm:flex-row gap-2">
              {onStartAssessment && (
                <Button
                  onClick={() => onStartAssessment(booking.id)}
                  disabled={booking.remainingScreeningCount === 0 || booking.status === 'CANCELLED'}
                  className="flex-1 font-medium"
                  variant={booking.remainingScreeningCount > 0 && booking.status !== 'CANCELLED' ? 'default' : 'outline'}
                  size="sm"
                >
                  <Activity className="mr-2 h-4 w-4" />
                  {booking.status === 'CANCELLED' ? 'Cancelled' : booking.remainingScreeningCount > 0 ? 'Posture Analysis' : 'No Assessments Left'}
                </Button>
              )}
              {onViewHistory && booking.usedScreeningCount > 0 && (
                <Button
                  onClick={() => onViewHistory(booking.id)}
                  variant="outline"
                  className="flex-1 font-medium"
                  size="sm"
                  disabled={booking.status === 'CANCELLED'}
                >
                  <History className="mr-2 h-4 w-4" />
                  History ({booking.usedScreeningCount})
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Footer — pinned to card bottom via mt-auto ── */}
        <div className="mt-auto pt-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-medium text-slate-500">
            {new Date(booking.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
          <div className="flex items-center gap-1">
            {booking.status === 'CONFIRMED' && onCancelBooking && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCancelBooking(booking.id)}
                disabled={cancellingBooking}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium h-8 px-2 text-xs"
              >
                {cancellingBooking
                  ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  : <XCircle className="mr-1 h-3.5 w-3.5" />}
                Cancel
              </Button>
            )}
            {onViewDetails && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewDetails(booking)}
                className="text-primary hover:text-primary/90 font-medium h-8 px-2 text-xs"
              >
                <Eye className="mr-1 h-3.5 w-3.5" />
                Details
              </Button>
            )}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
