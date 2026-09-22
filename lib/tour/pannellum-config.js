/**
 * Shared Pannellum tour config helpers (isomorphic — safe for client + server).
 */

export function sceneTitle(name) {
  return (name || "חדר")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .trim();
}

export function normalizeFloorPlans(plans) {
  if (!Array.isArray(plans)) return [];
  return plans
    .filter((p) => p && typeof p.url === "string" && p.url)
    .map((p, i) => ({
      floor: Number.isFinite(Number(p.floor)) ? Number(p.floor) : i,
      url: p.url,
      label:
        typeof p.label === "string" && p.label
          ? p.label
          : `קומה ${Number.isFinite(Number(p.floor)) ? p.floor : i}`,
    }));
}

export function normalizeFloorPlanMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const deletedLinks = Array.isArray(meta.deletedLinks)
    ? meta.deletedLinks
        .filter((p) => Array.isArray(p) && p.length >= 2 && p[0] && p[1])
        .map((p) => [String(p[0]), String(p[1])])
    : [];
  const addedLinks = Array.isArray(meta.addedLinks)
    ? meta.addedLinks
        .filter((p) => Array.isArray(p) && p.length >= 2 && p[0] && p[1])
        .map((p) => [String(p[0]), String(p[1])])
    : [];
  return {
    maxDistNorm: Number.isFinite(Number(meta.maxDistNorm))
      ? Number(meta.maxDistNorm)
      : 0.22,
    metersPerNorm: Number.isFinite(Number(meta.metersPerNorm))
      ? Number(meta.metersPerNorm)
      : 12,
    cameraHeightM: Number.isFinite(Number(meta.cameraHeightM))
      ? Number(meta.cameraHeightM)
      : 1.55,
    deletedLinks,
    addedLinks,
  };
}

/**
 * Normalize editor scenes → Pannellum multi-scene config.
 * @param {object} opts
 * @param {boolean} [opts.includeHidden=false] — when true (tour.json), keep hidden scenes for editor round-trip.
 *   Published HTML should use includeHidden:false so hidden shots are omitted from the live graph.
 * Hotspot yaw/pitch/target shape stays backward compatible.
 */
export function buildPannellumConfig({
  scenes,
  firstSceneId,
  includeHidden = false,
  floorPlans,
  floorPlanMeta,
} = {}) {
  const all = (Array.isArray(scenes) ? scenes : []).filter(Boolean);
  const list = includeHidden ? all : all.filter((s) => !s.hidden);
  const idSet = new Set(list.map((s) => s.id));
  const publishTargets = new Set(all.filter((s) => !s.hidden).map((s) => s.id));
  const sceneMap = {};
  let firstScene = firstSceneId || null;

  if (firstScene && !all.some((s) => s.id === firstScene && !s.hidden)) {
    firstScene = null;
  }

  list.forEach((scene, i) => {
    const key = scene.id || `scene_${i}`;
    if (!firstScene && !scene.hidden) firstScene = key;

    const allowedTargets = includeHidden ? idSet : publishTargets;
    const hotSpots = (scene.hotSpots || [])
      .filter((h) => h && h.targetSceneId && allowedTargets.has(h.targetSceneId))
      .map((h) => {
        const hs = {
          id: h.id || undefined,
          pitch: Number(h.pitch) || 0,
          yaw: Number(h.yaw) || 0,
          type: "scene",
          sceneId: h.targetSceneId,
          text: h.text || sceneTitle(h.targetSceneId),
          cssClass: "visio-hotspot",
        };
        if (h.source === "auto") hs.source = "auto";
        return hs;
      });

    const entry = {
      title: scene.title || `חדר ${i + 1}`,
      type: "equirectangular",
      panorama: scene.panoramaUrl,
      yaw: Number.isFinite(Number(scene.yaw)) ? Number(scene.yaw) : 0,
      pitch: Number.isFinite(Number(scene.pitch)) ? Number(scene.pitch) : 0,
      hfov: Number.isFinite(Number(scene.hfov)) ? Number(scene.hfov) : 100,
      hotSpots,
    };
    if (scene.hidden) entry.hidden = true;
    if (scene.viewerSizes && typeof scene.viewerSizes === "object") {
      entry.viewerSizes = { ...scene.viewerSizes };
      // Prefer mid-size as default panorama for JSON; client may swap up/down.
      if (scene.viewerSizes["6144"]) entry.panorama = scene.viewerSizes["6144"];
      else if (scene.viewerSizes["4096"]) entry.panorama = scene.viewerSizes["4096"];
    }
    // Keep original for editor round-trip when present
    if (scene.panoramaUrl) entry.panoramaOriginal = scene.panoramaUrl;
    if (Number.isFinite(Number(scene.mapX)) && Number.isFinite(Number(scene.mapY))) {
      entry.mapX = Number(scene.mapX);
      entry.mapY = Number(scene.mapY);
    }
    if (Number.isFinite(Number(scene.floor))) entry.floor = Number(scene.floor);
    if (Number.isFinite(Number(scene.northOffset))) {
      entry.northOffset = Number(scene.northOffset);
    }
    sceneMap[key] = entry;
  });

  if (!firstScene) {
    firstScene = list.find((s) => !s.hidden)?.id || list[0]?.id || null;
  }

  const plans = normalizeFloorPlans(floorPlans);
  const meta = normalizeFloorPlanMeta(floorPlanMeta);

  const out = {
    default: {
      firstScene,
      sceneFadeDuration: 400,
      autoLoad: true,
      showControls: true,
      compass: true,
      hfov: 100,
      hotSpotDebug: false,
    },
    scenes: sceneMap,
  };
  if (plans.length) out.floorPlans = plans;
  if (meta) out.floorPlanMeta = meta;
  return out;
}

