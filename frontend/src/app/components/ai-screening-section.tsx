import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

// ─── SVG Illustrations (unchanged) ───────────────────────────────────────────

const PostureSVG = () => (
  <svg viewBox="0 0 120 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="11" fill="#2F86C7" opacity="0.9" />
    <line x1="60" y1="29" x2="60" y2="38" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round" />
    <rect x="51" y="38" width="18" height="30" rx="8" fill="#2F86C7" opacity="0.85" />
    <rect x="47" y="66" width="26" height="10" rx="5" fill="#1E6FA8" opacity="0.8" />
    <line x1="51" y1="44" x2="36" y2="58" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round" />
    <line x1="36" y1="58" x2="30" y2="72" stroke="#2F86C7" strokeWidth="4" strokeLinecap="round" />
    <line x1="69" y1="44" x2="84" y2="58" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round" />
    <line x1="84" y1="58" x2="90" y2="72" stroke="#2F86C7" strokeWidth="4" strokeLinecap="round" />
    <line x1="54" y1="76" x2="50" y2="108" stroke="#1E6FA8" strokeWidth="7" strokeLinecap="round" />
    <line x1="50" y1="108" x2="48" y2="136" stroke="#1E6FA8" strokeWidth="7" strokeLinecap="round" />
    <line x1="66" y1="76" x2="70" y2="108" stroke="#1E6FA8" strokeWidth="7" strokeLinecap="round" />
    <line x1="70" y1="108" x2="72" y2="136" stroke="#1E6FA8" strokeWidth="7" strokeLinecap="round" />
    <line x1="60" y1="4" x2="60" y2="148" stroke="#60B5E8" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" opacity="0.6" />
    <line x1="36" y1="44" x2="84" y2="44" stroke="#93C5FD" strokeWidth="1" strokeDasharray="3 2" opacity="0.5" />
    <line x1="40" y1="70" x2="80" y2="70" stroke="#93C5FD" strokeWidth="1" strokeDasharray="3 2" opacity="0.5" />
    <path d="M48 52 Q54 46 60 50" stroke="#67E8F9" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.8" />
    <text x="60" y="155" textAnchor="middle" fontSize="9" fill="#60B5E8" fontWeight="700">Posture Analysis</text>
  </svg>
);

const GaitSVG = () => (
  <svg viewBox="0 0 140 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="68" cy="18" r="11" fill="#0D9488" opacity="0.9" />
    <rect x="60" y="30" width="17" height="28" rx="8" fill="#0D9488" opacity="0.85" transform="rotate(4 68 44)" />
    <rect x="55" y="56" width="26" height="10" rx="5" fill="#0F766E" opacity="0.8" />
    <line x1="61" y1="38" x2="42" y2="52" stroke="#0D9488" strokeWidth="5" strokeLinecap="round" />
    <line x1="42" y1="52" x2="34" y2="66" stroke="#0D9488" strokeWidth="4" strokeLinecap="round" />
    <line x1="76" y1="38" x2="94" y2="50" stroke="#0F766E" strokeWidth="5" strokeLinecap="round" />
    <line x1="94" y1="50" x2="102" y2="36" stroke="#0F766E" strokeWidth="4" strokeLinecap="round" />
    <line x1="60" y1="66" x2="50" y2="96" stroke="#0F766E" strokeWidth="7" strokeLinecap="round" />
    <line x1="50" y1="96" x2="42" y2="126" stroke="#0F766E" strokeWidth="7" strokeLinecap="round" />
    <line x1="74" y1="66" x2="88" y2="90" stroke="#0D9488" strokeWidth="7" strokeLinecap="round" />
    <line x1="88" y1="90" x2="96" y2="76" stroke="#0D9488" strokeWidth="6" strokeLinecap="round" />
    <line x1="16" y1="130" x2="124" y2="130" stroke="#5EEAD4" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" opacity="0.6" />
    <ellipse cx="42" cy="131" rx="7" ry="3" fill="#5EEAD4" opacity="0.5" />
    <ellipse cx="68" cy="131" rx="7" ry="3" fill="#5EEAD4" opacity="0.3" />
    <ellipse cx="94" cy="131" rx="7" ry="3" fill="#5EEAD4" opacity="0.5" />
    <path d="M42 118 L42 126" stroke="#34D399" strokeWidth="2" strokeLinecap="round" />
    <polygon points="38,118 42,110 46,118" fill="#34D399" opacity="0.7" />
    <text x="70" y="150" textAnchor="middle" fontSize="9" fill="#34D399" fontWeight="700">Gait Analysis</text>
  </svg>
);

