/**
 * Geometry for floor-plan discs: map bearing → panorama yaw/pitch.
 * All angles in degrees. Map coords are normalized 0–1 with y down.
 */

/** Normalize degrees to (-180, 180]. */
export function normDeg(deg) {
  let d = Number(deg);
  if (!Number.isFinite(d)) return 0;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/**
 * Bearing on the plan from A → B, degrees.
 * 0 = up on the image (−Y), positive clockwise (toward +X).
 */
export function mapBearingDeg(from, to) {
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y); // +down
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return null;
  // atan2(x, -y): 0 when going up, +90 when going right.
  return normDeg((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** Euclidean distance in normalized plan space. */
export function mapDistNorm(from, to) {
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  return Math.hypot(dx, dy);
}

/**
 * Yaw offset that makes `clickYaw` face neighbour at `mapBearing`.
 * discYaw(neighbour) = mapBearing(neighbour) + yawOffset
 */
export function yawOffsetFromClick(clickYaw, mapBearing) {
  if (!Number.isFinite(Number(clickYaw)) || !Number.isFinite(Number(mapBearing))) {
    return null;
  }
  return normDeg(Number(clickYaw) - Number(mapBearing));
}

/**
 * Camera height in the same units as plan distance, from one floor click.
 * pitch is negative when looking down.
 */
export function cameraHeightFromClick(distNorm, pitchDeg) {
  const d = Number(distNorm);
  const p = Number(pitchDeg);
  if (!(d > 1e-6) || !Number.isFinite(p)) return null;
  const rad = (p * Math.PI) / 180;
  // pitch = atan2(-H, d) → H = -d * tan(pitch)
  const h = -d * Math.tan(rad);
  if (!(h > 0) || !Number.isFinite(h)) return null;
  return h;
}

export function pitchFromHeight(distNorm, height) {
  const d = Number(distNorm);
  const h = Number(height);
  if (!(d > 1e-6) || !(h > 0)) return -30;
  return normDeg((Math.atan2(-h, d) * 180) / Math.PI);
}

/**
 * Build hotspot yaw/pitch for every neighbour of `fromId`.
 * @returns {{ targetSceneId: string, yaw: number, pitch: number }[]}
 */
export function discsFromYawCalibration({
  fromId,
  fromPos,
  neighbours,
  clickYaw,
  clickPitch,
  towardsId,
}) {
  const toward = neighbours.find((n) => n.id === towardsId);
  if (!toward || !fromPos) return [];
  const bearing0 = mapBearingDeg(fromPos, toward);
  if (bearing0 == null) return [];
  const offset = yawOffsetFromClick(clickYaw, bearing0);
  if (offset == null) return [];
  const d0 = mapDistNorm(fromPos, toward);
  const height = cameraHeightFromClick(d0, clickPitch) ?? d0 * Math.tan((35 * Math.PI) / 180);

  return neighbours
    .map((n) => {
      const bearing = mapBearingDeg(fromPos, n);
      if (bearing == null) return null;
      const dist = mapDistNorm(fromPos, n);
      return {
        targetSceneId: n.id,
        yaw: normDeg(bearing + offset),
        pitch: pitchFromHeight(dist, height),
      };
    })
    .filter(Boolean);
}
