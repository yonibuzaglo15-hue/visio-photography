/**
 * Rendered-canvas probes for the viewer's MapPlugin + tour.json snapshot/restore.
 *
 * Every assertion here reads the pixels MapPlugin actually drew — not DOM presence.
 */
const { expect, request: pwRequest } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SHOT_DIR = path.join(process.cwd(), "test-output", "acceptance");

/** Plan must fill the widget (opaque plan pixels) … */
const MIN_COVERAGE = 0.97;
/** … and show apartment, not just the dark scan margin. */
const MIN_CONTENT = 0.45;

/** Injected into every page before load; exposes window.__e2e probes. */
const PROBES = String.raw`
(() => {
  const plans = new Map();
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  async function plan(url) {
    if (plans.has(url)) return plans.get(url);
    const p = new Promise((resolve) => {
      const img = new Image();
      if (/^https?:\/\//i.test(url)) img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const avg = (cx, cy) => {
          let r = 0, g = 0, b = 0, n = 0;
          for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
            const i = (y * d.width + x) * 4;
            r += d.data[i]; g += d.data[i + 1]; b += d.data[i + 2]; n++;
          }
          return [r / n, g / n, b / n];
        };
        const cs = [avg(2, 2), avg(d.width - 3, 2), avg(2, d.height - 3), avg(d.width - 3, d.height - 3)];
        const bg = [0, 1, 2].map((k) => cs.reduce((s, c) => s + c[k], 0) / 4);
        resolve({ width: d.width, height: d.height, data: d.data, bg });
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    plans.set(url, p);
    return p;
  }

  function canvasInfo() {
    const map = window.__visioMap;
    const comp = map.component;
    const canvas = comp.canvas;
    const cssW = comp.container.clientWidth;
    const cssH = comp.container.clientHeight;
    const dpr = canvas.width / Math.max(1, cssW);
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { map, comp, canvas, cssW, cssH, dpr, img };
  }

  window.__e2e = {
    async metrics() {
      const map = window.__visioMap;
      if (!map) return { present: false };
      const comp = map.component;
      const url = map.config.imageUrl;
      const entry = comp.state.images[url];
      const loadedImg = entry && !entry.loading ? entry.value : null;
      const p = await plan(url);
      const { cssW, cssH, dpr, img } = canvasInfo();
      const visible = comp.isVisible() && getComputedStyle(comp.container).display !== "none";
      let n = 0, opaque = 0, content = 0;
      const step = Math.max(1, Math.round(2 * dpr));
      for (let y = 0; y < img.height; y += step) {
        for (let x = 0; x < img.width; x += step) {
          const i = (y * img.width + x) * 4;
          n++;
          if (img.data[i + 3] >= 250) {
            opaque++;
            if (p && dist([img.data[i], img.data[i + 1], img.data[i + 2]], p.bg) > 40) content++;
          }
        }
      }
      const st = map.__visioFraming?.getState?.() || null;
      return {
        present: true,
        visible,
        imageUrl: url,
        imageNatural: loadedImg
          ? { w: loadedImg.naturalWidth || loadedImg.width, h: loadedImg.naturalHeight || loadedImg.height }
          : null,
        coverage: n ? opaque / n : 0,
        content: n ? content / n : 0,
        cssW,
        cssH,
        dpr,
        zoomPct: Math.exp(comp.state.zoom) * 100,
        maximized: comp.maximized,
        offset: { ...comp.state.offset },
        framing: st && {
          scale: st.scale,
          minScale: st.minScale,
          maxScale: st.maxScale,
          view: st.view,
          bounds: st.bounds,
          fraction: st.fraction,
        },
      };
    },

    /** Centroid of the blue current-position pin, canvas CSS px. */
    pin() {
      const { cssW, cssH, dpr, img } = canvasInfo();
      let sx = 0, sy = 0, c = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2], a = img.data[i + 3];
          if (a > 200 && r < 90 && b > 190 && g > 80 && g < 170) { sx += x; sy += y; c++; }
        }
      }
      return { count: c, x: c ? sx / c / dpr : null, y: c ? sy / c / dpr : null, cssW, cssH, dpr };
    },

    /**
     * Direction of the view cone, degrees (screen, y down). Measured as the pixel
     * difference between this frame and the same frame rendered without the cone,
     * so yellow-ish plan content (wood floors, tables) can't bias it.
     */
    async cone(pinX, pinY) {
      const map = window.__visioMap;
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const size = map.config.coneSize;
      const color = map.config.coneColor;
      // Same geometry, high-contrast colour only while measuring: the real gold
      // cone is close to the plan's wood tones, which biases a contrast centroid.
      map.setOptions({ coneColor: "#ff00ff" });
      await frame();
      const a = canvasInfo().img;
      map.setOptions({ coneSize: 0 });
      await frame();
      const b = canvasInfo().img;
      map.setOptions({ coneSize: size, coneColor: color });
      await frame();
      const { dpr } = canvasInfo();
      const r0 = 12 * dpr, r1 = (size + 2) * dpr;
      const px = pinX * dpr, py = pinY * dpr;
      let sx = 0, sy = 0, w = 0, c = 0;
      for (let y = Math.max(0, Math.floor(py - r1)); y < Math.min(a.height, py + r1); y++) {
        for (let x = Math.max(0, Math.floor(px - r1)); x < Math.min(a.width, px + r1); x++) {
          const d = Math.hypot(x - px, y - py);
          if (d < r0 || d > r1) continue;
          const i = (y * a.width + x) * 4;
          const diff = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
          if (diff < 12) continue;
          sx += x - px; sy += y - py; w += 1; c++;
        }
      }
      return { count: c, angle: w ? (Math.atan2(sy, sx) * 180) / Math.PI : null };
    },

    /**
     * Check the drawn plan matches the plan image under the framing transform
     * (so "pin at image point P" is a statement about what the user sees).
     */
    async transformCheck(excludeX, excludeY) {
      const map = window.__visioMap;
      const st = map.__visioFraming.getState();
      const p = await plan(map.config.imageUrl);
      const { cssW, cssH, dpr, img } = canvasInfo();
      const sample = (shiftX) => {
        let diff = 0, n = 0;
        let seed = 7;
        const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < 600; k++) {
          const cx = 8 + rand() * (cssW - 16);
          const cy = 8 + rand() * (cssH - 16);
          if (Math.hypot(cx - excludeX, cy - excludeY) < 55) continue;
          const ix = Math.round(st.view.x + shiftX + (cx - cssW / 2) / st.scale);
          const iy = Math.round(st.view.y + (cy - cssH / 2) / st.scale);
          if (ix < 0 || iy < 0 || ix >= p.width || iy >= p.height) continue;
          const ci = (Math.round(cy * dpr) * img.width + Math.round(cx * dpr)) * 4;
          const pi = (iy * p.width + ix) * 4;
          diff += (Math.abs(img.data[ci] - p.data[pi]) + Math.abs(img.data[ci + 1] - p.data[pi + 1]) + Math.abs(img.data[ci + 2] - p.data[pi + 2])) / 3;
          n++;
        }
        return n ? diff / n : Infinity;
      };
      return { n: 600, meanDiff: sample(0), shiftedDiff: sample(25) };
    },
  };
})();
`;

