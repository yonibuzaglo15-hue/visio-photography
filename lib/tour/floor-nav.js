/**
 * Matterport-style floor discs + walking transitions for Pannellum.
 */

export const FLOOR_NAV_CSS = `
/* WebGL canvas covers in-scene HTML hotspots — discs live in .visio-disc-layer */
.pnlm-hotspot-base.visio-hotspot,
.pnlm-hotspot-base.visio-editor-hotspot,
.pnlm-hotspot.visio-hotspot,
.pnlm-hotspot.visio-editor-hotspot {
  background: transparent !important;
  background-image: none !important;
  border: none !important;
  width: 8px !important;
  height: 8px !important;
  margin-left: -4px !important;
  margin-top: -4px !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
.pnlm-hotspot-base.visio-hotspot .pnlm-tooltip,
.pnlm-hotspot-base.visio-editor-hotspot .pnlm-tooltip,
.pnlm-hotspot.visio-hotspot .pnlm-tooltip,
.pnlm-hotspot.visio-editor-hotspot .pnlm-tooltip,
.pnlm-hotspot-base .visio-disc { display: none !important; }
.visio-disc-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  overflow: hidden;
}
.visio-disc {
  position: absolute;
  width: 76px;
  height: 76px;
  margin-left: -38px;
  margin-top: -38px;
  transform: scale(var(--disc-scale, 1));
  transform-origin: center center;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 0.18s ease, opacity 0.15s ease;
}
.visio-disc.is-hidden-overflow {
  display: none !important;
}
.visio-disc.is-hover,
.visio-disc.is-snap {
  transform: scale(calc(var(--disc-scale, 1) * 1.12));
}
.visio-disc-shadow {
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  transform: scaleY(var(--disc-flat, 0.35));
  transform-origin: center center;
  background: rgba(0,0,0,0.45);
  filter: blur(5px);
  pointer-events: none;
}
.visio-disc-fill {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  transform: scaleY(var(--disc-flat, 0.35));
  transform-origin: center center;
  background: rgba(255,255,255,0.55);
  border: 2px solid rgba(255,255,255,0.9);
  box-shadow: 0 0 0 3px rgba(255,255,255,0.18), inset 0 0 8px rgba(255,255,255,0.22);
  transition: background 0.18s ease, box-shadow 0.18s ease;
  pointer-events: none;
}
.visio-disc.is-hover .visio-disc-fill,
.visio-disc.is-snap .visio-disc-fill {
  background: rgba(255,255,255,0.88);
  box-shadow: 0 0 0 4px rgba(255,255,255,0.4), inset 0 0 10px rgba(255,255,255,0.3);
}
.visio-disc-label {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.3;
  color: #fff;
  background: rgba(10,10,10,0.7);
  padding: 4px 10px;
  border-radius: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  font-family: system-ui, -apple-system, sans-serif;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.visio-disc.is-hover .visio-disc-label,
.visio-disc.is-snap .visio-disc-label,
.visio-disc.is-nearest-mobile .visio-disc-label {
  opacity: 1;
}
.visio-floor-cursor {
  position: absolute;
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  border-radius: 50%;
  transform: scaleY(0.3);
  background: rgba(255,255,255,0.16);
  border: 1px solid rgba(255,255,255,0.35);
  box-shadow: 0 0 0 2px rgba(0,0,0,0.12);
  pointer-events: none;
  z-index: 4;
  display: none;
  opacity: 0.85;
}
.visio-floor-cursor.is-snap {
  background: rgba(255,255,255,0.4);
  border-color: rgba(255,255,255,0.85);
  opacity: 1;
}
`;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function discMetrics(pitch) {
  // Nearer (more negative pitch) → larger disc. Floor line ≈ -6, nadir ≈ -58.
  const p = Number(pitch) || -35;
  const t = clamp((-p - 6) / 52, 0, 1);
  return {
    scale: 0.95 + t * 1.15,
    flat: clamp(0.28 + t * 0.4, 0.28, 0.72),
  };
}

/** Pull discs that land on walls down onto the floor band. */
function floorClampScreenY(y, pitch, h) {
  const bandTop = h * 0.52;
  if (y >= bandTop) return y;
  const t = clamp((-(Number(pitch) || -35) - 6) / 52, 0, 1);
  const floorY = h * (0.58 + t * 0.28);
  return Math.min(Math.max(y, floorY), h * 0.9);
}

function createFloorDiscTooltip(hotSpotDiv, args = {}) {
  hotSpotDiv.classList.add("visio-floor-hs");
  hotSpotDiv.setAttribute("data-scene-id", args.sceneId || "");
  hotSpotDiv.setAttribute("data-yaw", String(args.yaw != null ? args.yaw : 0));
  hotSpotDiv.setAttribute("data-pitch", String(args.pitch != null ? args.pitch : 0));
  hotSpotDiv.setAttribute("data-text", args.text || "");
  // Visual discs are drawn in .visio-disc-layer (canvas covers in-scene HTML).
}

