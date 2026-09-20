import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BestFrameData } from '../../lib/postureStore';

// ── Skeleton connections ──────────────────────────────────────────────────────
const CONNECTIONS: [number, number][] = [
  [0, 11], [0, 12],
  [11, 12],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [11, 23], [12, 24],
  [23, 24],
  [23, 25], [25, 27], [27, 29],
  [24, 26], [26, 28], [28, 30],
];

const VALID_LANDMARK_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

const PLANE_W = 1.2;
const PLANE_H = 1.6;
// How much the 3D z-depth from landmarks3D pushes joints forward/back (metres → scene units)
const Z_DEPTH_SCALE = 0.35;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidLandmark(
  lm: { x: number; y: number; z: number; visibility?: number } | undefined
): lm is { x: number; y: number; z: number; visibility?: number } {
  return !!lm && isFinite(lm.x) && isFinite(lm.y) && isFinite(lm.z) &&
    !isNaN(lm.x) && !isNaN(lm.y) && !isNaN(lm.z);
}

/**
 * Map a 2D normalized landmark + optional 3D z to Three.js scene space.
 * XY from landmarks2D (accurate screen position), Z from landmarks3D (real depth).
 * MediaPipe world z: negative = closer to camera → we negate so closer = positive Z.
 */
function toVec3(
  lm2D: { x: number; y: number },
  z3D = 0
): THREE.Vector3 {
  return new THREE.Vector3(
    (lm2D.x - 0.5) * PLANE_W,
    -(lm2D.y - 0.5) * PLANE_H,
    -z3D * Z_DEPTH_SCALE          // negate: MediaPipe z negative = close = positive scene Z
  );
}

// ── Color by body region ──────────────────────────────────────────────────────
function regionColor(idx: number): number {
  if (idx === 0)  return 0xffffff;   // head
  if (idx <= 16)  return 0x00d4ff;   // arms/shoulders
  if (idx <= 24)  return 0xff6b35;   // torso/hips
  return 0x00ff88;                    // legs/feet
}

// ── Cylinder bone ─────────────────────────────────────────────────────────────
function drawBone(
  group: THREE.Group,
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: number
): void {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  if (length < 0.001 || !isFinite(length)) return;

  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const geo = new THREE.CylinderGeometry(0.008, 0.008, length, 6);
  const mat = new THREE.MeshPhongMaterial({ color, shininess: 60 });
  const bone = new THREE.Mesh(geo, mat);
  bone.position.copy(mid);
  bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  group.add(bone);
}

// ── Angle annotation (arc + label sprite) ────────────────────────────────────
interface AngleAnnotation {
  label: string;
  angleDeg: number;
  position: THREE.Vector3;
  color: string;
}

function makeTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(10,10,20,0.75)';
  ctx.roundRect(2, 2, 252, 60, 8);
  ctx.fill();

  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.45, 0.12, 1);
  return sprite;
}

function addAngleAnnotation(
  group: THREE.Group,
  ann: AngleAnnotation
): void {
  // Small arc to visualise the angle
  const arcPoints: THREE.Vector3[] = [];
  const r = 0.07;
  const steps = 20;
  const rad = (ann.angleDeg * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * rad;
    arcPoints.push(new THREE.Vector3(
      ann.position.x + Math.cos(t) * r,
      ann.position.y + Math.sin(t) * r,
      ann.position.z + 0.02
    ));
  }
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
  const arcMat = new THREE.LineBasicMaterial({ color: ann.color, linewidth: 2 });
  group.add(new THREE.Line(arcGeo, arcMat));

  // Label sprite offset above the arc
  const sprite = makeTextSprite(`${ann.label}: ${ann.angleDeg.toFixed(1)}°`, ann.color);
  sprite.position.set(ann.position.x + 0.12, ann.position.y + 0.1, ann.position.z + 0.03);
  group.add(sprite);
}

// ── Compute clinical angles from landmarks ────────────────────────────────────
interface ClinicalAngles {
  forwardHead: number;      // angle between ear→shoulder and vertical
  shoulderTilt: number;     // height difference angle between shoulders
  hipTilt: number;          // height difference angle between hips
}

