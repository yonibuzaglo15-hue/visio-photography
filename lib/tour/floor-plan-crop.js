/**
 * Detect content bounds of a floor-plan image (trim dark/uniform borders).
 * Browser-safe (canvas). Also usable in Node with a pre-decoded ImageData-like buffer.
 *
 * Strategy: estimate background from the outer frame median color, flood-fill matching
 * pixels inward from the edges, then take the bounding box of remaining content.
 */

import { MIN_CONTENT_RATIO, clamp } from "./floor-plan.js";

function colorAt(data, W, x, y) {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function colorDist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * @param {ImageData} imageData
 * @param {{ pad?: number, floodTol?: number }} [opts]
 * @returns {{ x: number, y: number, w: number, h: number, contentRatio: number, needsCrop: boolean }}
 */
export function detectContentBoundsFromImageData(imageData, opts = {}) {
  const { width: W, height: H, data } = imageData;
  if (!W || !H) {
    return { x: 0, y: 0, w: 1, h: 1, contentRatio: 1, needsCrop: false };
  }

  const floodTol = opts.floodTol ?? 36;
  const sample = Math.max(1, Math.floor(Math.min(W, H) / 450));
  const border = Math.max(2, Math.round(Math.min(W, H) * 0.04));

  const rs = [];
  const gs = [];
  const bs = [];
  for (let y = 0; y < H; y += sample) {
    for (let x = 0; x < W; x += sample) {
      const onBorder = x < border || y < border || x >= W - border || y >= H - border;
      if (!onBorder) continue;
      const c = colorAt(data, W, x, y);
      rs.push(c[0]);
      gs.push(c[1]);
      bs.push(c[2]);
    }
  }
  const bg = [median(rs), median(gs), median(bs)];

  const visited = new Uint8Array(W * H);
  const isBg = (x, y) => colorDist(colorAt(data, W, x, y), bg) <= floodTol;

  const queue = [];
  for (let x = 0; x < W; x++) {
    for (const y of [0, H - 1]) {
      if (isBg(x, y)) {
        visited[y * W + x] = 1;
        queue.push(x, y);
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (const x of [0, W - 1]) {
      const idx = y * W + x;
      if (visited[idx]) continue;
      if (isBg(x, y)) {
        visited[idx] = 1;
        queue.push(x, y);
      }
    }
  }

  for (let qi = 0; qi < queue.length; qi += 2) {
    const x = queue[qi];
    const y = queue[qi + 1];
    const neigh = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const idx = ny * W + nx;
      if (visited[idx]) continue;
      if (!isBg(nx, ny)) continue;
      visited[idx] = 1;
      queue.push(nx, ny);
    }
  }

  let minX = W;
  let minY = H;
  let maxX = 0;
  let maxY = 0;
  let contentPx = 0;

  for (let y = 0; y < H; y += sample) {
    for (let x = 0; x < W; x += sample) {
      if (visited[y * W + x]) continue;
      contentPx += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX <= minX || maxY <= minY || contentPx < 20) {
    return { x: 0, y: 0, w: 1, h: 1, contentRatio: 1, needsCrop: false, bg };
  }

  const pad = opts.pad ?? Math.round(Math.min(W, H) * 0.008);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad);
  maxY = Math.min(H - 1, maxY + pad);

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  let contentRatio = (bw * bh) / (W * H);

  // Second pass: largest bright connected component inside a chrome-safe inset.
  // Matterport / browser screenshots keep the plan as a bright island; chrome/dock
  // sit on the outer bands and must not expand the crop.
  const insetT = Math.round(H * 0.12);
  const insetB = Math.round(H * 0.16);
  const insetX = Math.round(W * 0.06);
  const ix0 = Math.max(minX, insetX);
  const iy0 = Math.max(minY, insetT);
  const ix1 = Math.min(maxX, W - 1 - insetX);
  const iy1 = Math.min(maxY, H - 1 - insetB);

  if (ix1 > ix0 && iy1 > iy0) {
    const label = new Int32Array(W * H);
    const roots = [0];
    let nextId = 1;
    const find = (a) => {
      while (roots[a] !== a) a = roots[a] = roots[roots[a]];
      return a;
    };
    const unite = (a, b) => {
      a = find(a);
      b = find(b);
      if (a !== b) roots[b] = a;
    };
    const brightAt = (x, y) => {
      const i = (y * W + x) * 4;
      const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      return L >= 85;
    };

    for (let y = iy0; y <= iy1; y++) {
      for (let x = ix0; x <= ix1; x++) {
        if (!brightAt(x, y)) continue;
        const left = x > ix0 ? label[y * W + (x - 1)] : 0;
        const up = y > iy0 ? label[(y - 1) * W + x] : 0;
        if (left && up) {
          label[y * W + x] = left;
          unite(left, up);
        } else if (left) {
          label[y * W + x] = left;
        } else if (up) {
          label[y * W + x] = up;
        } else {
          roots[nextId] = nextId;
          label[y * W + x] = nextId++;
        }
      }
    }

    const stats = new Map();
    for (let y = iy0; y <= iy1; y++) {
      for (let x = ix0; x <= ix1; x++) {
        let id = label[y * W + x];
        if (!id) continue;
        id = find(id);
        let s = stats.get(id);
        if (!s) {
          s = { n: 0, minX: x, minY: y, maxX: x, maxY: y };
          stats.set(id, s);
        }
        s.n += 1;
        if (x < s.minX) s.minX = x;
        if (y < s.minY) s.minY = y;
        if (x > s.maxX) s.maxX = x;
        if (y > s.maxY) s.maxY = y;
      }
    }

    let best = null;
    for (const s of stats.values()) {
      if (!best || s.n > best.n) best = s;
    }
    if (best && best.n > 80 && best.maxX > best.minX && best.maxY > best.minY) {
      const islandRatio =
        ((best.maxX - best.minX + 1) * (best.maxY - best.minY + 1)) / (W * H);
      if (islandRatio <= contentRatio * 0.98) {
        const tightPad = Math.max(2, Math.round(Math.min(W, H) * 0.008));
        minX = Math.max(0, best.minX - tightPad);
        minY = Math.max(0, best.minY - tightPad);
        maxX = Math.min(W - 1, best.maxX + tightPad);
        maxY = Math.min(H - 1, best.maxY + tightPad);
        contentRatio =
          ((maxX - minX + 1) * (maxY - minY + 1)) / (W * H);
      }
    }
  }

  const finalW = maxX - minX + 1;
  const finalH = maxY - minY + 1;
  return {
    x: minX / W,
    y: minY / H,
    w: finalW / W,
    h: finalH / H,
    contentRatio,
    needsCrop: contentRatio < MIN_CONTENT_RATIO,
    pixel: { x: minX, y: minY, w: finalW, h: finalH, W, H },
    sampledContent: contentPx,
    bg,
  };
}

/**
 * Load a File / Blob / URL into ImageData via canvas (browser).
 */
export async function loadImageData(source) {
  const url =
    typeof source === "string"
      ? source
      : URL.createObjectURL(source);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("טעינת תמונת התוכנית נכשלה"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return {
      imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
      width: canvas.width,
      height: canvas.height,
      image: img,
    };
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

export async function detectContentBounds(source, opts) {
  const { imageData, width, height, image } = await loadImageData(source);
  const bounds = detectContentBoundsFromImageData(imageData, opts);
  return { ...bounds, width, height, image };
}

/**
 * Crop an image (File/Blob/HTMLImageElement) to a normalized rect → JPEG Blob.
 */
export async function cropImageToBlob(source, crop, opts = {}) {
  let img = source;
  if (!(source instanceof HTMLImageElement)) {
    const loaded = await loadImageData(source);
    img = loaded.image;
  }
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const sx = Math.round(clamp(crop.x, 0, 1) * W);
  const sy = Math.round(clamp(crop.y, 0, 1) * H);
  const sw = Math.max(1, Math.round(clamp(crop.w, 0.01, 1) * W));
  const sh = Math.max(1, Math.round(clamp(crop.h, 0.01, 1) * H));
  const cw = Math.min(sw, W - sx);
  const ch = Math.min(sh, H - sy);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
  const type = opts.type || "image/jpeg";
  const quality = opts.quality ?? 0.92;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error("חיתוך התוכנית נכשל");
  return blob;
}

/**
 * Whether confirming this crop is allowed when the source needs cropping.
 * Full-frame (or nearly) confirm is refused when needsCrop.
 */
export function assertCropAcceptable(crop, detection) {
  const coversAlmostAll = crop.w * crop.h >= 0.92;
  if (detection?.needsCrop && coversAlmostAll) {
    return {
      ok: false,
      error:
        "התמונה נראית כמו צילום מסך מלא (התוכנית תופסת פחות ממחצית השטח). חתוך את תוכנית הקומה בלבד לפני השמירה.",
    };
  }
  if (!(crop.w >= 0.05 && crop.h >= 0.05)) {
    return { ok: false, error: "אזור החיתוך קטן מדי" };
  }
  return { ok: true };
}
