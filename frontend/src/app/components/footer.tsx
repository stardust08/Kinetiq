import { Instagram, Youtube, Linkedin } from "lucide-react";

const LINKS = {
  Services: [
    { label: "AI Assessment",       href: "#" },
    { label: "Expert Consultation",  href: "#" },
    { label: "Rehab Programs",       href: "#" },
    { label: "Pricing",              href: "#" },
  ],
  Company: [
    { label: "About Us",       href: "#" },
    { label: "Our Experts",    href: "#" },
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
  ],
  Support: [
    { label: "Help Center", href: "#" },
    { label: "Contact Us",  href: "#" },
    { label: "FAQs",        href: "#" },
    { label: "Careers",     href: "#" },
  ],
};

const SOCIALS = [
  { Icon: Instagram, href: "#",                                        label: "Instagram" },
  { Icon: Youtube,   href: "#",                                        label: "YouTube"   },
  { Icon: Linkedin,  href: "https://www.linkedin.com/company/wundrsight/", label: "LinkedIn"  },
];

export function Footer() {
  return (
    <footer className="footer-root relative overflow-hidden">

      {/* ── Seamless separator from dark sections above ────────────────────── */}
      <div className="footer-sep-line" />

      {/* ── Grid overlay ──────────────────────────────────────────────────── */}
      <div className="footer-grid absolute inset-0 pointer-events-none" />

      {/* ── Ambient glow orbs ─────────────────────────────────────────────── */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[300px] rounded-full blur-[120px] bg-[#2F86C7]/8 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[250px] rounded-full blur-[100px] bg-[#1a5fa0]/10 pointer-events-none" />

      {/* ── Watermark ─────────────────────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end select-none pointer-events-none z-0 overflow-hidden pb-2">
        <span className="text-[22vw] font-black tracking-tighter leading-none text-white/[0.025] uppercase">
          NEURA
        </span>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="relative z-10 container mx-auto max-w-7xl px-6 md:px-10">

        {/* Top block: logo + columns + socials */}
        <div className="pt-16 pb-12 grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-12 lg:gap-20">

          {/* Brand column */}
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-xl font-black tracking-tight text-white leading-none">
                Neura<span className="text-[#2F86C7]">AI</span>
              </p>
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-slate-500 mt-1">
                AI Physiotherapy
              </p>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-[200px]">
              Doctor-guided recovery powered by real-time AI body analysis.
            </p>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full w-fit"
              style={{ background: "rgba(47,134,199,0.1)", border: "1px solid rgba(47,134,199,0.2)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px #34d399" }} />
              <span className="text-[11px] font-semibold text-slate-400">All systems operational</span>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-3 gap-8">
            {(Object.entries(LINKS) as [string, { label: string; href: string }[]][]).map(([col, items]) => (
              <div key={col} className="flex flex-col gap-5">
                <h4 className="text-[11px] font-extrabold tracking-[0.2em] uppercase text-slate-600">
                  {col}
                </h4>
                <ul className="flex flex-col gap-3">
                  {items.map(({ label, href }) => (
                    <li key={label}>
                      <a
                        href={href}
                        className="footer-link text-sm font-medium text-slate-400"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Socials + CTA */}
          <div className="flex flex-col gap-6">
            <div>
              <h4 className="text-[11px] font-extrabold tracking-[0.2em] uppercase text-slate-600 mb-4">
                Follow Us
              </h4>
              <div className="flex gap-3">
                {SOCIALS.map(({ Icon, href, label }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    className="footer-social-btn w-9 h-9 rounded-xl flex items-center justify-center"
                  >
                    <Icon className="w-4 h-4 text-slate-400 footer-social-icon transition-colors duration-300" />
                  </a>
                ))}
              </div>
            </div>

            {/* WhatsApp CTA */}
            <a
              href="https://wa.me/919876543210"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-cta-btn inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.107.547 4.09 1.504 5.815L.057 23.882l6.264-1.43A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-4.999-1.374l-.356-.215-3.724.851.882-3.619-.233-.372A9.818 9.818 0 012.182 12C2.182 6.575 6.575 2.182 12 2.182S21.818 6.575 21.818 12 17.425 21.818 12 21.818z"/>
              </svg>
              Chat on WhatsApp
            </a>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(47,134,199,0.2) 50%, rgba(255,255,255,0.08) 70%, transparent)" }} />

        {/* Bottom bar */}
        <div className="py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-600">
            © 2026 Neura AI Rehab. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <span className="text-xs text-slate-600">support@neuraai.com</span>
            <div className="w-px h-3 bg-white/10" />
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}
            >
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-semibold text-emerald-500">HIPAA-Safe</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── CSS ───────────────────────────────────────────────────────────── */}
      <style>{`
        .footer-root {
          background: #030712;
        }

        .footer-sep-line {
          height: 1px;
          background: linear-gradient(90deg,
            transparent,
            rgba(47,134,199,0.15) 20%,
            rgba(47,134,199,0.4) 50%,
            rgba(47,134,199,0.15) 80%,
            transparent
          );
        }

        .footer-grid {
          background-image:
            linear-gradient(rgba(47,134,199,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(47,134,199,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 100% 100% at 50% 0%, black 20%, transparent 100%);
        }

        .footer-link {
          transition: color 0.25s, transform 0.25s;
          display: inline-block;
        }
        .footer-link:hover {
          color: #60b5e8;
          transform: translateX(3px);
        }

        .footer-social-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          transition: background 0.25s, border-color 0.25s, box-shadow 0.25s, transform 0.25s;
        }
        .footer-social-btn:hover {
          background: rgba(47,134,199,0.15);
          border-color: rgba(47,134,199,0.4);
          box-shadow: 0 0 16px rgba(47,134,199,0.25);
          transform: translateY(-2px);
        }
        .footer-social-btn:hover .footer-social-icon {
          color: #60b5e8;
        }

        .footer-cta-btn {
          background: linear-gradient(135deg, #128C7E, #075E54);
          border: 1px solid rgba(18,140,126,0.4);
          box-shadow: 0 4px 16px rgba(18,140,126,0.2);
          transition: transform 0.25s, box-shadow 0.25s;
        }
        .footer-cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(18,140,126,0.35);
        }
      `}</style>
    </footer>
  );
}
