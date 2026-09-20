import { openDB } from 'idb';

/**
 * Best frame data captured per pose view.
 * imageDataUrl: clean PNG snapshot from raw <video> element (no overlay)
 * landmarks3D: poseWorldLandmarks (metric coords in metres, Y-up after flip)
 * landmarks2D: poseLandmarks (normalized 0–1 coords)
 */
export interface BestFrameData {
  imageDataUrl: string;
  /** poseWorldLandmarks – metric 3D coordinates */
  landmarks3D: Array<{ x: number; y: number; z: number; visibility?: number }>;
  /** poseLandmarks – normalized 2-D screen coordinates */
  landmarks2D: Array<{ x: number; y: number; z: number; visibility?: number }>;
  visibility: number;
  frameIndex: number;
  view: PoseView;
}

export type PoseView = 'front' | 'leftside' | 'rightside' | 'back';

// ---------------------------------------------------------------------------
// Layer 1 – In-memory (instant, cleared on page refresh)
// ---------------------------------------------------------------------------
const postureStore: Record<PoseView, BestFrameData | null> = {
  front: null,
  leftside: null,
  rightside: null,
  back: null,
};

export function setBestFrame(view: PoseView, frameData: BestFrameData): void {
  postureStore[view] = frameData;
}

export function getBestFrame(view: PoseView): BestFrameData | null {
  return postureStore[view];
}

export function clearAllFrames(): void {
  (Object.keys(postureStore) as PoseView[]).forEach(k => {
    postureStore[k] = null;
  });
}

export function allCapturesComplete(): boolean {
  return (Object.values(postureStore) as Array<BestFrameData | null>).every(v => v !== null);
}

// ---------------------------------------------------------------------------
// Layer 2 – IndexedDB (persistent, survives page refresh)
// ---------------------------------------------------------------------------
const DB_NAME = 'postureAssessment';
const STORE_NAME = 'captures';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function saveCapture(view: PoseView, frameData: BestFrameData): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, frameData, view);
  } catch (err) {
    console.error('[postureStore] IndexedDB save failed:', err);
  }
}

export async function loadCapture(view: PoseView): Promise<BestFrameData | null> {
  // Always try in-memory first
  const inMemory = getBestFrame(view);
  if (inMemory) return inMemory;

  try {
    const db = await getDB();
    const result = await db.get(STORE_NAME, view);
    if (result) {
      // Restore to in-memory cache
      postureStore[view] = result as BestFrameData;
    }
    return result as BestFrameData | null;
  } catch (err) {
    console.error('[postureStore] IndexedDB load failed:', err);
    return null;
  }
}

export async function loadAllCaptures(): Promise<Record<PoseView, BestFrameData | null>> {
  const views: PoseView[] = ['front', 'leftside', 'rightside', 'back'];
  const results = await Promise.all(views.map(v => loadCapture(v)));
  return Object.fromEntries(views.map((v, i) => [v, results[i]])) as Record<PoseView, BestFrameData | null>;
}
