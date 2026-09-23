/**
 * Convert stored tour.json / Pannellum-shaped config → Photo Sphere Viewer
 * VirtualTourPlugin nodes (+ optional MapPlugin wiring).
 *
 * Hotspot yaw/pitch are stored in degrees (tour.json) and passed through
 * unchanged as `${n}deg` — no height compensation or linkOffset.
 */

import { FLOOR_DISC_DATA_URL } from "./floor-disc.js";
import { pickPanoramaForDevice } from "./viewer-sizes.js";

/** @param {number} deg */
export function degStr(deg) {
  const n = Number(deg);
  return `${Number.isFinite(n) ? n : 0}deg`;
}

/**
 * Load natural size of a floor-plan image (for 0–1 → pixel map coords).
 * @param {string} url
 * @returns {Promise<{ width: number, height: number } | null>}
 */
export function loadImageSize(url) {
  if (!url || typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    img.onerror = () => resolve(null);
    img.crossOrigin = "anonymous";
    img.src = url;
  });
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
 * Build VirtualTour nodes from a pannellum-shaped tour config.
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

  return entries.map(([id, sc]) => {
    const panorama = pickPanoramaForDevice(sc, maxTextureSize) || sc.panorama;
    const links = (sc.hotSpots || [])
      .filter((h) => h && (h.sceneId || h.targetSceneId) && idSet.has(h.sceneId || h.targetSceneId))
      .map((h) => {
        const nodeId = h.sceneId || h.targetSceneId;
        return {
          nodeId,
          // Exact stored degrees — no linkOffset / pitch compensation.
          position: {
            yaw: degStr(h.yaw),
            pitch: degStr(h.pitch),
          },
          name: h.text || undefined,
          data: { hotspotId: h.id || null },
        };
      });

    /** @type {import('@photo-sphere-viewer/virtual-tour-plugin').VirtualTourNode} */
    const node = {
      id,
      name: sc.title || id,
      panorama,
      caption: sc.title || id,
      links,
      data: {
        northOffset: Number.isFinite(Number(sc.northOffset))
          ? Number(sc.northOffset)
          : 0,
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
 * Shared VirtualTourPlugin options — discs below horizon, overlap fade,
 * exact click positions (no pitch offset).
 */
export function virtualTourPluginOptions({ nodes, startNodeId, mapImageUrl }) {
  const opts = {
    dataMode: "client",
    positionMode: "manual",
    renderMode: "3d",
    preload: true,
    showLinkTooltip: true,
    transitionOptions: {
      showLoader: true,
      speed: "20rpm",
      effect: "fade",
      rotation: true,
    },
    arrowStyle: {
      image: FLOOR_DISC_DATA_URL,
      size: { width: 72, height: 72 },
      className: "visio-floor-disc",
    },
    arrowsPosition: {
      minPitch: 0.05,
      maxPitch: Math.PI / 2,
      linkOverlapAngle: Math.PI / 4,
      linkPitchOffset: 0,
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
  const yaw = (Number(data?.yaw) * 180) / Math.PI;
  const pitch = (Number(data?.pitch) * 180) / Math.PI;
  return {
    yaw: Number.isFinite(yaw) ? yaw : 0,
    pitch: Number.isFinite(pitch) ? pitch : 0,
  };
}