// ─── Card config ──────────────────────────────────────────────────────────────
const CARDS = [
  {
    type: "posture" as const,
    title: "Posture Analysis",
    subtitle: "Static alignment across 4 views — standing still",
    stats: [
      { icon: "📐", label: "33 metrics" },
      { icon: "📷", label: "4 views" },
      { icon: "⏱", label: "~40 sec" },
    ],
    accentColor: "#2F86C7",
    glowColor: "rgba(47,134,199,0.35)",
    borderColor: "rgba(47,134,199,0.3)",
    bgFrom: "rgba(47,134,199,0.06)",
    bgTo: "rgba(14,165,233,0.03)",
    badgeColor: "rgba(47,134,199,0.15)",
    badgeText: "#60B5E8",
    btnFrom: "#2F86C7",
    btnTo: "#1E6FA8",
    route: "/posture-analysis",
    tag: "New",
  },
  {
    type: "gait" as const,
    title: "Gait Analysis",
    subtitle: "Dynamic walking analysis across 3 views — in motion",
    stats: [
      { icon: "🦾", label: "32 metrics" },
      { icon: "📷", label: "3 views" },
      { icon: "⏱", label: "~15 sec" },
    ],
    accentColor: "#0D9488",
    glowColor: "rgba(13,148,136,0.35)",
    borderColor: "rgba(13,148,136,0.3)",
    bgFrom: "rgba(13,148,136,0.06)",
    bgTo: "rgba(16,185,129,0.03)",
    badgeColor: "rgba(13,148,136,0.15)",
    badgeText: "#34D399",
    btnFrom: "#0D9488",
    btnTo: "#0F766E",
    route: "/gait-analysis",
    tag: "New",
  },
];

// ─── AssessmentCard ───────────────────────────────────────────────────────────

