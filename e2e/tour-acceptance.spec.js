/**
 * Acceptance suite — real browser, real admin editor, real public viewer.
 * Requires DEV_AUTH_BYPASS=1 (local only).
 *
 * Data safety: global-setup refuses to run unless the job matches the pinned
 * baseline; global-teardown restores it. Tests create data only through the
 * editor UI (clicks on the real plan / panorama) — never invented positions.
 *
 * Screenshots land in test-output/acceptance/.
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const {
  installProbes,
  waitForMapReady,
  assertMapFramed,
  runFramingMatrix,
  clickMapButton,
  setMapZoomPct,
  pinImagePoint,
  apiContext,
  getEditorPayload,
  waitForBlobTourJson,
  placementsOf,
  writeJson,
} = require("./map-probes.js");

const JOB_ID = process.env.E2E_JOB_ID || "job_1790073394855_05316dbc";
const SHOT_DIR = path.join(process.cwd(), "test-output", "acceptance");
fs.mkdirSync(SHOT_DIR, { recursive: true });

/** The one known point used for the editor → viewer round trip (plan-normalized). */
const KNOWN_POINT = { nx: 0.5, ny: 0.5 };
const ROUND_TRIP_SCENE = "scene_0";
const HOTSPOT_TARGET_SCENE = "scene_1";
/** Obviously temporary title for the rename test (restored by global teardown). */
const TEMP_TITLE = "E2E שם זמני";

/** Rendered-map checks collected across tests (written per project at the end). */
const mapChecks = [];
let snapshot = null;
let snapshotPlacements = [];

const norm180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Camera filenames, extensions, timestamps, internal scene ids. */
const RAW_NAME_RE =
  /IMG[_\s-]?\d{3,}|VID[_\s-]?\d{3,}|\b[\w-]+\.(jpe?g|png|webp|heic|insp|dng)\b|\bscene_\d+\b|\b\d{8}_\d{6}\b/i;
/** Internal job ids must not reach the public viewer either. */
const JOB_ID_RE = /\bjob_\d{6,}/i;

/** Every string a user can see: text, tooltips (title), alt, aria-label, placeholders. */
const collectVisibleText = () => {
  const out = [];
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.visibility !== "hidden" && cs.display !== "none" && r.width > 0 && r.height > 0;
  };
  for (const line of (document.body.innerText || "").split("\n")) {
    if (line.trim()) out.push(line.trim());
  }
  for (const el of document.querySelectorAll("[title],[alt],[aria-label],[placeholder]")) {
    if (!visible(el)) continue;
    for (const a of ["title", "alt", "aria-label", "placeholder"]) {
      const v = el.getAttribute(a);
      if (v && v.trim()) out.push(v.trim());
    }
  }
  for (const o of document.querySelectorAll("option")) if (o.textContent.trim()) out.push(o.textContent.trim());
  return out;
};

async function waitMask(page) {
  await page.waitForFunction(() => window.__visioPlanMaskReady === true, null, { timeout: 30_000 });
}

async function unplacedIds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="map-unplaced-"]')].map((el) =>
      el.getAttribute("data-testid").replace("map-unplaced-", "")
    )
  );
}

async function firstUnplacedId(page) {
  const ids = await unplacedIds(page);
  if (!ids.length) throw new Error("no unplaced scene left");
  return ids[0];
}

/** Next unplaced scene after `id` in list order (what the editor should auto-select). */
async function nextUnplacedAfterInUi(page, id) {
  const ids = await unplacedIds(page);
  const i = ids.indexOf(id);
  for (let k = 1; k <= ids.length; k++) {
    const cand = ids[(i + k + ids.length) % ids.length];
    if (cand !== id) return cand;
  }
  return null;
}

async function placedCount(page) {
  return Number(await page.getByTestId("map-placed-count").getAttribute("data-placed"));
}

async function pinIds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="map-pin-"]')].map((el) =>
      el.getAttribute("data-testid").replace("map-pin-", "")
    )
  );
}

async function pinPositions(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="map-pin-"]')].map((el) => ({
      nx: Number(el.getAttribute("data-map-x")),
      ny: Number(el.getAttribute("data-map-y")),
    }))
  );
}

/**
 * Real apartment points on the actual plan (≥60 colour distance from the scan
 * background over a 5×5 patch), spread apart and away from existing pins.
 */
async function insidePoints(page, n, avoid = []) {
  return page.evaluate(
    async ({ n, avoid }) => {
      const img = document.querySelector('[data-testid="floor-plan-viewport"] img');
      let planUrl = img.getAttribute("src") || img.src;
      if (planUrl.includes("/api/dev/blob-cache")) {
        planUrl = new URL(planUrl, location.origin).searchParams.get("url") || planUrl;
      }
      const res = await fetch(`/api/pipeline/plan-proxy?url=${encodeURIComponent(planUrl)}`);
      const bmp = await createImageBitmap(await res.blob());
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const avg = (cx, cy) => {
        let r = 0, g = 0, b = 0, k = 0;
        for (let y = cy - 2; y <= cy + 2; y++)
          for (let x = cx - 2; x <= cx + 2; x++) {
            const i = (y * d.width + x) * 4;
            r += d.data[i]; g += d.data[i + 1]; b += d.data[i + 2]; k++;
          }
        return [r / k, g / k, b / k];
      };
      const cs = [avg(3, 3), avg(d.width - 4, 3), avg(3, d.height - 4), avg(d.width - 4, d.height - 4)];
      const bg = [0, 1, 2].map((j) => cs.reduce((s, x) => s + x[j], 0) / 4);
      const picked = [];
      const far = (p, list) => list.every((q) => Math.hypot(p.nx - q.nx, p.ny - q.ny) > 0.09);
      for (let ny = 0.2; ny <= 0.8 && picked.length < n; ny += 0.04) {
        for (let nx = 0.2; nx <= 0.8 && picked.length < n; nx += 0.04) {
          const p = { nx: Math.round(nx * 1000) / 1000, ny: Math.round(ny * 1000) / 1000 };
          const col = avg(Math.round(p.nx * (d.width - 1)), Math.round(p.ny * (d.height - 1)));
          if (Math.hypot(col[0] - bg[0], col[1] - bg[1], col[2] - bg[2]) < 60) continue;
          if (!far(p, avoid) || !far(p, picked)) continue;
          picked.push(p);
        }
      }
      if (picked.length < n) throw new Error(`only ${picked.length} inside points`);
      return picked;
    },
    { n, avoid }
  );
}

/** Pin stored at pt (≤2 plan px) AND drawn there (≤2 screen px). */
async function expectPinAt(page, sceneId, pt) {
  const pin = page.locator(`[data-testid="map-pin-${sceneId}"]`);
  await expect(pin).toBeVisible({ timeout: 15_000 });
  const r = await page.evaluate((id) => {
    const img = document.querySelector('[data-testid="floor-plan-viewport"] img');
    const el = document.querySelector(`[data-testid="map-pin-${id}"]`);
    const ir = img.getBoundingClientRect();
    const pr = el.getBoundingClientRect();
    const nx = Number(el.getAttribute("data-map-x"));
    const ny = Number(el.getAttribute("data-map-y"));
    return {
      nx,
      ny,
      w: img.naturalWidth,
      h: img.naturalHeight,
      drawnDx: Math.abs(pr.left + pr.width / 2 - (ir.left + nx * ir.width)),
      drawnDy: Math.abs(pr.top + pr.height / 2 - (ir.top + ny * ir.height)),
    };
  }, sceneId);
  expect(Math.abs(r.nx - pt.nx) * r.w, `${sceneId} stored x`).toBeLessThanOrEqual(2);
  expect(Math.abs(r.ny - pt.ny) * r.h, `${sceneId} stored y`).toBeLessThanOrEqual(2);
  expect(r.drawnDx, `${sceneId} drawn x`).toBeLessThanOrEqual(2);
  expect(r.drawnDy, `${sceneId} drawn y`).toBeLessThanOrEqual(2);
  return r;
}

