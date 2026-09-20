import { useRef, useState, useEffect, useCallback } from 'react';

const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32],
];

interface AnnotatedFrame {
  frameIndex: number;
  landmarks: Record<string, number[]>;
  gaitPhase: string;
  timestamp: number;
  isHeelStrike: boolean;
}

interface GaitFrameView {
  viewType: string;
  imageData?: string;
  annotatedTimeSeries: AnnotatedFrame[];
  heelStrikes?: { left: number[]; right: number[] };
  frameCount: number;
}

interface GaitSkeletonPlayerProps {
  gaitFrames: Record<string, GaitFrameView>;
}

const PHASE_COLORS: Record<string, string> = {
  stance_left: '#00FF88',    // green
  stance_right: '#FF6B35',   // orange
  swing_left: '#00D4FF',     // cyan
  swing_right: '#FFB347',    // light orange
  double_support: '#A78BFA', // purple
  unknown: '#6B7280',
};

const HEEL_STRIKE_COLOR = '#FFD700'; // gold

export function GaitSkeletonPlayer({ gaitFrames }: GaitSkeletonPlayerProps) {
  const views = Object.keys(gaitFrames);
  const [activeView, setActiveView] = useState(views[0] || 'front');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);

  const currentView = gaitFrames[activeView];
  const timeSeries = currentView?.annotatedTimeSeries || [];
  const totalFrames = timeSeries.length;

  // Load background image when view changes
  useEffect(() => {
    if (currentView?.imageData) {
      const img = new Image();
      img.onload = () => {
        bgImgRef.current = img;
      };
      img.src = currentView.imageData;
    } else {
      bgImgRef.current = null;
    }
    setCurrentFrameIdx(0);
    setIsPlaying(false);
  }, [activeView, currentView]);

  // Draw skeleton on canvas for current frame
  const drawFrame = useCallback(
    (frameIdx: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !timeSeries.length) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background image or solid fill
      if (bgImgRef.current) {
        ctx.drawImage(bgImgRef.current, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const frame = timeSeries[Math.min(frameIdx, totalFrames - 1)];
      if (!frame) return;

      const isHS = frame.isHeelStrike;
      const boneColor = isHS
        ? HEEL_STRIKE_COLOR
        : PHASE_COLORS[frame.gaitPhase] || '#6B7280';
      const lms = frame.landmarks;

      // Draw skeleton connections
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
          ctx.moveTo(sx * canvas.width, sy * canvas.height);
          ctx.lineTo(ex * canvas.width, ey * canvas.height);
          ctx.stroke();
        }
      }

      // Draw joints
      ctx.globalAlpha = 1;
      Object.values(lms).forEach(lm => {
        if (!Array.isArray(lm)) return;
        const [x, y, , vis] = lm;
        if ((vis ?? 1) > 0.4) {
          ctx.fillStyle = isHS ? HEEL_STRIKE_COLOR : boneColor;
          ctx.beginPath();
          ctx.arc(
            x * canvas.width,
            y * canvas.height,
            isHS ? 7 : 5,
            0,
            Math.PI * 2
          );
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });

      // Phase label
      const phaseLabel = frame.gaitPhase.replace('_', ' ').toUpperCase();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(8, 8, 160, 30);
      ctx.fillStyle = boneColor;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(phaseLabel, 16, 28);

      // Heel strike border flash
      if (isHS) {
        ctx.strokeStyle = HEEL_STRIKE_COLOR;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.5;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }
    },
    [timeSeries, totalFrames]
  );

  // Redraw whenever frame index changes
  useEffect(() => {
    drawFrame(currentFrameIdx);
  }, [currentFrameIdx, drawFrame, activeView]);

  // Playback loop
  useEffect(() => {
    if (isPlaying && totalFrames > 0) {
      const interval = Math.round(1000 / 30 / playbackSpeed);
      playIntervalRef.current = setInterval(() => {
        setCurrentFrameIdx(prev => {
          if (prev >= totalFrames - 1) return 0;
          return prev + 1;
        });
      }, interval);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, totalFrames, playbackSpeed]);

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentFrameIdx(parseInt(e.target.value));
    setIsPlaying(false);
  };

  const heelStrikes = currentView?.heelStrikes;
  const leftHS = heelStrikes?.left || [];
  const rightHS = heelStrikes?.right || [];

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* View Tabs */}
      <div className="flex gap-2">
        {views.map(v => (
          <button
            key={v}
            onClick={() => {
              setActiveView(v);
              setIsPlaying(false);
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeView === v
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {v === 'front'
              ? 'Front'
              : v === 'leftside'
              ? 'Left Side'
              : 'Right Side'}
          </button>
        ))}
      </div>

      {/* Canvas Player */}
      <div
        className="relative rounded-xl overflow-hidden bg-gray-900"
        style={{ aspectRatio: '4/3' }}
      >
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full h-full"
        />
        {totalFrames === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            No data for this view
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2">
        {/* Scrubber with heel strike markers */}
        <div className="relative">
          <input
            type="range"
            min={0}
            max={Math.max(totalFrames - 1, 1)}
            value={currentFrameIdx}
            onChange={handleScrub}
            className="w-full h-2 rounded-full accent-blue-500 cursor-pointer"
          />
          {/* Heel strike tick marks */}
          {totalFrames > 0 && (
            <div className="absolute top-0 left-0 right-0 h-2 pointer-events-none">
              {leftHS.map(f => (
                <div
                  key={`l-${f}`}
                  className="absolute top-0 w-0.5 h-2 bg-green-400 rounded"
                  style={{ left: `${(f / (totalFrames - 1)) * 100}%` }}
                  title="Left heel strike"
                />
              ))}
              {rightHS.map(f => (
                <div
                  key={`r-${f}`}
                  className="absolute top-0 w-0.5 h-2 bg-orange-400 rounded"
                  style={{ left: `${(f / (totalFrames - 1)) * 100}%` }}
                  title="Right heel strike"
                />
              ))}
            </div>
          )}
        </div>

        {/* Playback buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentFrameIdx(0)}
            className="text-gray-400 hover:text-white"
            title="Restart"
          >
            ⏮
          </button>
          <button
            onClick={() => setIsPlaying(p => !p)}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <span className="text-xs text-gray-400">
            {currentFrameIdx} / {totalFrames} frames
          </span>
          <div className="ml-auto flex gap-2">
            {[0.5, 1, 2].map(s => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className={`px-2 py-0.5 rounded text-xs ${
                  playbackSpeed === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Phase legend */}
        <div className="flex flex-wrap gap-3 mt-1">
          {[
            { phase: 'stance_left', label: 'Left Stance' },
            { phase: 'stance_right', label: 'Right Stance' },
            { phase: 'swing_left', label: 'Left Swing' },
            { phase: 'swing_right', label: 'Right Swing' },
          ].map(({ phase, label }) => (
            <div key={phase} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: PHASE_COLORS[phase] }}
              />
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: HEEL_STRIKE_COLOR }}
            />
            <span className="text-xs text-gray-400">Heel Strike</span>
          </div>
        </div>
      </div>
    </div>
  );
}
