/**
 * Floor-plan geometry + auto-link generation for tour navigation.
 * Image coords: x right, y down. Map "north" = −Y (up on the image).
 *
 * Distances: prefer meters via metersPerNorm (from scale calibration).
 * Without calibration, assume the cropped plan's short side ≈ DEFAULT_SHORT_SIDE_METERS.
 */

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** Bearing in degrees: 0 = up (north on map), 90 = right (east). */
export function mapBearing(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  while (deg < 0) deg += 360;
  while (deg >= 360) deg -= 360;
  return deg;
}

/** Smallest absolute angle difference in degrees. */
export function angleDelta(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d);
}

/** Euclidean distance in normalized plan space (0..1). */
export function normDist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

/**
 * Hotspot yaw in the panorama at A looking toward B.
 * Convention (Pannellum): yaw 0 = equirect centre, positive = look right.
 * northOffset = map bearing that yaw 0 faces.
 * yaw = bearing(A→B) − northOffset   (subtract; never add; never B→A)
 */
export function hotspotYaw(ax, ay, bx, by, northOffset = 0) {
  const bearing = mapBearing(ax, ay, bx, by);
  let yaw = bearing - (Number(northOffset) || 0);
  while (yaw > 180) yaw -= 360;
  while (yaw < -180) yaw += 360;
  return yaw;
}

/**
 * Derive northOffset: user looks at doorwayYaw in the pano toward neighbour B.
 * northOffset = mapBearing(A→B) − doorwayYaw
 */
export function northOffsetFromDoorway(ax, ay, bx, by, doorwayYaw) {
  const bearing = mapBearing(ax, ay, bx, by);
  let offset = bearing - (Number(doorwayYaw) || 0);
  while (offset > 180) offset -= 360;
  while (offset < -180) offset += 360;
  return offset;
}

/**
 * Absolute map bearing the viewer is facing: yaw + northOffset.
 */
export function mapBearingFromView(yaw, northOffset = 0) {
  let b = (Number(yaw) || 0) + (Number(northOffset) || 0);
  while (b < 0) b += 360;
  while (b >= 360) b -= 360;
  return b;
}

/**
 * Flag impossible calibrations: both ends claim the other is roughly "ahead"
 * (yaw≈0) while sharing a similar northOffset — that would put each north of the other.
 */
export function findCalibrationConflicts(scenes, opts = {}) {
  const yawTol = opts.yawTolDeg ?? 35;
  const northTol = opts.northTolDeg ?? 40;
  const list = (scenes || []).filter(
    (s) => s && Number.isFinite(Number(s.mapX)) && Number.isFinite(Number(s.mapY))
  );
  const byId = new Map(list.map((s) => [s.id, s]));
  const conflicts = [];
  const seen = new Set();

  for (const a of list) {
    for (const h of a.hotSpots || []) {
      const bId = h.targetSceneId || h.sceneId;
      if (!bId || !byId.has(bId)) continue;
      const key = undirectedKey(a.id, bId);
      if (seen.has(key)) continue;
      seen.add(key);
      const b = byId.get(bId);
      const hsBa = (b.hotSpots || []).find(
        (x) => (x.targetSceneId || x.sceneId) === a.id
      );
      if (!hsBa) continue;
      const yawAb = Number(h.yaw);
      const yawBa = Number(hsBa.yaw);
      if (!Number.isFinite(yawAb) || !Number.isFinite(yawBa)) continue;
      const nA = Number(a.northOffset) || 0;
      const nB = Number(b.northOffset) || 0;
      if (angleDelta(nA, nB) > northTol) continue;
      if (Math.abs(yawAb) <= yawTol && Math.abs(yawBa) <= yawTol) {
        conflicts.push({
          aId: a.id,
          bId: b.id,
          aTitle: a.title || a.id,
          bTitle: b.title || b.id,
          reason: "both_forward",
          message: `${a.title || a.id} ↔ ${b.title || b.id}: שני הצדדים מצביעים קדימה אחד לשני עם northOffset דומה — כיול הפוך באחד מהם.`,
        });
      }
    }
  }
  return conflicts;
}

