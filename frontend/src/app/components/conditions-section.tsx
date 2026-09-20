import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Check, ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { Category, Service } from "../../types";
import { useCartStore } from "../../store/cartStore";
import { categoryAPI } from "../../api/categories";
import { cartAPI } from "../../api/cart";
import { toast } from "sonner";
import { CategorySkeletonGrid } from "../../components/skeletons/CategorySkeleton";
import { ServiceSkeletonList } from "../../components/skeletons/ServiceSkeleton";
import { ErrorMessage } from "../../components/ErrorMessage";

// ─── SVG Exercise Illustrations ──────────────────────────────────────────────

const KneeQuadStretch = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="10" fill="#2F86C7" opacity="0.9"/>
    <rect x="52" y="30" width="16" height="28" rx="8" fill="#2F86C7" opacity="0.8"/>
    {/* Standing leg */}
    <line x1="60" y1="58" x2="54" y2="90" stroke="#2F86C7" strokeWidth="7" strokeLinecap="round"/>
    <line x1="54" y1="90" x2="54" y2="120" stroke="#2F86C7" strokeWidth="7" strokeLinecap="round"/>
    {/* Bent leg held back */}
    <line x1="60" y1="58" x2="68" y2="85" stroke="#1E6FA8" strokeWidth="7" strokeLinecap="round"/>
    <line x1="68" y1="85" x2="68" y2="65" stroke="#1E6FA8" strokeWidth="6" strokeLinecap="round"/>
    {/* Arm holding foot */}
    <line x1="60" y1="40" x2="72" y2="52" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round"/>
    <line x1="72" y1="52" x2="72" y2="68" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round"/>
    <line x1="60" y1="40" x2="46" y2="55" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#2F86C7" fontWeight="600">Quad Stretch</text>
  </svg>
);

const KneeLegRaise = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="30" r="10" fill="#2F86C7" opacity="0.9"/>
    {/* Seated body */}
    <rect x="52" y="42" width="16" height="22" rx="7" fill="#2F86C7" opacity="0.8"/>
    {/* Chair */}
    <rect x="36" y="64" width="48" height="5" rx="2" fill="#93C5FD"/>
    <line x1="40" y1="69" x2="40" y2="100" stroke="#93C5FD" strokeWidth="4" strokeLinecap="round"/>
    <line x1="80" y1="69" x2="80" y2="100" stroke="#93C5FD" strokeWidth="4" strokeLinecap="round"/>
    {/* Resting leg */}
    <line x1="56" y1="64" x2="50" y2="82" stroke="#1E6FA8" strokeWidth="7" strokeLinecap="round"/>
    <line x1="50" y1="82" x2="42" y2="90" stroke="#1E6FA8" strokeWidth="7" strokeLinecap="round"/>
    {/* Raised leg */}
    <line x1="64" y1="64" x2="82" y2="64" stroke="#2F86C7" strokeWidth="7" strokeLinecap="round"/>
    <line x1="82" y1="64" x2="90" y2="72" stroke="#2F86C7" strokeWidth="7" strokeLinecap="round"/>
    {/* Arms */}
    <line x1="60" y1="50" x2="44" y2="58" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round"/>
    <line x1="60" y1="50" x2="76" y2="58" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#2F86C7" fontWeight="600">Leg Raise</text>
  </svg>
);

const KneeSquat = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="10" fill="#2F86C7" opacity="0.9"/>
    <rect x="52" y="30" width="16" height="22" rx="7" fill="#2F86C7" opacity="0.8" transform="rotate(15 60 41)"/>
    {/* Squat legs */}
    <line x1="58" y1="52" x2="44" y2="78" stroke="#2F86C7" strokeWidth="7" strokeLinecap="round"/>
    <line x1="44" y1="78" x2="36" y2="100" stroke="#2F86C7" strokeWidth="7" strokeLinecap="round"/>
    <line x1="62" y1="52" x2="76" y2="78" stroke="#1E6FA8" strokeWidth="7" strokeLinecap="round"/>
    <line x1="76" y1="78" x2="84" y2="100" stroke="#1E6FA8" strokeWidth="7" strokeLinecap="round"/>
    {/* Arms forward */}
    <line x1="56" y1="40" x2="38" y2="56" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round"/>
    <line x1="64" y1="40" x2="82" y2="56" stroke="#2F86C7" strokeWidth="5" strokeLinecap="round"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#2F86C7" fontWeight="600">Partial Squat</text>
  </svg>
);

const BackCatStretch = () => (
  <svg viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="110" cy="38" r="10" fill="#7C3AED" opacity="0.9"/>
    {/* Arched spine (cat) */}
    <path d="M30 75 Q60 40 90 50 Q110 55 110 50" stroke="#7C3AED" strokeWidth="8" strokeLinecap="round" fill="none"/>
    {/* Arms */}
    <line x1="30" y1="75" x2="20" y2="95" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round"/>
    <line x1="30" y1="75" x2="20" y2="75" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round"/>
    {/* Knees */}
    <line x1="90" y1="50" x2="90" y2="78" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round"/>
    <line x1="70" y1="55" x2="70" y2="82" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round"/>
    {/* Feet back */}
    <line x1="90" y1="78" x2="102" y2="90" stroke="#6D28D9" strokeWidth="6" strokeLinecap="round"/>
    <line x1="70" y1="82" x2="80" y2="94" stroke="#6D28D9" strokeWidth="6" strokeLinecap="round"/>
    <text x="70" y="114" textAnchor="middle" fontSize="9" fill="#7C3AED" fontWeight="600">Cat Stretch</text>
  </svg>
);

