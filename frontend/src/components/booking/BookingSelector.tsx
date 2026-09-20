import { Booking } from '../../types';
import { isScreenable, screenableBookings } from '../../lib/screenableBooking';
import { Card, CardContent } from '../../app/components/ui/card';
import { Button } from '../../app/components/ui/button';
import { Badge } from '../../app/components/ui/badge';
import { Calendar, CheckCircle2, Package } from 'lucide-react';
import ScreeningCountBadge from './ScreeningCountBadge';

interface BookingSelectorProps {
  bookings: Booking[];
  selectedBookingId?: string;
  onSelectBooking: (bookingId: string) => void;
  disabled?: boolean;
}

export default function BookingSelector({
  bookings,
  selectedBookingId,
  onSelectBooking,
  disabled = false,
}: BookingSelectorProps) {
  // Filter bookings with remaining counts > 0
  // Screenings remaining is not enough: the backend also refuses a cancelled
  // booking, so offering one here only produces a failure at start.
  const validBookings = screenableBookings(bookings);

  // No valid bookings state
  if (validBookings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg mb-2 font-semibold">
            No Available Screening Assessments
          </p>
          <p className="text-gray-600 mb-4">
            You don't have any bookings with remaining screening counts. Purchase a service plan to get started.
          </p>
          <Button onClick={() => window.location.href = '/'}>
            Browse Services
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {validBookings.map((booking) => {
          const isSelected = selectedBookingId === booking.id;
          
          return (
            <Card
              key={booking.id}
              className={`cursor-pointer transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{
                background: isSelected ? "rgba(47,134,199,0.08)" : "rgba(255,255,255,0.03)",
                border: isSelected ? "2px solid rgba(47,134,199,0.5)" : "1px solid rgba(255,255,255,0.08)",
                boxShadow: isSelected ? "0 0 20px rgba(47,134,199,0.15)" : "none",
              }}
              onClick={() => !disabled && onSelectBooking(booking.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    {/* Service Name and Status */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-base mb-1 text-slate-100">
                          {booking.service?.name || 'Service'}
                        </h4>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="text-xs">
                            {booking.status}
                          </Badge>
                          {isSelected && (
                            <Badge className="text-xs bg-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Selected
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Screening Count Badge */}
                    <ScreeningCountBadge
                      totalCount={booking.totalScreeningCount}
                      usedCount={booking.usedScreeningCount}
                      remainingCount={booking.remainingScreeningCount}
                      showProgress={true}
                      size="sm"
                    />

                    {/* Booking Details */}
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {/* `time` is null for draft bookings. new Date(null) silently yields
                            1 Jan 1970, so an unguarded call renders a wrong date as fact. */}
                        Booked on {booking.time ? new Date(booking.time).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        }) : 'Not scheduled yet'}
                      </span>
                    </div>
                  </div>

                  {/* Select Button */}
                  <div className="flex-shrink-0">
                    <Button
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!disabled) {
                          onSelectBooking(booking.id);
                        }
                      }}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-4 p-3 rounded-lg" style={{ background: "rgba(47,134,199,0.07)", border: "1px solid rgba(47,134,199,0.2)" }}>
        <p className="text-sm text-slate-300">
          <span className="font-semibold">Note:</span> One screening count will be deducted from the selected booking upon successful completion of the assessment.
        </p>
      </div>
    </div>
  );
}
