/**
 * Keeps the PSV MapPlugin floor plan framed inside the map widget at every
 * zoom level, pan position and widget size (small widget, maximized, mobile).
 *
 * MapPlugin geometry (static map, rotation 0), in original image pixels:
 *   view centre V = config.center + state.offset
 *   scale s       = exp(state.zoom)   (CSS px per image px)
 * The widget shows image rect [V - W/2s, V + W/2s] × [V - H/2s, V + H/2s].
 *
 * Constraints enforced before every render:
 *   - s ≥ cover scale of the apartment content bounds (plan never smaller than widget)
 *   - the visible rect stays inside the content bounds (plan never scrolled off)
 *   - the visible rect shows at least `minContent` apartment pixels (not a dark
 *     scan-margin corner of an L-shaped plan)
 */

const MAX_MODEL_SIDE = 1024;
const BG_THRESHOLD = 28;
const BOX_RADIUS = 2;
const LINE_DENSITY = 0.08;
export const DEFAULT_MIN_CONTENT = 0.5;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Build a content model from plan pixels: background colour, content bounds
 * and an integral image of the content mask (all in original image pixels).
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
 * @param {number} [scale=1] original image px per imageData px
 */
export function buildPlanContentModel(imageData, scale = 1) {
  const { data, width: w, height: h } = imageData;
  if (!w || !h) return null;

  // Integral of RGB for O(1) box averages (grid lines average out to background).
  const W1 = w + 1;
  const sr = new Float64Array(W1 * (h + 1));
  const sg = new Float64Array(W1 * (h + 1));
  const sb = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let rr = 0;
    let rg = 0;
    let rb = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rr += data[i];
      rg += data[i + 1];
      rb += data[i + 2];
      const o = (y + 1) * W1 + (x + 1);
      sr[o] = sr[o - W1] + rr;
      sg[o] = sg[o - W1] + rg;
      sb[o] = sb[o - W1] + rb;
    }
  }
  const boxAvg = (arr, x, y) => {
    const x0 = Math.max(0, x - BOX_RADIUS);
    const y0 = Math.max(0, y - BOX_RADIUS);
    const x1 = Math.min(w, x + BOX_RADIUS + 1);
    const y1 = Math.min(h, y + BOX_RADIUS + 1);
    const n = (x1 - x0) * (y1 - y0);
    return (arr[y1 * W1 + x1] - arr[y0 * W1 + x1] - arr[y1 * W1 + x0] + arr[y0 * W1 + x0]) / n;
  };
  const corner = (x, y) => [boxAvg(sr, x, y), boxAvg(sg, x, y), boxAvg(sb, x, y)];
  const cs = [corner(2, 2), corner(w - 3, 2), corner(2, h - 3), corner(w - 3, h - 3)];
  const bg = [0, 1, 2].map((k) => cs.reduce((s, c) => s + c[k], 0) / cs.length);

  const mask = new Uint8Array(w * h);
  const rowCount = new Uint32Array(h);
  const colCount = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(
        boxAvg(sr, x, y) - bg[0],
        boxAvg(sg, x, y) - bg[1],
        boxAvg(sb, x, y) - bg[2]
      );
      if (d > BG_THRESHOLD) {
        mask[y * w + x] = 1;
        rowCount[y]++;
        colCount[x]++;
      }
    }
  }

  const firstLast = (counts, total) => {
    let a = -1;
    let b = -1;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] / total > LINE_DENSITY) {
        if (a < 0) a = i;
        b = i;
      }
    }
    return [a, b];
  };
  let [x0, x1] = firstLast(colCount, h);
  let [y0, y1] = firstLast(rowCount, w);
  if (x0 < 0 || y0 < 0 || x1 - x0 < w * 0.1 || y1 - y0 < h * 0.1) {
    x0 = 0;
    y0 = 0;
    x1 = w - 1;
    y1 = h - 1;
  }

  const integral = new Uint32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      run += mask[y * w + x];
      const o = (y + 1) * W1 + (x + 1);
      integral[o] = integral[o - W1] + run;
    }
  }

  return {
    scale,
    maskWidth: w,
    maskHeight: h,
    width: w * scale,
    height: h * scale,
    background: bg,
    bounds: { x0: x0 * scale, y0: y0 * scale, x1: (x1 + 1) * scale, y1: (y1 + 1) * scale },
    integral,
  };
}