function computeAngles(
  lm2D: Array<{ x: number; y: number; z: number; visibility?: number }>,
  lm3D: Array<{ x: number; y: number; z: number; visibility?: number }>
): ClinicalAngles | null {
  // Need: nose(0), left ear(7), right ear(8), left shoulder(11), right shoulder(12),
  //       left hip(23), right hip(24)
  const needed = [0, 7, 8, 11, 12, 23, 24];
  if (needed.some(i => !isValidLandmark(lm2D[i]))) return null;

  // Forward head: angle of (ear midpoint → shoulder midpoint) vs vertical
  const earMid = {
    x: (lm2D[7].x + lm2D[8].x) / 2,
    y: (lm2D[7].y + lm2D[8].y) / 2,
  };
  const shoulderMid = {
    x: (lm2D[11].x + lm2D[12].x) / 2,
    y: (lm2D[11].y + lm2D[12].y) / 2,
  };
  const dx = earMid.x - shoulderMid.x;
  const dy = earMid.y - shoulderMid.y;
  // Angle from vertical (dy axis) — positive = head forward
  const forwardHead = Math.abs(Math.atan2(Math.abs(dx), Math.abs(dy)) * (180 / Math.PI));

  // Shoulder tilt: angle of shoulder line vs horizontal
  const sDx = lm2D[12].x - lm2D[11].x;
  const sDy = lm2D[12].y - lm2D[11].y;
  const shoulderTilt = Math.abs(Math.atan2(Math.abs(sDy), Math.abs(sDx)) * (180 / Math.PI));

  // Hip tilt: angle of hip line vs horizontal
  const hDx = lm2D[24].x - lm2D[23].x;
  const hDy = lm2D[24].y - lm2D[23].y;
  const hipTilt = Math.abs(Math.atan2(Math.abs(hDy), Math.abs(hDx)) * (180 / Math.PI));

  return { forwardHead, shoulderTilt, hipTilt };
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface PostureViewer3DProps {
  frameData: BestFrameData;
  poseName: string;
  onClose: () => void;
}

export default function PostureViewer3D({ frameData, poseName, onClose }: PostureViewer3DProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const disposeRef    = useRef<(() => void) | null>(null);
  const mainPlaneRef  = useRef<THREE.Mesh | null>(null);
  const bgPlaneRef    = useRef<THREE.Mesh | null>(null);

  const [showImage, setShowImage]       = useState(true);
  const [showAngles, setShowAngles]     = useState(true);
  const [angles, setAngles]             = useState<ClinicalAngles | null>(null);

  // Toggle image visibility without rebuilding the scene
  useEffect(() => {
    if (mainPlaneRef.current) mainPlaneRef.current.visible = showImage;
    if (bgPlaneRef.current)   bgPlaneRef.current.visible  = showImage;
  }, [showImage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { imageDataUrl, landmarks2D, landmarks3D } = frameData;

    const lm2D = Array.isArray(landmarks2D) && landmarks2D.length >= 25 ? landmarks2D : [];
    const lm3D = Array.isArray(landmarks3D) && landmarks3D.length >= 25 ? landmarks3D : [];
    const hasLandmarks = lm2D.length >= 25;

    // Compute clinical angles for annotation panel
    if (hasLandmarks) {
      setAngles(computeAngles(lm2D, lm3D));
    }

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);

    // ── Lighting ───────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(1, 2, 3);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x88aaff, 0.3);
    rimLight.position.set(-2, 0, -1);
    scene.add(rimLight);

    // ── Camera ─────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.01,
      30
    );
    camera.position.set(0, 0, 2.5);
    camera.lookAt(0, 0, 0);

    // ── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // ── Controls ───────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.0;
    controls.maxDistance = 6.0;
    controls.target.set(0, 0, 0);

    // ── Unified group ──────────────────────────────────────────────────────
    const sceneGroup = new THREE.Group();
    scene.add(sceneGroup);

    const texture = new THREE.TextureLoader().load(imageDataUrl);

    // Layer 1 — ghost background
    const bgPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.8),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.22, depthWrite: false })
    );
    bgPlane.position.z = -0.15;
    bgPlane.visible = showImage;
    bgPlaneRef.current = bgPlane;
    sceneGroup.add(bgPlane);

    // Layer 2 — main image
    const mainPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(PLANE_W, PLANE_H),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    mainPlane.position.z = 0;
    mainPlane.visible = showImage;
    mainPlaneRef.current = mainPlane;
    sceneGroup.add(mainPlane);

    // Layer 3 — skeleton (in front of image)
    const skeletonGroup = new THREE.Group();
    sceneGroup.add(skeletonGroup);

    // ── 3D Skeleton ────────────────────────────────────────────────────────
    if (hasLandmarks) {
      // Build position array merging 2D XY + 3D Z
      const positions: (THREE.Vector3 | null)[] = lm2D.map((lm, i) => {
        if (!isValidLandmark(lm)) return null;
        const z = isValidLandmark(lm3D[i]) ? lm3D[i].z : 0;
        return toVec3(lm, z);
      });

      // Joints
      VALID_LANDMARK_INDICES.forEach(idx => {
        const lm = lm2D[idx];
        const pos = positions[idx];
        if (!pos || !isValidLandmark(lm)) return;
        if ((lm.visibility ?? 1) < 0.3) return;

        const color = regionColor(idx);
        const radius = idx === 0 ? 0.05 : 0.025;
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 12, 12),
          new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.28, shininess: 80 })
        );
        sphere.position.copy(pos);
        skeletonGroup.add(sphere);
      });

      // Bones — color matches the region of the start joint
      CONNECTIONS.forEach(([i, j]) => {
        const posA = positions[i];
        const posB = positions[j];
        const lmA  = lm2D[i];
        const lmB  = lm2D[j];
        if (!posA || !posB || !isValidLandmark(lmA) || !isValidLandmark(lmB)) return;
        if ((lmA.visibility ?? 1) < 0.3 || (lmB.visibility ?? 1) < 0.3) return;
        drawBone(skeletonGroup, posA, posB, regionColor(i));
      });

      // ── Angle annotations ────────────────────────────────────────────────
      if (showAngles) {
        const computed = computeAngles(lm2D, lm3D);
        if (computed) {
          const annoGroup = new THREE.Group();

          // Forward head — annotate at ear midpoint
          const earMidPos = toVec3(
            { x: (lm2D[7].x + lm2D[8].x) / 2, y: (lm2D[7].y + lm2D[8].y) / 2 },
            lm3D[7] ? (lm3D[7].z + (lm3D[8]?.z ?? lm3D[7].z)) / 2 : 0
          );
          addAngleAnnotation(annoGroup, {
            label: 'FHP',
            angleDeg: computed.forwardHead,
            position: earMidPos,
            color: computed.forwardHead > 15 ? '#ff4444' : '#44ff88',
          });

          // Shoulder tilt — annotate at left shoulder
          if (positions[11]) {
            addAngleAnnotation(annoGroup, {
              label: 'Shoulder',
              angleDeg: computed.shoulderTilt,
              position: positions[11].clone().add(new THREE.Vector3(-0.05, 0, 0)),
              color: computed.shoulderTilt > 5 ? '#ffaa00' : '#44ff88',
            });
          }

          // Hip tilt — annotate at left hip
          if (positions[23]) {
            addAngleAnnotation(annoGroup, {
              label: 'Hip',
              angleDeg: computed.hipTilt,
              position: positions[23].clone().add(new THREE.Vector3(-0.05, 0, 0)),
              color: computed.hipTilt > 5 ? '#ffaa00' : '#44ff88',
            });
          }

          annoGroup.position.z = 0.06; // in front of skeleton
          skeletonGroup.add(annoGroup);
        }
      }
    }

    // ── Floor grid ─────────────────────────────────────────────────────────
    const grid = new THREE.GridHelper(6, 24, 0x1a1a2e, 0x111120);
    grid.position.y = -(PLANE_H / 2) - 0.15;
    scene.add(grid);

    // ── Resize ─────────────────────────────────────────────────────────────
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // ── Animation loop ─────────────────────────────────────────────────────
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ────────────────────────────────────────────────────────────
    disposeRef.current = () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      texture.dispose();
      mainPlaneRef.current = null;
      bgPlaneRef.current   = null;
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };

    return () => disposeRef.current?.();
  // showAngles intentionally excluded — annotation toggle rebuilds the scene
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameData, showAngles]);

  const handleClose = () => {
    disposeRef.current?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && handleClose()}
    >
      <div className="relative w-full max-w-4xl mx-4 rounded-2xl overflow-hidden shadow-2xl border border-white/10">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0a0a14]/90 border-b border-white/10">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              3D Posture View
            </span>
            <h2 className="text-lg font-bold text-white mt-0.5">{poseName} View</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle: show/hide image */}
            <button
              onClick={() => setShowImage(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                showImage
                  ? 'bg-blue-600/30 border-blue-500/50 text-blue-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
              title="Toggle photo"
            >
              {showImage ? '🖼 Photo On' : '🖼 Photo Off'}
            </button>

            {/* Toggle: show/hide angle annotations */}
            <button
              onClick={() => setShowAngles(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                showAngles
                  ? 'bg-purple-600/30 border-purple-500/50 text-purple-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
              title="Toggle angle annotations"
            >
              {showAngles ? '📐 Angles On' : '📐 Angles Off'}
            </button>

            <span className="text-xs text-gray-400 italic hidden sm:block">Drag to rotate · Scroll to zoom</span>
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              aria-label="Close 3D viewer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Three.js canvas */}
        <div
          ref={containerRef}
          style={{ width: '100%', height: '520px', background: '#0a0a14' }}
        />

        {/* Footer */}
        <div className="px-6 py-3 bg-[#0a0a14]/90 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
            <span>
              Clarity{' '}
              <span className="text-green-400 font-semibold">
                {Math.round(frameData.visibility * 100)}%
              </span>
              {' '}· Frame #{frameData.frameIndex}
            </span>

            {/* Color legend */}
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-[#00d4ff]" /> Arms</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-[#ff6b35]" /> Torso</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-[#00ff88]" /> Legs</span>
            </span>

            {/* Clinical angle summary */}
            {angles && showAngles && (
              <span className="flex items-center gap-3 border-l border-white/10 pl-3">
                <span className={angles.forwardHead > 15 ? 'text-red-400' : 'text-green-400'}>
                  FHP {angles.forwardHead.toFixed(1)}°
                </span>
                <span className={angles.shoulderTilt > 5 ? 'text-yellow-400' : 'text-green-400'}>
                  Shoulder {angles.shoulderTilt.toFixed(1)}°
                </span>
                <span className={angles.hipTilt > 5 ? 'text-yellow-400' : 'text-green-400'}>
                  Hip {angles.hipTilt.toFixed(1)}°
                </span>
              </span>
            )}
          </div>

          <button
            onClick={handleClose}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Close viewer
          </button>
        </div>
      </div>
    </div>
  );
}
