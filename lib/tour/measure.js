/**
 * Approximate measuring for hosted 360 tours.
 *
 * Two frames, both Z-up, metres:
 * - surfaces: Matterport pose. Quaternion rotates a camera whose local axes are
 *   (x = panorama forward, y = left, z = up) into that world. Pannellum yaw 0 /
 *   pitch 0 looks along local +forward; positive yaw is to the right.
 * - floor: plan image x is world +X, plan up is world +Y. `heading` is the map
 *   bearing of panorama yaw 0, degrees clockwise from plan-up.
 *
 * There is no depth mesh. Surfaces mode hits wall rectangles and one floor
 * plane. Floor mode hits only the floor plane, scaled by an assumed lens height.
 */

export const CAMERA_HEIGHT_M = 1.266;

const MIN_T = 0.05;
const MAX_T = 40;

export function formatMeters(meters) {
  if (!Number.isFinite(meters) || meters < 0) return "";
  return `\u200E${meters.toFixed(2)}\u00A0מ׳`;
}

export function quatNormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function quatConjugate(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Rotate a vector by a quaternion (x, y, z, w). */
export function quatRotate(q, v) {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

function sphereDir(yawDeg, pitchDeg) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cp = Math.cos(pitch);
  return [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
}

function normalize(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** World direction for a panorama click. */
export function rayDirection(pose, yawDeg, pitchDeg) {
  if (!pose) return null;
  const [xr, yu, zf] = sphereDir(yawDeg, pitchDeg);
  if (pose.rotation) {
    const q = quatNormalize(pose.rotation);
    return normalize(quatRotate(q, [zf, -xr, yu]));
  }
  if (!Number.isFinite(pose.heading)) return null;
  const h = (pose.heading * Math.PI) / 180;
  const fwdX = Math.sin(h);
  const fwdY = Math.cos(h);
  const rightX = Math.cos(h);
  const rightY = -Math.sin(h);
  return normalize([rightX * xr + fwdX * zf, rightY * xr + fwdY * zf, yu]);
}

/** Panorama yaw/pitch of a world point, as Pannellum uses them. */
export function worldToYawPitch(pose, point) {
  const v = sub(point, pose.position);
  let xr;
  let yu;
  let zf;
  if (pose.rotation) {
    const d = quatRotate(quatConjugate(quatNormalize(pose.rotation)), v);
    zf = d[0];
    xr = -d[1];
    yu = d[2];
  } else {
    const h = (pose.heading * Math.PI) / 180;
    const fwdX = Math.sin(h);
    const fwdY = Math.cos(h);
    const rightX = Math.cos(h);
    const rightY = -Math.sin(h);
    xr = v[0] * rightX + v[1] * rightY;
    yu = v[2];
    zf = v[0] * fwdX + v[1] * fwdY;
  }
  const yaw = (Math.atan2(xr, zf) * 180) / Math.PI;
  const pitch = (Math.atan2(yu, Math.hypot(xr, zf)) * 180) / Math.PI;
  return { yaw, pitch };
}

/**
 * Inverse of Pannellum's mouseEventToCoords.
 * Returns CSS pixels inside the viewer, or null when the point is behind the camera.
 */
export function yawPitchToCss(targetYaw, targetPitch, viewYaw, viewPitch, hfov, width, height) {
  const yaw = Math.atan2(
    Math.sin(((targetYaw - viewYaw) * Math.PI) / 180),
    Math.cos(((targetYaw - viewYaw) * Math.PI) / 180),
  );
  const pitch = (targetPitch * Math.PI) / 180;
  const viewP = (viewPitch * Math.PI) / 180;
  const cp = Math.cos(pitch);
  const hx = cp * Math.sin(yaw);
  const hy = Math.sin(pitch);
  const hz = cp * Math.cos(yaw);
  const cP = Math.cos(viewP);
  const sP = Math.sin(viewP);
  const xCam = hx;
  const yCam = hy * cP - hz * sP;
  const zCam = hy * sP + hz * cP;
  if (zCam <= 0.02) return null;
  const focal = 1 / Math.tan((hfov * Math.PI) / 360);
  const xNorm = focal * (xCam / zCam);
  const yNorm = focal * (yCam / zCam);
  return {
    x: ((xNorm + 1) / 2) * width,
    y: (height * (1 - yNorm * (width / height))) / 2,
  };
}

function rayTriangle(origin, dir, tri) {
  const [v0, v1, v2] = tri;
  const e1 = sub(v1, v0);
  const e2 = sub(v2, v0);
  const p = [
    dir[1] * e2[2] - dir[2] * e2[1],
    dir[2] * e2[0] - dir[0] * e2[2],
    dir[0] * e2[1] - dir[1] * e2[0],
  ];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-8) return null;
  const inv = 1 / det;
  const tvec = sub(origin, v0);
  const u = (tvec[0] * p[0] + tvec[1] * p[1] + tvec[2] * p[2]) * inv;
  if (u < 0 || u > 1) return null;
  const q = [
    tvec[1] * e1[2] - tvec[2] * e1[1],
    tvec[2] * e1[0] - tvec[0] * e1[2],
    tvec[0] * e1[1] - tvec[1] * e1[0],
  ];
  const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t;
}

export function wallBasis(wall) {
  const dx = wall.b[0] - wall.a[0];
  const dy = wall.b[1] - wall.a[1];
  const length = Math.hypot(dx, dy);
  const dir = [dx / length, dy / length];
  return {
    dir,
    normal: [-dir[1], dir[0]],
    length,
    half: (Number(wall.thickness) || 0.12) / 2,
  };
}

/** Point on a wall face. `side` is +1 or -1 along the left normal; `t` is metres from `a`. */
export function pointOnWall(wall, t, z, side) {
  const { dir, normal, half } = wallBasis(wall);
  const along = [wall.a[0] + dir[0] * t, wall.a[1] + dir[1] * t];
  const off = side * half;
  return [along[0] + normal[0] * off, along[1] + normal[1] * off, z];
}

function pushQuad(tris, p0, p1, z0, z1) {
  const a = [p0[0], p0[1], z0];
  const b = [p1[0], p1[1], z0];
  const c = [p1[0], p1[1], z1];
  const d = [p0[0], p0[1], z1];
  tris.push([a, b, c], [a, c, d]);
}

export function buildWallTriangles(walls, zBottom, zTop) {
  const tris = [];
  for (const wall of walls || []) {
    const basis = wallBasis(wall);
    if (!(basis.length > 0.05)) continue;
    const { dir, normal, half, length } = basis;
    const openings = [...(wall.openings || [])].sort((p, q) => p.t0 - q.t0);
    const spans = [];
    let cursor = 0;
    for (const opening of openings) {
      const t0 = Math.max(0, Math.min(length, opening.t0));
      const t1 = Math.max(0, Math.min(length, opening.t1));
      if (t0 > cursor + 1e-3) spans.push([cursor, t0, zBottom, zTop]);
      if (opening.z0 > zBottom + 0.02) spans.push([t0, t1, zBottom, opening.z0]);
      if (opening.z1 < zTop - 0.02) spans.push([t0, t1, opening.z1, zTop]);
      const z0 = Math.max(zBottom, opening.z0);
      const z1 = Math.min(zTop, opening.z1);
      if (z1 > z0 + 0.02) {
        for (const t of [t0, t1]) {
          const p = [wall.a[0] + dir[0] * t, wall.a[1] + dir[1] * t];
          const inner = [p[0] - normal[0] * half, p[1] - normal[1] * half];
          const outer = [p[0] + normal[0] * half, p[1] + normal[1] * half];
          pushQuad(tris, inner, outer, z0, z1);
        }
      }
      cursor = Math.max(cursor, t1);
    }
    if (length > cursor + 1e-3) spans.push([cursor, length, zBottom, zTop]);
    for (const [s0, s1, za, zb] of spans) {
      if (s1 - s0 < 1e-3 || zb - za < 1e-3) continue;
      const p0 = [wall.a[0] + dir[0] * s0, wall.a[1] + dir[1] * s0];
      const p1 = [wall.a[0] + dir[0] * s1, wall.a[1] + dir[1] * s1];
      pushQuad(
        tris,
        [p0[0] + normal[0] * half, p0[1] + normal[1] * half],
        [p1[0] + normal[0] * half, p1[1] + normal[1] * half],
        za,
        zb,
      );
      pushQuad(
        tris,
        [p1[0] - normal[0] * half, p1[1] - normal[1] * half],
        [p0[0] - normal[0] * half, p0[1] - normal[1] * half],
        za,
        zb,
      );
    }
  }
  return tris;
}

/**
 * First hit on the floor plane or a wall. `floorZ` is the plane used for this shot
 * (the sweep's own floor). Walls stay in absolute Z.
 */
export function castRay(origin, dir, triangles, floorZ) {
  let bestT = Infinity;
  let best = null;
  if (dir[2] < -1e-4) {
    const t = (floorZ - origin[2]) / dir[2];
    if (t > MIN_T && t < MAX_T) {
      bestT = t;
      best = add(origin, mul(dir, t));
    }
  }
  for (const tri of triangles) {
    const t = rayTriangle(origin, dir, tri);
    if (t != null && t > MIN_T && t < bestT && t < MAX_T) {
      bestT = t;
      best = add(origin, mul(dir, t));
    }
  }
  return best;
}

export function measureHit(model, pose, yawDeg, pitchDeg, triangles) {
  const dir = rayDirection(pose, yawDeg, pitchDeg);
  if (!dir || !pose?.position) return null;
  const floorZ = Number.isFinite(pose.floorZ) ? pose.floorZ : (model.floorZ ?? 0);
  const tris = model.mode === "surfaces" ? triangles : [];
  return castRay(pose.position, dir, tris, floorZ);
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Floor-only model from plan dots + headings + floor-ring pitches.
 * Returns null when the links do not share one scale (the ruler would lie).
 * Absolute metres assume {@link CAMERA_HEIGHT_M}.
 */
export function calibrateFloorModel(tour, planWidth, planHeight) {
  if (!tour?.scenes?.length) return null;
  if (!tour.scenes.every((scene) => Number.isFinite(scene.map?.heading))) return null;
  if (!(planWidth > 0) || !(planHeight > 0)) return null;
  const byId = Object.fromEntries(tour.scenes.map((scene) => [scene.id, scene]));
  const ratios = [];
  for (const scene of tour.scenes) {
    for (const hotspot of scene.hotspots || []) {
      const target = byId[hotspot.scene];
      const pitch = hotspot.pitch;
      if (!target || !(pitch < -15 && pitch > -59.5)) continue;
      const ax = (scene.map.x / 100) * planWidth;
      const ay = (scene.map.y / 100) * planHeight;
      const bx = (target.map.x / 100) * planWidth;
      const by = (target.map.y / 100) * planHeight;
      const pixels = Math.hypot(bx - ax, by - ay);
      if (pixels < 8) continue;
      const metres = CAMERA_HEIGHT_M / Math.tan((Math.abs(pitch) * Math.PI) / 180);
      ratios.push(metres / pixels);
    }
  }
  if (ratios.length < 8) return null;
  ratios.sort((a, b) => a - b);
  const low = percentile(ratios, 0.1);
  const high = percentile(ratios, 0.9);
  const metersPerPixel = percentile(ratios, 0.5);
  if (!(metersPerPixel > 0) || high / low > 1.12) return null;

  const scenes = {};
  for (const scene of tour.scenes) {
    scenes[scene.id] = {
      position: [
        (scene.map.x / 100) * planWidth * metersPerPixel,
        (1 - scene.map.y / 100) * planHeight * metersPerPixel,
        CAMERA_HEIGHT_M,
      ],
      heading: scene.map.heading,
      floorZ: 0,
    };
  }
  return {
    mode: "floor",
    approx: true,
    cameraHeight: CAMERA_HEIGHT_M,
    metersPerPixel,
    floorZ: 0,
    ceilingZ: null,
    scenes,
    walls: [],
  };
}

/**
 * A doorway the ruler can see clearly: both jambs, a few millimetres onto the
 * wall face so the ray does not slip through the opening. Used to check the
 * שבט לוי model against Matterport's opening width.
 */
export function findClearOpening(model, triangles) {
  const doors = [];
  for (const wall of model.walls || []) {
    for (const opening of wall.openings || []) {
      if (opening.kind !== "doorway") continue;
      const width = opening.width;
      if (!(width >= 0.85 && width <= 1.0)) continue;
      if (!(opening.z0 < 0.15 && opening.z1 - opening.z0 > 1.9)) continue;
      doors.push({ wall, opening });
    }
  }
  let best = null;
  for (const [sceneId, pose] of Object.entries(model.scenes || {})) {
    for (const { wall, opening } of doors) {
      const z = opening.z0 + Math.min(1.05, (opening.z1 - opening.z0) * 0.45);
      const inset = 0.008;
      for (const side of [1, -1]) {
        const left = pointOnWall(wall, opening.t0 - inset, z, side);
        const right = pointOnWall(wall, opening.t1 + inset, z, side);
        const hits = [left, right].map((target) => {
          const dir = normalize(sub(target, pose.position));
          const hit = castRay(pose.position, dir, triangles, pose.floorZ);
          if (!hit || distance(hit, target) > 0.03) return null;
          const ang = worldToYawPitch(pose, target);
          return { hit, ...ang, target };
        });
        if (!hits[0] || !hits[1]) continue;
        const meters = distance(hits[0].hit, hits[1].hit);
        const range = distance(pose.position, hits[0].hit);
        if (range < 1.2 || range > 5) continue;
        const score = Math.abs(meters - (opening.width + 2 * inset)) + range * 0.01;
        if (!best || score < best.score) {
          best = {
            score,
            sceneId,
            yawA: hits[0].yaw,
            pitchA: hits[0].pitch,
            yawB: hits[1].yaw,
            pitchB: hits[1].pitch,
            meters,
            catalogWidth: opening.width,
            range,
          };
        }
      }
    }
  }
  return best;
}
