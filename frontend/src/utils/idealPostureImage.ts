/**
 * idealPostureImage
 * Generates clinical-style humanoid ideal posture reference SVG images
 * (front / side / back) as base64 data-URLs for use in @react-pdf/renderer.
 *
 * Each SVG contains:
 *  - Humanoid body silhouette (head, torso, limbs, clothing)
 *  - Dashed plumb-line aligned to gravity
 *  - Horizontal reference lines at key anatomical levels
 *  - Spine-curve arcs for side view
 *  - Labelled key-alignment annotations
 */

/** Convert an SVG string → PNG data-URL via an offscreen canvas.
 *  @react-pdf/renderer only accepts raster images (PNG/JPEG), not SVG. */
async function svgToPng(svg: string, w = 560, h = 920): Promise<string> {
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = svgUrl;
  });
}

// ─── FRONT VIEW ──────────────────────────────────────────────────────────────
function frontSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 460">
<rect width="280" height="460" fill="#f0f9ff" rx="3"/>
<text x="140" y="13" text-anchor="middle" font-family="Helvetica" font-size="7.5" font-weight="bold" fill="#0369a1">IDEAL POSTURE — FRONT VIEW</text>

<!-- Plumb line -->
<line x1="140" y1="18" x2="140" y2="450" stroke="#0EA5E9" stroke-width="1.4" stroke-dasharray="5,3"/>

<!-- Level reference lines -->
<line x1="22" y1="120" x2="258" y2="120" stroke="#f59e0b" stroke-width="0.9" stroke-dasharray="4,3"/>
<line x1="22" y1="252" x2="258" y2="252" stroke="#f59e0b" stroke-width="0.9" stroke-dasharray="4,3"/>
<line x1="22" y1="368" x2="258" y2="368" stroke="#f59e0b" stroke-width="0.9" stroke-dasharray="4,3"/>

<!-- HEAD -->
<ellipse cx="140" cy="52" rx="26" ry="30" fill="#FDDBB4" stroke="#d4956a" stroke-width="1.2"/>
<path d="M114,40 Q114,22 140,20 Q166,22 166,40 Q157,30 140,30 Q123,30 114,40" fill="#7c5c3e"/>
<ellipse cx="131" cy="49" rx="3.5" ry="4" fill="white" stroke="#aaa" stroke-width="0.5"/>
<ellipse cx="149" cy="49" rx="3.5" ry="4" fill="white" stroke="#aaa" stroke-width="0.5"/>
<circle cx="131" cy="50" r="2.2" fill="#5C3D2E"/>
<circle cx="149" cy="50" r="2.2" fill="#5C3D2E"/>
<path d="M138,57 L135,63 Q140,66 145,63 L142,57" fill="#e0a87e" stroke="none"/>
<path d="M133,68 Q140,73 147,68" fill="none" stroke="#c07050" stroke-width="1"/>

<!-- NECK -->
<path d="M130,80 L130,100 Q140,104 150,100 L150,80" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- SHIRT / TORSO -->
<path d="M100,100 L74,120 L74,204 L92,206 L92,148 L130,144 L150,144 L188,148 L188,206 L206,204 L206,120 L180,100 Q140,93 100,100Z" fill="#dbeafe" stroke="#60a5fa" stroke-width="1.2"/>
<path d="M130,100 Q140,112 150,100" fill="#bfdbfe" stroke="#93c5fd" stroke-width="1"/>

<!-- LEFT ARM -->
<path d="M74,120 Q58,158 60,200 Q68,204 78,200 Q82,160 92,120Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<path d="M60,198 Q54,234 55,258 Q63,261 71,258 Q72,234 78,198Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<ellipse cx="62" cy="264" rx="9" ry="11" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- RIGHT ARM -->
<path d="M206,120 Q222,158 220,200 Q212,204 202,200 Q198,160 188,120Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<path d="M220,198 Q226,234 225,258 Q217,261 209,258 Q208,234 202,198Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<ellipse cx="218" cy="264" rx="9" ry="11" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- TROUSERS -->
<path d="M92,202 Q140,210 188,202 L192,252 Q140,258 88,252Z" fill="#4b5563" stroke="#374151" stroke-width="1"/>
<!-- Left leg -->
<path d="M88,250 Q110,254 120,252 L118,368 Q108,371 98,368Z" fill="#4b5563" stroke="#374151" stroke-width="1"/>
<!-- Right leg -->
<path d="M192,250 Q170,254 160,252 L162,368 Q172,371 182,368Z" fill="#4b5563" stroke="#374151" stroke-width="1"/>

