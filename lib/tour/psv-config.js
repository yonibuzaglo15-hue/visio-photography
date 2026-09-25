/**
 * Convert stored tour.json → Photo Sphere Viewer VirtualTourPlugin nodes
 * (+ optional MapPlugin wiring).
 *
 * Hotspot yaw/pitch are stored in degrees (tour.json) and passed through
 * unchanged as `${n}deg` — the ring is drawn exactly where it was clicked.
 */

import { FLOOR_DISC_DATA_URL } from "./floor-disc.js";
import { friendlyRoomLabel } from "./room-label.js";
import { pickPanoramaForDevice } from "./viewer-sizes.js";

/** Room names are user-typed; PSV renders tooltips / captions as HTML. */
export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** @param {number} deg */
export function degStr(deg) {
  const n = Number(deg);
  return `${Number.isFinite(n) ? n : 0}deg`;
}

/**
 * Normalized mapX/mapY (0–1) → Map plugin pixel coords.
 * @param {number} mapX
 * @param {number} mapY
 * @param {{ width: number, height: number }} size
 */
export function normToMapPixels(mapX, mapY, size) {
  if (!size?.width || !size?.height) return null;
  if (!Number.isFinite(Number(mapX)) || !Number.isFinite(Number(mapY))) return null;
  return {
    x: Number(mapX) * size.width,
    y: Number(mapY) * size.height,
  };
}

/**
 * Pick the floor plan matching a scene's floor (fallback: first plan).
 * @param {object} config
 * @param {object} [scene]
 */
export function pickFloorPlan(config, scene) {
  const plans = Array.isArray(config?.floorPlans) ? config.floorPlans : [];
  if (!plans.length) return null;
  const floor = Number.isFinite(Number(scene?.floor)) ? Number(scene.floor) : null;
  if (floor != null) {
    const match = plans.find((p) => Number(p.floor) === floor);
    if (match) return match;
  }
  return plans[0];
}

/**
 * Build VirtualTour nodes from a tour config.
 * @param {object} config
 * @param {object} [opts]
 * @param {number|null} [opts.maxTextureSize]
 * @param {{ width: number, height: number } | null} [opts.mapSize]
 * @param {boolean} [opts.includeHidden]
 * @param {string|null} [opts.planId]
 */
export function buildVirtualTourNodes(config, opts = {}) {
  const {
    maxTextureSize = null,
    mapSize = null,
    includeHidden = false,
    planId = null,
  } = opts;

  const scenes = config?.scenes || {};
  const entries = Object.entries(scenes).filter(([, sc]) => {
    if (!sc) return false;
    if (!includeHidden && sc.hidden) return false;
    return Boolean(sc.panorama || sc.viewerSizes);
  });

  const idSet = new Set(entries.map(([id]) => id));
  const order = Object.keys(scenes);
  const labelOf = (id) =>
    escapeHtml(friendlyRoomLabel({ ...(scenes[id] || {}), id }, order.indexOf(id) + 1));

  return entries.map(([id, sc]) => {
    const panorama = pickPanoramaForDevice(sc, maxTextureSize) || sc.panorama;
    const links = (sc.hotSpots || [])
      .filter((h) => h && (h.sceneId || h.targetSceneId) && idSet.has(h.sceneId || h.targetSceneId))
      .map((h) => {
        const nodeId = h.sceneId || h.targetSceneId;
        const pitchNum = Number(h.pitch);
        const yawNum = Number(h.yaw);
        return {
          nodeId,
          // Exact stored degrees — no linkOffset / pitch compensation.
          position: {
            yaw: degStr(h.yaw),
            pitch: degStr(h.pitch),
          },
          name: labelOf(nodeId),
          data: {
            hotspotId: h.id || null,
            pitchNum: Number.isFinite(pitchNum) ? pitchNum : 0,
            yawNum: Number.isFinite(yawNum) ? yawNum : 0,
          },
        };
      })
      // Max 2 visible discs: prefer floor-level (more negative pitch).
      .sort((a, b) => (a.data.pitchNum || 0) - (b.data.pitchNum || 0))
      .slice(0, 2);

    /** @type {import('@photo-sphere-viewer/virtual-tour-plugin').VirtualTourNode} */
    const node = {
      id,
      name: labelOf(id),
      panorama,
      caption: labelOf(id),
      links,
      data: {
        floor: Number.isFinite(Number(sc.floor)) ? Number(sc.floor) : 0,
        mapX: sc.mapX,
        mapY: sc.mapY,
        startYaw: Number.isFinite(Number(sc.yaw)) ? Number(sc.yaw) : 0,
        startPitch: Number.isFinite(Number(sc.pitch)) ? Number(sc.pitch) : 0,
        hfov: Number.isFinite(Number(sc.hfov)) ? Number(sc.hfov) : 100,
      },
    };

    const px = normToMapPixels(sc.mapX, sc.mapY, mapSize);
    // Only pin scenes stamped for this plan version — never draw stale coords.
    if (px && planId && sc.mapPlanId && sc.mapPlanId === planId) {
      node.map = { x: px.x, y: px.y };
    } else {
      node.map = false;
    }

    return node;
  });
}