/**
 * Friendly room label — never raw IMG_ filenames.
 * @param {{ title?: string, id?: string }} scene
 * @param {number} [index1based]
 */
export function friendlyRoomLabel(scene, index1based) {
  const raw = String(scene?.title || "").trim();
  const looksLikeFile =
    !raw ||
    /^IMG[\s._-]/i.test(raw) ||
    /^\d{8}/.test(raw) ||
    /\.(jpe?g|png|webp)$/i.test(raw) ||
    /^scene[_\s-]?\d+/i.test(raw);
  if (!looksLikeFile) return raw;
  const n =
    Number.isFinite(Number(index1based)) && Number(index1based) > 0
      ? Number(index1based)
      : (() => {
          const m = String(scene?.id || "").match(/(\d+)/);
          return m ? Number(m[1]) + 1 : 1;
        })();
  return `חדר ${n}`;
}

/** Pitch never above the floor line (keeps discs off walls / horizon). */
export const FLOOR_LINE_PITCH = -6;
export const NADIR_PITCH_LIMIT = -58;

/**
 * Pitch toward a floor disc from camera height and ground distance:
 *   pitch = −atan(cameraHeightM / distM) · 180/π
 * Clamped to (NADIR_PITCH_LIMIT … FLOOR_LINE_PITCH) so never ≥ horizon (0°).
 */
export function hotspotPitch(distNorm, opts = {}) {
  const cameraHeightM = opts.cameraHeightM ?? DEFAULT_CAMERA_HEIGHT_M;
  const metersPerNorm = opts.metersPerNorm ?? DEFAULT_SHORT_SIDE_METERS;
  const distM =
    opts.distM != null
      ? Math.max(0.4, opts.distM)
      : Math.max(0.4, distNorm * metersPerNorm);
  let pitch = (-Math.atan(cameraHeightM / distM) * 180) / Math.PI;
  pitch = clamp(pitch, NADIR_PITCH_LIMIT, FLOOR_LINE_PITCH);
  return pitch;
}

function undirectedKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export const DEFAULT_MAX_NEIGHBORS = 3;
export const DEFAULT_MAX_LINK_METERS = 6;
export const DEFAULT_CAMERA_HEIGHT_M = 1.6;
/** Without scale calibration: cropped plan short side ≈ this many meters. */
export const DEFAULT_SHORT_SIDE_METERS = 12;
/** Reject confirming a near-full-frame crop when content fills less than this. */
export const MIN_CONTENT_RATIO = 0.5;
/** Skip a farther neighbour if a closer one lies within this bearing (deg). */
export const BEARING_OCCLUSION_DEG = 28;

/** @deprecated use DEFAULT_MAX_LINK_METERS + meters */
export const DEFAULT_MAX_DIST_NORM = 0.22;
/** @deprecated */
export const DEFAULT_METERS_PER_NORM = DEFAULT_SHORT_SIDE_METERS;

export function resolveMetersPerNorm(meta = {}) {
  if (meta.scaleCalibrated && Number.isFinite(Number(meta.metersPerNorm))) {
    return Number(meta.metersPerNorm);
  }
  if (Number.isFinite(Number(meta.metersPerNorm)) && Number(meta.metersPerNorm) > 0) {
    return Number(meta.metersPerNorm);
  }
  return DEFAULT_SHORT_SIDE_METERS;
}

export function resolveMaxLinkMeters(meta = {}) {
  if (Number.isFinite(Number(meta.maxLinkMeters)) && Number(meta.maxLinkMeters) > 0) {
    return Number(meta.maxLinkMeters);
  }
  // Legacy: derive from maxDistNorm if present
  if (Number.isFinite(Number(meta.maxDistNorm))) {
    return Number(meta.maxDistNorm) * resolveMetersPerNorm(meta);
  }
  return DEFAULT_MAX_LINK_METERS;
}

export function maxDistNormFromMeters(maxLinkMeters, metersPerNorm) {
  const mpn = metersPerNorm > 0 ? metersPerNorm : DEFAULT_SHORT_SIDE_METERS;
  return Math.max(0.02, (maxLinkMeters || DEFAULT_MAX_LINK_METERS) / mpn);
}

