import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../app/components/ui/dropdown-menu';
import { User, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { LoginModal } from '../auth/LoginModal';
import { Button } from '../../app/components/ui/button';

export const AuthButton: React.FC = () => {
  const { user, isAuthenticated } = useAuthStore();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <>
        <button
          onClick={() => setShowLoginModal(true)}
          className="relative px-5 py-2 rounded-xl text-sm font-semibold text-slate-300 border border-white/10 hover:border-[#2F86C7]/40 hover:text-white hover:bg-white/[0.06] transition-all duration-300"
        >
          Login
        </button>
        <LoginModal 
          open={showLoginModal} 
          onOpenChange={setShowLoginModal} 
        />
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button 
          className="flex items-center gap-2 p-1 rounded-full transition-colors focus:outline-none"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div className="w-9 h-9 bg-[#2F86C7] rounded-full flex items-center justify-center shadow-md">
            <User className="w-5 h-5 text-white" />
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 bg-[#0f172a] border border-white/10 shadow-2xl"
        style={{ backdropFilter: "blur(16px)" }}
        sideOffset={8}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <DropdownMenuLabel
          className="cursor-pointer hover:bg-white/[0.06] text-slate-300 hover:text-white transition-colors rounded-sm"
          onClick={() => navigate('/profile')}
        >
          My Account
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/8" />
        <DropdownMenuItem
          className="cursor-pointer hover:bg-white/[0.06] text-slate-300 hover:text-white transition-colors focus:bg-white/[0.06] focus:text-white"
          onClick={() => navigate('/notifications')}
        >
          Notifications
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-white/8" />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="cursor-pointer text-red-400 hover:bg-red-500/10 hover:text-red-300 focus:bg-red-500/10 focus:text-red-300 transition-colors"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
