import { useNavigate } from 'react-router-dom';
import { Button } from '../../app/components/ui/button';
import { Package } from 'lucide-react';

export default function NoBookingsState() {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl py-12 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <Package className="h-16 w-16 mx-auto text-slate-600 mb-4" />
      <p className="text-slate-200 text-lg mb-2 font-semibold">
        No bookings found
      </p>
      <p className="text-slate-400 mb-4">
        Purchase a service plan to get started
      </p>
      <Button onClick={() => navigate('/')}>Browse Services</Button>
    </div>
  );
}
