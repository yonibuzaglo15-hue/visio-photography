/**
 * Floor-plan geometry + auto-link generation for tour navigation.
 * Image coords: x right, y down. Map "north" = −Y (up on the image).
 */

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/** Bearing in degrees: 0 = up (north on map), 90 = right (east). */
export function mapBearing(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  // atan2(dx, -dy): 0 when moving up
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  while (deg < 0) deg += 360;
  while (deg >= 360) deg -= 360;
  return deg;
}

/** Euclidean distance in normalized plan space (0..1). */
export function normDist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

/**
 * Hotspot yaw in the panorama at A looking toward B.
 * northOffset: mapBearing − panoramaYaw when facing the same world direction.
 * yaw = bearing(A→B) − northOffset
 */
export function hotspotYaw(ax, ay, bx, by, northOffset = 0) {
  const bearing = mapBearing(ax, ay, bx, by);
  let yaw = bearing - (Number(northOffset) || 0);
  while (yaw > 180) yaw -= 360;
  while (yaw < -180) yaw += 360;
  return yaw;
}

/**
 * Pitch toward a nearby floor disc.
 * Further points → closer to horizon (less negative).
 * @param {number} distNorm normalized plan distance
 * @param {{ metersPerNorm?: number, cameraHeightM?: number }} opts
 */
export function hotspotPitch(distNorm, opts = {}) {
  const cameraHeightM = opts.cameraHeightM ?? 1.55;
  const metersPerNorm = opts.metersPerNorm ?? 12; // ~12m across full plan width (tunable)
  const distM = Math.max(0.4, distNorm * metersPerNorm);
  // Looking down: pitch negative. atan(height/dist) from horizontal.
  let pitch = (-Math.atan(cameraHeightM / distM) * 180) / Math.PI;
  // Keep discs on the floor, not at nadir / horizon
  pitch = clamp(pitch, -62, -12);
  return pitch;
}

function undirectedKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Recommend auto-link max normalized distance from plan density.
 * Default 0.22 of the image diagonal-ish (using unit square diagonal ~1.4 → ~0.22 is ~15% diagonal).
 */
export const DEFAULT_MAX_NEIGHBORS = 4;
export const DEFAULT_MAX_DIST_NORM = 0.22;
export const DEFAULT_CAMERA_HEIGHT_M = 1.55;
export const DEFAULT_METERS_PER_NORM = 12;

/**
 * @param {Array<{id, mapX, mapY, floor?, northOffset?, title?}>} placed
 * @param {object} opts
 * @returns {Array<{ fromId, toId, yaw, pitch, dist }>} directed edges (bidirectional pairs)
 */
export function generateAutoLinks(placed, opts = {}) {
  const maxN = opts.maxNeighbors ?? DEFAULT_MAX_NEIGHBORS;
  const maxDist = opts.maxDistNorm ?? DEFAULT_MAX_DIST_NORM;
  const deleted = new Set((opts.deletedLinks || []).map(([a, b]) => undirectedKey(a, b)));
  const added = opts.addedLinks || [];
  const metersPerNorm = opts.metersPerNorm ?? DEFAULT_METERS_PER_NORM;
  const cameraHeightM = opts.cameraHeightM ?? DEFAULT_CAMERA_HEIGHT_M;

  const byFloor = new Map();
  for (const s of placed) {
    if (s.mapX == null || s.mapY == null) continue;
    const f = s.floor ?? 0;
    if (!byFloor.has(f)) byFloor.set(f, []);
    byFloor.get(f).push(s);
  }

  const pairSet = new Set();

  for (const [, group] of byFloor) {
    for (const a of group) {
      const candidates = [];
      for (const b of group) {
        if (a.id === b.id) continue;
        const d = normDist(a.mapX, a.mapY, b.mapX, b.mapY);
        if (d > maxDist) continue;
        candidates.push({ b, d });
      }
      candidates.sort((x, y) => x.d - y.d);
      for (const { b } of candidates.slice(0, maxN)) {
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

  for (const key of pairSet) {
    const [idA, idB] = key.split("|");
    const a = byId.get(idA);
    const b = byId.get(idB);
    if (!a || !b) continue;
    const d = normDist(a.mapX, a.mapY, b.mapX, b.mapY);
    const pitchOpts = { metersPerNorm, cameraHeightM };
    edges.push({
      fromId: a.id,
      toId: b.id,
      yaw: hotspotYaw(a.mapX, a.mapY, b.mapX, b.mapY, a.northOffset),
      pitch: hotspotPitch(d, pitchOpts),
      dist: d,
    });
    edges.push({
      fromId: b.id,
      toId: a.id,
      yaw: hotspotYaw(b.mapX, b.mapY, a.mapX, a.mapY, b.northOffset),
      pitch: hotspotPitch(d, pitchOpts),
      dist: d,
    });
  }

  return edges;
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
      // Drop links between placed scenes (will be regenerated)
      if (bothPlaced) return false;
      return true;
    });

    const generated = (edgeMap.get(scene.id) || []).map((e, i) => ({
      id: `hs_auto_${scene.id}_${e.toId}_${stamp}_${i}`,
      yaw: e.yaw,
      pitch: e.pitch,
      targetSceneId: e.toId,
      text: scenes.find((s) => s.id === e.toId)?.title || e.toId,
      source: "auto",
    }));

    return { ...scene, hotSpots: [...kept, ...generated] };
  });
}

/** Meters-per-normalized-unit from a calibration line on the plan. */
export function metersPerNormFromLine(x1, y1, x2, y2, meters) {
  const d = normDist(x1, y1, x2, y2);
  if (d < 1e-6 || !(meters > 0)) return DEFAULT_METERS_PER_NORM;
  return meters / d;
}