<!-- SHINS -->
<path d="M98,366 L118,366 L116,428 L100,428Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<path d="M162,366 L182,366 L180,428 L164,428Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- SHOES -->
<path d="M92,426 Q108,422 118,426 Q122,432 116,436 L88,436 Q84,432 92,426Z" fill="#374151" stroke="#1f2937" stroke-width="1"/>
<path d="M162,426 Q178,422 188,426 Q192,432 186,436 L158,436 Q154,432 162,426Z" fill="#374151" stroke="#1f2937" stroke-width="1"/>

<!-- LABELS -->
<rect x="3" y="222" width="28" height="14" rx="2" fill="#0EA5E9" fill-opacity="0.18"/>
<text x="17" y="232" text-anchor="middle" font-family="Helvetica" font-size="6" fill="#0369a1" font-weight="bold">PLUMB</text>
<text x="3" y="245" font-family="Helvetica" font-size="5.5" fill="#0369a1">LINE</text>

<text x="262" y="118" font-family="Helvetica" font-size="6" fill="#b45309">Shoulder</text>
<text x="262" y="126" font-family="Helvetica" font-size="6" fill="#b45309">Level</text>
<text x="262" y="250" font-family="Helvetica" font-size="6" fill="#b45309">Hip</text>
<text x="262" y="258" font-family="Helvetica" font-size="6" fill="#b45309">Level</text>
<text x="262" y="366" font-family="Helvetica" font-size="6" fill="#b45309">Knee</text>
<text x="262" y="374" font-family="Helvetica" font-size="6" fill="#b45309">Level</text>
</svg>`;
}

// ─── SIDE VIEW ───────────────────────────────────────────────────────────────
function sideSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 460">
<rect width="280" height="460" fill="#f0f9ff" rx="3"/>
<text x="140" y="13" text-anchor="middle" font-family="Helvetica" font-size="7.5" font-weight="bold" fill="#0369a1">IDEAL POSTURE — SIDE VIEW</text>

<!-- Plumb line: ear → shoulder → hip → knee → ankle -->
<line x1="148" y1="18" x2="148" y2="450" stroke="#0EA5E9" stroke-width="1.4" stroke-dasharray="5,3"/>

<!-- Reference point dots on plumb line -->
<circle cx="148" cy="57" r="3.5" fill="#0EA5E9" fill-opacity="0.8"/>
<circle cx="148" cy="120" r="3.5" fill="#0EA5E9" fill-opacity="0.8"/>
<circle cx="148" cy="252" r="3.5" fill="#0EA5E9" fill-opacity="0.8"/>
<circle cx="148" cy="355" r="3.5" fill="#0EA5E9" fill-opacity="0.8"/>
<circle cx="148" cy="430" r="3.5" fill="#0EA5E9" fill-opacity="0.8"/>

<!-- HEAD (facing right) -->
<ellipse cx="160" cy="50" rx="22" ry="26" fill="#FDDBB4" stroke="#d4956a" stroke-width="1.2"/>
<path d="M138,36 Q142,18 162,18 Q178,20 180,36 Q172,26 158,26 Q144,26 138,36" fill="#7c5c3e"/>
<!-- Ear at plumb line -->
<ellipse cx="136" cy="55" rx="5.5" ry="8" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<!-- Eye -->
<ellipse cx="170" cy="48" rx="3.5" ry="3.5" fill="white" stroke="#aaa" stroke-width="0.5"/>
<circle cx="171" cy="49" r="2" fill="#5C3D2E"/>
<!-- Nose profile -->
<path d="M180,54 Q186,60 183,65" fill="none" stroke="#c07050" stroke-width="1.2"/>

<!-- NECK -->
<path d="M146,74 Q150,80 153,100 Q147,105 141,100 Q143,82 146,74Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- TORSO (shirt, side profile) -->
<path d="M134,100 Q168,96 170,120 L170,204 Q162,212 148,213 Q134,212 128,204 L128,120 Q130,106 134,100Z" fill="#dbeafe" stroke="#60a5fa" stroke-width="1"/>
<path d="M128,100 Q117,116 120,204 L128,204Z" fill="#bfdbfe" stroke="#60a5fa" stroke-width="0.8"/>

<!-- ARM (visible side) -->
<path d="M170,120 Q180,158 178,208 Q170,212 162,208 Q160,162 162,120Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<path d="M178,206 Q182,242 180,264 Q172,268 164,264 Q162,242 162,206Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<ellipse cx="172" cy="270" rx="8" ry="10" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- HIPS (trousers) -->
<path d="M124,202 Q148,212 170,202 L172,252 Q148,258 124,252Z" fill="#4b5563" stroke="#374151" stroke-width="1"/>
<!-- Thigh -->
<path d="M126,250 L148,254 L146,366 L124,362Z" fill="#4b5563" stroke="#374151" stroke-width="1"/>
<!-- Shin -->
<path d="M124,364 L146,364 L143,430 L122,426Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<!-- Shoe -->
<path d="M116,426 Q132,422 144,426 Q157,430 157,434 L113,434 Q110,430 116,426Z" fill="#374151" stroke="#1f2937" stroke-width="1"/>

<!-- SPINE CURVE ARCS -->
<!-- Cervical lordosis (green - normal inward curve) -->
<path d="M130,92 Q112,106 118,126" fill="none" stroke="#16a34a" stroke-width="1.8" stroke-dasharray="3,2"/>
<!-- Thoracic kyphosis (amber - normal outward curve) -->
<path d="M118,126 Q104,160 114,196" fill="none" stroke="#d97706" stroke-width="1.8" stroke-dasharray="3,2"/>
<!-- Lumbar lordosis (green - normal inward curve) -->
<path d="M114,196 Q102,224 122,252" fill="none" stroke="#16a34a" stroke-width="1.8" stroke-dasharray="3,2"/>

<!-- Curve labels (left side) -->
<rect x="38" y="101" width="48" height="20" rx="2" fill="#dcfce7" fill-opacity="0.8"/>
<text x="62" y="112" text-anchor="middle" font-family="Helvetica" font-size="6" fill="#15803d" font-weight="bold">Cervical</text>
<text x="62" y="120" text-anchor="middle" font-family="Helvetica" font-size="5.5" fill="#15803d">Lordosis</text>

<rect x="28" y="154" width="54" height="20" rx="2" fill="#fef9c3" fill-opacity="0.8"/>
<text x="55" y="165" text-anchor="middle" font-family="Helvetica" font-size="6" fill="#a16207" font-weight="bold">Thoracic</text>
<text x="55" y="173" text-anchor="middle" font-family="Helvetica" font-size="5.5" fill="#a16207">Kyphosis</text>

<rect x="34" y="214" width="48" height="20" rx="2" fill="#dcfce7" fill-opacity="0.8"/>
<text x="58" y="225" text-anchor="middle" font-family="Helvetica" font-size="6" fill="#15803d" font-weight="bold">Lumbar</text>
<text x="58" y="233" text-anchor="middle" font-family="Helvetica" font-size="5.5" fill="#15803d">Lordosis</text>

<!-- Plumb point labels (right side) -->
<text x="156" y="60" font-family="Helvetica" font-size="6" fill="#0369a1">Ear</text>
<text x="156" y="123" font-family="Helvetica" font-size="6" fill="#0369a1">Shoulder</text>
<text x="156" y="255" font-family="Helvetica" font-size="6" fill="#0369a1">Hip (GT)</text>
<text x="156" y="358" font-family="Helvetica" font-size="6" fill="#0369a1">Knee</text>
<text x="156" y="433" font-family="Helvetica" font-size="6" fill="#0369a1">Ankle</text>

<rect x="3" y="224" width="28" height="14" rx="2" fill="#0EA5E9" fill-opacity="0.18"/>
<text x="17" y="234" text-anchor="middle" font-family="Helvetica" font-size="6" fill="#0369a1" font-weight="bold">PLUMB</text>
</svg>`;
}

