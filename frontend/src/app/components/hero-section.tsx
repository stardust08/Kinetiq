import { Button } from "./ui/button";
import { MessageCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const HERO_SLIDES = [
  {
    image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=3840&q=95&fit=crop&crop=center",
    headline: "Recover Faster at Home",
    description: "Doctor-guided physiotherapy programs with AI movement assessment—without clinic visits.",
    buttonGradient: "from-blue-500 to-indigo-600",
    glowColor: "rgba(59,130,246,0.4)",
    borderColor: "#3b82f6",
  },
  {
    image: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=3840&q=95&fit=crop&crop=center",
    headline: "Personalized Care Plans",
    description: "AI-powered exercise plans tailored to your specific condition and recovery goals.",
    buttonGradient: "from-emerald-500 to-teal-600",
    glowColor: "rgba(16,185,129,0.4)",
    borderColor: "#10b981",
  },
  {
    image: "https://images.unsplash.com/photo-1559757175-5700dde675bc?w=3840&q=95&fit=crop&crop=center",
    headline: "Expert Care Anywhere",
    description: "Connect with certified physiotherapists through our advanced telehealth platform.",
    buttonGradient: "from-purple-500 to-violet-600",
    glowColor: "rgba(139,92,246,0.4)",
    borderColor: "#8b5cf6",
  },
  {
    image: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=3840&q=95&fit=crop&crop=center",
    headline: "AI Movement Analysis",
    description: "Real-time AI assessment tracks your progress and ensures proper form during exercises.",
    buttonGradient: "from-amber-500 to-orange-600",
    glowColor: "rgba(245,158,11,0.4)",
    borderColor: "#f59e0b",
  },
  {
    image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=3840&q=95&fit=crop&crop=center",
    headline: "Athletic Recovery Pro",
    description: "Professional-grade rehabilitation programs designed for athletes and active individuals.",
    buttonGradient: "from-rose-500 to-pink-600",
    glowColor: "rgba(244,63,94,0.4)",
    borderColor: "#f43f5e",
  },
  {
    image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=3840&q=95&fit=crop&crop=center",
    headline: "Powered by AI Tech",
    description: "Cutting-edge technology meets compassionate care for optimal recovery outcomes.",
    buttonGradient: "from-cyan-500 to-blue-600",
    glowColor: "rgba(6,182,212,0.4)",
    borderColor: "#06b6d4",
  },
];

const METRICS = [
  { label: "Posture Score", value: "87", pct: 87 },
  { label: "Gait Quality",  value: "92", pct: 92 },
  { label: "Symmetry",      value: "96", pct: 96 },
  { label: "Mobility",      value: "91", pct: 91 },
];

// Joint positions — well-proportioned standing figure in 200×180 viewBox
const J: [number, number][] = [
  [100, 34],  // 0  neck
  [73,  48],  // 1  L shoulder
  [127, 48],  // 2  R shoulder
  [57,  78],  // 3  L elbow
  [143, 78],  // 4  R elbow
  [48,  103], // 5  L wrist
  [152, 103], // 6  R wrist
  [100, 98],  // 7  pelvis
  [87,  109], // 8  L hip
  [113, 109], // 9  R hip
  [82,  141], // 10 L knee
  [118, 141], // 11 R knee
  [78,  168], // 12 L ankle
  [122, 168], // 13 R ankle
];

const BONES: [number, number][] = [
  [0,1],[0,2],   // shoulders
  [1,3],[2,4],   // upper arms
  [3,5],[4,6],   // forearms
  [0,7],         // spine
  [7,8],[7,9],   // hips
  [8,10],[9,11], // thighs
  [10,12],[11,13],// shins
];

// Angle labels at key joints
const ANGLE_LABELS = [
  { x: 23,  y: 52, text: "L: 98°" },
  { x: 159, y: 52, text: "R: 97°" },
  { x: 55,  y: 90, text: "142°"   },
  { x: 145, y: 90, text: "138°"   },
  { x: 57,  y: 148, text: "172°"  },
  { x: 127, y: 148, text: "170°"  },
];

export function HeroSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const cardWrapRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 5, y: -8 });
  const [live, setLive] = useState(false);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => { setActiveIndex(p => (p + 1) % HERO_SLIDES.length); setIsTransitioning(false); }, 400);
    }, 6000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardWrapRef.current) return;
    const r = cardWrapRef.current.getBoundingClientRect();
    const nx = (e.clientX - r.left - r.width  / 2) / (r.width  / 2);
    const ny = (e.clientY - r.top  - r.height / 2) / (r.height / 2);
    setTilt({ x: -ny * 24, y: nx * 24 });
    setLive(true);
  };
  const onMouseLeave = () => { setTilt({ x: 5, y: -8 }); setLive(false); };

  const slide = HERO_SLIDES[activeIndex];
  const bc = slide.borderColor;
  const gc = slide.glowColor;

  // Arc gauge
  const ArcGauge = ({ m }: { m: typeof METRICS[0] }) => {
    const r = 18; const circ = 2 * Math.PI * r;
    const filled = circ * m.pct / 100;
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <svg width="40" height="40" viewBox="0 0 48 48" style={{ flexShrink: 0, filter: `drop-shadow(0 0 4px ${gc})`, transition: "filter 1s" }}>
          <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
          <circle cx="24" cy="24" r={r} fill="none" stroke={bc} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={`${filled} ${circ - filled}`} transform="rotate(-90 24 24)"
            style={{ transition: "stroke 1s, stroke-dasharray 0.8s" }} />
          <circle cx="24" cy="24" r={r - 6} fill="none" stroke={bc} strokeWidth="0.5" strokeOpacity="0.15" />
          <text x="24" y="28" textAnchor="middle" fill="white" fontSize="9.5" fontWeight="800" fontFamily="system-ui">{m.value}</text>
        </svg>
        <div>
          <p className="text-[8px] text-slate-500 leading-tight mb-0.5">{m.label}</p>
          <p className="text-[10px] font-bold tabular-nums" style={{ color: bc, transition: "color 1s" }}>{m.pct}%</p>
        </div>
      </div>
    );
  };

  return (
    <section className="hero-root relative overflow-hidden min-h-[100vh] flex items-center bg-[#030712]">

      <div className="hero-grid absolute inset-0 pointer-events-none z-0" />

      <div className="absolute inset-0 z-1">
        {HERO_SLIDES.map((s, i) => (
          <div key={i} className={`absolute inset-0 transition-opacity duration-[2000ms] ${i === activeIndex ? "opacity-100" : "opacity-0"}`}>
            <img src={s.image} alt={s.headline} className="w-full h-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-br from-[#030712]/85 via-[#030712]/75 to-[#030712]/90" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#030712] via-transparent to-[#030712]/60" />
      </div>

      <div className="absolute inset-0 pointer-events-none z-2 overflow-hidden">
        <div className="hero-orb hero-orb-1 absolute rounded-full blur-[100px]" style={{ backgroundColor: gc, transition: "background-color 1s" }} />
        <div className="hero-orb hero-orb-2 absolute rounded-full blur-[80px]" style={{ backgroundColor: gc, transition: "background-color 1s", opacity: 0.3 }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[160px] bg-[#2F86C7]/8" />
      </div>

      <div className="relative z-10 w-full container mx-auto px-6 lg:px-10 py-28 md:py-32">
        <div className="grid lg:grid-cols-[1fr_430px] gap-12 xl:gap-20 items-center">

          {/* Left */}
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 mb-6">
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-widest uppercase border"
                style={{ borderColor: bc+"60", background: gc.replace("0.4","0.1"), color: bc, boxShadow: `0 0 16px ${gc}` }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: bc }} />
                AI-Powered Physiotherapy
              </div>
            </div>

            <h1 className={`text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-[1.05] tracking-tight transition-all duration-700 ${isTransitioning ? "opacity-0 translate-y-6 blur-sm" : "opacity-100 translate-y-0 blur-0"}`}>
              <span className="block" style={{ color: bc, textShadow: `0 0 40px ${gc}` }}>
                {slide.headline.split(" ").slice(0,2).join(" ")}
              </span>
              <span className="block text-white/95 font-light">
                {slide.headline.split(" ").slice(2).join(" ")}
              </span>
            </h1>

            <p className={`text-lg md:text-xl text-slate-300 mb-10 leading-relaxed max-w-xl transition-all duration-700 ${isTransitioning ? "opacity-0 translate-y-6" : "opacity-100 translate-y-0"}`}
              style={{ transitionDelay: "100ms" }}>
              {slide.description}
            </p>

            <div className={`flex flex-wrap gap-4 mb-12 transition-all duration-700 ${isTransitioning ? "opacity-0 translate-y-6" : "opacity-100 translate-y-0"}`}
              style={{ transitionDelay: "200ms" }}>
              <Button size="lg"
                className={`hero-btn-primary px-8 py-6 text-base font-semibold bg-gradient-to-r ${slide.buttonGradient} rounded-xl border-0 text-white`}
                style={{ boxShadow: `0 0 32px ${gc}, 0 4px 24px rgba(0,0,0,0.4)` }}>
                Take AI Assessment
              </Button>
              <Button size="lg" variant="outline"
                className="hero-btn-outline px-8 py-6 text-base font-semibold border border-white/20 text-white bg-white/5 backdrop-blur-md rounded-xl hover:bg-white/10 flex items-center gap-2.5"
                onClick={() => window.open("https://wa.me/919876543210","_blank")}>
                <MessageCircle className="w-5 h-5" />
                Contact Now
              </Button>
            </div>

            <div className="flex items-center gap-3">
              {HERO_SLIDES.map((s, i) => (
                <button key={i}
                  onClick={() => { if (i !== activeIndex) { setIsTransitioning(true); setTimeout(() => { setActiveIndex(i); setIsTransitioning(false); }, 400); } }}
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: i === activeIndex ? 48 : 20, backgroundColor: i === activeIndex ? s.borderColor : "rgba(255,255,255,0.25)", boxShadow: i === activeIndex ? `0 0 12px ${s.glowColor}` : "none" }}
                  aria-label={`Slide ${i+1}`} />
              ))}
            </div>
          </div>

          {/* ── Right: Movable 3D Card ──────────────────────────────────── */}
          <div className="hidden lg:block">
            <div ref={cardWrapRef} className="relative cursor-grab active:cursor-grabbing select-none"
              style={{ perspective: "1000px" }}
              onMouseMove={onMouseMove}
              onMouseLeave={onMouseLeave}>

              {/* Ground glow */}
              <div className="absolute inset-x-8 -bottom-10 h-12 blur-3xl rounded-full opacity-45 pointer-events-none transition-colors duration-1000"
                style={{ background: bc }} />

              <div className="relative rounded-2xl overflow-hidden"
                style={{
                  background: "linear-gradient(145deg, rgba(8,12,24,0.98) 0%, rgba(3,5,14,0.99) 100%)",
                  border: `1px solid ${bc}38`,
                  boxShadow: `0 0 0 1px ${bc}10, 0 32px 100px rgba(0,0,0,0.85), 0 0 80px ${gc}`,
                  backdropFilter: "blur(24px)",
                  transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                  transition: live ? "transform 0.07s linear, border-color 1s, box-shadow 1s" : "transform 0.9s cubic-bezier(0.23,1,0.32,1), border-color 1s, box-shadow 1s",
                  transformStyle: "preserve-3d",
                  padding: "16px",
                  willChange: "transform",
                }}>

                {/* Holographic inner grid */}
                <div className="absolute inset-0 pointer-events-none" style={{
                  backgroundImage: `linear-gradient(${bc}05 1px, transparent 1px), linear-gradient(90deg, ${bc}05 1px, transparent 1px)`,
                  backgroundSize: "22px 22px",
                  transition: "background-image 1s",
                }} />

                {/* Scan line */}
                <div className="hero-scan-line absolute left-0 right-0 h-px pointer-events-none z-20"
                  style={{ background: `linear-gradient(90deg,transparent,${bc}90,${bc},${bc}90,transparent)`, boxShadow: `0 0 10px ${gc}`, transition: "background 1s" }} />

                {/* Edge highlights */}
                <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${bc}95,transparent)` }} />
                <div className="absolute inset-y-0 left-0 w-px" style={{ background: `linear-gradient(180deg,${bc}65,transparent,${bc}25)` }} />
                <div className="absolute inset-y-0 right-0 w-px" style={{ background: `linear-gradient(180deg,transparent,${bc}20,transparent)` }} />

                {/* ── Header ── */}
                <div className="relative flex items-start justify-between mb-3">
                  <div>
                    <p className="text-[8px] font-black tracking-[0.3em] uppercase mb-0.5" style={{ color: bc, transition: "color 1s" }}>◆ NEURA AI</p>
                    <h3 className="text-[13px] font-bold text-white">Body Analysis Report</h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[8px] font-bold tracking-widest text-emerald-400">LIVE</span>
                    </div>
                    <span className="text-[7.5px] font-mono text-slate-600">ID #2847</span>
                  </div>
                </div>

                {/* ── Skeleton Visualization ── */}
                <div className="relative rounded-xl overflow-hidden mb-3" style={{
                  height: "210px",
                  background: `radial-gradient(ellipse 80% 90% at 50% 35%, ${gc.replace("0.4","0.11")}, rgba(0,0,0,0) 68%), rgba(255,255,255,0.01)`,
                  border: "1px solid rgba(255,255,255,0.07)",
                }}>

                  <svg viewBox="0 0 200 180" className="absolute inset-0 w-full h-full">
                    <defs>
                      {/* Bone glow */}
                      <filter id="fBone" x="-60%" y="-60%" width="220%" height="220%">
                        <feGaussianBlur stdDeviation="2.2" result="b"/>
                        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                      {/* Joint glow */}
                      <filter id="fJoint" x="-120%" y="-120%" width="340%" height="340%">
                        <feGaussianBlur stdDeviation="3.5" result="b"/>
                        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                      {/* Head glow */}
                      <filter id="fHead" x="-80%" y="-80%" width="260%" height="260%">
                        <feGaussianBlur stdDeviation="3" result="b"/>
                        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                    </defs>

                    {/* ── Perspective floor grid ── */}
                    <g>
                      {[1,0.75,0.5,0.3,0.15].map((t, i) => {
                        const y = 176 - i * 5;
                        const hw = 20 + t * 70;
                        return <line key={i} x1={100-hw} y1={y} x2={100+hw} y2={y} stroke={bc} strokeWidth="0.5" strokeOpacity={t * 0.3} />;
                      })}
                      {[-3,-2,-1,0,1,2,3].map((n, i) => (
                        <line key={i} x1={100 + n * 10} y1={176} x2={100 + n * 80} y2={156} stroke={bc} strokeWidth="0.5" strokeOpacity="0.2" />
                      ))}
                    </g>

                    {/* ── Symmetry dashed axis ── */}
                    <line x1="100" y1="1" x2="100" y2="174" stroke={bc} strokeWidth="0.4" strokeDasharray="2.5 6" strokeOpacity="0.18" />

                    {/* ── Head AI detection box ── */}
                    <g stroke={bc} strokeWidth="1.3" fill="none" strokeOpacity="0.75" style={{ transition: "stroke 1s" }}>
                      <path d="M 86 1 L 83 1 L 83 5" /><path d="M 114 1 L 117 1 L 117 5" />
                      <path d="M 83 28 L 83 31 L 86 31" /><path d="M 117 28 L 117 31 L 114 31" />
                    </g>
                    <text x="84" y="8.5" fill={bc} fontSize="5.5" fontFamily="monospace" fillOpacity="0.55" style={{ transition: "fill 1s" }}>TRACK</text>

                    {/* ── Head circle ── */}
                    <g filter="url(#fHead)">
                      <circle cx="100" cy="15" r="11" fill="none" stroke={bc} strokeWidth="2" strokeOpacity="0.9" style={{ transition: "stroke 1s" }} />
                      <line x1="95" y1="15" x2="105" y2="15" stroke={bc} strokeWidth="0.7" strokeOpacity="0.45" />
                      <line x1="100" y1="10" x2="100" y2="20" stroke={bc} strokeWidth="0.7" strokeOpacity="0.45" />
                      <circle cx="100" cy="15" r="2.8" fill={bc} fillOpacity="0.65" style={{ transition: "fill 1s" }} />
                      <circle cx="100" cy="15" r="1.1" fill="white" fillOpacity="0.9" />
                    </g>

                    {/* ── Neck line ── */}
                    <line x1="100" y1="26" x2="100" y2="34" stroke={bc} strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.88" filter="url(#fBone)" style={{ transition: "stroke 1s" }} />

                    {/* ── Torso fill ── */}
                    <polygon
                      points={`${J[1][0]},${J[1][1]} ${J[2][0]},${J[2][1]} ${J[9][0]},${J[9][1]} ${J[7][0]},${J[7][1]} ${J[8][0]},${J[8][1]}`}
                      fill={bc} fillOpacity="0.055" style={{ transition: "fill 1s" }} />

                    {/* ── Spine curvature guide (offset bezier) ── */}
                    <path d={`M 100 34 C 103 60 102 78 100 98`}
                      fill="none" stroke={bc} strokeWidth="0.7" strokeOpacity="0.22" strokeDasharray="2 4" />

                    {/* ── Bones ── */}
                    <g filter="url(#fBone)">
                      {BONES.map(([a, b], i) => (
                        <line key={i}
                          x1={J[a][0]} y1={J[a][1]} x2={J[b][0]} y2={J[b][1]}
                          stroke={bc} strokeWidth="2.2" strokeLinecap="round"
                          strokeOpacity={i < 2 ? 0.88 : i < 6 ? 0.78 : 0.72}
                          style={{ transition: "stroke 1s" }} />
                      ))}
                    </g>

                    {/* ── Angle arcs at elbows ── */}
                    <path d={`M ${J[1][0]+6} ${J[1][1]+8} A 15 15 0 0 0 ${J[3][0]+8} ${J[3][1]-4}`}
                      fill="none" stroke={bc} strokeWidth="0.9" strokeOpacity="0.45" strokeDasharray="2 2" />
                    <path d={`M ${J[2][0]-6} ${J[2][1]+8} A 15 15 0 0 1 ${J[4][0]-8} ${J[4][1]-4}`}
                      fill="none" stroke={bc} strokeWidth="0.9" strokeOpacity="0.45" strokeDasharray="2 2" />

                    {/* ── Angle arcs at knees ── */}
                    <path d={`M ${J[8][0]+4} ${J[8][1]+8} A 14 14 0 0 0 ${J[10][0]+6} ${J[10][1]-4}`}
                      fill="none" stroke={bc} strokeWidth="0.9" strokeOpacity="0.4" strokeDasharray="2 2" />
                    <path d={`M ${J[9][0]-4} ${J[9][1]+8} A 14 14 0 0 1 ${J[11][0]-6} ${J[11][1]-4}`}
                      fill="none" stroke={bc} strokeWidth="0.9" strokeOpacity="0.4" strokeDasharray="2 2" />

                    {/* ── Callout lines + angle labels ── */}
                    {/* L shoulder */}
                    <line x1={J[1][0]} y1={J[1][1]} x2="32" y2="44" stroke={bc} strokeWidth="0.5" strokeOpacity="0.3" strokeDasharray="2 3"/>
                    <circle cx="31" cy="44" r="1.2" fill={bc} fillOpacity="0.5"/>
                    {/* R shoulder */}
                    <line x1={J[2][0]} y1={J[2][1]} x2="168" y2="44" stroke={bc} strokeWidth="0.5" strokeOpacity="0.3" strokeDasharray="2 3"/>
                    <circle cx="169" cy="44" r="1.2" fill={bc} fillOpacity="0.5"/>
                    {/* Elbow L */}
                    <line x1={J[3][0]} y1={J[3][1]} x2="28" y2="86" stroke={bc} strokeWidth="0.5" strokeOpacity="0.25" strokeDasharray="2 3"/>
                    {/* Elbow R */}
                    <line x1={J[4][0]} y1={J[4][1]} x2="172" y2="86" stroke={bc} strokeWidth="0.5" strokeOpacity="0.25" strokeDasharray="2 3"/>
                    {/* Knee L */}
                    <line x1={J[10][0]} y1={J[10][1]} x2="32" y2="148" stroke={bc} strokeWidth="0.5" strokeOpacity="0.25" strokeDasharray="2 3"/>
                    {/* Knee R */}
                    <line x1={J[11][0]} y1={J[11][1]} x2="168" y2="148" stroke={bc} strokeWidth="0.5" strokeOpacity="0.25" strokeDasharray="2 3"/>

                    {/* ── Angle text labels ── */}
                    {[
                      { x: 4,   y: 42,  t: "L 98°"  },
                      { x: 150, y: 42,  t: "R 97°"  },
                      { x: 4,   y: 90,  t: "142°"   },
                      { x: 153, y: 90,  t: "138°"   },
                      { x: 4,   y: 152, t: "172°"   },
                      { x: 150, y: 152, t: "170°"   },
                    ].map((l, i) => (
                      <text key={i} x={l.x} y={l.y} fill={bc} fontSize="6.5" fontFamily="monospace" fillOpacity="0.65" style={{ transition: "fill 1s" }}>{l.t}</text>
                    ))}

                    {/* ── Joints ── */}
                    {J.map(([cx, cy], i) => (
                      <g key={i} filter="url(#fJoint)">
                        {/* Pulse outer ring */}
                        <circle cx={cx} cy={cy} r="10" fill={bc} fillOpacity="0.05"
                          className="hero-joint-pulse"
                          style={{ animationDelay: `${i * 0.17}s`, transition: "fill 1s" }} />
                        {/* Mid ring */}
                        <circle cx={cx} cy={cy} r="5.5" fill="none" stroke={bc} strokeWidth="1.1" strokeOpacity="0.3" style={{ transition: "stroke 1s" }} />
                        {/* Solid fill */}
                        <circle cx={cx} cy={cy} r="3.2" fill={bc} fillOpacity="0.95" style={{ transition: "fill 1s" }} />
                        {/* White core */}
                        <circle cx={cx} cy={cy} r="1.3" fill="white" fillOpacity="0.92" />
                      </g>
                    ))}

                    {/* ── Center of Mass ── */}
                    <circle cx="100" cy="76" r="4.5" fill="none" stroke={bc} strokeWidth="0.8" strokeDasharray="2 2.5" strokeOpacity="0.4" />
                    <line x1="96" y1="76" x2="104" y2="76" stroke={bc} strokeWidth="0.7" strokeOpacity="0.35" />
                    <line x1="100" y1="72" x2="100" y2="80" stroke={bc} strokeWidth="0.7" strokeOpacity="0.35" />
                    <circle cx="100" cy="76" r="1.3" fill={bc} fillOpacity="0.55" />
                    <text x="106" y="74.5" fill={bc} fontSize="6" fontFamily="monospace" fillOpacity="0.38">CoM</text>

                    {/* ── Ground shadow under feet ── */}
                    <ellipse cx="100" cy="177" rx="22" ry="2.5" fill={bc} fillOpacity="0.12" />
                  </svg>

                  {/* Corner status chips */}
                  <div className="absolute top-2 left-2 font-mono text-[7px] leading-[1.7] z-10 pointer-events-none" style={{ color: bc+"85" }}>
                    <div>FRAME 847</div><div>FPS&nbsp;&nbsp;&nbsp;30</div>
                  </div>
                  <div className="absolute top-2 right-2 font-mono text-[7px] leading-[1.7] text-right z-10 pointer-events-none" style={{ color: bc+"85" }}>
                    <div>CONF 99.2%</div><div>PTS&nbsp;&nbsp;17/17</div>
                  </div>

                  {/* Vignette */}
                  <div className="absolute inset-0 rounded-xl pointer-events-none" style={{
                    background: "radial-gradient(ellipse 72% 72% at 50% 50%, transparent 40%, rgba(3,5,14,0.55) 100%)"
                  }} />
                </div>

                {/* ── 2×2 Arc gauge grid ── */}
                <div className="relative grid grid-cols-2 gap-1.5 mb-3">
                  {METRICS.map(m => <ArcGauge key={m.label} m={m} />)}
                </div>

                {/* ── Footer ── */}
                <div className="relative flex items-center justify-between pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] text-slate-400 font-medium">Analysis Complete</span>
                  </div>
                  <span className="text-[8.5px] font-bold px-3 py-1 rounded-full tracking-[0.18em] uppercase"
                    style={{
                      background: `linear-gradient(135deg,${gc.replace("0.4","0.28")},${gc.replace("0.4","0.08")})`,
                      color: bc,
                      border: `1px solid ${bc}42`,
                      boxShadow: `0 0 18px ${gc}`,
                      transition: "all 1s",
                    }}>
                    Excellent
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Stats strip */}
      <div className="absolute bottom-0 left-0 right-0 z-10">
        <div className="border-t border-white/8 backdrop-blur-md bg-[#030712]/60">
          <div className="container mx-auto px-6 lg:px-10 py-4">
            <div className="flex flex-wrap items-center justify-center md:justify-between gap-6 md:gap-0">
              {[
                { icon: "🧠", label: "AI Powered",      sublabel: "MediaPipe & ML" },
                { icon: "📐", label: "33+ Metrics",      sublabel: "Per analysis" },
                { icon: "⚡", label: "Real-time",        sublabel: "Live skeleton" },
                { icon: "🏥", label: "Doctor Reviewed",  sublabel: "Expert guidance" },
                { icon: "🔒", label: "Secure & Private", sublabel: "HIPAA-safe" },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2.5">
                  <span className="text-lg">{stat.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-white/90">{stat.label}</p>
                    <p className="text-[10px] text-slate-500">{stat.sublabel}</p>
                  </div>
                  <div className="hidden md:block w-px h-6 bg-white/8 ml-4" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .hero-root { background: #030712; }
        .hero-grid {
          background-image:
            linear-gradient(rgba(47,134,199,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(47,134,199,0.07) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%);
        }
        .hero-orb-1 { width:500px;height:500px;top:-100px;right:-80px;animation:hero-float-a 10s ease-in-out infinite; }
        .hero-orb-2 { width:300px;height:300px;bottom:80px;right:200px;animation:hero-float-b 14s ease-in-out infinite; }
        @keyframes hero-float-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,20px) scale(1.1)} }
        @keyframes hero-float-b { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,-30px)} }
        .hero-btn-primary { transition:transform 0.3s,box-shadow 0.3s; }
        .hero-btn-primary:hover { transform:translateY(-2px) scale(1.03); }
        .hero-btn-outline { transition:background 0.3s,transform 0.3s; }
        .hero-btn-outline:hover { transform:translateY(-2px); }
        .hero-scan-line { animation: hero-scan 4.5s ease-in-out infinite; }
        @keyframes hero-scan {
          0%  { top:-2px; opacity:0; }
          4%  { opacity:1; }
          92% { opacity:0.6; }
          100%{ top:100%; opacity:0; }
        }
        .hero-joint-pulse {
          animation: hero-jpulse 2.6s ease-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        @keyframes hero-jpulse {
          0%  { opacity:0.5; transform:scale(1); }
          60% { opacity:0;   transform:scale(2.8); }
          100%{ opacity:0;   transform:scale(2.8); }
        }
      `}</style>
    </section>
  );
}
