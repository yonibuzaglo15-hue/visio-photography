/**
 * Matterport wall segments for the panorama.
 *
 * Lengths are the distances between Matterport's own wall vertices.
 * Opening widths are Matterport's `opening.width`. Nothing is scaled,
 * inset into the room, or taken from a bounding box.
 * Each line sits on the wall face at floor height, on the side the camera
 * can see. Segments behind the current view, or behind another wall, are omitted.
 */

import { closestWallDistance, sub } from "./measure.js";

const MIN_LENGTH = 0.8;
const MAX_DISTANCE = 7;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function hypot2(x, y) {
  return Math.hypot(x, y);
}

/** Both faces of one Matterport wall, at floor height. Length is unchanged by the offset. */
export function wallFaces(wall, floorZ) {
  const ax = wall.a[0];
  const ay = wall.a[1];
  const bx = wall.b[0];
  const by = wall.b[1];
  const dx = bx - ax;
  const dy = by - ay;
  const length = hypot2(dx, dy);
  if (!(length >= MIN_LENGTH)) return [];
  const nx = -dy / length;
  const ny = dx / length;
  const half = (Number(wall.thickness) > 0 ? Number(wall.thickness) : 0.16) / 2;
  const z = floorZ;
  const meters = round2(length);
  const openings = (wall.openings || [])
    .filter((opening) => Number.isFinite(opening.width) && opening.width >= 0.3)
    .map((opening) => ({
      width: round2(opening.width),
      along: ((opening.t0 || 0) + (opening.t1 || 0)) / 2 / length,
      kind: opening.kind || "",
    }))
    .filter((opening) => opening.along > 0.02 && opening.along < 0.98);
  return [1, -1].map((side) => {
    const ox = nx * half * side;
    const oy = ny * half * side;
    return {
      a: [ax + ox, ay + oy, z],
      b: [bx + ox, by + oy, z],
      meters,
      normal: [nx * side, ny * side],
      openings,
    };
  });
}

function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function midpoint(a, b, t = 0.5) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function facingCamera(face, camera) {
  const mid = midpoint(face.a, face.b);
  const vx = camera[0] - mid[0];
  const vy = camera[1] - mid[1];
  return vx * face.normal[0] + vy * face.normal[1] > 0.02;
}

function hiddenByWall(origin, target, triangles) {
  const delta = sub(target, origin);
  const dist = Math.hypot(delta[0], delta[1], delta[2]);
  if (!(dist > 0.2)) return true;
  const dir = [delta[0] / dist, delta[1] / dist, delta[2] / dist];
  const hit = closestWallDistance(origin, dir, triangles);
  return hit < dist - 0.35;
}

/**
 * Wall-floor lines the camera can actually see.
 * `forwardOf` receives a world point and returns the view-space forward
 * component (positive = in front of where the user is looking).
 */
export function visibleWallSegments(pose, walls, triangles, forwardOf) {
  if (!pose?.position) return [];
  const floorZ = Number.isFinite(pose.floorZ) ? pose.floorZ : 0;
  const camera = pose.position;
  const out = [];
  for (const wall of walls || []) {
    for (const face of wallFaces(wall, floorZ)) {
      if (!facingCamera(face, camera)) continue;
      const mid = midpoint(face.a, face.b);
      const dist = dist3(camera, mid);
      if (dist > MAX_DISTANCE) continue;
      if (forwardOf && forwardOf(mid) < 0.4) continue;
      if (hiddenByWall(camera, mid, triangles)) continue;
      const openings = [];
      for (const opening of face.openings) {
        const at = midpoint(face.a, face.b, opening.along);
        if (dist3(camera, at) > MAX_DISTANCE) continue;
        if (forwardOf && forwardOf(at) < 0.35) continue;
        if (hiddenByWall(camera, at, triangles)) continue;
        openings.push({ at, width: opening.width, kind: opening.kind });
      }
      out.push({ a: face.a, b: face.b, meters: face.meters, mid, dist, openings });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, 8);
}
