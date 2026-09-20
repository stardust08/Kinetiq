/**
 * captureSkeletonSnapshot
 *
 * Renders an offscreen Three.js scene — identical to PostureViewer3D — and
 * returns two base64 PNG data-URLs:
 *   - withPhoto:    photo plane + skeleton + angle annotations (matches "Photo On" state)
 *   - skeletonOnly: skeleton + angle annotations only, no photo (matches "Photo Off" state)
 *
 * No DOM mounting required; uses a detached canvas.
 */

import * as THREE from 'three';
import type { BestFrameData } from '../lib/postureStore';

// ── Skeleton constants (mirrors PostureViewer3D) ──────────────────────────────
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

const VALID_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const PLANE_W       = 1.2;
const PLANE_H       = 1.6;
const Z_DEPTH_SCALE = 0.35;
const W             = 640;
const H             = 853; // 3:4 aspect matches PoseCard

type LM = { x: number; y: number; z: number; visibility?: number };

function valid(lm: LM | undefined): lm is LM {
  return !!lm && isFinite(lm.x) && isFinite(lm.y) && isFinite(lm.z)
    && !isNaN(lm.x) && !isNaN(lm.y) && !isNaN(lm.z);
}

function toVec3(lm2D: { x: number; y: number }, z3D = 0): THREE.Vector3 {
  return new THREE.Vector3(
    (lm2D.x - 0.5) * PLANE_W,
    -(lm2D.y - 0.5) * PLANE_H,
    -z3D * Z_DEPTH_SCALE,
  );
}

function regionColor(idx: number): number {
  if (idx === 0)  return 0xffffff;
  if (idx <= 16)  return 0x00d4ff;
  if (idx <= 24)  return 0xff6b35;
  return 0x00ff88;
}

function drawBone(group: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, color: number) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.001 || !isFinite(len)) return;
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const geo = new THREE.CylinderGeometry(0.008, 0.008, len, 6);
  const mat = new THREE.MeshPhongMaterial({ color, shininess: 60 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  group.add(mesh);
}

function makeLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width  = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(10,10,20,0.8)';
  ctx.roundRect(2, 2, 252, 60, 8);
  ctx.fill();
  ctx.font         = 'bold 22px monospace';
  ctx.fillStyle    = color;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.45, 0.12, 1);
  return sprite;
}

function addAnnotation(
  group: THREE.Group,
  label: string,
  angleDeg: number,
  pos: THREE.Vector3,
  color: string,
) {
  const r     = 0.07;
  const steps = 20;
  const rad   = (angleDeg * Math.PI) / 180;
  const arc: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * rad;
    arc.push(new THREE.Vector3(pos.x + Math.cos(t) * r, pos.y + Math.sin(t) * r, pos.z + 0.02));
  }
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arc);
  group.add(new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color })));

  const sprite = makeLabel(`${label}: ${angleDeg.toFixed(1)}°`, color);
  sprite.position.set(pos.x + 0.12, pos.y + 0.1, pos.z + 0.03);
  group.add(sprite);
}

// ── Load texture from dataURL 
function loadTexture(dataUrl: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(dataUrl, resolve, undefined, reject);
  });
}

