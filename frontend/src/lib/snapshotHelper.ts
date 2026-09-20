/**
 * Grab a clean PNG snapshot from the raw <video> element.
 * This reads from the video track ONLY – the MediaPipe skeleton canvas
 * overlay is never drawn here, keeping the photo clean for Three.js texture.
 */
export function grabVideoSnapshot(videoEl: HTMLVideoElement): string {
  const offscreen = document.createElement('canvas');
  offscreen.width = videoEl.videoWidth || 640;
  offscreen.height = videoEl.videoHeight || 480;

  const ctx = offscreen.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(videoEl, 0, 0, offscreen.width, offscreen.height);
  return offscreen.toDataURL('image/jpeg', 0.75);
}