/** Fraction of apartment pixels inside an image-pixel rect. */
export function contentFraction(model, x0, y0, x1, y1) {
  if (!model?.integral) return 1;
  const { scale, maskWidth: w, maskHeight: h, integral } = model;
  const W1 = w + 1;
  const ax = clamp(Math.floor(x0 / scale), 0, w);
  const ay = clamp(Math.floor(y0 / scale), 0, h);
  const bx = clamp(Math.ceil(x1 / scale), 0, w);
  const by = clamp(Math.ceil(y1 / scale), 0, h);
  const n = (bx - ax) * (by - ay);
  if (n <= 0) return 0;
  const sum =
    integral[by * W1 + bx] - integral[ay * W1 + bx] - integral[by * W1 + ax] + integral[ay * W1 + ax];
  return sum / n;
}

/** Scale at which the content bounds exactly cover a viewW×viewH widget. */
export function coverScale(bounds, viewW, viewH) {
  const bw = Math.max(1, bounds.x1 - bounds.x0);
  const bh = Math.max(1, bounds.y1 - bounds.y0);
  return Math.max(viewW / bw, viewH / bh);
}

/**
 * Clamp MapPlugin zoom + offset so the plan stays framed.
 * @param {object} p
 * @param {object|null} p.model   content model (or null → image bounds only)
 * @param {{ width: number, height: number }} p.imageSize original image px
 * @param {number} p.viewW widget CSS width
 * @param {number} p.viewH widget CSS height
 * @param {{ x: number, y: number }} p.center MapPlugin config.center
 * @param {{ x: number, y: number }} p.offset MapPlugin state.offset
 * @param {number} p.zoomLog MapPlugin state.zoom (log scale)
 * @param {number} [p.maxZoomLog] configured max (log); raised to cover when needed
 * @param {number} [p.minContent]
 */
export function clampMapView(p) {
  const {
    model,
    imageSize,
    viewW,
    viewH,
    center,
    offset,
    zoomLog,
    maxZoomLog = Math.log(2),
    minContent = DEFAULT_MIN_CONTENT,
  } = p;
  const bounds = model?.bounds || {
    x0: 0,
    y0: 0,
    x1: imageSize.width,
    y1: imageSize.height,
  };

  const sMin = coverScale(bounds, viewW, viewH);
  const sMax = Math.max(Math.exp(maxZoomLog), sMin);
  const s = clamp(Math.exp(zoomLog), sMin, sMax);
  const hw = viewW / 2 / s;
  const hh = viewH / 2 / s;

  const xlo = bounds.x0 + hw;
  const xhi = Math.max(xlo, bounds.x1 - hw);
  const ylo = bounds.y0 + hh;
  const yhi = Math.max(ylo, bounds.y1 - hh);

  let vx = clamp(center.x + offset.x, xlo, xhi);
  let vy = clamp(center.y + offset.y, ylo, yhi);

  const frac = (x, y) => contentFraction(model, x - hw, y - hh, x + hw, y + hh);
  let fraction = frac(vx, vy);

  // Not panned away by the user → the current-position pin must stay in view.
  const followPin = Math.hypot(offset.x, offset.y) < 1;
  const pad = 12 / s;
  const pinInside = (x, y) =>
    Math.abs(center.x - x) <= hw - pad && Math.abs(center.y - y) <= hh - pad;

  if (model?.integral && fraction < minContent) {
    // Nearest window position that still shows enough apartment.
    const step = Math.max(2, Math.min(hw, hh) / 4);
    let best = null;
    let bestD = Infinity;
    let fallback = null;
    let fallbackF = -1;
    for (let y = ylo; y <= yhi + 1e-6; y += step) {
      for (let x = xlo; x <= xhi + 1e-6; x += step) {
        if (followPin && !pinInside(x, y)) continue;
        const f = frac(x, y);
        if (f > fallbackF) {
          fallbackF = f;
          fallback = { x, y };
        }
        if (f >= minContent) {
          const d = (x - vx) ** 2 + (y - vy) ** 2;
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
      }
    }
    const pick = best || fallback;
    if (pick) {
      vx = pick.x;
      vy = pick.y;
      fraction = frac(vx, vy);
    }
  }

  return {
    zoomLog: Math.log(s),
    offset: { x: vx - center.x, y: vy - center.y },
    view: { x: vx, y: vy, halfW: hw, halfH: hh },
    scale: s,
    minScale: sMin,
    maxScale: sMax,
    bounds,
    fraction,
  };
}

/**
 * Load a plan image and build its content model (browser only).
 * Downscales large plans so the model stays small.
 * @param {string} url
 * @returns {Promise<{ width: number, height: number, model: object|null } | null>}
 */
export function loadPlanModel(url) {
  if (!url || typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      let model = null;
      try {
        const k = Math.min(1, MAX_MODEL_SIDE / Math.max(width, height));
        const cw = Math.max(1, Math.round(width * k));
        const ch = Math.max(1, Math.round(height * k));
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, cw, ch);
        model = buildPlanContentModel(ctx.getImageData(0, 0, cw, ch), width / cw);
      } catch {
        // Tainted canvas — frame to image bounds only.
        model = null;
      }
      resolve({ width, height, model });
    };
    img.onerror = () => resolve(null);
    // Same-origin proxy URLs don't need CORS; Blob CDN sends ACAO: *.
    if (/^https?:\/\//i.test(url)) img.crossOrigin = "anonymous";
    img.src = url;
  });
}