async function installProbes(page) {
  await page.addInitScript({ content: PROBES });
}

async function waitForMapReady(page) {
  await page.waitForFunction(
    () => {
      const m = window.__visioMap;
      if (!m) return false;
      const e = m.component.state.images[m.config.imageUrl];
      return Boolean(e && !e.loading && m.__visioFraming?.getState?.());
    },
    null,
    { timeout: 60_000 }
  );
}

/** Poll metrics until framed (render is rAF-driven), then return the last reading. */
async function readFramed(page) {
  let m = null;
  for (let i = 0; i < 25; i++) {
    m = await page.evaluate(() => window.__e2e.metrics());
    if (m.present && m.visible && m.coverage >= MIN_COVERAGE && m.content >= MIN_CONTENT) break;
    await page.waitForTimeout(120);
  }
  return m;
}

/**
 * Assert the plan is visibly framed in the widget right now.
 * Records the reading + a screenshot, uses soft assertions so the whole matrix reports.
 */
async function assertMapFramed(page, label, results, extra = {}) {
  const m = await readFramed(page);
  const file = path.join(SHOT_DIR, `map-${label}.png`);
  if (m?.maximized) await page.screenshot({ path: file });
  else await page.locator(".psv-map").screenshot({ path: file }).catch(() => page.screenshot({ path: file }));
  const pass =
    Boolean(m?.present && m.visible) &&
    (m.imageNatural?.w || 0) > 16 &&
    (m.imageNatural?.h || 0) > 16 &&
    m.coverage >= MIN_COVERAGE &&
    m.content >= MIN_CONTENT;
  const row = { label, pass, screenshot: path.relative(process.cwd(), file), ...extra, metrics: m };
  results?.push(row);
  expect.soft(m?.present && m.visible, `${label}: map widget present+visible`).toBe(true);
  expect.soft(m?.imageNatural?.w || 0, `${label}: plan image loaded (naturalWidth)`).toBeGreaterThan(16);
  expect.soft(m?.imageNatural?.h || 0, `${label}: plan image loaded (naturalHeight)`).toBeGreaterThan(16);
  expect.soft(m?.coverage ?? 0, `${label}: plan covers widget`).toBeGreaterThanOrEqual(MIN_COVERAGE);
  expect.soft(m?.content ?? 0, `${label}: apartment visible (not dark margin)`).toBeGreaterThanOrEqual(MIN_CONTENT);
  return row;
}

