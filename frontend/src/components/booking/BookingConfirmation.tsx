import { useNavigate } from 'react-router-dom';
import { Button } from '../../app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../app/components/ui/card';
import { Separator } from '../../app/components/ui/separator';
import { CheckCircle2, Download, Printer, Calendar, CreditCard, Package } from 'lucide-react';
import { Booking, Payment } from '../../types';

export interface BookingConfirmationProps {
  bookings: Booking[];
  payment: Payment;
}

export default function BookingConfirmation({ bookings, payment }: BookingConfirmationProps) {
  const navigate = useNavigate();

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Create a simple text receipt
    const receiptContent = `
BOOKING CONFIRMATION
====================

Payment ID: ${payment.id}
Transaction ID: ${payment.transactionId || 'N/A'}
Date: ${new Date(payment.createdAt).toLocaleString()}
${payment.completedAt ? `Completed: ${new Date(payment.completedAt).toLocaleString()}` : ''}

PAYMENT DETAILS
---------------
Total Amount: ₹${payment.totalAmount.toFixed(2)}
Paid Amount: ₹${payment.paidAmount.toFixed(2)}
Remaining Amount: ₹${payment.remainingAmount.toFixed(2)}
Status: ${payment.status}
${payment.paymentMethod ? `Payment Method: ${payment.paymentMethod}` : ''}

BOOKINGS
--------
${bookings.map((booking, index) => `
${index + 1}. ${booking.service?.name || 'Service'}
   Booking ID: ${booking.id}
   Scheduled: ${booking.time ? new Date(booking.time).toLocaleString() : 'Not scheduled yet'}
   Amount: ₹${booking.totalAmount.toFixed(2)}
   Status: ${booking.status}
`).join('\n')}

Thank you for your booking!
    `.trim();

    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // payment.id is null for a draft booking that has not been paid for.
    link.download = `booking-confirmation-${payment.id?.slice(0, 8) ?? 'draft'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Success Message */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="h-16 w-16 mx-auto text-green-600 mb-4" />
          <h2 className="text-3xl font-bold text-green-900 mb-2">Booking Confirmed!</h2>
          <p className="text-green-700 text-lg">
            Your booking has been successfully confirmed
          </p>
        </CardContent>
      </Card>

      {/* Booking Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Booking Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600 mb-1">Payment ID</p>
              <p className="font-medium">{payment.id ? `${payment.id.slice(0, 8)}...` : '—'}</p>
            </div>
            <div>
              <p className="text-gray-600 mb-1">Booking Date</p>
              <p className="font-medium">
                {new Date(payment.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-gray-600 mb-3 font-medium">Services Booked</p>
            <div className="space-y-3">
              {bookings.map((booking) => (
                <div key={booking.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{booking.service?.name || 'Service'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Booking ID: {booking.id.slice(0, 8)}...
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {/* `time` is null for draft bookings. new Date(null) silently yields
                          1 Jan 1970, so an unguarded call renders a wrong date as fact. */}
                      Scheduled: {booking.time ? new Date(booking.time).toLocaleString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : 'Not scheduled yet'}
                    </p>
                    <p className="text-sm text-gray-600">
                      Status: <span className="font-medium text-green-600">{booking.status}</span>
                    </p>
                    {booking.description && (
                      <p className="text-sm text-gray-600 mt-1 italic">
                        Note: {booking.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">₹{booking.totalAmount.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Receipt */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Receipt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Amount</span>
              <span className="font-medium">₹{payment.totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Paid Amount</span>
              <span className="font-medium text-green-600">₹{payment.paidAmount.toFixed(2)}</span>
            </div>
            {payment.remainingAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Remaining Amount</span>
                <span className="font-medium text-orange-600">₹{payment.remainingAmount.toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="font-semibold">Payment Status</span>
              <span className={`font-semibold ${
                payment.status === 'COMPLETED' ? 'text-green-600' :
                payment.status === 'PARTIAL' ? 'text-orange-600' :
                'text-gray-600'
              }`}>
                {payment.status}
              </span>
            </div>
            {payment.paymentMethod && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Payment Method</span>
                <span className="font-medium">{payment.paymentMethod}</span>
              </div>
            )}
            {payment.transactionId && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Transaction ID</span>
                <span className="font-mono text-xs">{payment.transactionId}</span>
              </div>
            )}
            {payment.completedAt && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Completed At</span>
                <span className="text-xs">
                  {new Date(payment.completedAt).toLocaleString('en-US', {
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

          {payment.remainingAmount > 0 && (
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-900">
                You have a remaining balance of ₹{payment.remainingAmount.toFixed(2)}. 
                You can pay this amount later from your bookings page.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          size="lg"
          className="flex-1"
          onClick={() => navigate('/bookings')}
        >
          View My Bookings
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={handleDownload}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Download Receipt
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={handlePrint}
          className="flex items-center gap-2"
        >
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Next Steps */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader>
          <CardTitle className="text-purple-900">Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-purple-900">
            <li className="flex items-start gap-2">
              <span className="font-bold mt-0.5">•</span>
              <span>You will receive a confirmation email with your booking details</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold mt-0.5">•</span>
              <span>A clinician will be assigned to your booking shortly</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold mt-0.5">•</span>
              <span>You can view and manage your bookings from the "My Bookings" page</span>
            </li>
            {payment.remainingAmount > 0 && (
              <li className="flex items-start gap-2">
                <span className="font-bold mt-0.5">•</span>
                <span>Complete your remaining payment before your scheduled appointment</span>
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
