import { useState } from "react";
import { Button } from "./ui/button";
import { Activity, ClipboardList, Pointer } from "lucide-react";
import { ShoppingCart, Calendar, Menu, X, Sparkles } from "lucide-react";
import { AuthButton } from "../../components/layout/AuthButton";
import { CartDrawer } from "../../components/cart/CartDrawer";
import { useCartStore } from "../../store/cartStore";
import { useAuthStore } from "../../store/authStore";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/neura-logo.png";

export function Header() {
  const itemCount = useCartStore((state) => state.itemCount);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <header className="bg-[#030712]/85 backdrop-blur-xl border-b border-white/8 sticky top-0 z-50"
        style={{ boxShadow: "0 1px 0 rgba(47,134,199,0.15), 0 4px 24px rgba(0,0,0,0.4)" }}>
        {/* Top glow line */}
        <div className="h-px bg-gradient-to-r from-transparent via-[#2F86C7]/60 to-transparent" />

        <div className="container mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo with elegant hover effect */}
            <div
              className="flex items-center cursor-pointer group relative"
              onClick={() => navigate('/')}
            >
              {/* Glow effect on hover */}
              <div className="absolute inset-0 -m-3 bg-[#2F86C7]/0 group-hover:bg-[#2F86C7]/10 rounded-2xl transition-all duration-700 blur-2xl" />

              <div className="relative transition-all duration-700 ease-out group-hover:scale-[1.08] group-hover:drop-shadow-2xl">
                <img src={logo} alt="Neura AI" className="h-20 w-auto drop-shadow-lg" />
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              {isAuthenticated && (
                <>
                   <button
                  onClick={() => navigate('/bookings')}
                  className="relative text-slate-300 hover:text-[#2F86C7] transition-all duration-500 font-medium text-[13px] tracking-[0.15em] flex items-center gap-2.5 group py-2 uppercase cursor-pointer"
                >
                  <Calendar className="w-[15px] h-[15px] transition-all duration-500 group-hover:scale-110 group-hover:rotate-3"/>
                  <span className="relative z-10 drop-shadow-sm">My Bookings</span>
                  <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#2F86C7] group-hover:w-full transition-all duration-700 ease-out" />
                  <span className="absolute inset-0 bg-[#2F86C7]/0 group-hover:bg-[#2F86C7]/10 rounded-lg transition-all duration-500 -z-10 blur-sm" />
                </button>
                  <button
                    onClick={() => navigate('/assessments')}
                  //   className="text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-2"
                  // >
                  //   <ClipboardList className="w-4 h-4" />
                  //   Assessments
                   className="relative text-slate-300 hover:text-[#2F86C7] transition-all duration-500 font-medium text-[13px] tracking-[0.15em] flex items-center gap-2.5 group py-2 uppercase cursor-pointer"
                >
                  <ClipboardList className="w-[15px] h-[15px] transition-all duration-500 group-hover:scale-110 group-hover:rotate-3" />
                  <span className="relative z-10 drop-shadow-sm">Assessments</span>
                  <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#2F86C7] group-hover:w-full transition-all duration-700 ease-out" />
                  <span className="absolute inset-0 bg-[#2F86C7]/0 group-hover:bg-[#2F86C7]/10 rounded-lg transition-all duration-500 -z-10 blur-sm" />
                  </button>
                </>
              )}
              {/* Desktop Navigation - Elegant Typography */}
              {/* <nav className="hidden lg:flex items-center gap-10"> */}
              {/* <a
                href="#how-it-works"
                className="relative text-gray-700 hover:text-[#2F86C7] transition-all duration-500 font-medium text-[13px] tracking-[0.15em] group py-2 uppercase"
              >
                <span className="relative z-10 drop-shadow-sm">How It Works</span>
                <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#2F86C7] group-hover:w-full transition-all duration-700 ease-out" />
                <span className="absolute inset-0 bg-[#2F86C7]/0 group-hover:bg-[#2F86C7]/10 rounded-lg transition-all duration-500 -z-10 blur-sm" />
              </a>

              <a
                href="#services"
                className="relative text-gray-700 hover:text-[#2F86C7] transition-all duration-500 font-medium text-[13px] tracking-[0.15em] group py-2 uppercase"
              >
                <span className="relative z-10 drop-shadow-sm">Services</span>
                <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#2F86C7] group-hover:w-full transition-all duration-700 ease-out" />
                <span className="absolute inset-0 bg-[#2F86C7]/0 group-hover:bg-[#2F86C7]/10 rounded-lg transition-all duration-500 -z-10 blur-sm" />
              </a>

              <a
                href="#who-its-for"
                className="relative text-gray-700 hover:text-[#2F86C7] transition-all duration-500 font-medium text-[13px] tracking-[0.15em] group py-2 uppercase"
              >
                <span className="relative z-10 drop-shadow-sm">Who It's For</span>
                <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#2F86C7] group-hover:w-full transition-all duration-700 ease-out" />
                <span className="absolute inset-0 bg-[#2F86C7]/0 group-hover:bg-[#2F86C7]/10 rounded-lg transition-all duration-500 -z-10 blur-sm" />
              </a>

              {isAuthenticated && (
                <button
                  onClick={() => navigate('/bookings')}
                  className="relative text-gray-700 hover:text-[#2F86C7] transition-all duration-500 font-medium text-[13px] tracking-[0.15em] flex items-center gap-2.5 group py-2 uppercase"
                >
                  <Calendar className="w-[15px] h-[15px] transition-all duration-500 group-hover:scale-110 group-hover:rotate-3" />
                  <span className="relative z-10 drop-shadow-sm">My Bookings</span>
                  <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-[#2F86C7] group-hover:w-full transition-all duration-700 ease-out" />
                  <span className="absolute inset-0 bg-[#2F86C7]/0 group-hover:bg-[#2F86C7]/10 rounded-lg transition-all duration-500 -z-10 blur-sm" />
                </button>
              )} */}
            </nav>

            {/* Right Side Actions - Premium Styling */}
            <div className="flex items-center gap-3">
              {/* Cart Button with elegant badge */}
              <button
                className="relative p-3 hover:bg-[#2F86C7]/15 rounded-xl transition-all duration-300 group border border-transparent hover:border-[#2F86C7]/20"
                onClick={() => setCartOpen(true)}
                aria-label="Shopping cart"
              >
                <ShoppingCart className="w-5 h-5 text-slate-400 group-hover:text-[#2F86C7] transition-all duration-300 group-hover:scale-110" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#2F86C7] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg ring-2 ring-white animate-pulse-subtle">
                    {itemCount}
                  </span>
                )}
              </button>

              {/* Auth Button */}
              <div className="hidden md:block">
                <AuthButton />
              </div>

              {/* Get Started Button - Premium Design */}
              <Button
                className="hidden md:flex relative overflow-hidden text-white transition-all duration-500 px-8 py-3 rounded-xl font-semibold tracking-[0.15em] uppercase text-[12px] group hover:scale-[1.03]"
                style={{ background: "linear-gradient(135deg, #2F86C7, #1E6FA8)", boxShadow: "0 4px_24px rgba(47,134,199,0.45), 0 0 0 1px rgba(47,134,199,0.3)" }}
                onClick={() => navigate('/checkout')}
              >
                <span className="relative z-10 flex items-center gap-2.5">
                  <Sparkles className="w-[15px] h-[15px] transition-all duration-500 group-hover:rotate-12 group-hover:scale-110" />
                  <span>Get Started</span>
                </span>
              </Button>

              {/* Mobile Menu Button */}
              <button
                className="lg:hidden p-3 hover:bg-white/8 rounded-xl transition-all duration-300 border border-transparent hover:border-white/10"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6 text-slate-300" />
                ) : (
                  <Menu className="w-6 h-6 text-slate-300" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden py-6 border-t border-white/8 animate-slide-down">
              <nav className="flex flex-col gap-2">
                {isAuthenticated && (
                  <button
                    onClick={() => {
                      navigate('/bookings');
                      setMobileMenuOpen(false);
                    }}
                    className="text-slate-300 hover:text-[#2F86C7] hover:bg-[#2F86C7]/10 transition-all duration-500 font-medium flex items-center gap-2.5 py-3.5 px-5 rounded-xl text-left uppercase text-[12px] tracking-[0.12em]"
                  >
                    <Calendar className="w-[15px] h-[15px]" />
                    My Bookings
                  </button>
                )}

                {/* Mobile Actions */}
                <div className="pt-4 mt-4 border-t border-white/8 flex flex-col gap-3">
                  <AuthButton />
                  <Button
                    className="w-full relative overflow-hidden text-white transition-all duration-500 py-3.5 rounded-xl font-semibold tracking-[0.15em] uppercase text-[12px] group"
                    style={{ background: "linear-gradient(135deg, #2F86C7, #1E6FA8)", boxShadow: "0 4px 20px rgba(47,134,199,0.4)" }}
                    onClick={() => {
                      navigate('/checkout');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2.5">
                      <Sparkles className="w-[15px] h-[15px]" />
                      <span>Get Started</span>
                    </span>
                  </Button>
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />

      <style>{`
        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse-subtle {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
        
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }

        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}