async function hotspotClientPositions(page) {
  return page.evaluate(() => Object.values(window.__visioMap.component.state.hotspotPos || {}));
}

/**
 * Real mouse drag on the map canvas. Repeats short drags (start+end inside the
 * canvas, never releasing on a hotspot) until the view stops moving.
 * @returns {Promise<"mouse"|"addOffset">}
 */
async function panMapToEdge(page, dirX, dirY, state) {
  const box = await page.locator(".psv-map canvas").boundingBox();
  const len = Math.min(box.width, box.height) * 0.6;
  const dx = dirX * len;
  const dy = dirY * len;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const viewOf = () =>
    page.evaluate(() => {
      const s = window.__visioMap.__visioFraming.getState();
      return { x: s.view.x, y: s.view.y };
    });

  if (state.mode === "addOffset") {
    await page.evaluate(
      ({ dirX, dirY }) => window.__visioMap.component.addOffset({ x: -dirX * 1e5, y: -dirY * 1e5 }),
      { dirX, dirY }
    );
    await page.waitForTimeout(250);
    return "addOffset";
  }

  let prev = await viewOf();
  let movedAny = false;
  for (let i = 0; i < 30; i++) {
    let sx = cx - dx / 2;
    let sy = cy - dy / 2;
    let ex = cx + dx / 2;
    let ey = cy + dy / 2;
    const spots = await hotspotClientPositions(page);
    if (spots.some((p) => Math.hypot(p.x - ex, p.y - ey) < 22)) {
      // Nudge perpendicular so mouseup never lands on a hotspot (would navigate).
      const nx = dirY !== 0 ? 30 : 0;
      const ny = dirX !== 0 ? 30 : 0;
      sx += nx; ex += nx; sy += ny; ey += ny;
    }
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(sx + ((ex - sx) * k) / 8, sy + ((ey - sy) * k) / 8);
    await page.mouse.up();
    await page.waitForTimeout(80);
    const cur = await viewOf();
    const moved = Math.hypot(cur.x - prev.x, cur.y - prev.y) > 0.25;
    if (moved) movedAny = true;
    if (!moved) break;
    prev = cur;
  }
  if (!movedAny && state.mode === "probe") {
    // Mouse drag had no effect on this browser (e.g. mobile WebKit) — fall back.
    state.mode = "addOffset";
    return panMapToEdge(page, dirX, dirY, state);
  }
  if (state.mode === "probe" && movedAny) state.mode = "mouse";
  await page.waitForTimeout(150);
  return state.mode === "addOffset" ? "addOffset" : "mouse";
}

async function clickMapButton(page, title) {
  await page.locator(`.psv-map__button[title="${title}"]`).click();
  await page.waitForTimeout(500);
}

async function setMapZoomPct(page, pct) {
  await page.evaluate((p) => window.__visioMap.setZoom(p), pct);
  await page.waitForTimeout(200);
}

const EDGES = [
  // drag direction → edge revealed: drag right shows the left edge, etc.
  { name: "left-edge", dirX: 1, dirY: 0, bound: (f) => f.view.x - f.view.halfW - f.bounds.x0 },
  { name: "right-edge", dirX: -1, dirY: 0, bound: (f) => f.bounds.x1 - (f.view.x + f.view.halfW) },
  { name: "top-edge", dirX: 0, dirY: 1, bound: (f) => f.view.y - f.view.halfH - f.bounds.y0 },
  { name: "bottom-edge", dirX: 0, dirY: -1, bound: (f) => f.bounds.y1 - (f.view.y + f.view.halfH) },
  { name: "top-left-corner", dirX: 1, dirY: 1 },
  { name: "top-right-corner", dirX: -1, dirY: 1 },
  { name: "bottom-left-corner", dirX: 1, dirY: -1 },
  { name: "bottom-right-corner", dirX: -1, dirY: -1 },
];