/**
 * Remap a normalized point from the full image into a crop rect (also normalized).
 * @param {number} x
 * @param {number} y
 * @param {{ x: number, y: number, w: number, h: number }} crop
 */
export function remapNormToCrop(x, y, crop) {
  if (!crop || !(crop.w > 1e-6) || !(crop.h > 1e-6)) return { x, y };
  return {
    x: clamp((x - crop.x) / crop.w, 0, 1),
    y: clamp((y - crop.y) / crop.h, 0, 1),
  };
}

/** Remap all placed scenes on a floor into a new crop. */
export function remapScenesToCrop(scenes, floor, crop) {
  return (scenes || []).map((s) => {
    if ((s.floor ?? 0) !== floor) return s;
    if (!Number.isFinite(Number(s.mapX)) || !Number.isFinite(Number(s.mapY))) return s;
    const next = remapNormToCrop(Number(s.mapX), Number(s.mapY), crop);
    return { ...s, mapX: next.x, mapY: next.y };
  });
}

/**
 * Pick nearest neighbours with bearing occlusion.
 * Skip B if a closer C lies nearly along the same bearing from A.
 */
export function pickNeighbours(a, group, opts = {}) {
  const maxN = opts.maxNeighbors ?? DEFAULT_MAX_NEIGHBORS;
  const maxDist = opts.maxDistNorm ?? DEFAULT_MAX_DIST_NORM;
  const occDeg = opts.bearingOcclusionDeg ?? BEARING_OCCLUSION_DEG;
  const candidates = [];
  for (const b of group) {
    if (a.id === b.id) continue;
    const d = normDist(a.mapX, a.mapY, b.mapX, b.mapY);
    if (d > maxDist || d < 1e-9) continue;
    candidates.push({
      b,
      d,
      bearing: mapBearing(a.mapX, a.mapY, b.mapX, b.mapY),
    });
  }
  candidates.sort((x, y) => x.d - y.d);
  const picked = [];
  for (const cand of candidates) {
    if (picked.length >= maxN) break;
    const blocked = picked.some(
      (p) => angleDelta(p.bearing, cand.bearing) < occDeg && p.d < cand.d
    );
    if (blocked) continue;
    picked.push(cand);
  }
  return picked;
}

/**
 * @param {Array<{id, mapX, mapY, floor?, northOffset?, title?}>} placed
 * @param {object} opts
 * @returns {Array<{ fromId, toId, yaw, pitch, dist, distM }>} directed edges
 */
export function generateAutoLinks(placed, opts = {}) {
  const maxN = opts.maxNeighbors ?? DEFAULT_MAX_NEIGHBORS;
  const metersPerNorm = resolveMetersPerNorm(opts);
  const maxLinkMeters = resolveMaxLinkMeters(opts);
  const maxDist =
    opts.maxDistNorm != null
      ? opts.maxDistNorm
      : maxDistNormFromMeters(maxLinkMeters, metersPerNorm);
  const deleted = new Set(
    (opts.deletedLinks || []).map(([a, b]) => undirectedKey(a, b))
  );
  const added = opts.addedLinks || [];
  const cameraHeightM = opts.cameraHeightM ?? DEFAULT_CAMERA_HEIGHT_M;
  const sameFloorOnly = opts.sameFloorOnly !== false;

  const byFloor = new Map();
  for (const s of placed) {
    if (s.mapX == null || s.mapY == null) continue;
    const f = sameFloorOnly ? s.floor ?? 0 : 0;
    if (!byFloor.has(f)) byFloor.set(f, []);
    byFloor.get(f).push(s);
  }

  const pairSet = new Set();

  for (const [, group] of byFloor) {
    for (const a of group) {
      const picked = pickNeighbours(a, group, {
        maxNeighbors: maxN,
        maxDistNorm: maxDist,
        bearingOcclusionDeg: opts.bearingOcclusionDeg,
      });
      for (const { b } of picked) {
        const key = undirectedKey(a.id, b.id);
        if (deleted.has(key)) continue;
        pairSet.add(key);
      }
    }
  }

  for (const [a, b] of added) {
    if (a && b && a !== b) pairSet.add(undirectedKey(a, b));
  }

  const byId = new Map(placed.map((s) => [s.id, s]));
  const edges = [];
  const pitchOpts = { metersPerNorm, cameraHeightM };

  for (const key of pairSet) {
    const [idA, idB] = key.split("|");
    const a = byId.get(idA);
    const b = byId.get(idB);
    if (!a || !b) continue;
    if (sameFloorOnly && (a.floor ?? 0) !== (b.floor ?? 0)) continue;
    const d = normDist(a.mapX, a.mapY, b.mapX, b.mapY);
    const distM = d * metersPerNorm;
    edges.push({
      fromId: a.id,
      toId: b.id,
      yaw: hotspotYaw(a.mapX, a.mapY, b.mapX, b.mapY, a.northOffset),
      pitch: hotspotPitch(d, { ...pitchOpts, distM }),
      dist: d,
      distM,
    });
    edges.push({
      fromId: b.id,
      toId: a.id,
      yaw: hotspotYaw(b.mapX, b.mapY, a.mapX, a.mapY, b.northOffset),
      pitch: hotspotPitch(d, { ...pitchOpts, distM }),
      dist: d,
      distM,
    });
  }

  return edges;
}