// ── Core render function  
async function renderScene(frameData: BestFrameData, showPhoto: boolean): Promise<string> {
  const { imageDataUrl, landmarks2D, landmarks3D } = frameData;
  const lm2D = Array.isArray(landmarks2D) && landmarks2D.length >= 25 ? landmarks2D : [];
  const lm3D = Array.isArray(landmarks3D) && landmarks3D.length >= 25 ? landmarks3D : [];

  // ── Scene  
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(1, 2, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.3);
  rim.position.set(-2, 0, -1);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(50, W / H, 0.01, 30);
  camera.position.set(0, 0, 2.5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(W, H);
  renderer.setPixelRatio(1);

  // ── Photo planes 
  const texture = await loadTexture(imageDataUrl);
  if (showPhoto) {
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.8),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    bg.position.z = -0.15;
    scene.add(bg);

    const main = new THREE.Mesh(
      new THREE.PlaneGeometry(PLANE_W, PLANE_H),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    main.position.z = 0;
    scene.add(main);
  }

  // ── Skeleton  
  if (lm2D.length >= 25) {
    const positions: (THREE.Vector3 | null)[] = lm2D.map((lm, i) => {
      if (!valid(lm)) return null;
      const z = valid(lm3D[i]) ? lm3D[i].z : 0;
      return toVec3(lm, z);
    });

    const skGroup = new THREE.Group();
    skGroup.position.z = 0.05;
    scene.add(skGroup);

    // Joints
    VALID_INDICES.forEach(idx => {
      const pos = positions[idx];
      const lm  = lm2D[idx];
      if (!pos || !valid(lm) || (lm.visibility ?? 1) < 0.3) return;
      const color  = regionColor(idx);
      const radius = idx === 0 ? 0.05 : 0.025;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 12),
        new THREE.MeshPhongMaterial({ color, emissive: color, emissiveIntensity: 0.28 }),
      );
      sphere.position.copy(pos);
      skGroup.add(sphere);
    });

    // Bones
    CONNECTIONS.forEach(([i, j]) => {
      const a = positions[i], b = positions[j];
      const la = lm2D[i],    lb = lm2D[j];
      if (!a || !b || !valid(la) || !valid(lb)) return;
      if ((la.visibility ?? 1) < 0.3 || (lb.visibility ?? 1) < 0.3) return;
      drawBone(skGroup, a, b, regionColor(i));
    });

    // Angle annotations
    const needed = [0, 7, 8, 11, 12, 23, 24];
    if (needed.every(i => valid(lm2D[i]))) {
      const earMidX = (lm2D[7].x + lm2D[8].x) / 2;
      const earMidY = (lm2D[7].y + lm2D[8].y) / 2;
      const shMidX  = (lm2D[11].x + lm2D[12].x) / 2;
      const shMidY  = (lm2D[11].y + lm2D[12].y) / 2;

      const fhp = Math.abs(
        Math.atan2(Math.abs(earMidX - shMidX), Math.abs(earMidY - shMidY)) * (180 / Math.PI)
      );
      const shTilt = Math.abs(
        Math.atan2(Math.abs(lm2D[12].y - lm2D[11].y), Math.abs(lm2D[12].x - lm2D[11].x)) * (180 / Math.PI)
      );
      const hipTilt = Math.abs(
        Math.atan2(Math.abs(lm2D[24].y - lm2D[23].y), Math.abs(lm2D[24].x - lm2D[23].x)) * (180 / Math.PI)
      );

      const annoGroup = new THREE.Group();
      annoGroup.position.z = 0.06;

      const earZ = lm3D[7] ? (lm3D[7].z + (lm3D[8]?.z ?? lm3D[7].z)) / 2 : 0;
      addAnnotation(annoGroup, 'FHP', fhp, toVec3({ x: earMidX, y: earMidY }, earZ),
        fhp > 15 ? '#ff4444' : '#44ff88');

      if (positions[11]) {
        addAnnotation(annoGroup, 'Shoulder', shTilt,
          positions[11].clone().add(new THREE.Vector3(-0.05, 0, 0)),
          shTilt > 5 ? '#ffaa00' : '#44ff88');
      }
      if (positions[23]) {
        addAnnotation(annoGroup, 'Hip', hipTilt,
          positions[23].clone().add(new THREE.Vector3(-0.05, 0, 0)),
          hipTilt > 5 ? '#ffaa00' : '#44ff88');
      }

      skGroup.add(annoGroup);
    }
  }

  // ── Render once 
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.88);

  // ── Dispose 
  renderer.dispose();
  texture.dispose();

  return dataUrl;
}

// ── Public API  
export interface SkeletonSnapshots {
  /** Raw camera photo only (same as imageDataUrl) */
  photo: string;
  /** Photo plane + 3D skeleton + angle annotations */
  withOverlay: string;
  /** 3D skeleton + angle annotations, no photo */
  skeletonOnly: string;
}

/**
 * Capture three snapshot variants for a single pose view.
 * Runs two offscreen Three.js renders (with and without the photo plane).
 *
 * @param frameData - BestFrameData from postureStore / bestFrames state
 */
export async function captureSkeletonSnapshot(frameData: BestFrameData): Promise<SkeletonSnapshots> {
  const [withOverlay, skeletonOnly] = await Promise.all([
    renderScene(frameData, true),
    renderScene(frameData, false),
  ]);
  return {
    photo: frameData.imageDataUrl,
    withOverlay,
    skeletonOnly,
  };
}