/**
 * Wrap MapPlugin's render so zoom/offset are clamped before every frame
 * (wheel, pinch, drag, zoom buttons, reset, maximize, node change).
 * @param {object} map MapPlugin instance
 * @param {{ url: string, width: number, height: number, model: object|null }} initial
 */
export function installMapFraming(map, initial) {
  const component = map?.component;
  if (!component || typeof component.render !== "function") return null;

  const models = new Map();
  if (initial?.url) models.set(initial.url, initial);
  const pending = new Set();

  const modelFor = (url) => {
    const hit = models.get(url);
    if (hit) return hit;
    if (url && !pending.has(url)) {
      pending.add(url);
      loadPlanModel(url).then((m) => {
        pending.delete(url);
        if (m) {
          models.set(url, { url, ...m });
          component.update();
        }
      });
    }
    return null;
  };

  const originalRender = component.render;
  let last = null;

  const framedRender = function framedRender() {
    const cfg = map.config;
    const url = cfg?.imageUrl;
    const img = component.state?.images?.[url];
    const viewW = component.container?.clientWidth || 0;
    const viewH = component.container?.clientHeight || 0;
    const centerOk =
      Number.isFinite(cfg?.center?.x) && Number.isFinite(cfg?.center?.y);
    if (centerOk && img && !img.loading && viewW > 0 && viewH > 0 && cfg.static) {
      const entry = modelFor(url);
      const imgScale = component.state.imgScale || 1;
      const imageSize = entry || {
        width: (img.value.naturalWidth || img.value.width) / imgScale,
        height: (img.value.naturalHeight || img.value.height) / imgScale,
      };
      const r = clampMapView({
        model: entry?.model || null,
        imageSize,
        viewW,
        viewH,
        center: cfg.center,
        offset: component.state.offset,
        zoomLog: component.state.zoom,
        maxZoomLog: cfg.maxZoom,
      });
      component.state.zoom = r.zoomLog;
      component.state.offset.x = r.offset.x;
      component.state.offset.y = r.offset.y;
      last = { ...r, viewW, viewH, imageUrl: url };
    }
    return originalRender.call(this);
  };

  component.render = framedRender;
  component.update();

  const api = {
    getState: () => last,
    // For tests: restore unframed rendering / re-install it.
    disable: () => {
      component.render = originalRender;
      component.update();
    },
    enable: () => {
      component.render = framedRender;
      component.update();
    },
  };
  map.__visioFraming = api;
  return api;
}