// ─── BACK VIEW ───────────────────────────────────────────────────────────────
function backSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 460">
<rect width="280" height="460" fill="#f0f9ff" rx="3"/>
<text x="140" y="13" text-anchor="middle" font-family="Helvetica" font-size="7.5" font-weight="bold" fill="#0369a1">IDEAL POSTURE — BACK VIEW</text>

<!-- Plumb line -->
<line x1="140" y1="18" x2="140" y2="450" stroke="#0EA5E9" stroke-width="1.4" stroke-dasharray="5,3"/>

<!-- Level reference lines -->
<line x1="22" y1="120" x2="258" y2="120" stroke="#f59e0b" stroke-width="0.9" stroke-dasharray="4,3"/>
<line x1="22" y1="252" x2="258" y2="252" stroke="#f59e0b" stroke-width="0.9" stroke-dasharray="4,3"/>
<line x1="22" y1="368" x2="258" y2="368" stroke="#f59e0b" stroke-width="0.9" stroke-dasharray="4,3"/>

<!-- HEAD (back) -->
<ellipse cx="140" cy="52" rx="26" ry="30" fill="#7c5c3e" stroke="#5C3D2E" stroke-width="1.2"/>
<ellipse cx="140" cy="60" rx="20" ry="20" fill="#8b6b4a" stroke="none"/>
<ellipse cx="140" cy="66" rx="14" ry="14" fill="#9a7a5a" stroke="none"/>