async function dragPin(page, sceneId, pt) {
  const img = page.locator('[data-testid="floor-plan-viewport"] img');
  const box = await img.boundingBox();
  const pb = await page.locator(`[data-testid="map-pin-${sceneId}"]`).boundingBox();
  const sx = pb.x + pb.width / 2;
  const sy = pb.y + pb.height / 2;
  const ex = box.x + pt.nx * box.width;
  const ey = box.y + pt.ny * box.height;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(sx + ((ex - sx) * k) / 12, sy + ((ey - sy) * k) / 12);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

/** Click Save; returns the server response + exactly what was sent. */
async function saveEditor(page) {
  const resp = page.waitForResponse(
    (r) => r.url().includes(`/jobs/${JOB_ID}/tour`) && r.request().method() === "PUT",
    { timeout: 240_000 }
  );
  await expect(page.getByTestId("tour-save")).toBeEnabled();
  await page.getByTestId("tour-save").click();
  const res = await resp;
  const body = await res.json();
  expect(body.ok, JSON.stringify(body)).toBe(true);
  await expect(page.getByTestId("tour-save")).toHaveAttribute("data-dirty", "0");
  await expect(page.getByTestId("tour-save")).toHaveAttribute("data-version", body.version);
  return { ...body, request: res.request().postDataJSON() };
}

/**
 * Editor: pick target room, click the floor at (fx, fy) of the panorama.
 * Returns the yaw/pitch under that screen point (computed by the viewer) and
 * checks the new ring is drawn on that same point after the editor re-renders.
 */
async function placeRingViaEditor(page, sceneId, targetId, { fx, fy }) {
  await page.waitForFunction((id) => window.__visioTour?.getCurrentNode?.()?.id === id, sceneId, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  await page.getByTestId("hotspot-target-select").selectOption(targetId);
  await expect(page.getByTestId("hotspot-place-btn")).toContainText("לחץ על הרצפה");
  const box = await page.locator(".visio-tour-editor-viewer .psv-container").boundingBox();
  const local = { x: fx * box.width, y: fy * box.height };
  const at = await page.evaluate(({ x, y }) => {
    const s = window.__visioEditorViewer.dataHelper.viewerCoordsToSphericalCoords({ x, y });
    return { yaw: (s.yaw * 180) / Math.PI, pitch: (s.pitch * 180) / Math.PI };
  }, local);
  const click = { x: box.x + local.x, y: box.y + local.y };
  const viewerBefore = await page.evaluateHandle(() => window.__visioEditorViewer);
  await page.mouse.click(click.x, click.y);
  await expect(page.getByTestId("tour-ok")).toContainText("נקודה", { timeout: 10_000 });
  // The editor rebuilds its viewer with the new ring; measure on the new one once it settles.
  await page.waitForFunction(
    ([old, id]) =>
      window.__visioEditorViewer &&
      window.__visioEditorViewer !== old &&
      window.__visioTour?.getCurrentNode?.()?.id === id,
    [viewerBefore, sceneId],
    { timeout: 60_000 }
  );
  await page.waitForTimeout(1500);
  const ring = await page.waitForFunction(
    (target) => {
      const v = window.__visioEditorViewer;
      const el = [...v.container.querySelectorAll(".psv-virtual-tour-link")].find(
        (e) => e.tourLink?.nodeId === target
      );
      if (!el || !el.complete || !el.naturalWidth) return null;
      // Positioned by the renderer (not the pre-render corner) and panorama loaded.
      if (v.state.loadingPromise || !/translate\(-?[\d.]+px/.test(el.style.transform || "")) return null;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0)) return null;
      const c = v.container.getBoundingClientRect();
      const s = v.dataHelper.viewerCoordsToSphericalCoords({
        x: r.left + r.width / 2 - c.left,
        y: r.top + r.height / 2 - c.top,
      });
      return { yaw: (s.yaw * 180) / Math.PI, pitch: (s.pitch * 180) / Math.PI };
    },
    targetId,
    { timeout: 60_000 }
  );
  const drawnAt = await ring.jsonValue();
  const editorOnScreen = await page.evaluate(({ target, click }) => {
    const v = window.__visioEditorViewer;
    const el = [...v.container.querySelectorAll(".psv-virtual-tour-link")].find((e) => e.tourLink?.nodeId === target);
    const r = el.getBoundingClientRect();
    const c = v.container.getBoundingClientRect();
    return { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
  }, { target: targetId, click });
  // Same (unchanged) view → the ring's box sits on the clicked pixel of the viewer.
  expect(Math.hypot(editorOnScreen.x - local.x, editorOnScreen.y - local.y), "editor ring on clicked pixel").toBeLessThanOrEqual(4);
  expect(Math.abs(norm180(drawnAt.yaw - at.yaw)), "editor ring drawn at clicked yaw").toBeLessThan(0.5);
  expect(Math.abs(drawnAt.pitch - at.pitch), "editor ring drawn at clicked pitch").toBeLessThan(0.5);
  return { ...at, click, editorRingDrawnAt: drawnAt };
}

/**
 * Viewer: face the stored ring position; the ring element must be loaded, visible,
 * centred on screen, map back to the same yaw/pitch, and change real pixels.
 */
async function assertRingOnTile(page, targetId, ring, shotName) {
  await page.evaluate(
    ({ yaw, pitch }) => window.__visioViewer.rotate({ yaw: (yaw * Math.PI) / 180, pitch: (pitch * Math.PI) / 180 }),
    ring
  );
  await page.waitForFunction(
    (target) => {
      const v = window.__visioViewer;
      const el = [...document.querySelectorAll(".psv-virtual-tour-link")].find((e) => e.tourLink?.nodeId === target);
      return Boolean(el && !v.state.loadingPromise && /translate\(-?[\d.]+px/.test(el.style.transform || ""));
    },
    targetId,
    { timeout: 60_000 }
  );
  await page.waitForTimeout(800);
  const info = await page.evaluate((target) => {
    const v = window.__visioViewer;
    const cont = v.container.getBoundingClientRect();
    const el = [...document.querySelectorAll(".psv-virtual-tour-link")].find((e) => e.tourLink?.nodeId === target);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const s = v.dataHelper.viewerCoordsToSphericalCoords({ x: center.x - cont.left, y: center.y - cont.top });
    return {
      loaded: el.complete && el.naturalWidth > 0,
      naturalWidth: el.naturalWidth,
      opacity: Number(cs.opacity),
      visibility: cs.visibility,
      display: cs.display,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      center,
      screenCenter: { x: cont.left + cont.width / 2, y: cont.top + cont.height / 2 },
      at: { yaw: (s.yaw * 180) / Math.PI, pitch: (s.pitch * 180) / Math.PI },
    };
  }, targetId);
  expect(info, "ring element exists for the target room").toBeTruthy();
  expect(info.loaded, "ring image loaded").toBe(true);
  expect(info.visibility).toBe("visible");
  expect(info.display).not.toBe("none");
  expect(info.opacity).toBeGreaterThan(0.3);
  expect(info.rect.w).toBeGreaterThan(20);
  const offCenter = Math.hypot(info.center.x - info.screenCenter.x, info.center.y - info.screenCenter.y);
  expect(offCenter, "ring drawn where the view points (its tile)").toBeLessThanOrEqual(3);
  expect(Math.abs(norm180(info.at.yaw - ring.yaw)), "ring yaw on tile").toBeLessThan(0.5);
  expect(Math.abs(info.at.pitch - ring.pitch), "ring pitch on tile").toBeLessThan(0.5);

  // Real rendered pixels: region with the ring vs the same region with it hidden.
  const clip = {
    x: Math.max(0, info.rect.x - 4),
    y: Math.max(0, info.rect.y - 4),
    width: info.rect.w + 8,
    height: info.rect.h + 8,
  };
  const withRing = await page.screenshot({ clip });
  await page.evaluate((target) => {
    const el = [...document.querySelectorAll(".psv-virtual-tour-link")].find((e) => e.tourLink?.nodeId === target);
    el.style.visibility = "hidden";
  }, targetId);
  await page.waitForTimeout(150);
  const without = await page.screenshot({ clip });
  await page.evaluate((target) => {
    const el = [...document.querySelectorAll(".psv-virtual-tour-link")].find((e) => e.tourLink?.nodeId === target);
    el.style.visibility = "";
  }, targetId);
  const a = await sharp(withRing).raw().toBuffer();
  const b = await sharp(without).raw().toBuffer();
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff += Math.abs(a[i] - b[i]);
  const meanDiff = diff / Math.min(a.length, b.length);
  expect(meanDiff, "ring changes real pixels on the panorama").toBeGreaterThan(4);
  fs.writeFileSync(path.join(SHOT_DIR, `${shotName}-crop.png`), withRing);
  await shot(page, shotName);
  return { ...info, offCenterPx: offCenter, pixelMeanDiff: meanDiff };
}

async function waitArrival(page, nodeId) {
  await page.waitForFunction((id) => window.__visioTour.getCurrentNode()?.id === id, nodeId, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  let prev = null;
  for (let i = 0; i < 20; i++) {
    const p = await page.evaluate(() => {
      const pos = window.__visioViewer.getPosition();
      return { yaw: (pos.yaw * 180) / Math.PI, pitch: (pos.pitch * 180) / Math.PI };
    });
    if (prev && Math.abs(norm180(p.yaw - prev.yaw)) < 0.05 && Math.abs(p.pitch - prev.pitch) < 0.05) {
      return { yaw: norm180(p.yaw), pitch: p.pitch };
    }
    prev = p;
    await page.waitForTimeout(250);
  }
  return { yaw: norm180(prev.yaw), pitch: prev.pitch, unstable: true };
}

async function sceneLabel(page, id) {
  return page.evaluate((sid) => (window.__visioTourNodes || []).find((n) => n.id === sid)?.name, id);
}

async function shot(page, name) {
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function openTourEditor(page) {
  await page.goto("/admin");
  await expect(page.getByTestId("admin-tab-tour-editor")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("admin-tab-tour-editor").click();
  await expect(page.getByTestId("tour-job-id")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("tour-job-id").click();
  await page.getByTestId("tour-job-id").fill(JOB_ID);
  // Trigger React onChange commit
  await page.getByTestId("tour-job-id").press("Tab");
  await expect(page.getByTestId("tour-scene-scene_0")).toBeVisible({ timeout: 120_000 });
  await page.getByTestId("floor-plan-viewport").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("floor-plan-viewport")).toBeVisible({ timeout: 30_000 });
}

async function selectScene(page, sceneId) {
  await page.getByTestId(`tour-scene-${sceneId}`).click();
}

/** Probe the floor-plan image for an inside (content) and outside (bg) click in normalized coords. */
async function findPlanClickTargets(page) {
  return page.evaluate(async () => {
    const img = document.querySelector('[data-testid="floor-plan-viewport"] img');
    if (!img) throw new Error("no plan img");
    await new Promise((r) => {
      if (img.complete && img.naturalWidth) r();
      else {
        img.onload = () => r();
        setTimeout(r, 5000);
      }
    });
    let planUrl = img.getAttribute("src") || img.src;
    // Unwrap local blob-cache proxy so plan-proxy gets a real Blob URL.
    if (planUrl && planUrl.includes("/api/dev/blob-cache")) {
      try {
        const u = new URL(planUrl, location.origin);
        planUrl = u.searchParams.get("url") || planUrl;
      } catch {
        /* keep */
      }
    }
    const proxied = await fetch(
      `/api/pipeline/plan-proxy?url=${encodeURIComponent(planUrl)}`
    );
    if (!proxied.ok) throw new Error("plan proxy failed " + proxied.status);
    const blob = await proxied.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const sample = (x, y) => {
      const i = (Math.round(y) * canvas.width + Math.round(x)) * 4;
      return { r: data.data[i], g: data.data[i + 1], b: data.data[i + 2] };
    };
    const corners = [
      sample(2, 2),
      sample(canvas.width - 3, 2),
      sample(2, canvas.height - 3),
      sample(canvas.width - 3, canvas.height - 3),
    ];
    const bg = {
      r: corners.reduce((s, c) => s + c.r, 0) / 4,
      g: corners.reduce((s, c) => s + c.g, 0) / 4,
      b: corners.reduce((s, c) => s + c.b, 0) / 4,
    };
    const dist = (c) => Math.hypot(c.r - bg.r, c.g - bg.g, c.b - bg.b);

    let inside = null;
    const outside = { nx: 0.03, ny: 0.03 };
    outer: for (let y = 0.2; y < 0.8; y += 0.02) {
      for (let x = 0.2; x < 0.8; x += 0.02) {
        const c = sample(x * (canvas.width - 1), y * (canvas.height - 1));
        if (dist(c) > 40) {
          inside = { nx: x, ny: y };
          break outer;
        }
      }
    }
    if (!inside) throw new Error("could not find inside apartment pixel");
    bmp.close?.();
    return { inside, outside, width: canvas.width, height: canvas.height };
  });
}

async function clickPlanNorm(page, nx, ny) {
  const img = page.locator('[data-testid="floor-plan-viewport"] img');
  await img.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await img.boundingBox();
  if (!box) throw new Error("plan img not laid out");
  const x = box.x + nx * box.width;
  const y = box.y + ny * box.height;
  // Click the viewport (img has pointer-events:none); coords are viewport-absolute.
  await page.mouse.click(x, y);
  await page.waitForTimeout(600);
  return { x, y, box };
}

/**
 * Map widget must show the plan framed (canvas pixels), plus report which plan asset it uses.
 */
async function assertViewerMapPlanVisible(page, label = "viewer") {
  await waitForMapReady(page);
  const row = await assertMapFramed(page, label, mapChecks);
  const url = row.metrics?.imageUrl || "";
  let remote = url;
  if (url.includes("/api/dev/blob-cache")) {
    remote = new URL(url, "http://local").searchParams.get("url") || url;
  }
  return {
    imageUrl: url,
    width: row.metrics?.imageNatural?.w || 0,
    height: row.metrics?.imageNatural?.h || 0,
    planIdHint: String(remote).match(/floorplan[^/?#.]+/i)?.[0] || null,
  };
}

/** Editor floor-plan <img> must be loaded (naturalWidth > 0), not just in the DOM. */
async function assertEditorPlanImageLoaded(page) {
  await page.waitForFunction(
    () => {
      const img = document.querySelector('[data-testid="floor-plan-viewport"] img');
      return Boolean(img && img.complete && img.naturalWidth > 16 && img.naturalHeight > 16);
    },
    null,
    { timeout: 45_000 }
  );
  return page.evaluate(() => {
    const img = document.querySelector('[data-testid="floor-plan-viewport"] img');
    const src = img.currentSrc || img.src || "";
    let remote = src;
    if (src.includes("/api/dev/blob-cache")) {
      try {
        remote = new URL(src, location.origin).searchParams.get("url") || src;
      } catch {
        /* keep */
      }
    }
    return {
      src,
      remote,
      width: img.naturalWidth,
      height: img.naturalHeight,
      planIdHint: String(remote).match(/floorplan[^/?#.]+/i)?.[0] || null,
    };
  });
}

test.describe.configure({ mode: "serial" });

async function openViewer(page) {
  await page.goto(`/tour/${JOB_ID}`);
  await expect(page.getByTestId("tour-viewer")).toBeVisible({ timeout: 90_000 });
  await page.waitForFunction(() => Boolean(window.__visioTour?.getCurrentNode?.()), null, {
    timeout: 180_000,
  });
  await page.waitForTimeout(1500);
  await expect(page.getByText("The panorama cannot be loaded")).toHaveCount(0);
}

async function goToNode(page, id) {
  await page.evaluate(async (nodeId) => {
    if (window.__visioTour.getCurrentNode()?.id !== nodeId) {
      await window.__visioTour.setCurrentNode(nodeId);
    }
  }, id);
  await page.waitForFunction(
    (nodeId) => window.__visioTour.getCurrentNode()?.id === nodeId,
    id,
    { timeout: 60_000 }
  );
  await page.waitForTimeout(600);
}

test.describe("Tour acceptance", () => {
  test.beforeAll(() => {
    mapChecks.length = 0;
    const file = path.join(process.cwd(), ".data", "e2e", `${JOB_ID}.json`);
    snapshot = JSON.parse(fs.readFileSync(file, "utf8")).payload;
    snapshotPlacements = placementsOf(snapshot.scenes);
  });

  test.afterAll(async ({}, testInfo) => {
    writeJson(`map-checks-${testInfo.project.name}.json`, mapChecks);
  });

  test.beforeEach(async ({ page }) => {
    await installProbes(page);
    page.on("dialog", (d) => (d.type() === "beforeunload" ? d.accept() : d.dismiss()));
  });

  test("0 auth bypass reaches admin", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "admin nav is desktop; mobile covers viewer");
    await page.goto("/admin");
    await expect(page.getByTestId("admin-tab-tour-editor")).toBeVisible({ timeout: 60_000 });
    await shot(page, "00-admin-bypass");
  });

  test("P0 NO PLACEMENTS — no pin in viewer (desktop + 390×844) or editor", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "runs first, before any placement exists");
    test.skip(
      snapshotPlacements.length > 0,
      `job has ${snapshotPlacements.length} real placement(s); zero-pin check needs an unplaced job`
    );
    const read = (p) =>
      p.evaluate(() => ({
        mapPlugin: Boolean(window.__visioMap),
        mapElements: document.querySelectorAll(".psv-map").length,
        nodes: (window.__visioTourNodes || []).length,
        nodesWithMapPin: (window.__visioTourNodes || []).filter((n) => n.map).length,
      }));
    await openViewer(page);
    const v = await read(page);
    await shot(page, "P0-viewer-no-pin-desktop");

    const small = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    const phone = await small.newPage();
    await installProbes(phone);
    await openViewer(phone);
    const vPhone = await read(phone);
    await phone.screenshot({ path: path.join(SHOT_DIR, "P0-viewer-no-pin-390x844.png") });
    await small.close();

    writeJson("P0.json", { desktop: v, phone390: vPhone });
    for (const r of [v, vPhone]) {
      expect(r.nodes, "viewer loaded scenes").toBeGreaterThan(0);
      expect(r.nodesWithMapPin, "no scene carries a map pin").toBe(0);
      expect(r.mapPlugin, "no map plugin without placements").toBe(false);
      expect(r.mapElements, "no map widget rendered").toBe(0);
    }

    await openTourEditor(page);
    await assertEditorPlanImageLoaded(page);
    await expect(page.locator("[data-testid^=map-pin-]")).toHaveCount(0);
    await expect(page.getByTestId("map-placed-count")).toHaveAttribute("data-placed", "0");
    await page.getByTestId("floor-plan-viewport").screenshot({
      path: path.join(SHOT_DIR, "P0-editor-no-pins.png"),
    });
  });

  test("R ROUND TRIP — one scene: editor place → viewer pin → cone follows view", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "editor UI round trip runs on desktop");
    test.setTimeout(600_000);
    const rt = { scene: ROUND_TRIP_SCENE, knownPoint: KNOWN_POINT };
    const norm180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

    // 1. Editor: place at the known point with a real click.
    await openTourEditor(page);
    const editorPlan = await assertEditorPlanImageLoaded(page);
    await selectScene(page, ROUND_TRIP_SCENE);
    await page.waitForFunction(() => window.__visioPlanMaskReady === true, null, {
      timeout: 30_000,
    });
    await shot(page, "R1-editor-before-place");
    const click = await clickPlanNorm(page, KNOWN_POINT.nx, KNOWN_POINT.ny);
    const err = page.getByTestId("plan-place-error");
    if (await err.isVisible().catch(() => false)) {
      throw new Error(`known point rejected as outside: ${await err.textContent()}`);
    }
    const pin = page.locator(`[data-testid="map-pin-${ROUND_TRIP_SCENE}"]`);
    await expect(pin).toBeVisible({ timeout: 10_000 });
    const storedNx = Number(await pin.getAttribute("data-map-x"));
    const storedNy = Number(await pin.getAttribute("data-map-y"));
    rt.editor = {
      planWidthPx: editorPlan.width,
      planHeightPx: editorPlan.height,
      storedNx,
      storedNy,
      errPlanPxX: Math.abs(storedNx - KNOWN_POINT.nx) * editorPlan.width,
      errPlanPxY: Math.abs(storedNy - KNOWN_POINT.ny) * editorPlan.height,
      clickBox: click.box,
    };
    expect(rt.editor.errPlanPxX, "editor stored x vs click (plan px)").toBeLessThanOrEqual(2);
    expect(rt.editor.errPlanPxY, "editor stored y vs click (plan px)").toBeLessThanOrEqual(2);
    if (snapshotPlacements.length === 0) {
      await expect(page.locator("[data-testid^=map-pin-]")).toHaveCount(1);
    }
    await shot(page, "R2-editor-placed");

    // 2. Save through the editor UI.
    const saveResp = page.waitForResponse(
      (r) => r.url().includes(`/jobs/${JOB_ID}/tour`) && r.request().method() === "PUT",
      { timeout: 240_000 }
    );
    await page.getByTestId("tour-save").click();
    const saveRes = await saveResp;
    const saveBody = await saveRes.json();
    const sent = saveRes.request().postDataJSON();
    const sentScene = sent.scenes.find((s) => s.id === ROUND_TRIP_SCENE);
    rt.putBody = {
      mapX: sentScene?.mapX,
      mapY: sentScene?.mapY,
      mapPlanId: sentScene?.mapPlanId,
      floor: sentScene?.floor,
      floorPlans: sent.floorPlans?.map((p) => ({ floor: p.floor, planId: p.planId, url: p.url })),
    };
    expect(saveBody.ok, JSON.stringify(saveBody)).toBe(true);
    await expect(page.locator("text=נשמר")).toBeVisible({ timeout: 30_000 });
    await shot(page, "R3-editor-saved");

    // Blob CDN can serve the previous copy after an overwrite — poll for this save.
    const api = await apiContext(testInfo.project.use.baseURL);
    const { cfg, waitedMs, timedOut } = await waitForBlobTourJson(api, JOB_ID, (c) => {
      const s = c.scenes?.[ROUND_TRIP_SCENE];
      return Number.isFinite(s?.mapX) && Math.abs(s.mapX - storedNx) < 1e-6;
    });
    await api.dispose();
    const saved = cfg.scenes[ROUND_TRIP_SCENE];
    rt.savedTourJson = {
      mapX: saved.mapX,
      mapY: saved.mapY,
      mapPlanId: saved.mapPlanId,
      placements: placementsOf(cfg).length,
      blobPropagationMs: waitedMs,
      timedOut: Boolean(timedOut),
    };
    writeJson("round-trip.json", rt);
    expect(timedOut, "saved placement reached Blob tour.json").toBeFalsy();
    expect(Math.abs(saved.mapX - storedNx)).toBeLessThan(1e-6);
    expect(Math.abs(saved.mapY - storedNy)).toBeLessThan(1e-6);
    expect(String(editorPlan.planIdHint)).toContain(saved.mapPlanId);
    if (snapshotPlacements.length === 0) expect(rt.savedTourJson.placements).toBe(1);

    // 3. Viewer: pin drawn at the same plan point.
    await openViewer(page);
    await goToNode(page, ROUND_TRIP_SCENE);
    await waitForMapReady(page);
    const framed = await assertMapFramed(page, "R4-viewer-default", mapChecks);
    const W = framed.metrics.imageNatural.w;
    const H = framed.metrics.imageNatural.h;
    const expected = { x: storedNx * W, y: storedNy * H };

    const checkPin = async (label) => {
      const p = await pinImagePoint(page);
      const tc = await page.evaluate(({ x, y }) => window.__e2e.transformCheck(x, y), {
        x: p.pin.x,
        y: p.pin.y,
      });
      const row = {
        label,
        pinPixels: p.pin.count,
        pinImage: p.image,
        expectedImage: expected,
        errImagePx: p.image ? Math.hypot(p.image.x - expected.x, p.image.y - expected.y) : null,
        errScreenPx: p.image
          ? Math.hypot(p.image.x - expected.x, p.image.y - expected.y) * p.f.scale
          : null,
        scale: p.f.scale,
        transform: tc,
      };
      expect(p.pin.count, `${label}: blue pin drawn`).toBeGreaterThan(20);
      expect(tc.meanDiff, `${label}: drawn plan matches plan image under transform`).toBeLessThan(35);
      expect(tc.meanDiff, `${label}: transform check is sensitive`).toBeLessThan(tc.shiftedDiff);
      expect(row.errScreenPx, `${label}: pin at the placed point (screen px)`).toBeLessThanOrEqual(2);
      return row;
    };

    rt.viewerDefault = await checkPin("viewer default zoom");
    await page.locator(".psv-map").screenshot({ path: path.join(SHOT_DIR, "R4-viewer-pin-map.png") });
    await shot(page, "R4-viewer-pin");

    await setMapZoomPct(page, 1e6);
    await assertMapFramed(page, "R4b-viewer-max-zoom", mapChecks);
    rt.viewerMaxZoom = await checkPin("viewer max zoom");
    await page
      .locator(".psv-map")
      .screenshot({ path: path.join(SHOT_DIR, "R4b-viewer-pin-max-zoom.png") });
    await clickMapButton(page, "Reset");

    // 4. Cone follows the view: real mouse drag on the panorama.
    const readCone = async () => {
      await page.waitForTimeout(250);
      const p = await page.evaluate(() => window.__e2e.pin());
      const c = await page.evaluate(({ x, y }) => window.__e2e.cone(x, y), { x: p.x, y: p.y });
      const yaw = await page.evaluate(
        () => (window.__visioViewer.getPosition().yaw * 180) / Math.PI
      );
      return { yaw, cone: c.angle, conePixels: c.count };
    };
    const c0 = await readCone();
    const vp = page.viewportSize();
    await page.mouse.move(vp.width * 0.55, vp.height * 0.4);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) {
      await page.mouse.move(vp.width * (0.55 - (0.25 * k) / 12), vp.height * 0.4);
    }
    await page.mouse.up();
    await page.waitForTimeout(1800);
    const c1 = await readCone();
    await page.locator(".psv-map").screenshot({ path: path.join(SHOT_DIR, "R5a-cone-after-drag.png") });
    await shot(page, "R5a-view-after-drag");

    await page.evaluate(() => {
      const v = window.__visioViewer;
      const pos = v.getPosition();
      v.rotate({ yaw: pos.yaw + Math.PI / 2, pitch: pos.pitch });
    });
    const c2 = await readCone();
    await page.locator(".psv-map").screenshot({ path: path.join(SHOT_DIR, "R5b-cone-after-90.png") });
    await shot(page, "R5b-view-after-90");

    rt.cone = {
      before: c0,
      afterDrag: c1,
      afterRotate90: c2,
      dragYawDelta: norm180(c1.yaw - c0.yaw),
      dragConeDelta: norm180(c1.cone - c0.cone),
      rotateYawDelta: norm180(c2.yaw - c1.yaw),
      rotateConeDelta: norm180(c2.cone - c1.cone),
    };
    for (const c of [c0, c1, c2]) expect(c.conePixels, "cone drawn").toBeGreaterThan(30);
    expect(Math.abs(rt.cone.dragYawDelta), "mouse drag turned the view").toBeGreaterThan(15);
    expect(
      Math.abs(norm180(rt.cone.dragConeDelta - rt.cone.dragYawDelta)),
      "cone turned with the dragged view"
    ).toBeLessThan(3);
    expect(Math.abs(norm180(rt.cone.rotateConeDelta - 90)), "cone turned 90° with view").toBeLessThan(3);
    // Absolute direction: cone points along view yaw on the north-up map.
    for (const c of [c0, c1, c2]) {
      expect(Math.abs(norm180(c.cone - (c.yaw - 90))), `cone aims at view yaw ${c.yaw.toFixed(1)}°`).toBeLessThan(3);
    }

    // 5. Unplaced scene: map hidden, no stale pin.
    const unplaced = snapshot.scenes.find(
      (s) => s.id !== ROUND_TRIP_SCENE && !s.hidden && !snapshotPlacements.some((p) => p.id === s.id)
    );
    if (unplaced) {
      await goToNode(page, unplaced.id);
      const m = await page.evaluate(() => window.__e2e.metrics());
      rt.unplacedScene = { id: unplaced.id, mapVisible: m.visible };
      await shot(page, "R6-unplaced-scene-no-pin");
      expect(m.visible, `map hidden on unplaced ${unplaced.id}`).toBe(false);
      await goToNode(page, ROUND_TRIP_SCENE);
      await assertMapFramed(page, "R6b-back-to-placed-scene", mapChecks);
      rt.backToPlaced = await checkPin("back on placed scene");
    }

    writeJson("round-trip.json", rt);
  });

  test("F MAP FRAMING — every zoom, every edge, expanded (desktop 1440×900)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "mobile has its own framing test");
    test.setTimeout(600_000);
    await openViewer(page);
    await goToNode(page, ROUND_TRIP_SCENE);
    await waitForMapReady(page);

    // Negative control: the pre-fix renderer at 100% panned to a corner must FAIL
    // these same checks — proves the detector catches a blank/partial map.
    await page.evaluate(() => {
      const m = window.__visioMap;
      m.__visioFraming.disable();
      m.component.state.zoom = 0;
      m.component.state.offset.x = -m.config.center.x;
      m.component.state.offset.y = -m.config.center.y;
      m.component.update();
    });
    await page.waitForTimeout(300);
    const control = await page.evaluate(() => window.__e2e.metrics());
    await page.locator(".psv-map").screenshot({ path: path.join(SHOT_DIR, "map-control-unframed.png") });
    writeJson("map-control-unframed.json", control);
    expect(control.coverage, "control: unframed map is detected as not covering").toBeLessThan(0.97);
    await page.evaluate(() => window.__visioMap.__visioFraming.enable());

    const inputState = { mode: "probe" };
    await runFramingMatrix(page, "desktop-widget", mapChecks, inputState);

    // Real wheel input to both extremes.
    const box = await page.locator(".psv-map canvas").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 120);
    await assertMapFramed(page, "desktop-widget-wheel-out", mapChecks);
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -120);
    await assertMapFramed(page, "desktop-widget-wheel-in", mapChecks);

    await clickMapButton(page, "Maximize");
    await page.waitForTimeout(700);
    await runFramingMatrix(page, "desktop-expanded", mapChecks, inputState);
    await clickMapButton(page, "Minimize");
    await page.waitForTimeout(700);
    await assertMapFramed(page, "desktop-after-minimize", mapChecks);
    writeJson("framing-input-desktop.json", inputState);
  });

  /* ---------------------------------------------------------------------------
   * 1. SAVE: place → Save enabled → save → reload → placement still there;
   *    a stale editor can never overwrite a newer save.
   * ------------------------------------------------------------------------- */
  test("S1 SAVE PERSISTS — place → Save enabled → save → reload → still there", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "editor runs on desktop");
    const out = {};
    await openTourEditor(page);
    await assertEditorPlanImageLoaded(page);
    await expect(page.getByTestId("tour-save")).toBeDisabled();
    const sceneId = await firstUnplacedId(page);
    await page.getByTestId(`map-unplaced-${sceneId}`).click();
    await expect(page.getByTestId("map-place-hint")).toHaveAttribute("data-scene-id", sceneId);
    await waitMask(page);
    const [pt] = await insidePoints(page, 1, await pinPositions(page));
    await clickPlanNorm(page, pt.nx, pt.ny);
    await expectPinAt(page, sceneId, pt);
    await expect(page.getByTestId("tour-save")).toBeEnabled();
    await shot(page, "S1a-placed-save-enabled");

    const saved = await saveEditor(page);
    out.saved = { version: saved.version, sceneId, pt };
    await shot(page, "S1b-saved");

    await page.reload();
    await openTourEditor(page);
    await assertEditorPlanImageLoaded(page);
    const after = await expectPinAt(page, sceneId, pt);
    await expect(page.getByTestId("tour-save")).toHaveAttribute("data-version", saved.version);
    out.afterReload = after;
    await page.getByTestId("floor-plan-viewport").screenshot({
      path: path.join(SHOT_DIR, "S1c-after-reload-pin-still-there.png"),
    });
    await shot(page, "S1c-after-reload");
    writeJson("S1-save.json", out);
  });

  test("S1b STALE EDITOR CANNOT OVERWRITE a newer save (two tabs)", async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "editor runs on desktop");
    const out = {};
    // Tab A loads the editor first.
    await openTourEditor(page);
    await waitMask(page);
    // Tab B loads, places a scene and saves.
    const tabB = await context.newPage();
    await installProbes(tabB);
    await openTourEditor(tabB);
    await waitMask(tabB);
    const sceneB = await firstUnplacedId(tabB);
    await tabB.getByTestId(`map-unplaced-${sceneB}`).click();
    const [ptB, ptA] = await insidePoints(tabB, 2, await pinPositions(tabB));
    await clickPlanNorm(tabB, ptB.nx, ptB.ny);
    await expectPinAt(tabB, sceneB, ptB);
    const savedB = await saveEditor(tabB);
    out.tabB = { sceneB, ptB, version: savedB.version };

    // Tab A (still on the older version) places a different scene and tries to save.
    const sceneA = (await unplacedIds(page)).find((id) => id !== sceneB);
    await page.getByTestId(`map-unplaced-${sceneA}`).click();
    await clickPlanNorm(page, ptA.nx, ptA.ny);
    await expectPinAt(page, sceneA, ptA);
    await page.getByTestId("tour-save").click();
    await expect(page.getByTestId("tour-error")).toContainText("נשמר ממקום אחר", { timeout: 30_000 });
    await expect(page.getByTestId("tour-reload-latest")).toBeVisible();
    await shot(page, "S1d-stale-tab-save-rejected");

    // Server still has B's work; A's stale state was not written.
    const api = await apiContext(testInfo.project.use.baseURL);
    const server = await getEditorPayload(api, JOB_ID);
    await api.dispose();
    const sB = server.scenes.find((s) => s.id === sceneB);
    const sA = server.scenes.find((s) => s.id === sceneA);
    out.server = { version: server.version, sceneB: [sB.mapX, sB.mapY], sceneAPlaced: Number.isFinite(sA.mapX) };
    expect(server.version).toBe(savedB.version);
    expect(Math.abs(sB.mapX - ptB.nx)).toBeLessThan(1e-6);
    expect(Number.isFinite(sA.mapX), "stale tab did not overwrite").toBe(false);

    await page.getByTestId("tour-reload-latest").click();
    await expectPinAt(page, sceneB, ptB);
    await expect(page.locator(`[data-testid="map-pin-${sceneA}"]`)).toHaveCount(0);
    await shot(page, "S1e-stale-tab-reloaded-latest");
    await tabB.close();
    writeJson("S1b-conflict.json", out);
  });

  /* ---------------------------------------------------------------------------
   * 4. FAST PLACING: auto-advance to next unplaced, N/total counter, drag to fix.
   * ------------------------------------------------------------------------- */
  test("S4 FAST PLACING — auto-advance, counter, drag correction, persists", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "editor runs on desktop");
    test.setTimeout(600_000);
    const out = { steps: [] };
    await openTourEditor(page);
    await waitMask(page);
    const count0 = await placedCount(page);
    const first = await firstUnplacedId(page);
    await page.getByTestId(`map-unplaced-${first}`).click();
    const pts = await insidePoints(page, 5, await pinPositions(page));

    for (let i = 0; i < 4; i++) {
      const target = await page.getByTestId("map-place-hint").getAttribute("data-scene-id");
      const expectedNext = await nextUnplacedAfterInUi(page, target);
      await clickPlanNorm(page, pts[i].nx, pts[i].ny);
      const pin = await expectPinAt(page, target, pts[i]);
      await expect(page.getByTestId("map-placed-count")).toHaveAttribute(
        "data-placed",
        String(count0 + i + 1)
      );
      await expect(page.getByTestId("map-place-hint")).toHaveAttribute("data-scene-id", expectedNext);
      out.steps.push({ placed: target, at: pts[i], pin, nextSelected: expectedNext });
      await page.getByTestId("floor-plan-viewport").screenshot({
        path: path.join(SHOT_DIR, `S4-${i + 1}-placed-${target}.png`),
      });
    }
    const countText = await page.getByTestId("map-placed-count").textContent();
    out.counterText = countText;
    expect(countText).toMatch(new RegExp(`${count0 + 4}\\s*/\\s*\\d+`));

    // Drag the first of these pins to a corrected position.
    const dragged = out.steps[0].placed;
    const hintBefore = await page.getByTestId("map-place-hint").getAttribute("data-scene-id");
    await dragPin(page, dragged, pts[4]);
    const corrected = await expectPinAt(page, dragged, pts[4]);
    await expect(page.getByTestId("map-placed-count")).toHaveAttribute("data-placed", String(count0 + 4));
    await expect(page.getByTestId("map-place-hint")).toHaveAttribute("data-scene-id", hintBefore);
    out.drag = { scene: dragged, to: pts[4], corrected };
    await page.getByTestId("floor-plan-viewport").screenshot({
      path: path.join(SHOT_DIR, "S4-5-drag-corrected.png"),
    });

    await saveEditor(page);
    await page.reload();
    await openTourEditor(page);
    await assertEditorPlanImageLoaded(page);
    await expectPinAt(page, dragged, pts[4]);
    for (let i = 1; i < 4; i++) await expectPinAt(page, out.steps[i].placed, pts[i]);
    await expect(page.getByTestId("map-placed-count")).toHaveAttribute("data-placed", String(count0 + 4));
    await page.getByTestId("floor-plan-viewport").screenshot({
      path: path.join(SHOT_DIR, "S4-6-after-reload.png"),
    });
    writeJson("S4-fast-placing.json", out);
  });

  test("F MAP FRAMING — 390×844 widget + expanded (mobile)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
    test.setTimeout(600_000);
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
    // Uses the placement the desktop run made through the editor (restored in teardown).
    await openViewer(page);
    await goToNode(page, ROUND_TRIP_SCENE);
    await waitForMapReady(page);

    const framed = await assertMapFramed(page, "mobile-widget-initial", mapChecks);
    const p = await pinImagePoint(page);
    const W = framed.metrics.imageNatural.w;
    const H = framed.metrics.imageNatural.h;
    const errScreen = p.image
      ? Math.hypot(p.image.x - KNOWN_POINT.nx * W, p.image.y - KNOWN_POINT.ny * H) * p.f.scale
      : null;
    writeJson("mobile-pin.json", { pin: p.pin, image: p.image, errScreenPx: errScreen });
    expect(p.pin.count, "mobile: blue pin drawn").toBeGreaterThan(20);
    expect(errScreen, "mobile: pin at placed point (screen px)").toBeLessThanOrEqual(2);

    const inputState = { mode: "probe" };
    await runFramingMatrix(page, "mobile-widget", mapChecks, inputState);
    await clickMapButton(page, "Maximize");
    await page.waitForTimeout(700);
    await runFramingMatrix(page, "mobile-expanded", mapChecks, inputState);
    await clickMapButton(page, "Minimize");
    await page.waitForTimeout(700);
    await assertMapFramed(page, "mobile-after-minimize", mapChecks);
    writeJson("framing-input-mobile.json", inputState);
  });

  /* ---------------------------------------------------------------------------
   * 5. HOTSPOTS through the editor UI → ring on that tile → click → arrival heading.
   * ------------------------------------------------------------------------- */
  test("S5 HOTSPOT FLOW — pick room → click floor → save → ring on tile → click → arrive facing travel", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "editor runs on desktop; mobile viewer check below");
    test.setTimeout(600_000);
    const A = ROUND_TRIP_SCENE;
    const B = HOTSPOT_TARGET_SCENE;
    const out = { A, B };

    await openTourEditor(page);
    await selectScene(page, A);
    const clickA = await placeRingViaEditor(page, A, B, { fx: 0.5, fy: 0.82 });
    out.editorClickA = clickA;
    await shot(page, "S5-1-editor-ring-placed-A");

    // Place the way back by hand in B; it must not overwrite A's exact ring.
    await selectScene(page, B);
    const clickB = await placeRingViaEditor(page, B, A, { fx: 0.35, fy: 0.82 });
    out.editorClickB = clickB;
    await shot(page, "S5-2-editor-ring-placed-B");

    const saved = await saveEditor(page);
    const sent = saved.request;
    const ringA = sent.scenes.find((s) => s.id === A).hotSpots.find((h) => h.targetSceneId === B);
    const ringB = sent.scenes.find((s) => s.id === B).hotSpots.find((h) => h.targetSceneId === A);
    out.saved = { ringA, ringB };
    expect(Math.abs(norm180(ringA.yaw - clickA.yaw)), "A ring stored at clicked yaw (sub-pixel)").toBeLessThan(0.25);
    expect(Math.abs(ringA.pitch - clickA.pitch), "A ring stored at clicked pitch (sub-pixel)").toBeLessThan(0.25);
    expect(Math.abs(norm180(ringB.yaw - clickB.yaw)), "B ring stored at clicked yaw (sub-pixel)").toBeLessThan(0.25);
    expect(ringA.pitch, "clicked the floor (below horizon)").toBeLessThan(-10);
    expect(ringB.pitch, "clicked the floor (below horizon)").toBeLessThan(-10);

    await openViewer(page);
    await goToNode(page, A);
    const ring = await assertRingOnTile(page, B, ringA, "S5-3-viewer-ring-on-tile-A");
    out.viewerRing = ring;

    await page.mouse.move(ring.center.x, ring.center.y);
    await page.waitForTimeout(400);
    out.tooltip = await page.evaluate(
      () => document.querySelector(".psv-tooltip-content")?.textContent?.trim() || null
    );
    expect(out.tooltip, "ring tooltip names the target room").toBe(await sceneLabel(page, B));

    await page.mouse.click(ring.center.x, ring.center.y);
    const arrival = await waitArrival(page, B);
    out.arrival = arrival;
    const expectedYaw = norm180(ringB.yaw + 180);
    out.expectedArrivalYaw = expectedYaw;
    await shot(page, "S5-4-viewer-arrived-B-facing-travel");
    expect(Math.abs(norm180(arrival.yaw - expectedYaw)), "arrival faces direction of travel").toBeLessThan(3);
    expect(Math.abs(arrival.pitch), "arrival at eye level").toBeLessThan(3);
    writeJson("S5-hotspot-flow.json", out);
  });

  test("S5m HOTSPOT ON 390×844 — ring on tile, tap goes to the room", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
    const api = await apiContext(testInfo.project.use.baseURL);
    const server = await getEditorPayload(api, JOB_ID);
    await api.dispose();
    const ringA = server.scenes
      .find((s) => s.id === ROUND_TRIP_SCENE)
      ?.hotSpots?.find((h) => h.targetSceneId === HOTSPOT_TARGET_SCENE);
    test.skip(!ringA, "needs the ring placed through the editor in the desktop run");
    const ringB = server.scenes
      .find((s) => s.id === HOTSPOT_TARGET_SCENE)
      .hotSpots.find((h) => h.targetSceneId === ROUND_TRIP_SCENE);
    await openViewer(page);
    await goToNode(page, ROUND_TRIP_SCENE);
    const ring = await assertRingOnTile(page, HOTSPOT_TARGET_SCENE, ringA, "S5m-1-mobile-ring-on-tile");
    await page.touchscreen.tap(ring.center.x, ring.center.y);
    const arrival = await waitArrival(page, HOTSPOT_TARGET_SCENE);
    await shot(page, "S5m-2-mobile-arrived");
    const expectedYaw = norm180(ringB.yaw + 180);
    writeJson("S5m-mobile.json", { ring, arrival, expectedYaw });
    expect(Math.abs(norm180(arrival.yaw - expectedYaw))).toBeLessThan(3);
  });

  /* ---------------------------------------------------------------------------
   * 6. RENAME + HIDE persist; hidden never in the public tour or on the map.
   * ------------------------------------------------------------------------- */
  test("S6 RENAME + HIDE — persist; hidden never in public tour or map", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "editor runs on desktop");
    test.setTimeout(600_000);
    const out = {};
    await openTourEditor(page);
    const placedIds = await pinIds(page);
    const renameId = placedIds.find((id) => ![ROUND_TRIP_SCENE, HOTSPOT_TARGET_SCENE].includes(id));
    const hideId = placedIds.find(
      (id) => ![ROUND_TRIP_SCENE, HOTSPOT_TARGET_SCENE, renameId].includes(id)
    );
    expect(renameId && hideId, "needs placed scenes from S4").toBeTruthy();
    out.renameId = renameId;
    out.hideId = hideId;

    await selectScene(page, renameId);
    await page.getByTestId("scene-title-input").fill(TEMP_TITLE);
    await page.getByTestId(`scene-hide-${hideId}`).click();
    await expect(page.getByTestId(`tour-scene-${hideId}`)).toContainText("מוסתר");
    await expect(page.locator(`[data-testid="map-pin-${hideId}"]`)).toHaveCount(0);
    await shot(page, "S6-1-editor-renamed-and-hidden");
    await saveEditor(page);

    await page.reload();
    await openTourEditor(page);
    await expect(page.getByTestId(`tour-scene-${renameId}`)).toContainText(TEMP_TITLE);
    await expect(page.getByTestId(`tour-scene-${hideId}`)).toContainText("מוסתר");
    await expect(page.locator(`[data-testid="map-pin-${hideId}"]`)).toHaveCount(0);
    await shot(page, "S6-2-editor-after-reload");

    await openViewer(page);
    const v = await page.evaluate((hid) => {
      const nodes = window.__visioTourNodes || [];
      return {
        nodeIds: nodes.map((n) => n.id),
        linksToHidden: nodes.flatMap((n) => n.links || []).filter((l) => l.nodeId === hid).length,
        mapHotspots: (window.__visioMap?.config?.hotspots || []).map((h) => h.id),
      };
    }, hideId);
    out.viewer = v;
    expect(v.nodeIds).not.toContain(hideId);
    expect(v.linksToHidden).toBe(0);
    expect(v.mapHotspots.some((id) => id.endsWith(hideId))).toBe(false);

    await goToNode(page, renameId);
    await waitForMapReady(page);
    await assertMapFramed(page, "S6-3-viewer-map", mapChecks);
    // Spots actually drawn on the canvas this frame (render output, not config).
    const drawn = await page.evaluate(() => Object.keys(window.__visioMap.component.state.hotspotPos || {}));
    out.drawnMapSpots = drawn;
    expect(drawn.length, "map drew the placed scenes").toBeGreaterThan(1);
    expect(drawn.some((id) => id.endsWith(hideId)), "hidden scene not drawn on map").toBe(false);
    // Where a visitor sees room names: hover the renamed room's spot on the map
    // (expanded, from another room, so the spot is drawn and on screen).
    await goToNode(page, ROUND_TRIP_SCENE);
    await clickMapButton(page, "Maximize");
    await page.waitForTimeout(800);
    const spot = await page.evaluate(
      (rid) => {
        const pos = window.__visioMap.component.state.hotspotPos || {};
        const key = Object.keys(pos).find((k) => k.endsWith(rid));
        return key ? pos[key] : null;
      },
      renameId
    );
    expect(spot, "renamed room drawn on the map").toBeTruthy();
    await page.mouse.move(spot.x, spot.y);
    await page.waitForTimeout(400);
    const tooltip = await page.evaluate(
      () => document.querySelector(".psv-tooltip-content")?.textContent?.trim() || ""
    );
    out.mapTooltip = tooltip;
    expect(tooltip, "renamed title shown in viewer map tooltip").toBe(TEMP_TITLE);
    await shot(page, "S6-4-viewer-map-renamed-tooltip-hidden-excluded");
    await clickMapButton(page, "Minimize");

    // Public tour.json on Blob: hidden scene is not in it at all.
    const api = await apiContext(testInfo.project.use.baseURL);
    const { cfg, timedOut } = await waitForBlobTourJson(
      api,
      JOB_ID,
      (c) => c.scenes?.[renameId]?.title === TEMP_TITLE && !c.scenes?.[hideId]
    );
    await api.dispose();
    out.publicTourJson = {
      hasHidden: Boolean(cfg.scenes?.[hideId]),
      anyHiddenFlag: Object.values(cfg.scenes || {}).some((s) => s.hidden),
      linksToHidden: Object.values(cfg.scenes || {}).flatMap((s) => s.hotSpots || []).filter((h) => h.sceneId === hideId).length,
      renamedTitle: cfg.scenes?.[renameId]?.title,
    };
    writeJson("S6-rename-hide.json", out);
    expect(timedOut, "public tour.json updated").toBeFalsy();
    expect(out.publicTourJson.hasHidden).toBe(false);
    expect(out.publicTourJson.anyHiddenFlag).toBe(false);
    expect(out.publicTourJson.linksToHidden).toBe(0);
  });

  /* ---------------------------------------------------------------------------
   * 7. No raw filenames anywhere users look.
   * ------------------------------------------------------------------------- */
  test("S7 NO RAW FILENAMES — editor, viewer, map, tooltips", async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const found = [];
    const seen = [];
    const check = (where, text) => {
      if (!text) return;
      seen.push({ where, text: String(text).slice(0, 200) });
      const m =
        String(text).match(RAW_NAME_RE) ||
        (where === "editor" ? null : String(text).match(JOB_ID_RE));
      if (m) found.push({ where, match: m[0], text: String(text).slice(0, 200) });
    };

    if (project !== "mobile") {
      await openTourEditor(page);
      await assertEditorPlanImageLoaded(page);
      const e = await page.evaluate(collectVisibleText);
      e.forEach((t) => check("editor", t));
      await shot(page, "S7-1-editor");
    }

    await openViewer(page);
    await waitForMapReady(page);
    check("viewer:title", await page.title());
    (await page.evaluate(collectVisibleText)).forEach((t) => check("viewer", t));
    // Map spot tooltips.
    const spots = await page.evaluate(() => Object.values(window.__visioMap.component.state.hotspotPos || {}));
    for (const s of spots) {
      await page.mouse.move(s.x, s.y);
      await page.waitForTimeout(250);
      check("map-tooltip", await page.evaluate(() => document.querySelector(".psv-tooltip-content")?.textContent));
    }
    // Ring tooltips.
    const rings = await page.evaluate(() =>
      [...document.querySelectorAll(".psv-virtual-tour-link")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.top > 0 && r.left > 0 && r.bottom < innerHeight && r.right < innerWidth)
        .map((r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))
    );
    for (const r of rings) {
      await page.mouse.move(r.x, r.y);
      await page.waitForTimeout(300);
      check("ring-tooltip", await page.evaluate(() => document.querySelector(".psv-tooltip-content")?.textContent));
    }
    await shot(page, `S7-2-viewer-${project}`);
    writeJson(`S7-filenames-${project}.json`, { checked: seen.length, found, sample: seen.slice(0, 60) });
    expect(seen.length, "collected real visible strings").toBeGreaterThan(5);
    expect(found, JSON.stringify(found)).toEqual([]);
  });

  test("2 OUTSIDE THE APARTMENT — real click on background is rejected", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "editor runs on desktop");
    await openTourEditor(page);
    await waitMask(page);
    const sceneId = await firstUnplacedId(page);
    await page.getByTestId(`map-unplaced-${sceneId}`).click();
    const before = await placedCount(page);
    const targets = await findPlanClickTargets(page);
    await clickPlanNorm(page, targets.outside.nx, targets.outside.ny);
    await expect(page.getByTestId("plan-place-error")).toContainText("מחוץ");
    await expect(page.locator(`[data-testid="map-pin-${sceneId}"]`)).toHaveCount(0);
    expect(await placedCount(page)).toBe(before);
    await expect(page.getByTestId("tour-save")).toBeDisabled();
    await shot(page, "02-outside-rejected");
  });

  test("CV1 LOCAL ASSIST — detect dots on real cropped plan (suggestions only)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "editor assist is desktop");
    test.setTimeout(180_000);
    const out = {};

    // API (same OpenCV path the button uses)
    const api = await apiContext(testInfo.project.use.baseURL);
    const planUrl =
      "https://5ltyuhgj5vbqjxug.public.blob.vercel-storage.com/tours/job_1790073394855_05316dbc/floorplan-f0-muemq7nx.jpg";
    const detectRes = await api.post(`/api/pipeline/jobs/${JOB_ID}/tour/assist`, {
      data: { action: "detect", planUrl },
    });
    const detectBody = await detectRes.json();
    out.api = {
      status: detectRes.status(),
      ok: detectBody.ok,
      dotCount: detectBody.dotCount,
      width: detectBody.width,
      height: detectBody.height,
      error: detectBody.error || null,
    };
    expect(detectBody.ok, JSON.stringify(detectBody)).toBe(true);
    expect(detectBody.dotCount).toBeGreaterThan(10);
    expect(detectBody.dots[0]).toMatchObject({
      id: expect.any(String),
      x: expect.any(Number),
      y: expect.any(Number),
    });
    // Suggestions must stay in [0,1] — never invent scene mapX.
    for (const d of detectBody.dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(1);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(1);
    }

    await openTourEditor(page);
    await assertEditorPlanImageLoaded(page);
    const beforePins = await page.locator("[data-testid^=map-pin-]").count();
    await page.getByTestId("plan-detect-dots").click();
    await expect(page.getByTestId("plan-dot-count")).toBeVisible({ timeout: 60_000 });
    const countAttr = await page.getByTestId("plan-dot-count").getAttribute("data-count");
    const uiCount = Number(countAttr);
    out.ui = { candidateCount: uiCount, pinsUnchanged: beforePins };
    expect(uiCount).toBe(detectBody.dotCount);
    await expect(page.locator("[data-testid^=plan-candidate-]")).toHaveCount(uiCount);
    // Detect must NOT auto-write map pins.
    await expect(page.locator("[data-testid^=map-pin-]")).toHaveCount(beforePins);
    await page.locator("[data-testid^=plan-candidate-]").first().click();
    await page.getByTestId("plan-delete-candidate").click();
    await expect(page.getByTestId("plan-dot-count")).toHaveAttribute(
      "data-count",
      String(uiCount - 1)
    );
    await page.getByTestId("floor-plan-viewport").screenshot({
      path: path.join(SHOT_DIR, "CV1-editor-candidates.png"),
    });
    await shot(page, "CV1-editor-after-detect");
    writeJson("CV1-detect.json", out);
    await api.dispose();
  });

});
