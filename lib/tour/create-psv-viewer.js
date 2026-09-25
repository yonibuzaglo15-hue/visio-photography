/**
 * Browser-only Photo Sphere Viewer + VirtualTour (+ optional Map) factory.
 */

import { Viewer } from "@photo-sphere-viewer/core";
import { VirtualTourPlugin } from "@photo-sphere-viewer/virtual-tour-plugin";
import { MapPlugin } from "@photo-sphere-viewer/map-plugin";
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/virtual-tour-plugin/index.css";
import "@photo-sphere-viewer/map-plugin/index.css";

import {
  buildVirtualTourNodes,
  clickDataToDegrees,
  pickFloorPlan,
  virtualTourPluginOptions,
} from "./psv-config.js";
import { coverScale, installMapFraming, loadPlanModel } from "./map-framing.js";
import { planIdFromFloorPlan } from "./map-plan.js";
import { probeMaxTextureSize } from "./viewer-sizes.js";

/**
 * @param {HTMLElement} container
 * @param {object} config — tour.json config
 * @param {object} [options]
 */
export async function createPsvTourViewer(container, config, options = {}) {
  const {
    startNodeId,
    includeHidden = false,
    enableMap = true,
    onNodeChange,
    onPlaceClick,
    isPlaceMode,
    isCancelled,
  } = options;

  const maxTextureSize = probeMaxTextureSize();
  const firstId =
    startNodeId ||
    config?.default?.firstScene ||
    Object.keys(config?.scenes || {})[0];
  const firstScene = config?.scenes?.[firstId];
  const plan = enableMap ? pickFloorPlan(config, firstScene) : null;
  const planModel = plan?.url ? await loadPlanModel(plan.url) : null;
  // A superseded mount (e.g. React dev double-mount) must not build a viewer:
  // destroying it mid-load aborts panorama fetches the live viewer shares.
  if (isCancelled?.()) return null;
  const mapSize = planModel
    ? { width: planModel.width, height: planModel.height }
    : null;

  const nodes = buildVirtualTourNodes(config, {
    maxTextureSize,
    mapSize,
    includeHidden,
    planId: planIdFromFloorPlan(plan),
  });
  if (!nodes.length) {
    throw new Error("אין סצנות בסיור");
  }

  const start = nodes.find((n) => n.id === firstId)?.id || nodes[0].id;
  const startNode = nodes.find((n) => n.id === start);
  const firstMapped = nodes.find((n) => n.map && n.map !== false);
  const startCenter =
    (startNode?.map && startNode.map !== false ? startNode.map : null) ||
    firstMapped?.map ||
    null;

  /** @type {unknown[]} */
  const plugins = [];

  let mapPluginConfig = null;
  if (plan?.url && mapSize && nodes.some((n) => n.map && n.map !== false)) {
    const mapWidgetPx = 180;
    // Plan never smaller than the widget: start at cover scale. The exact floor is
    // enforced per widget size by installMapFraming (maximized needs more).
    const coverRaw =
      coverScale(
        planModel.model?.bounds || { x0: 0, y0: 0, x1: mapSize.width, y1: mapSize.height },
        mapWidgetPx,
        mapWidgetPx
      ) * 100;
    const coverPct = Math.ceil(coverRaw);
    mapPluginConfig = {
      imageUrl: plan.url,
      center: startCenter || {
        x: mapSize.width / 2,
        y: mapSize.height / 2,
      },
      size: `${mapWidgetPx}px`,
      position: "bottom right",
      shape: "square",
      // Keep plan north-up; only the view cone rotates. With static:false the
      // cropped plan spins and its dark margin fills the 180px square.
      static: true,
      coneColor: "#c9a84c",
      coneSize: 48,
      defaultZoom: coverPct,
      minZoom: Math.max(1, Math.floor(coverRaw)),
      maxZoom: Math.max(200, coverPct),
      visibleOnLoad: true,
      buttons: { north: false, maximize: true, close: true, reset: true },
    };
    plugins.push(MapPlugin.withConfig(mapPluginConfig));
  }

  // Register VT without nodes first — call setNodes after Viewer is ready.
  const vtOpts = virtualTourPluginOptions({
    nodes: undefined,
    startNodeId: start,
    mapImageUrl: mapPluginConfig ? plan.url : null,
  });
  delete vtOpts.nodes;
  delete vtOpts.startNodeId;
  plugins.push(VirtualTourPlugin.withConfig(vtOpts));

  const startData = startNode?.data || {};
  // No initial `panorama`: VirtualTour.setNodes loads the start node. Passing it
  // here too starts a load that setNodes aborts; when the file comes from the HTTP
  // cache the abort surfaces as "Failed to fetch" (not AbortError) and PSV shows
  // "The panorama cannot be loaded".
  const viewer = new Viewer({
    container,
    defaultYaw: degToRadStr(startData.startYaw || 0),
    defaultPitch: degToRadStr(startData.startPitch || 0),
    defaultZoomLvl: hfovToZoom(startData.hfov),
    navbar: ["zoom", "move", "fullscreen"],
    touchmoveTwoFingers: true,
    mousewheelCtrlKey: false,
    lang: {
      loading: "טוען…",
    },
    plugins,
  });

  const virtualTour = viewer.getPlugin(VirtualTourPlugin);
  const map = mapPluginConfig ? viewer.getPlugin(MapPlugin) : null;

  // Don't block forever on first panorama — Map can paint while VT attaches.
  await new Promise((resolve) => {
    const done = () => {
      viewer.removeEventListener("ready", done);
      viewer.removeEventListener("panorama-loaded", done);
      resolve();
    };
    viewer.addEventListener("ready", done);
    viewer.addEventListener("panorama-loaded", done);
    setTimeout(done, 50);
  });

  virtualTour.setNodes(nodes, start);

  // Attach window hooks early so E2E can proceed even if node-changed is slow.
  if (typeof window !== "undefined") {
    window.__visioViewer = viewer;
    window.__visioTour = virtualTour;
    window.__visioMap = map;
    window.__visioTourNodes = nodes;
  }

  await new Promise((resolve) => {
    if (virtualTour.getCurrentNode()?.id === start) {
      resolve();
      return;
    }
    const onChanged = ({ node }) => {
      if (node?.id === start) {
        virtualTour.removeEventListener("node-changed", onChanged);
        resolve();
      }
    };
    virtualTour.addEventListener("node-changed", onChanged);
    setTimeout(resolve, 3000);
  });

  // VirtualTour recenters the map from node.map on every node change; here we
  // only sync the floor image, and hide the map for unplaced scenes so a stale
  // pin from the previous scene is never shown.
  const syncMapForNode = (node) => {
    if (!map || !node) return;
    if (!node.map) {
      map.hide();
      return;
    }
    map.show();
    const nextPlan = pickFloorPlan(config, { floor: node.data?.floor });
    if (nextPlan?.url && nextPlan.url !== map.config?.imageUrl) {
      map.setImage(nextPlan.url, node.map);
    }
  };

  if (map) {
    installMapFraming(map, { url: plan.url, ...planModel });
    syncMapForNode(virtualTour.getCurrentNode());
  }

  const onNodeChanged = ({ node }) => {
    syncMapForNode(node);
    try {
      if (typeof document !== "undefined" && node?.id) {
        container.dataset.currentNode = node.id;
        container.dataset.mapX = String(node.data?.mapX ?? "");
        container.dataset.mapY = String(node.data?.mapY ?? "");
      }
    } catch {
      /* ignore */
    }
    onNodeChange?.(node);
  };

  virtualTour.addEventListener("node-changed", onNodeChanged);

  const onPositionUpdated = () => {
    try {
      const pos = viewer.getPosition();
      const deg = clickDataToDegrees(pos);
      container.dataset.viewYaw = String(deg.yaw.toFixed(2));
      container.dataset.viewPitch = String(deg.pitch.toFixed(2));
      let bearing = deg.yaw;
      while (bearing < 0) bearing += 360;
      while (bearing >= 360) bearing -= 360;
      container.dataset.viewBearing = String(bearing.toFixed(2));
    } catch {
      /* ignore */
    }
  };
  viewer.addEventListener("position-updated", onPositionUpdated);

  const onClick = (e) => {
    if (typeof isPlaceMode === "function" && !isPlaceMode()) return;
    if (!onPlaceClick) return;
    const data = e.data;
    if (!data || data.rightclick) return;
    // Clicks on an existing ring / map widget are navigation, not placement.
    // (data.objects always contains the panorama sphere itself — not a signal.)
    if (data.target?.closest?.(".psv-virtual-tour-link, .psv-map, .psv-navbar")) return;
    if (typeof data.yaw !== "number" || typeof data.pitch !== "number") return;
    onPlaceClick(clickDataToDegrees(data), data);
  };

  if (onPlaceClick) {
    viewer.addEventListener("click", onClick);
  }

  const destroy = () => {
    try {
      virtualTour.removeEventListener("node-changed", onNodeChanged);
    } catch {
      /* ignore */
    }
    try {
      viewer.removeEventListener("position-updated", onPositionUpdated);
    } catch {
      /* ignore */
    }
    try {
      if (onPlaceClick) viewer.removeEventListener("click", onClick);
    } catch {
      /* ignore */
    }
    try {
      viewer.destroy();
    } catch {
      /* ignore */
    }
  };

  return {
    viewer,
    virtualTour,
    map,
    destroy,
    setCurrentNode: (id) => virtualTour.setCurrentNode(id),
    getPositionDegrees: () => {
      const pos = viewer.getPosition();
      return clickDataToDegrees(pos);
    },
  };
}

function degToRadStr(deg) {
  const n = Number(deg);
  return `${Number.isFinite(n) ? n : 0}deg`;
}

function hfovToZoom(hfov) {
  const h = Number(hfov) || 100;
  return Math.max(0, Math.min(100, 150 - h));
}
