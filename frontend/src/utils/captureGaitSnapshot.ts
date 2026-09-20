/**
 * captureGaitSnapshot
 * Renders an offscreen 2D canvas for a gait view and returns three
 * base64 JPEG data-URLs for the PDF report:
 *   - withOverlay:    background image + skeleton + phase label
 *   - backgroundOnly: raw background frame
 *   - skeletonOnly:   skeleton on dark background (no photo)
 */

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32],
];

const PHASE_COLORS: Record<string, string> = {
  stance_left: '#00FF88',
  stance_right: '#FF6B35',
  swing_left: '#00D4FF',
  swing_right: '#FFB347',
  double_support: '#A78BFA',
  unknown: '#6B7280',
};

export interface GaitFrameSnapshot {
  withOverlay: string;
  backgroundOnly: string;
  skeletonOnly: string;
}

interface AnnotatedFrame {
  frameIndex: number;
  landmarks: Record<string, number[]>;
  gaitPhase: string;
  timestamp: number;
  isHeelStrike: boolean;
}

export interface GaitViewData {
  viewType: string;
  imageData?: string;
  annotatedTimeSeries: AnnotatedFrame[];
  frameCount: number;
}

const W = 640;
const H = 480;

function pickRepresentativeFrame(frames: AnnotatedFrame[]): AnnotatedFrame {
  // Use a mid-stance frame (~30%) for a representative pose
  return frames[Math.floor(frames.length * 0.3)] || frames[0];
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: AnnotatedFrame,
  width: number,
  height: number,
) {
  const lms = frame.landmarks;
  const boneColor = PHASE_COLORS[frame.gaitPhase] || '#6B7280';

  // Bones
  ctx.strokeStyle = boneColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [si, ei] of POSE_CONNECTIONS) {
    const s = lms[si.toString()];
    const e = lms[ei.toString()];
    if (!s || !e) continue;
    const [sx, sy, , sv] = s;
    const [ex, ey, , ev] = e;
    if ((sv ?? 1) > 0.4 && (ev ?? 1) > 0.4) {
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(sx * width, sy * height);
      ctx.lineTo(ex * width, ey * height);
      ctx.stroke();
    }
  }

  // Joints
  ctx.globalAlpha = 1;
  Object.values(lms).forEach(lm => {
    if (!Array.isArray(lm)) return;
    const [x, y, , vis] = lm;
    if ((vis ?? 1) > 0.4) {
      ctx.fillStyle = boneColor;
      ctx.beginPath();
      ctx.arc(x * width, y * height, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  // Phase label overlay
  const phaseLabel = (frame.gaitPhase || 'unknown').replace(/_/g, ' ').toUpperCase();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(8, 8, 170, 30);
  ctx.fillStyle = boneColor;
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(phaseLabel, 16, 28);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function darkPlaceholder(canvas: HTMLCanvasElement, label: string): string {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#4B5563';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export async function captureGaitSnapshot(viewData: GaitViewData): Promise<GaitFrameSnapshot> {
  const frames = viewData.annotatedTimeSeries;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (!frames || frames.length === 0) {
    const ph = darkPlaceholder(canvas, 'No frame data');
    return { withOverlay: ph, backgroundOnly: ph, skeletonOnly: ph };
  }

  const frame = pickRepresentativeFrame(frames);

  let bgImg: HTMLImageElement | null = null;
  if (viewData.imageData) {
    try {
      bgImg = await loadImage(viewData.imageData);
    } catch {
      bgImg = null;
    }
  }

  // ── 1. withOverlay: background + semi-transparent overlay + skeleton ─────────
  ctx.clearRect(0, 0, W, H);
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
  }
  drawSkeleton(ctx, frame, W, H);
  const withOverlay = canvas.toDataURL('image/jpeg', 0.88);

  // ── 2. backgroundOnly: raw captured frame ────────────────────────────────────
  ctx.clearRect(0, 0, W, H);
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, W, H);
  } else {
    darkPlaceholder(canvas, 'No background image');
  }
  const backgroundOnly = canvas.toDataURL('image/jpeg', 0.88);

  // ── 3. skeletonOnly: skeleton on dark background ──────────────────────────────
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);
  drawSkeleton(ctx, frame, W, H);
  const skeletonOnly = canvas.toDataURL('image/jpeg', 0.88);

  return { withOverlay, backgroundOnly, skeletonOnly };
}