const BackBridge = () => (
  <svg viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="20" cy="42" r="10" fill="#7C3AED" opacity="0.9"/>
    {/* Body arched up */}
    <path d="M30 60 Q50 28 90 32 Q110 34 115 55" stroke="#7C3AED" strokeWidth="8" strokeLinecap="round" fill="none"/>
    {/* Thighs */}
    <line x1="90" y1="32" x2="96" y2="58" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round"/>
    <line x1="100" y1="36" x2="108" y2="60" stroke="#6D28D9" strokeWidth="7" strokeLinecap="round"/>
    {/* Shins on ground */}
    <line x1="96" y1="58" x2="82" y2="72" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round"/>
    <line x1="108" y1="60" x2="94" y2="74" stroke="#6D28D9" strokeWidth="7" strokeLinecap="round"/>
    {/* Arms flat */}
    <line x1="30" y1="60" x2="14" y2="68" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round"/>
    <line x1="40" y1="58" x2="26" y2="64" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round"/>
    <text x="70" y="114" textAnchor="middle" fontSize="9" fill="#7C3AED" fontWeight="600">Bridge Pose</text>
  </svg>
);

const BackChildPose = () => (
  <svg viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="118" cy="55" r="10" fill="#7C3AED" opacity="0.9"/>
    {/* Rounded back */}
    <path d="M20 72 Q50 40 95 52 Q110 56 110 60" stroke="#7C3AED" strokeWidth="8" strokeLinecap="round" fill="none"/>
    {/* Arms stretched forward */}
    <line x1="20" y1="72" x2="8" y2="65" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round"/>
    <line x1="20" y1="72" x2="8" y2="76" stroke="#7C3AED" strokeWidth="5" strokeLinecap="round"/>
    {/* Knees tucked */}
    <line x1="98" y1="54" x2="112" y2="70" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round"/>
    <line x1="108" y1="60" x2="118" y2="72" stroke="#6D28D9" strokeWidth="7" strokeLinecap="round"/>
    <line x1="112" y1="70" x2="96" y2="78" stroke="#7C3AED" strokeWidth="6" strokeLinecap="round"/>
    <text x="70" y="114" textAnchor="middle" fontSize="9" fill="#7C3AED" fontWeight="600">Child's Pose</text>
  </svg>
);

const NeckTilt = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="55" cy="20" r="10" fill="#059669" opacity="0.9" transform="rotate(-15 55 20)"/>
    {/* Neck */}
    <line x1="60" y1="30" x2="62" y2="40" stroke="#059669" strokeWidth="6" strokeLinecap="round"/>
    {/* Body */}
    <rect x="54" y="42" width="16" height="26" rx="7" fill="#059669" opacity="0.8"/>
    {/* Arms */}
    <line x1="62" y1="50" x2="46" y2="62" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
    <line x1="62" y1="50" x2="78" y2="62" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
    {/* Legs */}
    <line x1="60" y1="68" x2="54" y2="96" stroke="#047857" strokeWidth="7" strokeLinecap="round"/>
    <line x1="64" y1="68" x2="70" y2="96" stroke="#047857" strokeWidth="7" strokeLinecap="round"/>
    {/* Tilt arrow */}
    <path d="M40 15 Q35 22 40 28" stroke="#34D399" strokeWidth="2" strokeLinecap="round" fill="none"/>
    <polygon points="38,28 44,26 42,32" fill="#34D399"/>
    <text x="62" y="136" textAnchor="middle" fontSize="9" fill="#059669" fontWeight="600">Neck Tilt</text>
  </svg>
);

const ShoulderStretch = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="10" fill="#059669" opacity="0.9"/>
    <rect x="52" y="30" width="16" height="26" rx="7" fill="#059669" opacity="0.8"/>
    {/* Right arm across chest */}
    <line x1="68" y1="42" x2="82" y2="50" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
    <line x1="82" y1="50" x2="52" y2="46" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
    {/* Left arm holding right */}
    <line x1="52" y1="42" x2="38" y2="52" stroke="#047857" strokeWidth="5" strokeLinecap="round"/>
    <line x1="38" y1="52" x2="52" y2="46" stroke="#047857" strokeWidth="5" strokeLinecap="round"/>
    {/* Legs */}
    <line x1="58" y1="56" x2="52" y2="96" stroke="#047857" strokeWidth="7" strokeLinecap="round"/>
    <line x1="62" y1="56" x2="68" y2="96" stroke="#047857" strokeWidth="7" strokeLinecap="round"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#059669" fontWeight="600">Shoulder Stretch</text>
  </svg>
);

const ChinTuck = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="62" cy="20" r="10" fill="#059669" opacity="0.9"/>
    {/* Chin tucked - head slightly forward */}
    <line x1="60" y1="30" x2="60" y2="42" stroke="#059669" strokeWidth="6" strokeLinecap="round"/>
    <rect x="52" y="42" width="16" height="26" rx="7" fill="#059669" opacity="0.8"/>
    <line x1="60" y1="42" x2="74" y2="38" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 2"/>
    {/* Arrow showing tuck motion */}
    <path d="M74 24 Q80 30 76 36" stroke="#34D399" strokeWidth="2" strokeLinecap="round" fill="none"/>
    <polygon points="72,34 78,32 76,38" fill="#34D399"/>
    {/* Arms */}
    <line x1="60" y1="52" x2="44" y2="62" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
    <line x1="60" y1="52" x2="76" y2="62" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
    {/* Legs */}
    <line x1="58" y1="68" x2="52" y2="96" stroke="#047857" strokeWidth="7" strokeLinecap="round"/>
    <line x1="62" y1="68" x2="68" y2="96" stroke="#047857" strokeWidth="7" strokeLinecap="round"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#059669" fontWeight="600">Chin Tuck</text>
  </svg>
);

