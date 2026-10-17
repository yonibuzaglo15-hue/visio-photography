import { describe, expect, it } from "vitest";
import {
  classifyMapCoordSpace,
  planIdFromFloorPlan,
  tryRemapNormToCrop,
  reconcileMapPlacements,
} from "../lib/tour/map-plan.js";

const CROP = { x: 411 / 1024, y: 96 / 576, w: 442 / 1024, h: 394 / 576 };

describe("map-plan", () => {
  it("planIdFromFloorPlan uses basename", () => {
    expect(
      planIdFromFloorPlan({
        url: "https://x/tours/j/floorplan-f0-muemq7nx.jpg",
      })
    ).toBe("floorplan-f0-muemq7nx");
  });

  it("classify: left-of-crop cannot be original-space", () => {
    const c = classifyMapCoordSpace(0.043, 0.312, CROP);
    expect(c.space).toBe("crop-normalized");
  });

  it("tryRemapNormToCrop rejects points outside crop", () => {
    expect(tryRemapNormToCrop(0.043, 0.312, CROP)).toBeNull();
    const ok = tryRemapNormToCrop(0.5, 0.4, CROP);
    expect(ok).not.toBeNull();
    expect(ok.x).toBeGreaterThan(0);
    expect(ok.x).toBeLessThan(1);
  });

  it("reconcile invalidates when remap impossible", () => {
    const { scenes, invalidated, remapped } = reconcileMapPlacements(
      [{ id: "a", floor: 0, mapX: 0.04, mapY: 0.3, mapPlanId: "old" }],
      { floor: 0, newPlanId: "new", cropRect: CROP, previousPlanId: "old" }
    );
    expect(invalidated).toEqual(["a"]);
    expect(remapped).toEqual([]);
    expect(scenes[0].mapX).toBeUndefined();
  });
});
