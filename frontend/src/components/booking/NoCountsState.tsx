import { useNavigate } from 'react-router-dom';
import { Button } from '../../app/components/ui/button';
import { Activity, ShoppingCart } from 'lucide-react';
import type { Booking } from '../../types';

interface NoCountsStateProps {
  bookings?: Booking[];
}

export default function NoCountsState({ bookings = [] }: NoCountsStateProps) {
  const navigate = useNavigate();

  const totalUsedCounts = bookings.reduce(
    (sum, booking) => sum + booking.usedScreeningCount,
    0
  );

  const totalAllocatedCounts = bookings.reduce(
    (sum, booking) => sum + booking.totalScreeningCount,
    0
  );

  return (
    <div className="rounded-2xl py-12 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <Activity className="h-16 w-16 mx-auto text-slate-600 mb-4" />
      <p className="text-slate-200 text-lg mb-2 font-semibold">
        All screening counts used
      </p>
      <p className="text-slate-400 mb-4">
        You've used all {totalUsedCounts} of your allocated AI screening assessments
      </p>

      {totalAllocatedCounts > 0 && (
        <div className="rounded-lg p-4 mb-6 max-w-md mx-auto" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Total allocated:</span>
            <span className="font-semibold text-slate-200">{totalAllocatedCounts}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-slate-400">Used:</span>
            <span className="font-semibold text-slate-200">{totalUsedCounts}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-slate-400">Remaining:</span>
            <span className="font-semibold text-red-400">0</span>
          </div>
        </div>
      )}

      <Button onClick={() => navigate('/')}>
        <ShoppingCart className="h-4 w-4 mr-2" />
        Purchase New Service
      </Button>
    </div>
  );
}