/**
 * Default, min, max zoom + pan to every edge/corner at min and max zoom.
 * @param {string} prefix label prefix (e.g. "desktop-widget")
 */
async function runFramingMatrix(page, prefix, results, inputState) {
  await clickMapButton(page, "Reset");
  await assertMapFramed(page, `${prefix}-default-zoom`, results);

  for (const [zoomName, pct] of [
    ["min-zoom", 1],
    ["max-zoom", 1e6],
  ]) {
    await clickMapButton(page, "Reset");
    await setMapZoomPct(page, pct);
    const z = await page.evaluate(() => {
      const s = window.__visioMap.__visioFraming.getState();
      return { scale: s.scale, minScale: s.minScale, maxScale: s.maxScale };
    });
    const target = zoomName === "min-zoom" ? z.minScale : z.maxScale;
    expect.soft(Math.abs(z.scale - target), `${prefix} ${zoomName} reached`).toBeLessThan(1e-6);
    const pin = await page.evaluate(() => window.__e2e.pin());
    // Not panned → the current-position pin must be on screen at this zoom.
    expect.soft(pin.count, `${prefix} ${zoomName}: current-position pin visible`).toBeGreaterThan(20);
    await assertMapFramed(page, `${prefix}-${zoomName}`, results, {
      scale: z.scale,
      pinPixels: pin.count,
    });

    for (const edge of EDGES) {
      await clickMapButton(page, "Reset");
      await setMapZoomPct(page, pct);
      const input = await panMapToEdge(page, edge.dirX, edge.dirY, inputState);
      const f = await page.evaluate(() => window.__visioMap.__visioFraming.getState());
      const extra = { input, zoom: zoomName };
      if (edge.bound) {
        const gap = edge.bound(f);
        extra.edgeGapImagePx = gap;
        // Pan reached the plan's edge exactly — no further, no empty strip.
        expect.soft(Math.abs(gap), `${prefix} ${zoomName} ${edge.name} clamped at bound`).toBeLessThan(1.5);
      }
      await assertMapFramed(page, `${prefix}-${zoomName}-${edge.name}`, results, extra);
    }
  }
}

/** Blue pin location → image px through the framing transform. */
async function pinImagePoint(page) {
  const pin = await page.evaluate(() => window.__e2e.pin());
  const f = await page.evaluate(() => window.__visioMap.__visioFraming.getState());
  if (!pin.count) return { pin, f, image: null };
  return {
    pin,
    f,
    image: {
      x: f.view.x + (pin.x - pin.cssW / 2) / f.scale,
      y: f.view.y + (pin.y - pin.cssH / 2) / f.scale,
    },
  };
}

/* ---------------- tour.json snapshot / restore via the app's own API ---------------- */

async function apiContext(baseURL) {
  return pwRequest.newContext({ baseURL });
}