<!-- Ears -->
<ellipse cx="114" cy="55" rx="6" ry="9" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<ellipse cx="166" cy="55" rx="6" ry="9" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- NECK -->
<path d="M130,80 L130,100 Q140,104 150,100 L150,80" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- SHIRT BACK -->
<path d="M100,100 L74,120 L74,204 L92,206 L92,148 L130,144 L150,144 L188,148 L188,206 L206,204 L206,120 L180,100 Q140,93 100,100Z" fill="#bfdbfe" stroke="#60a5fa" stroke-width="1.2"/>
<!-- Spine line hint -->
<line x1="140" y1="104" x2="140" y2="200" stroke="#93c5fd" stroke-width="1" stroke-dasharray="2,3"/>

<!-- Shoulder blades -->
<ellipse cx="118" cy="148" rx="16" ry="20" fill="#93c5fd" fill-opacity="0.4" stroke="#60a5fa" stroke-width="0.8"/>
<ellipse cx="162" cy="148" rx="16" ry="20" fill="#93c5fd" fill-opacity="0.4" stroke="#60a5fa" stroke-width="0.8"/>

<!-- LEFT ARM -->
<path d="M74,120 Q58,158 60,200 Q68,204 78,200 Q82,160 92,120Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<path d="M60,198 Q54,234 55,258 Q63,261 71,258 Q72,234 78,198Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<ellipse cx="62" cy="264" rx="9" ry="11" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- RIGHT ARM -->
<path d="M206,120 Q222,158 220,200 Q212,204 202,200 Q198,160 188,120Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<path d="M220,198 Q226,234 225,258 Q217,261 209,258 Q208,234 202,198Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<ellipse cx="218" cy="264" rx="9" ry="11" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- TROUSERS -->
<path d="M92,202 Q140,210 188,202 L192,252 Q140,258 88,252Z" fill="#374151" stroke="#1f2937" stroke-width="1"/>
<path d="M88,250 Q110,254 120,252 L118,368 Q108,371 98,368Z" fill="#374151" stroke="#1f2937" stroke-width="1"/>
<path d="M192,250 Q170,254 160,252 L162,368 Q172,371 182,368Z" fill="#374151" stroke="#1f2937" stroke-width="1"/>

<!-- SHINS -->
<path d="M98,366 L118,366 L116,428 L100,428Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>
<path d="M162,366 L182,366 L180,428 L164,428Z" fill="#FDDBB4" stroke="#d4956a" stroke-width="1"/>

<!-- SHOES (back) -->
<path d="M92,426 Q108,422 118,426 Q122,432 116,436 L88,436 Q84,432 92,426Z" fill="#1f2937" stroke="#111827" stroke-width="1"/>
<path d="M162,426 Q178,422 188,426 Q192,432 186,436 L158,436 Q154,432 162,426Z" fill="#1f2937" stroke="#111827" stroke-width="1"/>

<!-- LABELS -->
<rect x="3" y="222" width="28" height="14" rx="2" fill="#0EA5E9" fill-opacity="0.18"/>
<text x="17" y="232" text-anchor="middle" font-family="Helvetica" font-size="6" fill="#0369a1" font-weight="bold">PLUMB</text>
<text x="3" y="245" font-family="Helvetica" font-size="5.5" fill="#0369a1">LINE</text>

<text x="262" y="118" font-family="Helvetica" font-size="6" fill="#b45309">Shoulder</text>
<text x="262" y="126" font-family="Helvetica" font-size="6" fill="#b45309">Level</text>
<text x="262" y="250" font-family="Helvetica" font-size="6" fill="#b45309">Hip</text>
<text x="262" y="258" font-family="Helvetica" font-size="6" fill="#b45309">Level</text>
<text x="262" y="366" font-family="Helvetica" font-size="6" fill="#b45309">Knee</text>
<text x="262" y="374" font-family="Helvetica" font-size="6" fill="#b45309">Level</text>

<!-- Spine label -->
<text x="144" y="152" font-family="Helvetica" font-size="5.5" fill="#93c5fd">Spine</text>
</svg>`;
}

/**
 * Returns a PNG data-URL for the ideal posture reference image of the given view.
 * Converts the SVG to a raster PNG via canvas — required by @react-pdf/renderer.
 */
export async function getIdealPostureImage(view: 'front' | 'side' | 'back'): Promise<string> {
  const svg = view === 'front' ? frontSVG() : view === 'side' ? sideSVG() : backSVG();
  return svgToPng(svg);
}