function AssessmentCard({
  card,
  isAuthenticated,
  onStart,
}: {
  card: typeof CARDS[0];
  isAuthenticated: boolean;
  onStart: (route: string) => void;
}) {
  return (
    <div
      className="ai-card relative rounded-2xl p-6 flex flex-col gap-4 overflow-hidden cursor-pointer"
      style={{
        background: `linear-gradient(145deg, ${card.bgFrom} 0%, ${card.bgTo} 100%)`,
        border: `1px solid ${card.borderColor}`,
        boxShadow: `0 0 0 1px ${card.borderColor}, inset 0 1px 0 rgba(255,255,255,0.05)`,
        backdropFilter: "blur(12px)",
        transformStyle: "preserve-3d",
        perspective: "800px",
      }}
      onClick={() => onStart(card.route)}
    >
      {/* Top glow line */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${card.accentColor}80, transparent)` }}
      />

      {/* Tag */}
      <span
        className="absolute top-4 right-4 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
        style={{ background: card.badgeColor, color: card.badgeText, border: `1px solid ${card.borderColor}` }}
      >
        {card.tag}
      </span>

      {/* SVG illustration */}
      <div
        className="relative w-28 h-32 mx-auto mt-2"
        style={{
          filter: "drop-shadow(0 0 20px " + card.glowColor + ")",
          transform: "translateZ(20px)",
        }}
      >
        {/* Glow ring behind SVG */}
        <div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: card.bgFrom, transform: "scale(0.8)" }}
        />
        <div className="relative w-full h-full">
          {card.type === "posture" ? <PostureSVG /> : <GaitSVG />}
        </div>
      </div>

      {/* Title + subtitle */}
      <div className="text-center">
        <h3 className="text-base font-bold text-white mb-1" style={{ textShadow: `0 0 20px ${card.glowColor}` }}>
          {card.title}
        </h3>
        <p className="text-xs text-slate-400 leading-snug">{card.subtitle}</p>
      </div>

      {/* Stats */}
      <div className="flex justify-around">
        {card.stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
              style={{ background: card.badgeColor, border: `1px solid ${card.borderColor}` }}
            >
              {s.icon}
            </div>
            <span className="text-[10px] text-slate-500 text-center">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/8" />

      {/* CTA button */}
      <button
        className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-all"
        style={{
          background: `linear-gradient(135deg, ${card.btnFrom}, ${card.btnTo})`,
          boxShadow: `0 4px 20px ${card.glowColor}`,
        }}
      >
        {isAuthenticated ? "Start Assessment →" : "Login to Start →"}
      </button>

      {/* Corner accent */}
      <div
        className="absolute bottom-0 right-0 w-24 h-24 rounded-tl-full opacity-10 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${card.accentColor}, transparent)` }}
      />
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export function AIScreeningSection() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Unchanged logic
  const handleStart = (route: string) => {
    if (isAuthenticated) {
      navigate(route);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <section className="ai-section relative py-20 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[#030712]" />
      <div className="ai-section-grid absolute inset-0 pointer-events-none" />
      {/* Top fade from hero */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#030712] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#030712] to-transparent" />

      {/* Glow orbs */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-64 h-64 rounded-full blur-[100px] bg-[#2F86C7]/12 pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-64 h-64 rounded-full blur-[100px] bg-[#0D9488]/12 pointer-events-none" />

      <div className="relative z-10 container mx-auto px-4 max-w-7xl">

        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0D9488] px-4 py-1.5 rounded-full mb-4"
            style={{ background: "rgba(13,148,136,0.12)", border: "1px solid rgba(13,148,136,0.25)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] animate-pulse" />
            AI Assessment
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            AI-Powered Body Assessment
          </h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
            Get a clinical-grade analysis of your body before starting your treatment plan — no wearables needed.
          </p>
        </div>

        {/* Cards */}
        <div
          className="grid grid-cols-2 gap-5 max-w-sm mx-auto sm:max-w-lg md:max-w-xl"
          style={{ perspective: "1200px" }}
        >
          {CARDS.map((card) => (
            <AssessmentCard
              key={card.type}
              card={card}
              isAuthenticated={isAuthenticated}
              onStart={handleStart}
            />
          ))}
        </div>

        {/* Info note */}
        <div className="mt-8 flex items-start gap-3 max-w-xl mx-auto rounded-xl px-5 py-4"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(8px)",
          }}>
          <span className="text-lg mt-0.5">💡</span>
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">Posture Analysis</span> is ideal for neck, back &amp; shoulder conditions.{" "}
            <span className="font-semibold text-slate-300">Gait Analysis</span> is recommended for balance issues, stroke recovery, post-surgery rehab &amp; lower limb conditions.
          </p>
        </div>
      </div>

      <style>{`
        .ai-section-grid {
          background-image:
            linear-gradient(rgba(47,134,199,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(47,134,199,0.05) 1px, transparent 1px);
          background-size: 50px 50px;
          mask-image: radial-gradient(ellipse 90% 80% at 50% 50%, black 30%, transparent 100%);
        }

        .ai-card {
          transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.4s;
        }
        .ai-card:hover {
          transform: translateY(-8px) rotateX(4deg) rotateY(-2deg);
          box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1);
        }
      `}</style>
    </section>
  );
}