/**
 * Summary after regenerate: undirected link count + scenes with zero outbound links.
 */
export function summarizeAutoLinks(scenes, edges) {
  const placed = (scenes || []).filter(
    (s) => !s.hidden && Number.isFinite(Number(s.mapX)) && Number.isFinite(Number(s.mapY))
  );
  const undirected = new Set();
  const outCount = new Map(placed.map((s) => [s.id, 0]));
  for (const e of edges || []) {
    undirected.add(undirectedKey(e.fromId, e.toId));
    outCount.set(e.fromId, (outCount.get(e.fromId) || 0) + 1);
  }
  const zeroLinkScenes = placed.filter((s) => (outCount.get(s.id) || 0) === 0);
  return {
    linkCount: undirected.size,
    directedCount: (edges || []).length,
    placedCount: placed.length,
    zeroLinkCount: zeroLinkScenes.length,
    zeroLinkTitles: zeroLinkScenes.map((s) => s.title || s.id),
  };
}

/**
 * Apply generated edges onto scenes as hotspots.
 * Replaces links between map-placed scenes; keeps hotspots to/from unplaced scenes.
 */
export function applyAutoLinksToScenes(scenes, edges, opts = {}) {
  const placedIds = new Set(
    (scenes || [])
      .filter((s) => s.mapX != null && s.mapY != null && !s.hidden)
      .map((s) => s.id)
  );
  const edgeMap = new Map();
  for (const e of edges) {
    if (!edgeMap.has(e.fromId)) edgeMap.set(e.fromId, []);
    edgeMap.get(e.fromId).push(e);
  }

  const stamp = opts.stamp || `auto_${Date.now().toString(36)}`;

  return (scenes || []).map((scene) => {
    const kept = (scene.hotSpots || []).filter((h) => {
      if (!h?.targetSceneId) return false;
      const bothPlaced = placedIds.has(scene.id) && placedIds.has(h.targetSceneId);
      if (bothPlaced) return false;
      return true;
    });

    const generated = (edgeMap.get(scene.id) || []).map((e, i) => ({
      id: `hs_auto_${scene.id}_${e.toId}_${stamp}_${i}`,
      yaw: e.yaw,
      pitch: e.pitch,
      targetSceneId: e.toId,
      text: friendlyRoomLabel(
        scenes.find((s) => s.id === e.toId) || { id: e.toId },
        undefined
      ),
      source: "auto",
    }));

    return { ...scene, hotSpots: [...kept, ...generated] };
  });
}

/** Meters-per-normalized-unit from a calibration line on the plan. */
export function metersPerNormFromLine(x1, y1, x2, y2, meters) {
  const d = normDist(x1, y1, x2, y2);
  if (d < 1e-6 || !(meters > 0)) return DEFAULT_SHORT_SIDE_METERS;
  return meters / d;
}