/**
 * Convert a stored Pannellum config back into editor scene list.
 */
export function configToEditorScenes(config) {
  if (!config?.scenes || typeof config.scenes !== "object") return [];

  return Object.entries(config.scenes).map(([id, scene]) => {
    const out = {
      id,
      title: scene.title || id,
      // Editor always uses the original upload when known
      panoramaUrl: scene.panoramaOriginal || scene.panorama,
      yaw: Number.isFinite(Number(scene.yaw)) ? Number(scene.yaw) : 0,
      pitch: Number.isFinite(Number(scene.pitch)) ? Number(scene.pitch) : 0,
      hfov: Number.isFinite(Number(scene.hfov)) ? Number(scene.hfov) : 100,
      hidden: Boolean(scene.hidden),
      viewerSizes:
        scene.viewerSizes && typeof scene.viewerSizes === "object"
          ? { ...scene.viewerSizes }
          : undefined,
      hotSpots: (scene.hotSpots || [])
        .filter((h) => h?.type === "scene" && h.sceneId)
        .map((h, i) => {
          const hs = {
            id: h.id || `hs_${id}_${i}`,
            pitch: Number(h.pitch) || 0,
            yaw: Number(h.yaw) || 0,
            targetSceneId: h.sceneId,
            text: h.text || "",
          };
          if (h.source === "auto") hs.source = "auto";
          return hs;
        }),
    };
    if (Number.isFinite(Number(scene.mapX)) && Number.isFinite(Number(scene.mapY))) {
      out.mapX = Number(scene.mapX);
      out.mapY = Number(scene.mapY);
    }
    if (Number.isFinite(Number(scene.floor))) out.floor = Number(scene.floor);
    if (Number.isFinite(Number(scene.northOffset))) {
      out.northOffset = Number(scene.northOffset);
    }
    return out;
  });
}

/** Extract floor-plan payload from a stored tour.json. */
export function configToFloorPlanState(config) {
  return {
    floorPlans: normalizeFloorPlans(config?.floorPlans),
    floorPlanMeta: normalizeFloorPlanMeta(config?.floorPlanMeta) || {
      maxDistNorm: 0.22,
      metersPerNorm: 12,
      cameraHeightM: 1.55,
      deletedLinks: [],
      addedLinks: [],
    },
  };
}

/**
 * Build editor scenes from job panorama files (no hotspots yet).
 */
export function panoramasToEditorScenes(panoramas = []) {
  return panoramas.map((p, i) => ({
    id: `scene_${i}`,
    title: sceneTitle(p.name),
    panoramaUrl: p.url,
    yaw: 0,
    pitch: 0,
    hfov: 100,
    hidden: false,
    hotSpots: [],
  }));
}

/**
 * Graph health for editor: outbound counts, dead ends, unreachable scenes.
 */
export function analyzeTourGraph(scenes, firstSceneId) {
  const visible = (scenes || []).filter((s) => s && !s.hidden);
  const ids = new Set(visible.map((s) => s.id));
  const inbound = new Map([...ids].map((id) => [id, 0]));

  for (const s of visible) {
    for (const h of s.hotSpots || []) {
      if (h?.targetSceneId && ids.has(h.targetSceneId)) {
        inbound.set(h.targetSceneId, (inbound.get(h.targetSceneId) || 0) + 1);
      }
    }
  }

  return visible.map((s) => {
    const outCount = (s.hotSpots || []).filter(
      (h) => h?.targetSceneId && ids.has(h.targetSceneId)
    ).length;
    const inCount = inbound.get(s.id) || 0;
    return {
      id: s.id,
      outCount,
      inCount,
      isDeadEnd: outCount === 0,
      isUnreachable: inCount === 0 && s.id !== firstSceneId,
    };
  });
}
