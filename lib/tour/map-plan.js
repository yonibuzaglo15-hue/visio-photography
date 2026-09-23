/**
 * Floor-plan identity + map coordinate space helpers.
 *
 * mapX/mapY are normalized 0–1 against a specific plan image version.
 * Always store mapPlanId with placements; never render mismatched coords.
 */

/** Stable id for a floor-plan image version (URL basename or uploadedAt). */
export function planIdFromFloorPlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  if (typeof plan.planId === "string" && plan.planId.trim()) {
    return plan.planId.trim();
  }
  const url = String(plan.url || "");
  const base = url.split("?")[0].split("/").pop() || "";
  if (base) return base.replace(/\.[^.]+$/, "") || base;
  if (Number.isFinite(Number(plan.uploadedAt))) {
    return `uploaded-${Number(plan.uploadedAt)}`;
  }
  return null;
}

/** Ensure floor-plan entries carry a planId. */
export function withPlanIds(plans) {
  return (Array.isArray(plans) ? plans : []).map((p) => {
    const planId = planIdFromFloorPlan(p);
    return planId ? { ...p, planId } : { ...p };
  });
}

/**
 * Remap normalized coords from an uncropped image into a crop rect
 * (crop also normalized 0–1 on the source). Returns null if outside crop.
 */
export function tryRemapNormToCrop(x, y, crop) {
  if (!crop || !(crop.w > 1e-6) || !(crop.h > 1e-6)) return null;
  const nx = (Number(x) - Number(crop.x)) / Number(crop.w);
  const ny = (Number(y) - Number(crop.y)) / Number(crop.h);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  if (nx < -0.02 || nx > 1.02 || ny < -0.02 || ny > 1.02) return null;
  return {
    x: Math.min(1, Math.max(0, nx)),
    y: Math.min(1, Math.max(0, ny)),
  };
}

/**
 * When the active plan changes: remap placements that still reference the old
 * plan (using cropRect if provided), otherwise strip map coords so they are
 * not drawn in the wrong place.
 *
 * @returns {{ scenes: object[], remapped: string[], invalidated: string[] }}
 */
export function reconcileMapPlacements(scenes, { floor, newPlanId, cropRect, previousPlanId }) {
  const remapped = [];
  const invalidated = [];
  const next = (scenes || []).map((s) => {
    if ((s.floor ?? 0) !== floor) return s;
    if (!Number.isFinite(Number(s.mapX)) || !Number.isFinite(Number(s.mapY))) {
      return s;
    }
    const sid = s.mapPlanId || null;
    // Already stamped for the new plan — keep.
    if (sid && newPlanId && sid === newPlanId) return s;

    // Legacy unstamped or old plan: try crop remap when we have a rect.
    if (cropRect && (!sid || (previousPlanId && sid === previousPlanId) || !sid)) {
      const r = tryRemapNormToCrop(s.mapX, s.mapY, cropRect);
      if (r) {
        remapped.push(s.id);
        return {
          ...s,
          mapX: r.x,
          mapY: r.y,
          mapPlanId: newPlanId || s.mapPlanId,
        };
      }
    }

    // Cannot safely place on the new plan — drop coords (never mis-draw).
    invalidated.push(s.id);
    const { mapX, mapY, mapPlanId, ...rest } = s;
    return newPlanId ? { ...rest, floor: s.floor } : rest;
  });
  return { scenes: next, remapped, invalidated };
}

/** True if this scene's map pin may be shown on the given plan. */
export function mapPlacementMatchesPlan(scene, planId) {
  if (!Number.isFinite(Number(scene?.mapX)) || !Number.isFinite(Number(scene?.mapY))) {
    return false;
  }
  if (!planId) return false;
  // Legacy: no stamp — treat as invalid for rendering (force re-stamp/migrate).
  // Callers may pass allowLegacy=true during one-time migration.
  if (!scene.mapPlanId) return false;
  return scene.mapPlanId === planId;
}

/**
 * Classify whether a normalized point looks like "full uncropped image" room
 * space vs "cropped plan" space, given a known crop rect on the original.
 *
 * Evidence-based: original-space room points must lie inside the crop box.
 * Values left of crop.x cannot be original-space apartment placements.
 */
export function classifyMapCoordSpace(mapX, mapY, cropNorm) {
  const x = Number(mapX);
  const y = Number(mapY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { space: "none", reason: "missing" };
  }
  if (!cropNorm) {
    return { space: "unknown", reason: "no-crop-rect" };
  }
  const inCropBox =
    x >= cropNorm.x &&
    x <= cropNorm.x + cropNorm.w &&
    y >= cropNorm.y &&
    y <= cropNorm.y + cropNorm.h;

  // Spans into the region left of the apartment on the full screenshot.
  if (x < cropNorm.x - 0.01 || y < cropNorm.y - 0.01) {
    return {
      space: "crop-normalized",
      reason: `x/y outside original crop box (x=${x.toFixed(3)} < crop.x=${cropNorm.x.toFixed(3)} or above crop) — cannot be original-space room coords`,
    };
  }
  if (inCropBox) {
    // Ambiguous by range alone if we only look at one point; ensemble decides.
    return {
      space: "ambiguous-or-original",
      reason: "lies inside original crop box — could be original-space or remapped crop-space",
    };
  }
  return {
    space: "crop-normalized",
    reason: "outside original crop box on the high side — typical of crop-normalized [0,1]",
  };
}