const RehabWalk = () => (
  <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="70" cy="18" r="10" fill="#D97706" opacity="0.9"/>
    <rect x="62" y="30" width="16" height="26" rx="7" fill="#D97706" opacity="0.8"/>
    {/* Parallel bars */}
    <line x1="20" y1="60" x2="120" y2="60" stroke="#FCD34D" strokeWidth="4" strokeLinecap="round"/>
    <line x1="20" y1="70" x2="120" y2="70" stroke="#FCD34D" strokeWidth="4" strokeLinecap="round"/>
    <line x1="20" y1="60" x2="20" y2="100" stroke="#FCD34D" strokeWidth="4" strokeLinecap="round"/>
    <line x1="120" y1="60" x2="120" y2="100" stroke="#FCD34D" strokeWidth="4" strokeLinecap="round"/>
    {/* Hands on bars */}
    <line x1="70" y1="46" x2="44" y2="60" stroke="#D97706" strokeWidth="5" strokeLinecap="round"/>
    <line x1="70" y1="46" x2="96" y2="60" stroke="#D97706" strokeWidth="5" strokeLinecap="round"/>
    {/* Walk legs */}
    <line x1="68" y1="56" x2="56" y2="84" stroke="#B45309" strokeWidth="7" strokeLinecap="round"/>
    <line x1="56" y1="84" x2="48" y2="110" stroke="#B45309" strokeWidth="7" strokeLinecap="round"/>
    <line x1="72" y1="56" x2="84" y2="80" stroke="#D97706" strokeWidth="7" strokeLinecap="round"/>
    <line x1="84" y1="80" x2="90" y2="104" stroke="#D97706" strokeWidth="7" strokeLinecap="round"/>
    <text x="70" y="130" textAnchor="middle" fontSize="9" fill="#D97706" fontWeight="600">Assisted Walk</text>
  </svg>
);

const RehabKneeLift = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="10" fill="#D97706" opacity="0.9"/>
    <rect x="52" y="30" width="16" height="26" rx="7" fill="#D97706" opacity="0.8"/>
    {/* Support hand on wall */}
    <line x1="52" y1="46" x2="30" y2="54" stroke="#D97706" strokeWidth="5" strokeLinecap="round"/>
    <rect x="20" y="50" width="6" height="30" rx="3" fill="#FCD34D" opacity="0.6"/>
    {/* Standing leg */}
    <line x1="62" y1="56" x2="64" y2="96" stroke="#B45309" strokeWidth="7" strokeLinecap="round"/>
    <line x1="64" y1="96" x2="66" y2="120" stroke="#B45309" strokeWidth="7" strokeLinecap="round"/>
    {/* Raised knee */}
    <line x1="58" y1="56" x2="50" y2="76" stroke="#D97706" strokeWidth="7" strokeLinecap="round"/>
    <line x1="50" y1="76" x2="54" y2="96" stroke="#D97706" strokeWidth="6" strokeLinecap="round"/>
    {/* Other arm */}
    <line x1="68" y1="46" x2="84" y2="52" stroke="#D97706" strokeWidth="5" strokeLinecap="round"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#D97706" fontWeight="600">Knee Lift</text>
  </svg>
);

const RehabBandStretch = () => (
  <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="70" cy="20" r="10" fill="#D97706" opacity="0.9"/>
    {/* Seated */}
    <rect x="62" y="32" width="16" height="22" rx="7" fill="#D97706" opacity="0.8"/>
    <rect x="42" y="54" width="56" height="6" rx="3" fill="#FCD34D" opacity="0.5"/>
    {/* Resistance band */}
    <path d="M36 68 Q70 52 104 68" stroke="#34D399" strokeWidth="3" strokeLinecap="round" fill="none" strokeDasharray="4 2"/>
    {/* Arms pulling band */}
    <line x1="66" y1="42" x2="40" y2="58" stroke="#D97706" strokeWidth="5" strokeLinecap="round"/>
    <line x1="40" y1="58" x2="36" y2="68" stroke="#D97706" strokeWidth="5" strokeLinecap="round"/>
    <line x1="74" y1="42" x2="100" y2="58" stroke="#B45309" strokeWidth="5" strokeLinecap="round"/>
    <line x1="100" y1="58" x2="104" y2="68" stroke="#B45309" strokeWidth="5" strokeLinecap="round"/>
    {/* Legs */}
    <line x1="66" y1="60" x2="56" y2="90" stroke="#B45309" strokeWidth="7" strokeLinecap="round"/>
    <line x1="56" y1="90" x2="46" y2="105" stroke="#B45309" strokeWidth="7" strokeLinecap="round"/>
    <line x1="74" y1="60" x2="84" y2="90" stroke="#D97706" strokeWidth="7" strokeLinecap="round"/>
    <line x1="84" y1="90" x2="94" y2="105" stroke="#D97706" strokeWidth="7" strokeLinecap="round"/>
    <text x="70" y="130" textAnchor="middle" fontSize="9" fill="#D97706" fontWeight="600">Band Exercise</text>
  </svg>
);

const StrokeBalance = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="10" fill="#DC2626" opacity="0.9"/>
    <rect x="52" y="30" width="16" height="26" rx="7" fill="#DC2626" opacity="0.8"/>
    {/* Balance board */}
    <ellipse cx="60" cy="110" rx="28" ry="6" fill="#FCA5A5" opacity="0.5"/>
    <line x1="32" y1="110" x2="88" y2="110" stroke="#FCA5A5" strokeWidth="4" strokeLinecap="round"/>
    <ellipse cx="60" cy="116" rx="8" ry="4" fill="#FCA5A5" opacity="0.3"/>
    {/* Arms out for balance */}
    <line x1="60" y1="44" x2="30" y2="54" stroke="#DC2626" strokeWidth="5" strokeLinecap="round"/>
    <line x1="30" y1="54" x2="22" y2="66" stroke="#DC2626" strokeWidth="5" strokeLinecap="round"/>
    <line x1="60" y1="44" x2="90" y2="54" stroke="#B91C1C" strokeWidth="5" strokeLinecap="round"/>
    <line x1="90" y1="54" x2="98" y2="66" stroke="#B91C1C" strokeWidth="5" strokeLinecap="round"/>
    {/* Legs on board */}
    <line x1="58" y1="56" x2="52" y2="84" stroke="#B91C1C" strokeWidth="7" strokeLinecap="round"/>
    <line x1="52" y1="84" x2="48" y2="110" stroke="#B91C1C" strokeWidth="7" strokeLinecap="round"/>
    <line x1="62" y1="56" x2="68" y2="84" stroke="#DC2626" strokeWidth="7" strokeLinecap="round"/>
    <line x1="68" y1="84" x2="72" y2="110" stroke="#DC2626" strokeWidth="7" strokeLinecap="round"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#DC2626" fontWeight="600">Balance Board</text>
  </svg>
);