async function getEditorPayload(api, jobId) {
  const res = await api.get(`/api/pipeline/jobs/${jobId}/tour`);
  expect(res.ok(), `GET tour ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return {
    scenes: body.scenes,
    floorPlans: body.floorPlans,
    firstSceneId: body.firstSceneId,
    version: body.version || null,
  };
}

/** Save through the app API on top of the newest version (restore / fixtures). */
async function putEditorPayload(api, jobId, payload) {
  const { version } = await getEditorPayload(api, jobId);
  const { version: _ignored, ...data } = payload;
  const res = await api.put(`/api/pipeline/jobs/${jobId}/tour`, {
    data: { ...data, baseVersion: version },
    timeout: 240_000,
  });
  const body = await res.json().catch(() => ({}));
  expect(res.ok() && body.ok, `PUT tour ${res.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

async function blobTourJson(api, jobId) {
  const base =
    process.env.NEXT_PUBLIC_BLOB_BASE_URL ||
    "https://5ltyuhgj5vbqjxug.public.blob.vercel-storage.com";
  const res = await api.get(`${base}/tours/${jobId}/tour.json?t=${Date.now()}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/**
 * Vercel Blob's CDN ignores query strings, so an overwrite can be served stale
 * for a while. Poll until the stored tour.json satisfies `predicate`.
 * @returns {Promise<{ cfg: object, waitedMs: number }>}
 */
async function waitForBlobTourJson(api, jobId, predicate, timeoutMs = 360_000) {
  const t0 = Date.now();
  let cfg = null;
  while (Date.now() - t0 < timeoutMs) {
    cfg = await blobTourJson(api, jobId);
    if (predicate(cfg)) return { cfg, waitedMs: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { cfg, waitedMs: Date.now() - t0, timedOut: true };
}

/** Placements from a tour.json config, or from an editor scenes array. */
function placementsOf(cfgOrScenes) {
  const entries = Array.isArray(cfgOrScenes)
    ? cfgOrScenes.map((s) => [s.id, s])
    : Object.entries(cfgOrScenes.scenes || {});
  return entries
    .filter(([, s]) => Number.isFinite(s.mapX) || Number.isFinite(s.mapY) || s.mapPlanId)
    .map(([id, s]) => ({ id, mapX: s.mapX ?? null, mapY: s.mapY ?? null, mapPlanId: s.mapPlanId ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/* ---------------- pinned baseline (crash- and CDN-staleness-safe restore) ---------------- */

const BASELINE_DIR = path.join(process.cwd(), ".data", "e2e");

/** What the suite must leave untouched: placements, hotspots, names, hidden flags. */
function dataSignature(payload) {
  return JSON.stringify({
    placements: placementsOf(payload.scenes),
    scenes: payload.scenes.map((s) => ({
      id: s.id,
      title: s.title || "",
      hidden: Boolean(s.hidden),
      hotSpots: (s.hotSpots || [])
        .map((h) => [h.sceneId || h.targetSceneId, Number(h.yaw).toFixed(2), Number(h.pitch).toFixed(2)])
        .sort(),
    })),
    firstSceneId: payload.firstSceneId || null,
  });
}

/**
 * The suite restores to a pinned baseline file, never to a fresh read: Vercel
 * Blob's CDN is eventually consistent, so a read right after a write can return
 * test data and a "snapshot" of it would make that data permanent.
 *
 * - No baseline yet (or E2E_REFRESH_BASELINE=1): pin the current data.
 * - Current data ≠ baseline: refuse to run (no writes), unless
 *   E2E_RESTORE_BASELINE=1 (recover from an interrupted run).
 */
async function loadPinnedBaseline(api, jobId) {
  const file = path.join(BASELINE_DIR, `${jobId}.json`);
  const current = await getEditorPayload(api, jobId);
  if (!fs.existsSync(file) || process.env.E2E_REFRESH_BASELINE === "1") {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ pinnedAt: new Date().toISOString(), payload: current }, null, 2)
    );
    return { payload: current, source: "pinned-now" };
  }
  const pinned = JSON.parse(fs.readFileSync(file, "utf8")).payload;
  if (dataSignature(current) === dataSignature(pinned)) {
    return { payload: pinned, source: "matches-pinned" };
  }
  if (process.env.E2E_RESTORE_BASELINE === "1") {
    await putEditorPayload(api, jobId, pinned);
    return { payload: pinned, source: "restored-pinned" };
  }
  throw new Error(
    `Job ${jobId} data differs from the pinned E2E baseline (${file}). ` +
      `Refusing to run so tests can't overwrite real edits. Current placements: ` +
      `${JSON.stringify(placementsOf(current.scenes))}; pinned: ${JSON.stringify(placementsOf(pinned.scenes))}. ` +
      `If this is leftover test data, re-run with E2E_RESTORE_BASELINE=1; ` +
      `if these are real edits, re-run with E2E_REFRESH_BASELINE=1.`
  );
}

function writeJson(name, data) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.writeFileSync(path.join(SHOT_DIR, name), JSON.stringify(data, null, 2));
}

module.exports = {
  SHOT_DIR,
  MIN_COVERAGE,
  MIN_CONTENT,
  installProbes,
  waitForMapReady,
  readFramed,
  assertMapFramed,
  runFramingMatrix,
  clickMapButton,
  setMapZoomPct,
  panMapToEdge,
  pinImagePoint,
  apiContext,
  getEditorPayload,
  putEditorPayload,
  blobTourJson,
  waitForBlobTourJson,
  placementsOf,
  dataSignature,
  loadPinnedBaseline,
  writeJson,
};
