/**
 * Floor-plan content mask — reject placements on background / outside the apartment.
 *
 * Samples the cropped plan image: corner pixels define "background"; any click
 * whose neighbourhood matches that background is treated as outside.
 */

const DEFAULT_BG_THRESHOLD = 28;
const SAMPLE_RADIUS = 2;

/**
 * Average RGB of a pixel neighbourhood.
 * @param {ImageData} imageData
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 */
function sampleRgb(imageData, cx, cy, radius = SAMPLE_RADIUS) {
  const { data, width, height } = imageData;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = Math.min(width - 1, Math.max(0, Math.round(cx + dx)));
      const y = Math.min(height - 1, Math.max(0, Math.round(cy + dy)));
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

function colorDist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/**
 * Estimate background colour from the four corners (typical for cropped plans).
 * @param {ImageData} imageData
 */
export function estimateBackgroundRgb(imageData) {
  const { width, height } = imageData;
  const corners = [
    sampleRgb(imageData, 2, 2),
    sampleRgb(imageData, width - 3, 2),
    sampleRgb(imageData, 2, height - 3),
    sampleRgb(imageData, width - 3, height - 3),
  ];
  return {
    r: corners.reduce((s, c) => s + c.r, 0) / corners.length,
    g: corners.reduce((s, c) => s + c.g, 0) / corners.length,
    b: corners.reduce((s, c) => s + c.b, 0) / corners.length,
  };
}

/**
 * @param {ImageData} imageData
 * @param {number} normX 0–1
 * @param {number} normY 0–1
 * @param {{ threshold?: number, background?: {r:number,g:number,b:number} }} [opts]
 * @returns {{ inside: boolean, reason?: string }}
 */
export function isInsidePlanContent(imageData, normX, normY, opts = {}) {
  if (!imageData?.width || !imageData?.height) {
    return { inside: false, reason: "no-image" };
  }
  if (!Number.isFinite(normX) || !Number.isFinite(normY)) {
    return { inside: false, reason: "bad-coords" };
  }
  if (normX < 0 || normX > 1 || normY < 0 || normY > 1) {
    return { inside: false, reason: "out-of-bounds" };
  }

  const threshold = opts.threshold ?? DEFAULT_BG_THRESHOLD;
  const bg = opts.background || estimateBackgroundRgb(imageData);
  const px = normX * (imageData.width - 1);
  const py = normY * (imageData.height - 1);
  const sample = sampleRgb(imageData, px, py);
  const dist = colorDist(sample, bg);

  if (dist <= threshold) {
    return { inside: false, reason: "background" };
  }
  return { inside: true };
}

/**
 * Read ImageData from an HTMLImageElement (must be CORS-clean / same-origin proxy).
 * @param {HTMLImageElement} img
 * @returns {ImageData | null}
 */
export function imageDataFromElement(img) {
  if (!img?.naturalWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    // Tainted canvas (CORS) — cannot sample.
    return null;
  }
}

/** Hebrew message shown when the user clicks outside the apartment outline. */
export const OUTSIDE_PLAN_MESSAGE_HE =
  "לא ניתן למקם מחוץ לדירה — לחצו בתוך קווי התוכנית";
