import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Neural grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(47,134,199,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(47,134,199,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }}
      />

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-[120px] bg-[#2F86C7]/8 pointer-events-none" />

      {/* Watermark */}
      <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none overflow-hidden">
        <span className="text-[30vw] font-black tracking-tighter text-white/[0.018] uppercase">404</span>
      </div>

      <div className="relative z-10 text-center px-6">
        {/* Label */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span className="text-xs font-bold uppercase tracking-widest text-red-400">Page Not Found</span>
        </div>

        <h1 className="text-8xl md:text-9xl font-black text-white leading-none mb-4"
          style={{ textShadow: "0 0 80px rgba(47,134,199,0.3)" }}>
          404
        </h1>

        <p className="text-slate-400 text-lg mb-10 max-w-sm mx-auto leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-semibold text-[#030712] bg-white hover:bg-slate-100 transition-all duration-300 hover:shadow-[0_8px_28px_rgba(255,255,255,0.14)] hover:scale-105"
        >
          Go Back Home
        </Link>
      </div>
    </div>
  );
}
