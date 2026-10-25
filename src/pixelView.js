import * as THREE from "three";

export function pixelSizeFor(width, height, phone) {
  const long = Math.max(width, height, 1);
  if (phone) return THREE.MathUtils.clamp(Math.round(long / 420), 2, 4);
  return 3;
}

/** Draw the real scene into a small buffer and let the browser scale it with hard pixels. */
export function applyPixelFrame(renderer, width, height, phone) {
  const pixelSize = pixelSizeFor(width, height, phone);
  const rw = Math.max(160, Math.floor(width / pixelSize));
  const rh = Math.max(120, Math.floor(height / pixelSize));
  renderer.setPixelRatio(1);
  renderer.setSize(rw, rh, false);
  const canvas = renderer.domElement;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.imageRendering = "pixelated";
}
