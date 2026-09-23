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
  loadImageSize,
  pickFloorPlan,
  virtualTourPluginOptions,
} from "./psv-config.js";
import { probeMaxTextureSize } from "./viewer-sizes.js";

/**
 * @param {HTMLElement} container
 * @param {object} config — pannellum-shaped tour.json
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
  } = options;

  const maxTextureSize = probeMaxTextureSize();
  const firstId =
    startNodeId ||
    config?.default?.firstScene ||
    Object.keys(config?.scenes || {})[0];
  const firstScene = config?.scenes?.[firstId];
  const plan = enableMap ? pickFloorPlan(config, firstScene) : null;
  const mapSize = plan?.url ? await loadImageSize(plan.url) : null;

  const nodes = buildVirtualTourNodes(config, {
    maxTextureSize,
    mapSize,
    includeHidden,
  });
  if (!nodes.length) {
    throw new Error("אין סצנות בסיור");
  }

  const start = nodes.find((n) => n.id === firstId)?.id || nodes[0].id;
  const startNode = nodes.find((n) => n.id === start);
  const startCenter = startNode?.map && startNode.map !== false ? startNode.map : null;

  /** @type {unknown[]} */
  const plugins = [];

  let mapPluginConfig = null;
  if (plan?.url && mapSize && nodes.some((n) => n.map && n.map !== false)) {
    mapPluginConfig = {
      imageUrl: plan.url,
      center: startCenter || {
        x: mapSize.width / 2,
        y: mapSize.height / 2,
      },
      rotation: degToRadStr(startNode?.data?.northOffset || 0),
      size: "180px",
      position: "bottom right",
      shape: "square",
      static: false,
      coneColor: "#c9a84c",
      coneSize: 48,
      defaultZoom: 100,
      minZoom: 40,
      maxZoom: 200,
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
  const viewer = new Viewer({
    container,
    panorama: startNode.panorama,
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

  // Wait until the first panorama is ready, then attach the tour graph.
  await new Promise((resolve) => {
    const done = () => {
      viewer.removeEventListener("ready", done);
      viewer.removeEventListener("panorama-loaded", done);
      resolve();
    };
    viewer.addEventListener("ready", done);
    viewer.addEventListener("panorama-loaded", done);
    // Fallback if already ready
    setTimeout(done, 50);
  });

  virtualTour.setNodes(nodes, start);

  // Wait for the start node to become current (links render).
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
    setTimeout(resolve, 8000);
  });

  const onNodeChanged = ({ node }) => {
    if (map && node) {
      const floor = node.data?.floor;
      const nextPlan = pickFloorPlan(config, { floor });
      const north = Number(node.data?.northOffset) || 0;
      if (nextPlan?.url && nextPlan.url !== (map.config?.imageUrl || plan?.url)) {
        loadImageSize(nextPlan.url).then((size) => {
          if (!size) return;
          const px =
            Number.isFinite(Number(node.data?.mapX)) &&
            Number.isFinite(Number(node.data?.mapY))
              ? {
                  x: Number(node.data.mapX) * size.width,
                  y: Number(node.data.mapY) * size.height,
                }
              : { x: size.width / 2, y: size.height / 2 };
          map.setImage(nextPlan.url, px, degToRadStr(north));
        });
      } else {
        try {
          map.setOptions({ rotation: degToRadStr(north) });
        } catch {
          /* ignore */
        }
      }
    }
    onNodeChange?.(node);
  };

  virtualTour.addEventListener("node-changed", onNodeChanged);

  const onClick = (e) => {
    if (typeof isPlaceMode === "function" && !isPlaceMode()) return;
    if (!onPlaceClick) return;
    const data = e.data;
    if (!data || data.rightclick) return;
    if (data.objects?.length) return;
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