const StrokeArmReach = () => (
  <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="10" fill="#DC2626" opacity="0.9"/>
    <rect x="52" y="30" width="16" height="26" rx="7" fill="#DC2626" opacity="0.8"/>
    {/* Long reach arm */}
    <line x1="68" y1="42" x2="110" y2="38" stroke="#DC2626" strokeWidth="5" strokeLinecap="round"/>
    <circle cx="114" cy="38" r="5" fill="#FCA5A5"/>
    {/* Target */}
    <circle cx="120" cy="38" r="8" stroke="#FCA5A5" strokeWidth="2" fill="none"/>
    {/* Other arm */}
    <line x1="52" y1="44" x2="36" y2="56" stroke="#B91C1C" strokeWidth="5" strokeLinecap="round"/>
    {/* Legs */}
    <line x1="58" y1="56" x2="52" y2="96" stroke="#B91C1C" strokeWidth="7" strokeLinecap="round"/>
    <line x1="52" y1="96" x2="48" y2="120" stroke="#B91C1C" strokeWidth="7" strokeLinecap="round"/>
    <line x1="62" y1="56" x2="68" y2="96" stroke="#DC2626" strokeWidth="7" strokeLinecap="round"/>
    <line x1="68" y1="96" x2="72" y2="120" stroke="#DC2626" strokeWidth="7" strokeLinecap="round"/>
    <text x="70" y="136" textAnchor="middle" fontSize="9" fill="#DC2626" fontWeight="600">Arm Reach</text>
  </svg>
);

const StrokeCoordination = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="10" fill="#DC2626" opacity="0.9"/>
    <rect x="52" y="30" width="16" height="26" rx="7" fill="#DC2626" opacity="0.8"/>
    {/* Opposite arm/leg movement */}
    <line x1="52" y1="42" x2="32" y2="30" stroke="#DC2626" strokeWidth="5" strokeLinecap="round"/>
    <line x1="68" y1="44" x2="88" y2="56" stroke="#B91C1C" strokeWidth="5" strokeLinecap="round"/>
    {/* Marching leg */}
    <line x1="62" y1="56" x2="74" y2="82" stroke="#B91C1C" strokeWidth="7" strokeLinecap="round"/>
    <line x1="74" y1="82" x2="80" y2="110" stroke="#B91C1C" strokeWidth="7" strokeLinecap="round"/>
    {/* Raised knee opposite */}
    <line x1="58" y1="56" x2="46" y2="72" stroke="#DC2626" strokeWidth="7" strokeLinecap="round"/>
    <line x1="46" y1="72" x2="50" y2="58" stroke="#DC2626" strokeWidth="6" strokeLinecap="round"/>
    {/* Motion lines */}
    <path d="M28 26 Q24 30 28 34" stroke="#FCA5A5" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#DC2626" fontWeight="600">Coordination</text>
  </svg>
);

const BalanceOneLeg = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="10" fill="#0891B2" opacity="0.9"/>
    <rect x="52" y="30" width="16" height="26" rx="7" fill="#0891B2" opacity="0.8"/>
    {/* Arms out for balance */}
    <line x1="60" y1="44" x2="28" y2="56" stroke="#0891B2" strokeWidth="5" strokeLinecap="round"/>
    <line x1="60" y1="44" x2="92" y2="56" stroke="#0891B2" strokeWidth="5" strokeLinecap="round"/>
    {/* Standing leg */}
    <line x1="60" y1="56" x2="60" y2="90" stroke="#0E7490" strokeWidth="7" strokeLinecap="round"/>
    <line x1="60" y1="90" x2="60" y2="120" stroke="#0E7490" strokeWidth="7" strokeLinecap="round"/>
    {/* Raised leg out */}
    <line x1="58" y1="68" x2="38" y2="76" stroke="#0891B2" strokeWidth="7" strokeLinecap="round"/>
    <line x1="38" y1="76" x2="30" y2="90" stroke="#0891B2" strokeWidth="6" strokeLinecap="round"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#0891B2" fontWeight="600">One-Leg Stand</text>
  </svg>
);

const HeelToeWalk = () => (
  <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="70" cy="18" r="10" fill="#0891B2" opacity="0.9"/>
    <rect x="62" y="30" width="16" height="26" rx="7" fill="#0891B2" opacity="0.8"/>
    {/* Walking stride */}
    <line x1="70" y1="56" x2="56" y2="82" stroke="#0E7490" strokeWidth="7" strokeLinecap="round"/>
    <line x1="56" y1="82" x2="44" y2="110" stroke="#0E7490" strokeWidth="7" strokeLinecap="round"/>
    <line x1="70" y1="56" x2="84" y2="78" stroke="#0891B2" strokeWidth="7" strokeLinecap="round"/>
    <line x1="84" y1="78" x2="96" y2="102" stroke="#0891B2" strokeWidth="7" strokeLinecap="round"/>
    {/* Heel-toe path line */}
    <line x1="20" y1="116" x2="120" y2="116" stroke="#67E8F9" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round"/>
    {/* Footprints */}
    <ellipse cx="44" cy="114" rx="6" ry="3" fill="#67E8F9" opacity="0.6"/>
    <ellipse cx="66" cy="114" rx="6" ry="3" fill="#67E8F9" opacity="0.4"/>
    <ellipse cx="88" cy="114" rx="6" ry="3" fill="#67E8F9" opacity="0.6"/>
    {/* Arms */}
    <line x1="68" y1="44" x2="48" y2="58" stroke="#0891B2" strokeWidth="5" strokeLinecap="round"/>
    <line x1="72" y1="44" x2="92" y2="52" stroke="#0E7490" strokeWidth="5" strokeLinecap="round"/>
    <text x="70" y="134" textAnchor="middle" fontSize="9" fill="#0891B2" fontWeight="600">Heel-Toe Walk</text>
  </svg>
);

