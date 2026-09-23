import { describe, expect, it } from "vitest";
import { buildVirtualTourNodes, degStr, normToMapPixels } from "../lib/tour/psv-config.js";

describe("psv-config", () => {
  it("passes hotspot yaw/pitch through as degree strings with no offset", () => {
    const nodes = buildVirtualTourNodes(
      {
        scenes: {
          a: {
            title: "A",
            panorama: "a.jpg",
            mapX: 0.25,
            mapY: 0.5,
            mapPlanId: "plan-v1",
            hotSpots: [
              { id: "h1", yaw: -42.5, pitch: -35.1, sceneId: "b", text: "to B" },
            ],
          },
          b: {
            title: "B",
            panorama: "b.jpg",
            mapX: 0.75,
            mapY: 0.5,
            mapPlanId: "plan-v1",
            hotSpots: [],
          },
        },
      },
      { mapSize: { width: 1000, height: 800 }, planId: "plan-v1" }
    );

    expect(nodes).toHaveLength(2);
    const a = nodes.find((n) => n.id === "a");
    expect(a.links).toHaveLength(1);
    expect(a.links[0]).toMatchObject({
      nodeId: "b",
      position: { yaw: "-42.5deg", pitch: "-35.1deg" },
    });
    expect(a.links[0].linkOffset).toBeUndefined();
    expect(a.map).toEqual({ x: 250, y: 400 });
  });

  it("hides map pins stamped for a different plan id", () => {
    const nodes = buildVirtualTourNodes(
      {
        scenes: {
          a: {
            title: "A",
            panorama: "a.jpg",
            mapX: 0.25,
            mapY: 0.5,
            mapPlanId: "old-plan",
            hotSpots: [],
          },
        },
      },
      { mapSize: { width: 1000, height: 800 }, planId: "new-plan" }
    );
    expect(nodes[0].map).toBe(false);
  });

  it("degStr and normToMapPixels helpers", () => {
    expect(degStr(12)).toBe("12deg");
    expect(normToMapPixels(0.1, 0.2, { width: 2000, height: 1000 })).toEqual({
      x: 200,
      y: 200,
    });
  });
});
