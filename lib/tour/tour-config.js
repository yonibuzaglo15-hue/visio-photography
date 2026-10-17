/**
 * tour.json format helpers (isomorphic — safe for client + server).
 *
 * Stored shape: { default: { firstScene }, scenes: { [id]: scene }, floorPlans? }
 * Hotspot yaw/pitch are the exact degrees clicked in the editor.
 */

import { friendlyRoomLabel } from "./room-label.js";

export function normalizeFloorPlans(plans) {
  if (!Array.isArray(plans)) return [];
  return plans
    .filter((p) => p && typeof p.url === "string" && p.url)
    .map((p, i) => {
      const out = {
        floor: Number.isFinite(Number(p.floor)) ? Number(p.floor) : i,
        url: p.url,
        label:
          typeof p.label === "string" && p.label
            ? p.label
            : `קומה ${Number.isFinite(Number(p.floor)) ? p.floor : i}`,
      };
      if (p.cropped) out.cropped = true;
      if (Number.isFinite(Number(p.uploadedAt))) out.uploadedAt = Number(p.uploadedAt);
      if (typeof p.planId === "string" && p.planId.trim()) out.planId = p.planId.trim();
      else {
        // Derive from URL basename so existing cropped uploads get a stable id.
        const base = String(p.url).split("?")[0].split("/").pop() || "";
        if (base) out.planId = base.replace(/\.[^.]+$/, "") || base;
      }
      if (p.cropRect && typeof p.cropRect === "object") {
        const c = p.cropRect;
        if (
          Number.isFinite(Number(c.x)) &&
          Number.isFinite(Number(c.y)) &&
          Number.isFinite(Number(c.w)) &&
          Number.isFinite(Number(c.h))
        ) {
          out.cropRect = { x: Number(c.x), y: Number(c.y), w: Number(c.w), h: Number(c.h) };
        }
      }
      return out;
    });
}

/**
 * Editor scenes → tour config.
 * @param {object} opts
 * @param {boolean} [opts.includeHidden=false] true for the stored tour.json (editor
 *   round-trip); false for anything the public sees — hidden scenes and every
 *   hotspot pointing at them are dropped.
 */
export function buildTourConfig({ scenes, firstSceneId, includeHidden = false, floorPlans } = {}) {
  const all = (Array.isArray(scenes) ? scenes : []).filter(Boolean);
  const list = includeHidden ? all : all.filter((s) => !s.hidden);
  const idSet = new Set(list.map((s) => s.id));
  const publishTargets = new Set(all.filter((s) => !s.hidden).map((s) => s.id));
  const labelOf = (id) => {
    const i = all.findIndex((s) => s.id === id);
    return friendlyRoomLabel(i >= 0 ? all[i] : { id }, i >= 0 ? i + 1 : undefined);
  };
  const sceneMap = {};
  let firstScene = firstSceneId || null;
  if (firstScene && !all.some((s) => s.id === firstScene && !s.hidden)) firstScene = null;

  list.forEach((scene, i) => {
    const key = scene.id || `scene_${i}`;
    if (!firstScene && !scene.hidden) firstScene = key;
    const allowedTargets = includeHidden ? idSet : publishTargets;
    const hotSpots = (scene.hotSpots || [])
      .filter((h) => h && h.targetSceneId && allowedTargets.has(h.targetSceneId))
      .map((h) => ({
        id: h.id || undefined,
        pitch: Number(h.pitch) || 0,
        yaw: Number(h.yaw) || 0,
        type: "scene",
        sceneId: h.targetSceneId,
        text: labelOf(h.targetSceneId),
      }));

    const index = all.indexOf(scene);
    const entry = {
      title: friendlyRoomLabel(scene, (index >= 0 ? index : i) + 1),
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
      if (scene.viewerSizes["6144"]) entry.panorama = scene.viewerSizes["6144"];
      else if (scene.viewerSizes["4096"]) entry.panorama = scene.viewerSizes["4096"];
    }
    if (scene.panoramaUrl) entry.panoramaOriginal = scene.panoramaUrl;
    if (Number.isFinite(Number(scene.mapX)) && Number.isFinite(Number(scene.mapY))) {
      entry.mapX = Number(scene.mapX);
      entry.mapY = Number(scene.mapY);
    }
    if (typeof scene.mapPlanId === "string" && scene.mapPlanId.trim()) {
      entry.mapPlanId = scene.mapPlanId.trim();
    }
    if (Number.isFinite(Number(scene.floor))) entry.floor = Number(scene.floor);
    sceneMap[key] = entry;
  });

  if (!firstScene) firstScene = list.find((s) => !s.hidden)?.id || list[0]?.id || null;

  const out = { default: { firstScene }, scenes: sceneMap };
  const plans = normalizeFloorPlans(floorPlans);
  if (plans.length) out.floorPlans = plans;
  return out;
}

/** Stored tour config → editor scene list. */
export function configToEditorScenes(config) {
  if (!config?.scenes || typeof config.scenes !== "object") return [];
  return Object.entries(config.scenes).map(([id, scene], i) => {
    const out = {
      id,
      title: friendlyRoomLabel({ title: scene.title, id }, i + 1),
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
        .map((h, j) => ({
          id: h.id || `hs_${id}_${j}`,
          pitch: Number(h.pitch) || 0,
          yaw: Number(h.yaw) || 0,
          targetSceneId: h.sceneId,
        })),
    };
    if (Number.isFinite(Number(scene.mapX)) && Number.isFinite(Number(scene.mapY))) {
      out.mapX = Number(scene.mapX);
      out.mapY = Number(scene.mapY);
    }
    if (typeof scene.mapPlanId === "string" && scene.mapPlanId.trim()) {
      out.mapPlanId = scene.mapPlanId.trim();
    }
    if (Number.isFinite(Number(scene.floor))) out.floor = Number(scene.floor);
    return out;
  });
}

/** Floor plans stored in a tour config. */
export function configToFloorPlans(config) {
  return normalizeFloorPlans(config?.floorPlans);
}

/** Editor scenes from job panorama files (no hotspots, no filename titles). */
export function panoramasToEditorScenes(panoramas = []) {
  return panoramas.map((p, i) => ({
    id: `scene_${i}`,
    title: friendlyRoomLabel({ id: `scene_${i}` }, i + 1),
    panoramaUrl: p.url,
    yaw: 0,
    pitch: 0,
    hfov: 100,
    hidden: false,
    hotSpots: [],
  }));
}

/** Graph health for editor: outbound counts, dead ends, unreachable scenes. */
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