const SideLegRaise = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="18" r="10" fill="#0891B2" opacity="0.9"/>
    <rect x="52" y="30" width="16" height="26" rx="7" fill="#0891B2" opacity="0.8"/>
    {/* Support hand */}
    <line x1="52" y1="44" x2="30" y2="52" stroke="#0891B2" strokeWidth="5" strokeLinecap="round"/>
    <rect x="20" y="48" width="6" height="34" rx="3" fill="#67E8F9" opacity="0.5"/>
    {/* Standing leg */}
    <line x1="62" y1="56" x2="64" y2="96" stroke="#0E7490" strokeWidth="7" strokeLinecap="round"/>
    <line x1="64" y1="96" x2="66" y2="120" stroke="#0E7490" strokeWidth="7" strokeLinecap="round"/>
    {/* Side raised leg */}
    <line x1="58" y1="64" x2="32" y2="64" stroke="#0891B2" strokeWidth="7" strokeLinecap="round"/>
    <line x1="32" y1="64" x2="22" y2="72" stroke="#0891B2" strokeWidth="6" strokeLinecap="round"/>
    {/* Arrow up */}
    <path d="M28 50 L28 62" stroke="#67E8F9" strokeWidth="2" strokeLinecap="round"/>
    <polygon points="24,52 28,44 32,52" fill="#67E8F9"/>
    {/* Other arm */}
    <line x1="68" y1="44" x2="84" y2="50" stroke="#0E7490" strokeWidth="5" strokeLinecap="round"/>
    <text x="60" y="136" textAnchor="middle" fontSize="9" fill="#0891B2" fontWeight="600">Side Leg Raise</text>
  </svg>
);

const HipFlexorLunge = () => (
  <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="70" cy="18" r="10" fill="#9333EA" opacity="0.9"/>
    <rect x="62" y="30" width="16" height="22" rx="7" fill="#9333EA" opacity="0.8" transform="rotate(10 70 41)"/>
    {/* Front leg lunge */}
    <line x1="68" y1="52" x2="52" y2="76" stroke="#9333EA" strokeWidth="7" strokeLinecap="round"/>
    <line x1="52" y1="76" x2="38" y2="78" stroke="#9333EA" strokeWidth="7" strokeLinecap="round"/>
    {/* Back knee down */}
    <line x1="72" y1="52" x2="90" y2="72" stroke="#7E22CE" strokeWidth="7" strokeLinecap="round"/>
    <line x1="90" y1="72" x2="98" y2="78" stroke="#7E22CE" strokeWidth="7" strokeLinecap="round"/>
    {/* Ground */}
    <line x1="20" y1="100" x2="120" y2="100" stroke="#DDD6FE" strokeWidth="2" strokeLinecap="round"/>
    {/* Arms up/out */}
    <line x1="68" y1="40" x2="50" y2="28" stroke="#9333EA" strokeWidth="5" strokeLinecap="round"/>
    <line x1="72" y1="40" x2="90" y2="28" stroke="#7E22CE" strokeWidth="5" strokeLinecap="round"/>
    <text x="70" y="120" textAnchor="middle" fontSize="9" fill="#9333EA" fontWeight="600">Hip Flexor Lunge</text>
  </svg>
);

const AnkleCircle = () => (
  <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="60" cy="24" r="10" fill="#9333EA" opacity="0.9"/>
    {/* Seated */}
    <rect x="52" y="36" width="16" height="20" rx="7" fill="#9333EA" opacity="0.8"/>
    <rect x="34" y="56" width="52" height="6" rx="3" fill="#DDD6FE" opacity="0.5"/>
    {/* Leg extended */}
    <line x1="62" y1="62" x2="92" y2="68" stroke="#7E22CE" strokeWidth="7" strokeLinecap="round"/>
    {/* Ankle rotation circle */}
    <circle cx="102" cy="82" r="12" stroke="#C4B5FD" strokeWidth="2" fill="none" strokeDasharray="4 2"/>
    <line x1="92" y1="68" x2="96" y2="80" stroke="#7E22CE" strokeWidth="6" strokeLinecap="round"/>
    <circle cx="96" cy="80" r="5" fill="#9333EA"/>
    {/* Arrow showing rotation */}
    <path d="M104 70 Q114 74 112 84" stroke="#C4B5FD" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <polygon points="108,84 114,82 112,88" fill="#C4B5FD"/>
    {/* Other leg down */}
    <line x1="58" y1="62" x2="48" y2="90" stroke="#9333EA" strokeWidth="7" strokeLinecap="round"/>
    <line x1="48" y1="90" x2="44" y2="108" stroke="#9333EA" strokeWidth="7" strokeLinecap="round"/>
    {/* Arms */}
    <line x1="60" y1="46" x2="44" y2="56" stroke="#9333EA" strokeWidth="5" strokeLinecap="round"/>
    <line x1="60" y1="46" x2="76" y2="56" stroke="#9333EA" strokeWidth="5" strokeLinecap="round"/>
    <text x="60" y="130" textAnchor="middle" fontSize="9" fill="#9333EA" fontWeight="600">Ankle Circle</text>
  </svg>
);

const SideLunge = () => (
  <svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="70" cy="18" r="10" fill="#9333EA" opacity="0.9"/>
    <rect x="62" y="30" width="16" height="22" rx="7" fill="#9333EA" opacity="0.8"/>
    {/* Lunge to right */}
    <line x1="70" y1="52" x2="50" y2="66" stroke="#9333EA" strokeWidth="7" strokeLinecap="round"/>
    <line x1="50" y1="66" x2="36" y2="88" stroke="#9333EA" strokeWidth="7" strokeLinecap="round"/>
    <line x1="36" y1="88" x2="26" y2="90" stroke="#9333EA" strokeWidth="6" strokeLinecap="round"/>
    {/* Straight right leg */}
    <line x1="70" y1="52" x2="90" y2="62" stroke="#7E22CE" strokeWidth="7" strokeLinecap="round"/>
    <line x1="90" y1="62" x2="110" y2="70" stroke="#7E22CE" strokeWidth="7" strokeLinecap="round"/>
    <line x1="110" y1="70" x2="114" y2="84" stroke="#7E22CE" strokeWidth="6" strokeLinecap="round"/>
    {/* Arms */}
    <line x1="68" y1="40" x2="48" y2="52" stroke="#9333EA" strokeWidth="5" strokeLinecap="round"/>
    <line x1="72" y1="40" x2="92" y2="52" stroke="#7E22CE" strokeWidth="5" strokeLinecap="round"/>
    <text x="70" y="110" textAnchor="middle" fontSize="9" fill="#9333EA" fontWeight="600">Side Lunge</text>
  </svg>
);

