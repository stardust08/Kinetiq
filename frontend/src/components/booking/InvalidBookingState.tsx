import { useNavigate } from 'react-router-dom';
import { Button } from '../../app/components/ui/button';
import { Card, CardContent } from '../../app/components/ui/card';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface InvalidBookingStateProps {
  message?: string;
  reason?: 'expired' | 'cancelled' | 'invalid_status' | 'not_found' | 'unknown';
  bookingId?: string;
  onRetry?: () => void;
}

export default function InvalidBookingState({
  message,
  reason = 'unknown',
  bookingId,
  onRetry,
}: InvalidBookingStateProps) {
  const navigate = useNavigate();

  const getDefaultMessage = () => {
    switch (reason) {
      case 'expired':
        return 'This booking has expired';
      case 'cancelled':
        return 'This booking has been cancelled';
      case 'invalid_status':
        return 'This booking is not available for screening';
      case 'not_found':
        return 'Booking not found';
      default:
        return 'This booking cannot be used for screening';
    }
  };

  const getDescription = () => {
    switch (reason) {
      case 'expired':
        return 'The booking date has passed. Please create a new booking to continue.';
      case 'cancelled':
        return 'This booking was cancelled and cannot be used for assessments.';
      case 'invalid_status':
        return 'Only confirmed or completed bookings can be used for screening assessments.';
      case 'not_found':
        return 'The booking you are trying to access does not exist or you do not have permission to view it.';
      default:
        return 'Please select a different booking or create a new one.';
    }
  };

  return (
    <Card>
      <CardContent className="py-12 text-center">
        <AlertCircle className="h-16 w-16 mx-auto text-orange-400 mb-4" />
        <p className="text-gray-500 text-lg mb-2 font-semibold">
          {message || getDefaultMessage()}
        </p>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          {getDescription()}
        </p>

        {bookingId && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-6 max-w-md mx-auto">
            <p className="text-xs text-gray-500">Booking ID</p>
            <p className="text-sm font-mono text-gray-700 break-all">{bookingId}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}
          <Button onClick={() => navigate('/bookings')}>
            <Home className="h-4 w-4 mr-2" />
            View My Bookings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
