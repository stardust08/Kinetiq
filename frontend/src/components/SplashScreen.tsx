import React, { useEffect } from 'react';
import logo from '../assets/neura-logo.png';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  useEffect(() => {
    // Complete splash screen after 2.5 seconds
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => {
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center z-[9999] overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0">
        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-500/20 rounded-full blur-3xl animate-float-delayed" />

        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Logo container with multiple animation layers */}
      <div className="relative z-10">
        {/* Outer glow ring */}
        <div className="absolute inset-0 -m-20">
          <div className="w-full h-full rounded-full bg-gradient-to-r from-blue-500/30 to-sky-500/30 blur-2xl animate-pulse-slow" />
        </div>

        {/* Rotating ring */}
        <div className="absolute inset-0 -m-16 animate-spin-slow">
          <div className="w-full h-full rounded-full border-2 border-blue-500/20 border-t-blue-500/60 border-r-sky-500/60" />
        </div>

        {/* Inner glow */}
        <div className="absolute inset-0 -m-12">
          <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-400/20 to-sky-400/20 blur-xl animate-pulse-medium" />
        </div>

        {/* Logo with elegant animations */}
        <div className="relative animate-logo-entrance">
          <div className="relative group">
            {/* Shimmer effect overlay */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" style={{
                transform: 'translateX(-100%)'
              }} />
            </div>

            {/* Logo */}
            <img
              src={logo}
              alt="Neura AI"
              className="h-32 w-auto relative z-10 drop-shadow-2xl"
            />
          </div>
        </div>

        {/* Particle effects */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-blue-400 rounded-full animate-particle"
              style={{
                top: '50%',
                left: '50%',
                animationDelay: `${i * 0.2}s`,
                transform: `rotate(${i * 45}deg) translateY(-60px)`
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes logo-entrance {
          0% {
            opacity: 0;
            transform: scale(0.5) rotateY(-180deg);
            filter: blur(10px);
          }
          50% {
            opacity: 1;
            transform: scale(1.1) rotateY(0deg);
            filter: blur(0px);
          }
          100% {
            opacity: 1;
            transform: scale(1) rotateY(0deg);
            filter: blur(0px);
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -30px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        @keyframes float-delayed {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(-30px, 30px) scale(0.9);
          }
          66% {
            transform: translate(20px, -20px) scale(1.1);
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.05);
          }
        }

        @keyframes pulse-medium {
          0%, 100% {
            opacity: 0.2;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(1.1);
          }
        }

        @keyframes particle {
          0% {
            opacity: 0;
            transform: rotate(var(--rotation, 0deg)) translateY(-60px) scale(0);
          }
          50% {
            opacity: 1;
            transform: rotate(var(--rotation, 0deg)) translateY(-100px) scale(1);
          }
          100% {
            opacity: 0;
            transform: rotate(var(--rotation, 0deg)) translateY(-140px) scale(0);
          }
        }

        .animate-logo-entrance {
          animation: logo-entrance 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .animate-shimmer {
          animation: shimmer 2s ease-in-out infinite;
        }

        .animate-float {
          animation: float 8s ease-in-out infinite;
        }

        .animate-float-delayed {
          animation: float-delayed 8s ease-in-out infinite;
        }

        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }

        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }

        .animate-pulse-medium {
          animation: pulse-medium 2s ease-in-out infinite;
        }

        .animate-particle {
          animation: particle 2s ease-out infinite;
        }
      `}</style>
    </div>
  );
};