// ─── Category Exercise Data ───────────────────────────────────────────────────

type ExerciseSlide = { name: string; component: React.FC; bg: string };

const CATEGORY_SLIDES: Record<string, ExerciseSlide[]> = {
  "knee-pain-arthritis": [
    { name: "Quad Stretch", component: KneeQuadStretch, bg: "from-blue-50 to-blue-100" },
    { name: "Leg Raise", component: KneeLegRaise, bg: "from-blue-100 to-sky-100" },
    { name: "Partial Squat", component: KneeSquat, bg: "from-sky-50 to-blue-50" },
  ],
  "back-pain-slip-disc-sciatica": [
    { name: "Cat Stretch", component: BackCatStretch, bg: "from-purple-50 to-violet-100" },
    { name: "Bridge Pose", component: BackBridge, bg: "from-violet-50 to-purple-100" },
    { name: "Child's Pose", component: BackChildPose, bg: "from-purple-100 to-indigo-50" },
  ],
  "neck-shoulder-pain": [
    { name: "Neck Tilt", component: NeckTilt, bg: "from-emerald-50 to-green-100" },
    { name: "Shoulder Stretch", component: ShoulderStretch, bg: "from-green-50 to-teal-100" },
    { name: "Chin Tuck", component: ChinTuck, bg: "from-teal-50 to-emerald-50" },
  ],
  "post-surgery-rehabilitation": [
    { name: "Assisted Walk", component: RehabWalk, bg: "from-amber-50 to-yellow-100" },
    { name: "Knee Lift", component: RehabKneeLift, bg: "from-yellow-50 to-amber-100" },
    { name: "Band Exercise", component: RehabBandStretch, bg: "from-orange-50 to-amber-50" },
  ],
  "stroke-neurological-recovery": [
    { name: "Balance Board", component: StrokeBalance, bg: "from-red-50 to-rose-100" },
    { name: "Arm Reach", component: StrokeArmReach, bg: "from-rose-50 to-red-100" },
    { name: "Coordination", component: StrokeCoordination, bg: "from-red-100 to-pink-50" },
  ],
  "balance-issues-fall-risk": [
    { name: "One-Leg Stand", component: BalanceOneLeg, bg: "from-cyan-50 to-sky-100" },
    { name: "Heel-Toe Walk", component: HeelToeWalk, bg: "from-sky-50 to-cyan-100" },
    { name: "Side Leg Raise", component: SideLegRaise, bg: "from-cyan-100 to-teal-50" },
  ],
  "hip-ankle-sports-injuries": [
    { name: "Hip Lunge", component: HipFlexorLunge, bg: "from-violet-50 to-purple-100" },
    { name: "Ankle Circle", component: AnkleCircle, bg: "from-purple-50 to-violet-100" },
    { name: "Side Lunge", component: SideLunge, bg: "from-fuchsia-50 to-purple-50" },
  ],
};

const DEFAULT_SLIDES: ExerciseSlide[] = [
  { name: "Exercise 1", component: KneeQuadStretch, bg: "from-blue-50 to-blue-100" },
  { name: "Exercise 2", component: BackBridge, bg: "from-blue-100 to-sky-100" },
  { name: "Exercise 3", component: BalanceOneLeg, bg: "from-sky-50 to-blue-50" },
];

// ─── Mini Carousel per Category Card ─────────────────────────────────────────