/**
 * Heading (degrees, destination panorama) to face on arrival: the direction of
 * travel. When the destination has a ring back to the origin, travel continues
 * straight through it (its yaw + 180°); otherwise keep the clicked ring's yaw.
 * @returns {number|null}
 */
export function arrivalYawDeg(toNode, fromNode, fromLink) {
  if (!fromNode || !fromLink) return null;
  const back = (toNode?.links || []).find((l) => l.nodeId === fromNode.id);
  let yaw = back ? Number(back.data?.yawNum) + 180 : Number(fromLink.data?.yawNum);
  if (!Number.isFinite(yaw)) return null;
  while (yaw > 180) yaw -= 360;
  while (yaw <= -180) yaw += 360;
  return yaw;
}

/**
 * Shared VirtualTourPlugin options. `2d` render mode pins each ring to its exact
 * clicked yaw/pitch on the panorama (the `3d` mode draws arrows on a separate
 * ground layer and ignores pitch, so a ring would not sit on its floor tile).
 */
export function virtualTourPluginOptions({ nodes, startNodeId, mapImageUrl }) {
  const base = { showLoader: true, speed: "20rpm", effect: "fade", rotation: false };
  const opts = {
    dataMode: "client",
    positionMode: "manual",
    renderMode: "2d",
    preload: true,
    showLinkTooltip: true,
    // Room name once (the default template repeats it as heading + caption).
    getLinkTooltip: (_content, _link, node) => `<h3>${node.name}</h3>`,
    transitionOptions: (toNode, fromNode, fromLink) => {
      const yaw = arrivalYawDeg(toNode, fromNode, fromLink);
      return yaw == null ? base : { ...base, rotateTo: { yaw: `${yaw}deg`, pitch: "0deg" } };
    },
    arrowStyle: {
      image: FLOOR_DISC_DATA_URL,
      size: { width: 80, height: 50 },
      className: "visio-floor-disc",
      // The renderer positions rings with transforms from the top-left origin; in
      // RTL pages an unset `left` would start them at the right edge instead.
      style: { left: "0px", top: "0px" },
    },
  };
  if (nodes) {
    opts.nodes = nodes;
    opts.startNodeId = startNodeId || nodes[0]?.id;
  }
  if (mapImageUrl) {
    opts.map = {
      imageUrl: mapImageUrl,
      recenter: true,
    };
  }
  return opts;
}

/**
 * ClickData yaw/pitch are radians → degrees for tour.json storage.
 * @param {{ yaw: number, pitch: number }} data
 */
export function clickDataToDegrees(data) {
  let yaw = (Number(data?.yaw) * 180) / Math.PI;
  const pitch = (Number(data?.pitch) * 180) / Math.PI;
  if (!Number.isFinite(yaw)) yaw = 0;
  // PSV reports yaw in [0, 2π); store it in (-180, 180].
  while (yaw > 180) yaw -= 360;
  while (yaw <= -180) yaw += 360;
  return { yaw, pitch: Number.isFinite(pitch) ? pitch : 0 };
}