/**
 * Mutate config BEFORE pannellum.viewer so discs + clicks are wired.
 * @param {object} config
 * @param {{ onClick?: (hs: object, ev: Event) => void, onHover?: (sceneId: string) => void, cssClass?: string }} handlers
 */
export function prepareFloorHotspots(config, handlers = {}) {
  const cssClass = handlers.cssClass || "visio-hotspot";
  const scenes = config.scenes || {};
  Object.keys(scenes).forEach((key) => {
    (scenes[key].hotSpots || []).forEach((hs) => {
      if (!hs?.sceneId) return;
      hs.type = "info";
      hs.cssClass = cssClass;
      hs.createTooltipArgs = {
        text: hs.text || "",
        pitch: hs.pitch,
        yaw: hs.yaw,
        sceneId: hs.sceneId,
        onHover: handlers.onHover,
      };
      hs.createTooltipFunc = createFloorDiscTooltip;
      hs.clickHandlerFunc = (ev) => {
        if (ev?.preventDefault) ev.preventDefault();
        if (ev?.stopPropagation) ev.stopPropagation();
        if (typeof handlers.onClick === "function") handlers.onClick(hs, ev);
      };
    });
  });
  return config;
}

function shortestYawDelta(from, to) {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function angularDist(p1, y1, p2, y2) {
  const toRad = Math.PI / 180;
  const x1 = Math.cos(p1 * toRad) * Math.cos(y1 * toRad);
  const yv1 = Math.cos(p1 * toRad) * Math.sin(y1 * toRad);
  const z1 = Math.sin(p1 * toRad);
  const x2 = Math.cos(p2 * toRad) * Math.cos(y2 * toRad);
  const yv2 = Math.cos(p2 * toRad) * Math.sin(y2 * toRad);
  const z2 = Math.sin(p2 * toRad);
  const dot = clamp(x1 * x2 + yv1 * yv2 + z1 * z2, -1, 1);
  return (Math.acos(dot) * 180) / Math.PI;
}

function easeIn(t) {
  return t * t;
}

/**
 * Attach floor cursor, preload, and walk transitions to an existing viewer.
 * Call prepareFloorHotspots(config, { onClick: (hs) => api.walkTo(hs) }) before creating the viewer,
 * or pass a walkRef that installFloorNav will fill.
 */
export function installFloorNav(viewer, config, options = {}) {
  const SNAP = options.snapDegrees != null ? options.snapDegrees : 14;
  const WALK_MS = 400;
  const FADE_MS = 400;
  const MAX_MOBILE_PRELOAD = 2;
  let walking = false;
  const preloaded = new Set();
  const preloadOrder = [];
  let cursorEl = null;
  let snappedHs = null;
  const container = viewer.getContainer();
  const isTouch =
    options.isTouch != null
      ? options.isTouch
      : typeof window !== "undefined" &&
        ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  function sceneHotspots(sceneId) {
    return config.scenes?.[sceneId]?.hotSpots || [];
  }

  function findReturnHotspot(destSceneId, fromSceneId) {
    return sceneHotspots(destSceneId).find((h) => h?.sceneId === fromSceneId) || null;
  }

  function getArrivalYaw(fromId, toId) {
    const ret = findReturnHotspot(toId, fromId);
    if (ret && Number.isFinite(Number(ret.yaw))) return Number(ret.yaw) + 180;
    const dest = config.scenes[toId];
    return dest && Number.isFinite(Number(dest.yaw)) ? Number(dest.yaw) : 0;
  }

  function preloadScene(sceneId) {
    if (!sceneId || preloaded.has(sceneId)) return;
    const sc = config.scenes[sceneId];
    if (!sc?.panorama) return;
    if (isTouch && preloadOrder.length >= MAX_MOBILE_PRELOAD) {
      preloaded.delete(preloadOrder.shift());
    }
    preloaded.add(sceneId);
    preloadOrder.push(sceneId);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = sc.panorama;
  }

  function preloadLinkedFrom(sceneId) {
    const list = sceneHotspots(sceneId);
    const n = isTouch ? MAX_MOBILE_PRELOAD : list.length;
    for (let i = 0; i < list.length && i < n; i++) {
      if (list[i]?.sceneId) preloadScene(list[i].sceneId);
    }
  }

  function animateLook(targetYaw, targetPitch, targetHfov, duration) {
    return new Promise((resolve) => {
      const startYaw = viewer.getYaw();
      const startPitch = viewer.getPitch();
      const startHfov = viewer.getHfov();
      const dy = shortestYawDelta(startYaw, targetYaw);
      const dp = targetPitch - startPitch;
      const dh = targetHfov - startHfov;
      const t0 = performance.now();
      function frame(now) {
        const t = clamp((now - t0) / duration, 0, 1);
        const e = easeIn(t);
        viewer.setYaw(startYaw + dy * e);
        viewer.setPitch(startPitch + dp * e);
        viewer.setHfov(startHfov + dh * e);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function ensureCursor() {
    if (cursorEl || isTouch) return;
    cursorEl = document.createElement("div");
    cursorEl.className = "visio-floor-cursor";
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    container.appendChild(cursorEl);
  }

  let discLayer = null;
  function ensureDiscLayer() {
    if (discLayer) return discLayer;
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    discLayer = document.createElement("div");
    discLayer.className = "visio-disc-layer";
    container.appendChild(discLayer);
    return discLayer;
  }

  function parseHsTranslate(hsEl) {
    const tr = hsEl.style.transform || "";
    const m3 = tr.match(/matrix3d\(([^)]+)\)/);
    if (m3) {
      const p = m3[1].split(",").map(Number);
      return { x: p[12], y: p[13] };
    }
    const m = tr.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    return null;
  }

  function syncDiscOverlay() {
    const layer = ensureDiscLayer();
    const w = container.clientWidth;
    const h = container.clientHeight;
    const nodes = container.querySelectorAll(
      ".pnlm-hotspot-base.visio-hotspot, .pnlm-hotspot-base.visio-editor-hotspot"
    );
    const MAX_VISIBLE = 4;
    let viewYaw = 0;
    let viewPitch = 0;
    try {
      viewYaw = viewer.getYaw();
      viewPitch = viewer.getPitch();
    } catch {
      /* ignore */
    }

    const candidates = [];
    const seen = new Set();
    nodes.forEach((hsEl) => {
      if (hsEl.style.visibility === "hidden") return;
      const pos = parseHsTranslate(hsEl);
      if (!pos) return;
      if (pos.x < -80 || pos.y < -80 || pos.x > w + 80 || pos.y > h + 80) return;
      const sceneId = hsEl.getAttribute("data-scene-id") || "";
      const yaw = hsEl.getAttribute("data-yaw") || "0";
      const pitch = hsEl.getAttribute("data-pitch") || "0";
      const text = hsEl.getAttribute("data-text") || "";
      const key = `${sceneId}|${yaw}|${pitch}`;
      seen.add(key);
      const ang = angularDist(
        viewPitch,
        viewYaw,
        Number(pitch) || 0,
        Number(yaw) || 0
      );
      candidates.push({ key, sceneId, yaw, pitch, text, pos, ang });
    });
    candidates.sort((a, b) => a.ang - b.ang);
    const visibleKeys = new Set(
      candidates.slice(0, MAX_VISIBLE).map((c) => c.key)
    );
    const nearestKey = candidates[0]?.key || null;

    for (const c of candidates) {
      let disc = layer.querySelector(`[data-key="${c.key}"]`);
      if (!disc) {
        const m = discMetrics(Number(c.pitch));
        disc = document.createElement("div");
        disc.className = "visio-disc";
        disc.dataset.key = c.key;
        disc.setAttribute("data-scene-id", c.sceneId);
        disc.setAttribute("data-yaw", c.yaw);
        disc.setAttribute("data-pitch", c.pitch);
        disc.style.setProperty("--disc-scale", String(m.scale));
        disc.style.setProperty("--disc-flat", String(m.flat));
        disc.innerHTML =
          '<div class="visio-disc-shadow"></div><div class="visio-disc-fill"></div><div class="visio-disc-label"></div>';
        disc.querySelector(".visio-disc-label").textContent = c.text;
        disc.addEventListener("mouseenter", () => {
          disc.classList.add("is-hover");
          preloadScene(c.sceneId);
        });
        disc.addEventListener("mouseleave", () => disc.classList.remove("is-hover"));
        disc.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const hs = sceneHotspots(viewer.getScene()).find(
            (x) =>
              String(x.sceneId) === c.sceneId &&
              Math.abs(Number(x.yaw) - Number(c.yaw)) < 0.2
          );
          if (hs) walkTo(hs);
        });
        layer.appendChild(disc);
      } else {
        // Refresh scale when pitch attribute changes
        const m = discMetrics(Number(c.pitch));
        disc.style.setProperty("--disc-scale", String(m.scale));
        disc.style.setProperty("--disc-flat", String(m.flat));
      }
      disc.style.left = `${c.pos.x}px`;
      disc.style.top = `${floorClampScreenY(c.pos.y, c.pitch, h)}px`;
      const show = visibleKeys.has(c.key);
      disc.style.display = show ? "block" : "none";
      disc.classList.toggle("is-hidden-overflow", !show);
      if (isTouch && show && c.key === nearestKey) {
        disc.classList.add("is-nearest-mobile");
      } else {
        disc.classList.remove("is-nearest-mobile");
      }
    }
    layer.querySelectorAll(".visio-disc").forEach((d) => {
      if (!seen.has(d.dataset.key)) d.remove();
    });
  }

  function clearSnapHighlight() {
    container.querySelectorAll(".visio-disc.is-snap").forEach((d) => d.classList.remove("is-snap"));
    snappedHs = null;
    if (cursorEl) cursorEl.classList.remove("is-snap");
  }

  function highlightDiscForHotspot(hs) {
    clearSnapHighlight();
    if (!hs) return;
    snappedHs = hs;
    container.querySelectorAll(".visio-disc").forEach((d) => {
      if (
        d.getAttribute("data-scene-id") === String(hs.sceneId) &&
        Math.abs(Number(d.getAttribute("data-yaw")) - Number(hs.yaw)) < 0.15
      ) {
        d.classList.add("is-snap");
      }
    });
    if (cursorEl) cursorEl.classList.add("is-snap");
  }

  function nearestHotspot(pitch, yaw) {
    let best = null;
    let bestD = SNAP;
    for (const h of sceneHotspots(viewer.getScene())) {
      if (!h?.sceneId) continue;
      const d = angularDist(pitch, yaw, Number(h.pitch) || 0, Number(h.yaw) || 0);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  async function walkTo(hs) {
    if (walking || !hs?.sceneId) return;
    if (typeof options.isPlaceMode === "function" && options.isPlaceMode()) return;

    walking = true;
    clearSnapHighlight();
    if (cursorEl) cursorEl.style.display = "none";

    const fromId = viewer.getScene();
    const toId = hs.sceneId;
    preloadScene(toId);

    const lookHfov = Math.max(48, viewer.getHfov() - 28);
    try {
      await animateLook(Number(hs.yaw) || 0, Number(hs.pitch) || 0, lookHfov, WALK_MS);
      const arrivalYaw = ((getArrivalYaw(fromId, toId) % 360) + 360) % 360;
      const dest = config.scenes[toId] || {};
      const arrivalPitch = Number.isFinite(Number(dest.pitch)) ? Number(dest.pitch) : 0;
      const arrivalHfov = Number.isFinite(Number(dest.hfov)) ? Number(dest.hfov) : 100;
      viewer.loadScene(toId, arrivalPitch, arrivalYaw, arrivalHfov);
      await new Promise((r) => setTimeout(r, FADE_MS));
      preloadLinkedFrom(toId);
      if (typeof options.onSceneChange === "function") options.onSceneChange(toId);
    } finally {
      walking = false;
    }
  }

  if (options.walkRef) options.walkRef.current = walkTo;

  ensureCursor();
  ensureDiscLayer();
  syncDiscOverlay();
  viewer.on("animate", syncDiscOverlay);
  let raf = 0;
  function tickOverlay() {
    syncDiscOverlay();
    raf = requestAnimationFrame(tickOverlay);
  }
  raf = requestAnimationFrame(tickOverlay);
  preloadLinkedFrom(viewer.getScene());

  viewer.on("scenechange", (sceneId) => {
    preloadLinkedFrom(sceneId);
    clearSnapHighlight();
    setTimeout(syncDiscOverlay, 50);
    if (typeof options.onSceneChange === "function") options.onSceneChange(sceneId);
  });

  function onPointerMove(ev) {
    if (isTouch || walking) return;
    if (typeof options.isPlaceMode === "function" && options.isPlaceMode()) {
      if (cursorEl) cursorEl.style.display = "none";
      return;
    }
    ensureCursor();
    const rect = container.getBoundingClientRect();
    const yRatio = (ev.clientY - rect.top) / rect.height;
    if (yRatio < 0.42) {
      if (cursorEl) cursorEl.style.display = "none";
      clearSnapHighlight();
      return;
    }

    const coords = viewer.mouseEventToCoords(ev);
    if (!coords) return;
    const [pitch, yaw] = coords;
    if (pitch > -6) {
      if (cursorEl) cursorEl.style.display = "none";
      clearSnapHighlight();
      return;
    }

    const near = nearestHotspot(pitch, yaw);
    if (near) {
      highlightDiscForHotspot(near);
      preloadScene(near.sceneId);
    } else {
      clearSnapHighlight();
    }

    if (cursorEl) {
      cursorEl.style.display = "block";
      let left = ev.clientX - rect.left;
      let top = ev.clientY - rect.top;
      try {
        if (typeof viewer.coordsToScreen === "function") {
          const screen = viewer.coordsToScreen(pitch, yaw);
          if (screen?.length >= 2) {
            left = screen[0];
            top = screen[1];
          }
        }
      } catch {
        /* ignore */
      }
      cursorEl.style.left = `${left}px`;
      cursorEl.style.top = `${top}px`;
    }
  }

  let pointerDown = null;
  function onMouseDown(ev) {
    pointerDown = { x: ev.clientX, y: ev.clientY, event: ev };
  }
  function onMouseUp(ev) {
    if (!pointerDown) return;
    const moved = Math.hypot(ev.clientX - pointerDown.x, ev.clientY - pointerDown.y);
    const src = moved < 8 ? pointerDown.event : null;
    pointerDown = null;
    if (!src) return;

    if (typeof options.isPlaceMode === "function" && options.isPlaceMode()) {
      const coords = viewer.mouseEventToCoords(src);
      if (coords && typeof options.onFloorPlace === "function") {
        options.onFloorPlace(coords[0], coords[1], src);
      }
      return;
    }

    if (!isTouch && snappedHs) walkTo(snappedHs);
  }

  container.addEventListener("mousemove", onPointerMove);
  container.addEventListener("mousedown", onMouseDown);
  container.addEventListener("mouseup", onMouseUp);
  container.addEventListener("mouseleave", () => {
    if (cursorEl) cursorEl.style.display = "none";
    clearSnapHighlight();
  });

  return {
    walkTo,
    jumpToScene(sceneId) {
      if (!sceneId || walking) return;
      const fromId = viewer.getScene();
      if (sceneId === fromId) return;
      const list = sceneHotspots(fromId);
      const existing = list.find((h) => h.sceneId === sceneId);
      if (existing) return walkTo(existing);
      // No direct link — still walk with current look direction as outbound
      return walkTo({
        sceneId,
        yaw: viewer.getYaw(),
        pitch: Math.min(-28, viewer.getPitch()),
      });
    },
    preloadScene,
    destroy() {
      container.removeEventListener("mousemove", onPointerMove);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mouseup", onMouseUp);
      if (raf) cancelAnimationFrame(raf);
      if (discLayer?.parentNode) discLayer.parentNode.removeChild(discLayer);
      discLayer = null;
      if (cursorEl?.parentNode) cursorEl.parentNode.removeChild(cursorEl);
      cursorEl = null;
      if (options.walkRef) options.walkRef.current = null;
    },
  };
}

/**
 * Self-contained browser runtime for published tour HTML (no imports).
 * Nested helpers so the whole bootstrap can be inlined.
 */
export function getPublishedTourBootstrap() {
  return function visioTourBootstrap(config) {
    var SNAP = 14;
    var WALK_MS = 400;
    var FADE_MS = 400;
    var MAX_MOBILE_PRELOAD = 2;
    var walking = false;
    var preloaded = {};
    var preloadOrder = [];
    var cursorEl = null;
    var snappedHs = null;
    var viewer = null;
    var isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);

    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }
    function easeIn(t) {
      return t * t;
    }
    function shortestYawDelta(from, to) {
      var d = to - from;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      return d;
    }
    function angularDist(p1, y1, p2, y2) {
      var toRad = Math.PI / 180;
      var x1 = Math.cos(p1 * toRad) * Math.cos(y1 * toRad);
      var yv1 = Math.cos(p1 * toRad) * Math.sin(y1 * toRad);
      var z1 = Math.sin(p1 * toRad);
      var x2 = Math.cos(p2 * toRad) * Math.cos(y2 * toRad);
      var yv2 = Math.cos(p2 * toRad) * Math.sin(y2 * toRad);
      var z2 = Math.sin(p2 * toRad);
      var dot = clamp(x1 * x2 + yv1 * yv2 + z1 * z2, -1, 1);
      return (Math.acos(dot) * 180) / Math.PI;
    }
    function discMetrics(pitch) {
      var p = Number(pitch) || -35;
      var t = clamp((-p - 6) / 52, 0, 1);
      return {
        scale: 0.95 + t * 1.15,
        flat: clamp(0.28 + t * 0.4, 0.28, 0.72),
      };
    }
    function floorClampScreenY(y, pitch, h) {
      var bandTop = h * 0.52;
      if (y >= bandTop) return y;
      var t = clamp((-(Number(pitch) || -35) - 6) / 52, 0, 1);
      var floorY = h * (0.58 + t * 0.28);
      return Math.min(Math.max(y, floorY), h * 0.9);
    }
    function sceneHotspots(sceneId) {
      var sc = config.scenes && config.scenes[sceneId];
      return (sc && sc.hotSpots) || [];
    }
    function findReturnHotspot(destSceneId, fromSceneId) {
      var list = sceneHotspots(destSceneId);
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].sceneId === fromSceneId) return list[i];
      }
      return null;
    }
    function getArrivalYaw(fromId, toId) {
      var ret = findReturnHotspot(toId, fromId);
      if (ret && Number.isFinite(Number(ret.yaw))) return Number(ret.yaw) + 180;
      var dest = config.scenes[toId];
      return dest && Number.isFinite(Number(dest.yaw)) ? Number(dest.yaw) : 0;
    }
    function preloadScene(sceneId) {
      if (!sceneId || preloaded[sceneId]) return;
      var sc = config.scenes[sceneId];
      if (!sc || !sc.panorama) return;
      if (isTouch && preloadOrder.length >= MAX_MOBILE_PRELOAD) {
        var drop = preloadOrder.shift();
        delete preloaded[drop];
      }
      preloaded[sceneId] = true;
      preloadOrder.push(sceneId);
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.src = sc.panorama;
    }
    function preloadLinkedFrom(sceneId) {
      var list = sceneHotspots(sceneId);
      var n = isTouch ? MAX_MOBILE_PRELOAD : list.length;
      for (var i = 0; i < list.length && i < n; i++) {
        if (list[i] && list[i].sceneId) preloadScene(list[i].sceneId);
      }
    }
    function createFloorDiscTooltip(hotSpotDiv, args) {
      args = args || {};
      hotSpotDiv.classList.add("visio-floor-hs");
      hotSpotDiv.setAttribute("data-scene-id", args.sceneId || "");
      hotSpotDiv.setAttribute("data-yaw", String(args.yaw != null ? args.yaw : 0));
      hotSpotDiv.setAttribute("data-pitch", String(args.pitch != null ? args.pitch : 0));
      hotSpotDiv.setAttribute("data-text", args.text || "");
    }
    var discLayer = null;
    function ensureDiscLayer() {
      if (discLayer) return discLayer;
      var container = viewer.getContainer();
      if (getComputedStyle(container).position === "static") container.style.position = "relative";
      discLayer = document.createElement("div");
      discLayer.className = "visio-disc-layer";
      container.appendChild(discLayer);
      return discLayer;
    }
    function parseHsTranslate(hsEl) {
      var tr = hsEl.style.transform || "";
      var m3 = tr.match(/matrix3d\(([^)]+)\)/);
      if (m3) {
        var p = m3[1].split(",").map(Number);
        return { x: p[12], y: p[13] };
      }
      var m = tr.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
      return null;
    }
    function syncDiscOverlay() {
      if (!viewer) return;
      var container = viewer.getContainer();
      var layer = ensureDiscLayer();
      var w = container.clientWidth;
      var h = container.clientHeight;
      var nodes = container.querySelectorAll(".pnlm-hotspot-base.visio-hotspot");
      var MAX_VISIBLE = 4;
      var viewYaw = 0;
      var viewPitch = 0;
      try {
        viewYaw = viewer.getYaw();
        viewPitch = viewer.getPitch();
      } catch (e) {}
      var candidates = [];
      var seen = {};
      for (var i = 0; i < nodes.length; i++) {
        var hsEl = nodes[i];
        if (hsEl.style.visibility === "hidden") continue;
        var pos = parseHsTranslate(hsEl);
        if (!pos) continue;
        if (pos.x < -80 || pos.y < -80 || pos.x > w + 80 || pos.y > h + 80) continue;
        var sceneId = hsEl.getAttribute("data-scene-id") || "";
        var yaw = hsEl.getAttribute("data-yaw") || "0";
        var pitch = hsEl.getAttribute("data-pitch") || "0";
        var text = hsEl.getAttribute("data-text") || "";
        var key = sceneId + "|" + yaw + "|" + pitch;
        seen[key] = true;
        candidates.push({
          key: key,
          sceneId: sceneId,
          yaw: yaw,
          pitch: pitch,
          text: text,
          pos: pos,
          ang: angularDist(viewPitch, viewYaw, Number(pitch) || 0, Number(yaw) || 0),
        });
      }
      candidates.sort(function (a, b) {
        return a.ang - b.ang;
      });
      var visible = {};
      var nearestKey = candidates.length ? candidates[0].key : null;
      for (var v = 0; v < candidates.length && v < MAX_VISIBLE; v++) {
        visible[candidates[v].key] = true;
      }
      for (var ci = 0; ci < candidates.length; ci++) {
        var c = candidates[ci];
        var disc = layer.querySelector('[data-key="' + c.key + '"]');
        if (!disc) {
          var met = discMetrics(Number(c.pitch));
          disc = document.createElement("div");
          disc.className = "visio-disc";
          disc.setAttribute("data-key", c.key);
          disc.setAttribute("data-scene-id", c.sceneId);
          disc.setAttribute("data-yaw", c.yaw);
          disc.setAttribute("data-pitch", c.pitch);
          disc.style.setProperty("--disc-scale", String(met.scale));
          disc.style.setProperty("--disc-flat", String(met.flat));
          disc.innerHTML =
            '<div class="visio-disc-shadow"></div><div class="visio-disc-fill"></div><div class="visio-disc-label"></div>';
          disc.querySelector(".visio-disc-label").textContent = c.text;
          (function (sid, yw, d) {
            if (!isTouch) {
              d.addEventListener("mouseenter", function () {
                d.classList.add("is-hover");
                preloadScene(sid);
              });
              d.addEventListener("mouseleave", function () {
                d.classList.remove("is-hover");
              });
            }
            d.addEventListener("click", function (ev) {
              if (ev && ev.preventDefault) ev.preventDefault();
              if (ev && ev.stopPropagation) ev.stopPropagation();
              var list = sceneHotspots(viewer.getScene());
              for (var j = 0; j < list.length; j++) {
                if (
                  list[j] &&
                  String(list[j].sceneId) === sid &&
                  Math.abs(Number(list[j].yaw) - Number(yw)) < 0.2
                ) {
                  walkTo(list[j]);
                  break;
                }
              }
            });
          })(c.sceneId, c.yaw, disc);
          layer.appendChild(disc);
        } else {
          var met2 = discMetrics(Number(c.pitch));
          disc.style.setProperty("--disc-scale", String(met2.scale));
          disc.style.setProperty("--disc-flat", String(met2.flat));
        }
        disc.style.left = c.pos.x + "px";
        disc.style.top = floorClampScreenY(c.pos.y, c.pitch, h) + "px";
        var show = !!visible[c.key];
        disc.style.display = show ? "block" : "none";
        if (isTouch && show && c.key === nearestKey) disc.classList.add("is-nearest-mobile");
        else disc.classList.remove("is-nearest-mobile");
      }
      var existing = layer.querySelectorAll(".visio-disc");
      for (var k = 0; k < existing.length; k++) {
        if (!seen[existing[k].getAttribute("data-key")]) existing[k].parentNode.removeChild(existing[k]);
      }
    }
    function animateLook(targetYaw, targetPitch, targetHfov, duration) {
      return new Promise(function (resolve) {
        var startYaw = viewer.getYaw();
        var startPitch = viewer.getPitch();
        var startHfov = viewer.getHfov();
        var dy = shortestYawDelta(startYaw, targetYaw);
        var dp = targetPitch - startPitch;
        var dh = targetHfov - startHfov;
        var t0 = performance.now();
        function frame(now) {
          var t = clamp((now - t0) / duration, 0, 1);
          var e = easeIn(t);
          viewer.setYaw(startYaw + dy * e);
          viewer.setPitch(startPitch + dp * e);
          viewer.setHfov(startHfov + dh * e);
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      });
    }
    function clearSnapHighlight() {
      var discs = viewer.getContainer().querySelectorAll(".visio-disc.is-snap");
      for (var i = 0; i < discs.length; i++) discs[i].classList.remove("is-snap");
      snappedHs = null;
      if (cursorEl) cursorEl.classList.remove("is-snap");
    }
    function highlightDiscForHotspot(hs) {
      clearSnapHighlight();
      if (!hs) return;
      snappedHs = hs;
      var discs = viewer.getContainer().querySelectorAll(".visio-disc");
      for (var i = 0; i < discs.length; i++) {
        var d = discs[i];
        if (
          d.getAttribute("data-scene-id") === String(hs.sceneId) &&
          Math.abs(Number(d.getAttribute("data-yaw")) - Number(hs.yaw)) < 0.15
        ) {
          d.classList.add("is-snap");
          break;
        }
      }
      if (cursorEl) cursorEl.classList.add("is-snap");
    }
    function nearestHotspot(pitch, yaw) {
      var list = sceneHotspots(viewer.getScene());
      var best = null;
      var bestD = SNAP;
      for (var i = 0; i < list.length; i++) {
        var h = list[i];
        if (!h || !h.sceneId) continue;
        var d = angularDist(pitch, yaw, Number(h.pitch) || 0, Number(h.yaw) || 0);
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
      return best;
    }
    function walkTo(hs) {
      if (walking || !hs || !hs.sceneId) return Promise.resolve();
      walking = true;
      clearSnapHighlight();
      if (cursorEl) cursorEl.style.display = "none";
      var fromId = viewer.getScene();
      var toId = hs.sceneId;
      preloadScene(toId);
      var lookHfov = Math.max(48, viewer.getHfov() - 28);
      return animateLook(Number(hs.yaw) || 0, Number(hs.pitch) || 0, lookHfov, WALK_MS)
        .then(function () {
          var arrivalYaw = getArrivalYaw(fromId, toId);
          arrivalYaw = ((arrivalYaw % 360) + 360) % 360;
          var dest = config.scenes[toId] || {};
          var arrivalPitch = Number.isFinite(Number(dest.pitch)) ? Number(dest.pitch) : 0;
          var arrivalHfov = Number.isFinite(Number(dest.hfov)) ? Number(dest.hfov) : 100;
          viewer.loadScene(toId, arrivalPitch, arrivalYaw, arrivalHfov);
          return new Promise(function (r) {
            setTimeout(r, FADE_MS);
          });
        })
        .then(function () {
          walking = false;
          preloadLinkedFrom(toId);
        })
        .catch(function () {
          walking = false;
        });
    }
    function prepareHotspots() {
      var scenes = config.scenes || {};
      var keys = Object.keys(scenes);
      for (var s = 0; s < keys.length; s++) {
        var list = scenes[keys[s]].hotSpots || [];
        for (var i = 0; i < list.length; i++) {
          (function (hs) {
            if (!hs || !hs.sceneId) return;
            hs.type = "info";
            hs.cssClass = "visio-hotspot";
            hs.createTooltipFunc = createFloorDiscTooltip;
            hs.createTooltipArgs = {
              text: hs.text || "",
              pitch: hs.pitch,
              yaw: hs.yaw,
              sceneId: hs.sceneId,
            };
            hs.clickHandlerFunc = function (ev) {
              if (ev && ev.preventDefault) ev.preventDefault();
              if (ev && ev.stopPropagation) ev.stopPropagation();
              walkTo(hs);
            };
          })(list[i]);
        }
      }
    }

    prepareHotspots();
    if (config.default) config.default.sceneFadeDuration = FADE_MS;
    // Pick 4096 vs 6144 by GPU MAX_TEXTURE_SIZE
    try {
      var maxTex = 4096;
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (gl) maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
      var sceneKeys = Object.keys(config.scenes || {});
      for (var si = 0; si < sceneKeys.length; si++) {
        var sc = config.scenes[sceneKeys[si]];
        var vs = sc && sc.viewerSizes;
        if (!vs) continue;
        if (maxTex >= 6144 && vs["6144"]) sc.panorama = vs["6144"];
        else if (vs["4096"]) sc.panorama = vs["4096"];
        else if (vs["6144"]) sc.panorama = vs["6144"];
      }
    } catch (ignore) {}
    viewer = pannellum.viewer("panorama", config);
    document.getElementById("loading").style.display = "none";

    var container = viewer.getContainer();
    if (!isTouch) {
      cursorEl = document.createElement("div");
      cursorEl.className = "visio-floor-cursor";
      container.style.position = "relative";
      container.appendChild(cursorEl);
    }
    ensureDiscLayer();
    syncDiscOverlay();
    viewer.on("animate", syncDiscOverlay);
    (function tickOverlay() {
      syncDiscOverlay();
      requestAnimationFrame(tickOverlay);
    })();
    preloadLinkedFrom(viewer.getScene());
    viewer.on("scenechange", function (sceneId) {
      preloadLinkedFrom(sceneId);
      clearSnapHighlight();
      setTimeout(syncDiscOverlay, 50);
    });

    function onPointerMove(ev) {
      if (isTouch || walking || !cursorEl) return;
      var rect = container.getBoundingClientRect();
      if ((ev.clientY - rect.top) / rect.height < 0.42) {
        cursorEl.style.display = "none";
        clearSnapHighlight();
        return;
      }
      var coords = viewer.mouseEventToCoords(ev);
      if (!coords) return;
      var pitch = coords[0];
      var yaw = coords[1];
      if (pitch > -6) {
        cursorEl.style.display = "none";
        clearSnapHighlight();
        return;
      }
      var near = nearestHotspot(pitch, yaw);
      if (near) {
        highlightDiscForHotspot(near);
        preloadScene(near.sceneId);
      } else clearSnapHighlight();
      cursorEl.style.display = "block";
      cursorEl.style.left = ev.clientX - rect.left + "px";
      cursorEl.style.top = ev.clientY - rect.top + "px";
    }
    var pointerDown = null;
    container.addEventListener("mousemove", onPointerMove);
    container.addEventListener("mousedown", function (ev) {
      pointerDown = { x: ev.clientX, y: ev.clientY };
    });
    container.addEventListener("mouseup", function (ev) {
      if (!pointerDown) return;
      var moved = Math.hypot(ev.clientX - pointerDown.x, ev.clientY - pointerDown.y);
      pointerDown = null;
      if (moved < 8 && !isTouch && snappedHs) walkTo(snappedHs);
    });
    container.addEventListener("mouseleave", function () {
      if (cursorEl) cursorEl.style.display = "none";
      clearSnapHighlight();
    });
  };
}