function CategoryCarousel({
  slides,
  onImageClick,
  isSelected,
}: {
  slides: ExerciseSlide[];
  onImageClick: (index: number) => void;
  isSelected: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % slides.length);
    }, 2800);
  }, [slides.length]);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  const pause = () => { if (timerRef.current) clearInterval(timerRef.current); };
  const resume = () => startTimer();

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrent((c) => (c - 1 + slides.length) % slides.length);
  };

  const next = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrent((c) => (c + 1) % slides.length);
  };

  const Illustration = slides[current].component;

  return (
    <div
      className={`relative w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br ${slides[current].bg} group`}
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      {/* Illustration — clicking selects category (handled by parent) */}
      <div className="w-full h-full p-3">
        <Illustration />
      </div>

      {/* Zoom button — only this opens lightbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onImageClick(current); }}
        className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
      >
        <ZoomIn className="w-3 h-3 text-gray-600" />
      </button>

      {/* Nav arrows */}
      <button
        onClick={prev}
        className="absolute left-1 top-1/2 -translate-y-1/2 bg-white/70 backdrop-blur-sm rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-white"
      >
        <ChevronLeft className="w-3 h-3 text-gray-700" />
      </button>
      <button
        onClick={next}
        className="absolute right-1 top-1/2 -translate-y-1/2 bg-white/70 backdrop-blur-sm rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-white"
      >
        <ChevronRight className="w-3 h-3 text-gray-700" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
            className={`rounded-full transition-all ${
              i === current
                ? "w-4 h-1.5 bg-white shadow"
                : "w-1.5 h-1.5 bg-white/50"
            }`}
          />
        ))}
      </div>

      {/* Selected ring overlay */}
      {isSelected && (
        <div className="absolute inset-0 ring-2 ring-inset ring-[#2F86C7] rounded-xl pointer-events-none" />
      )}
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  slides,
  initialIndex,
  categoryName,
  onClose,
}: {
  slides: ExerciseSlide[];
  initialIndex: number;
  categoryName: string;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(initialIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCurrent((c) => (c - 1 + slides.length) % slides.length);
      if (e.key === "ArrowRight") setCurrent((c) => (c + 1) % slides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, slides.length]);

  const Illustration = slides[current].component;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative bg-gradient-to-br ${slides[current].bg} rounded-2xl shadow-2xl p-6 mx-4 flex flex-col items-center`}
        style={{ width: 340, maxWidth: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 bg-white/80 hover:bg-white rounded-full p-1.5 shadow transition-colors"
        >
          <X className="w-4 h-4 text-gray-700" />
        </button>

        {/* Header */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">{categoryName}</p>
        <h3 className="text-lg font-bold text-gray-800 mb-4">{slides[current].name}</h3>

        {/* Illustration */}
        <div className="w-56 h-56">
          <Illustration />
        </div>

        {/* Nav */}
        <div className="flex items-center gap-4 mt-5">
          <button
            onClick={() => setCurrent((c) => (c - 1 + slides.length) % slides.length)}
            className="bg-white/80 hover:bg-white rounded-full p-2 shadow transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`rounded-full transition-all ${
                  i === current ? "w-6 h-2 bg-gray-700" : "w-2 h-2 bg-gray-300"
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => setCurrent((c) => (c + 1) % slides.length)}
            className="bg-white/80 hover:bg-white rounded-full p-2 shadow transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-3">{current + 1} / {slides.length} · Press Esc to close</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConditionsSection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ categorySlug: string; slideIndex: number } | null>(null);

  const syncWithServer = useCartStore((state) => state.syncWithServer);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoading(true);
        setCategoriesError(null);
        const data = await categoryAPI.getAll();
        setCategories(data);
        if (data.length > 0) setSelectedCategory(data[0].id);
      } catch {
        setCategoriesError('Failed to load categories. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    const loadServices = async () => {
      if (!selectedCategory) return;
      try {
        setServicesLoading(true);
        setServicesError(null);
        const response = await categoryAPI.getServices(selectedCategory);
        setServices(response.data);
      } catch {
        setServicesError('Failed to load services. Please try again.');
      } finally {
        setServicesLoading(false);
      }
    };
    loadServices();
    // Close lightbox whenever category switches
    setLightbox(null);
  }, [selectedCategory]);

  const currentCategory = categories.find(c => c.id === selectedCategory);

  const retryLoadCategories = () => {
    setLoading(true);
    setCategoriesError(null);
    categoryAPI.getAll()
      .then(data => { setCategories(data); if (data.length > 0) setSelectedCategory(data[0].id); })
      .catch(() => setCategoriesError('Failed to load categories. Please try again.'))
      .finally(() => setLoading(false));
  };

  const retryLoadServices = () => {
    if (!selectedCategory) return;
    setServicesLoading(true);
    setServicesError(null);
    categoryAPI.getServices(selectedCategory)
      .then(response => setServices(response.data))
      .catch(() => setServicesError('Failed to load services. Please try again.'))
      .finally(() => setServicesLoading(false));
  };

  const handleAddToCart = async (service: Service) => {
    try {
      const updatedCart = await cartAPI.addItem(service.id, 1);
      syncWithServer(updatedCart);
      toast.success('Added to cart!', { closeButton: true });
    } catch {
      toast.error('Failed to add item to cart. Please try again.');
    }
  };

  const formatPrice = (price: number) => `₹${price.toLocaleString('en-IN')}`;

  const calculateDiscount = (basePrice: number, salePrice?: number) => {
    if (!salePrice || salePrice >= basePrice) return null;
    return Math.round(((basePrice - salePrice) / basePrice) * 100);
  };

  const lightboxCategory = lightbox ? categories.find(c => c.slug === lightbox.categorySlug) : null;
  const lightboxSlides = lightbox ? (CATEGORY_SLIDES[lightbox.categorySlug] ?? DEFAULT_SLIDES) : DEFAULT_SLIDES;

  return (
    <>
      <section className="cond-section relative py-16 md:py-24 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-[#0a0f1e]" />
        <div className="cond-grid absolute inset-0 pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#030712] to-transparent" />
        {/* Ambient glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-[140px] bg-[#2F86C7]/8 pointer-events-none" />

        <div className="relative z-10 container mx-auto px-4">

          {/* Section header */}
          <div className="text-center mb-12">
            <span
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#2F86C7] px-4 py-1.5 rounded-full mb-4"
              style={{ background: "rgba(47,134,199,0.12)", border: "1px solid rgba(47,134,199,0.25)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#2F86C7] animate-pulse" />
              What We Treat
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              Explore By Category
            </h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Choose your condition and discover personalised treatment plans crafted by our expert physiotherapists.
            </p>
          </div>

          <div className="grid lg:grid-cols-[300px_1fr] gap-10 max-w-7xl mx-auto">

            {/* ── Left: Category Grid ── */}
            <div>
              <div className="grid grid-cols-2 gap-3">
                {loading ? (
                  <CategorySkeletonGrid count={6} />
                ) : categoriesError ? (
                  <div className="col-span-2">
                    <ErrorMessage message={categoriesError} onRetry={retryLoadCategories} variant="compact" />
                  </div>
                ) : (
                  categories.map((category) => {
                    const slides = CATEGORY_SLIDES[category.slug] ?? DEFAULT_SLIDES;
                    const isSelected = selectedCategory === category.id;
                    const isComingSoon = category.status === 'COMING_SOON' || category.status === 'coming_soon';

                    return (
                      <div key={category.id} className="flex flex-col gap-1.5">
                        <div
                          className={`transition-all duration-200 ${isSelected ? "scale-105" : "hover:scale-102"} ${isComingSoon ? "opacity-50" : ""}`}
                          onClick={() => !isComingSoon && setSelectedCategory(category.id)}
                        >
                          <div
                            className="relative rounded-xl overflow-hidden"
                            style={isSelected ? {
                              boxShadow: "0 0 0 2px #2F86C7, 0 0 20px rgba(47,134,199,0.3)",
                            } : {}}
                          >
                            <CategoryCarousel
                              slides={slides}
                              isSelected={isSelected}
                              onImageClick={(idx) => {
                                if (!isComingSoon) setLightbox({ categorySlug: category.slug, slideIndex: idx });
                              }}
                            />
                            {isComingSoon && (
                              <Badge className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] shadow">
                                Coming Soon
                              </Badge>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => !isComingSoon && setSelectedCategory(category.id)}
                          disabled={isComingSoon}
                          className={`text-center text-[11px] leading-tight font-semibold px-1 transition-colors ${
                            isSelected ? "text-[#2F86C7]" : "text-slate-400 hover:text-slate-200"
                          } ${isComingSoon ? "cursor-default" : "cursor-pointer"}`}
                        >
                          {category.name}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <Button
                variant="ghost"
                className="w-full mt-4 text-[#2F86C7] hover:text-[#2F86C7] text-sm font-medium"
                style={{ background: "rgba(47,134,199,0.06)", border: "1px solid rgba(47,134,199,0.15)" }}
              >
                View All Categories →
              </Button>
            </div>

            {/* ── Right: Services ── */}
            <div>
              {currentCategory && !servicesLoading && (
                <div className="mb-5 flex items-center gap-3">
                  <div className="w-1 h-8 rounded-full bg-[#2F86C7]" style={{ boxShadow: "0 0 12px rgba(47,134,199,0.6)" }} />
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Selected Category</p>
                    <h3 className="text-lg font-bold text-white">{currentCategory.name}</h3>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {servicesLoading ? (
                  <ServiceSkeletonList count={3} />
                ) : servicesError ? (
                  <div
                    className="p-6 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <ErrorMessage message={servicesError} onRetry={retryLoadServices} title="Failed to Load Services" />
                  </div>
                ) : services.length === 0 ? (
                  <div
                    className="p-8 text-center rounded-xl"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}
                  >
                    <p className="text-slate-500 text-sm">No services available for this category yet.</p>
                  </div>
                ) : (
                  services.map((service) => {
                    const discount = calculateDiscount(service.basePrice, service.salePrice);
                    const displayPrice = service.salePrice || service.basePrice;
                    const pricePerSession = service.sessionCount ? displayPrice / service.sessionCount : null;

                    return (
                      <div
                        key={service.id}
                        className="cond-service-card p-5 rounded-2xl"
                        style={{
                          background: "linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(10,15,30,0.95) 100%)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          backdropFilter: "blur(12px)",
                        }}
                      >
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="text-base font-bold text-white leading-snug">{service.name}</h3>
                          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                            {service.paymentType === 'PARTIAL' && (
                              <Badge className="bg-emerald-600 text-white text-[10px] px-2 py-0.5">Combo</Badge>
                            )}
                            {discount && discount >= 30 && (
                              <Badge className="bg-purple-600 text-white text-[10px] px-2 py-0.5">Best Value</Badge>
                            )}
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{ border: "1px solid rgba(47,134,199,0.4)", color: "#60B5E8", background: "rgba(47,134,199,0.1)" }}
                            >
                              {service.deliveryMode || 'Online'}
                            </span>
                          </div>
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                          <span>{service.duration || 'Flexible duration'}</span>
                          <span>·</span>
                          <span>⭐ {service.reviewCount}+ reviews</span>
                          {service.sessionCount && (
                            <>
                              <span>·</span>
                              <span>{service.sessionCount} sessions</span>
                            </>
                          )}
                        </div>

                        {/* Features */}
                        {service.features && service.features.length > 0 && (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
                            {service.features.map((feature, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                                  style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}
                                >
                                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                                </div>
                                <span className="text-xs text-slate-400">{feature}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Price + CTA */}
                        <div className="border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold text-emerald-400">{formatPrice(displayPrice)}</span>
                                {service.salePrice && service.salePrice < service.basePrice && (
                                  <>
                                    <span className="text-sm text-slate-600 line-through">{formatPrice(service.basePrice)}</span>
                                    {discount && (
                                      <span
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        style={{ background: "rgba(16,185,129,0.15)", color: "#34D399", border: "1px solid rgba(16,185,129,0.25)" }}
                                      >
                                        {discount}% OFF
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                              {pricePerSession && (
                                <p className="text-xs text-slate-500 mt-0.5">{formatPrice(pricePerSession)} / session</p>
                              )}
                            </div>

                            <Button
                              className="px-6 font-semibold text-white shadow-sm flex-shrink-0"
                              style={{
                                background: "linear-gradient(135deg, #2F86C7, #1E6FA8)",
                                boxShadow: "0 4px 20px rgba(47,134,199,0.35)",
                              }}
                              onClick={() => handleAddToCart(service)}
                            >
                              Book at {formatPrice(service.advanceAmount || displayPrice)}
                            </Button>
                          </div>

                          {service.paymentType === 'PARTIAL' && service.advanceAmount && (
                            <p
                              className="text-xs mt-3 py-2 px-3 rounded-lg"
                              style={{
                                color: "#FCD34D",
                                background: "rgba(245,158,11,0.08)",
                                border: "1px solid rgba(245,158,11,0.2)",
                              }}
                            >
                              Pay <strong>{formatPrice(service.advanceAmount)}</strong> now — remaining{" "}
                              <strong>{formatPrice(displayPrice - service.advanceAmount)}</strong> after first session
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lightbox (unchanged) */}
      {lightbox && lightboxCategory && (
        <Lightbox
          slides={lightboxSlides}
          initialIndex={lightbox.slideIndex}
          categoryName={lightboxCategory.name}
          onClose={() => setLightbox(null)}
        />
      )}

      <style>{`
        .cond-section { background: #0a0f1e; }
        .cond-grid {
          background-image:
            linear-gradient(rgba(47,134,199,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(47,134,199,0.05) 1px, transparent 1px);
          background-size: 50px 50px;
          mask-image: radial-gradient(ellipse 90% 80% at 50% 50%, black 20%, transparent 100%);
        }
        .cond-service-card {
          transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s;
        }
        .cond-service-card:hover {
          transform: translateY(-3px);
          border-color: rgba(47,134,199,0.25) !important;
          box-shadow: 0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(47,134,199,0.15);
        }
      `}</style>
    </>
  );
}
