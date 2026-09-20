import { Booking } from '../../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../app/components/ui/dialog';
import { Badge } from '../../app/components/ui/badge';
import { Separator } from '../../app/components/ui/separator';
import { Calendar, CreditCard, Package, User, Clock } from 'lucide-react';

interface BookingDetailsModalProps {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SECTION_STYLE = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "0.75rem",
  padding: "1rem",
};

const SEP_STYLE = { background: "rgba(255,255,255,0.08)" };

export default function BookingDetailsModal({
  booking,
  open,
  onOpenChange,
}: BookingDetailsModalProps) {
  if (!booking) return null;

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
      case 'COMPLETED':
        return 'default';
      case 'CANCELLED':
      case 'FAILED':
        return 'destructive';
      case 'PARTIAL':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-white">Booking Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Booking ID and Status */}
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-500 mb-1">Booking ID</p>
              <p className="font-mono text-sm font-medium text-slate-300">{booking.id}</p>
            </div>
            <div className="flex gap-2">
              <Badge variant={getStatusBadgeVariant(booking.status)}>
                {booking.status}
              </Badge>
              {booking.payment && (
                <Badge variant={getStatusBadgeVariant(booking.payment.status)}>
                  {booking.payment.status}
                </Badge>
              )}
            </div>
          </div>

          <Separator style={SEP_STYLE} className="bg-transparent" />

          {/* Service Information */}
          {booking.service && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-5 w-5 text-[#2F86C7]" />
                <h3 className="font-semibold text-white">Service Information</h3>
              </div>
              <div style={SECTION_STYLE} className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Service Name</p>
                  <p className="font-medium text-white">{booking.service.name}</p>
                </div>
                {booking.service.description && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Description</p>
                    <p className="text-sm text-slate-300">{booking.service.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  {booking.service.duration && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Duration</p>
                      <p className="text-sm font-medium text-white">{booking.service.duration}</p>
                    </div>
                  )}
                  {booking.service.serviceType && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Type</p>
                      <p className="text-sm font-medium text-white">{booking.service.serviceType}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Separator style={SEP_STYLE} className="bg-transparent" />

          {/* Booking Time */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-5 w-5 text-[#2F86C7]" />
              <h3 className="font-semibold text-white">Scheduled Time</h3>
            </div>
            <div style={SECTION_STYLE}>
              <p className="font-medium text-white">
                {/*
                  `time` is null for draft bookings synthesised from the cart. This
                  dereferenced it unguarded, so opening the details of a draft threw
                  "booking.time.replace is not a function" and took the page down with it.
                  BookingCard already guards the same field; this copy did not.
                */}
                {booking.time ? new Date(booking.time.replace('Z', '').replace(/[+-]\d{2}:\d{2}$/, '')).toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }) : 'Not scheduled yet'}
              </p>
            </div>
          </div>

          <Separator style={SEP_STYLE} className="bg-transparent" />

          {/* Payment Information */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-5 w-5 text-[#2F86C7]" />
              <h3 className="font-semibold text-white">Payment Information</h3>
            </div>
            <div style={SECTION_STYLE} className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Amount</span>
                <span className="font-semibold text-white">₹{booking.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Paid Amount</span>
                <span className="font-semibold text-emerald-400">
                  ₹{booking.paidAmount.toFixed(2)}
                </span>
              </div>
              {booking.remainingAmount > 0 && (
                <div className="flex justify-between pt-2"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="text-slate-400 font-medium">Remaining Amount</span>
                  <span className="font-semibold text-orange-400">
                    ₹{booking.remainingAmount.toFixed(2)}
                  </span>
                </div>
              )}
              {booking.payment && (
                <>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Payment ID</span>
                      <span className="font-mono text-xs text-slate-400">{booking.payment.id}</span>
                    </div>
                    {booking.payment.paymentMethod && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Payment Method</span>
                        <span className="font-medium text-slate-300">{booking.payment.paymentMethod}</span>
                      </div>
                    )}
                    {booking.payment.transactionId && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Transaction ID</span>
                        <span className="font-mono text-xs text-slate-400">{booking.payment.transactionId}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Booking Description */}
          {booking.description && (
            <>
              <Separator style={SEP_STYLE} className="bg-transparent" />
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-5 w-5 text-[#2F86C7]" />
                  <h3 className="font-semibold text-white">Additional Notes</h3>
                </div>
                <div style={SECTION_STYLE}>
                  <p className="text-sm text-slate-300">{booking.description}</p>
                </div>
              </div>
            </>
          )}

          <Separator style={SEP_STYLE} className="bg-transparent" />

          {/* Timestamps */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-[#2F86C7]" />
              <h3 className="font-semibold text-white">Timeline</h3>
            </div>
            <div style={SECTION_STYLE} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Booking Created</span>
                <span className="font-medium text-slate-300">
                  {new Date(booking.createdAt).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {booking.payment?.completedAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Payment Completed</span>
                  <span className="font-medium text-slate-300">
                    {new Date(booking.payment.completedAt).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
