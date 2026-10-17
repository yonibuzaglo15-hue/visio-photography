import { describe, expect, it } from "vitest";
import {
  arrivalYawDeg,
  clickDataToDegrees,
  buildVirtualTourNodes,
  degStr,
  normToMapPixels,
  virtualTourPluginOptions,
} from "../lib/tour/psv-config.js";

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

  it("click yaw is stored in (-180, 180]", () => {
    expect(clickDataToDegrees({ yaw: 2 * Math.PI, pitch: -0.35 }).yaw).toBeCloseTo(0, 6);
    expect(clickDataToDegrees({ yaw: 1.5 * Math.PI, pitch: 0 }).yaw).toBeCloseTo(-90, 6);
  });

  it("names nodes and links with friendly labels", () => {
    const nodes = buildVirtualTourNodes(
      {
        scenes: {
          scene_0: { title: "IMG_20260922_130035_366", panorama: "a.jpg", hotSpots: [{ yaw: 1, pitch: -20, sceneId: "scene_1" }] },
          scene_1: { title: "מטבח", panorama: "b.jpg", hotSpots: [] },
        },
      },
      {}
    );
    expect(nodes[0].name).toBe("חדר 1");
    expect(nodes[0].caption).toBe("חדר 1");
    expect(nodes[0].links[0].name).toBe("מטבח");
  });

  it("escapes user-typed room names and shows them once in ring tooltips", () => {
    const nodes = buildVirtualTourNodes(
      { scenes: { a: { title: '<img src=x onerror=alert(1)>', panorama: "a.jpg", hotSpots: [] } } },
      {}
    );
    expect(nodes[0].name).toBe("&lt;img src=x onerror=alert(1)&gt;");
    const tip = virtualTourPluginOptions({}).getLinkTooltip("<h3>x</h3><p>x</p>", {}, { name: "מטבח" });
    expect(tip).toBe("<h3>מטבח</h3>");
  });

  it("pins rings to their clicked point (2d) and arrives facing the direction of travel", () => {
    expect(virtualTourPluginOptions({}).renderMode).toBe("2d");
    expect(virtualTourPluginOptions({}).arrowStyle.style).toEqual({ left: "0px", top: "0px" });
    const from = { id: "a" };
    const link = { nodeId: "b", data: { yawNum: 30 } };
    // Destination has a ring back to origin at -120° → travel continues through it: 60°.
    expect(arrivalYawDeg({ links: [{ nodeId: "a", data: { yawNum: -120 } }] }, from, link)).toBe(60);
    // No ring back: keep the clicked ring's yaw.
    expect(arrivalYawDeg({ links: [] }, from, link)).toBe(30);
    expect(arrivalYawDeg({ links: [] }, null, null)).toBeNull();
    const t = virtualTourPluginOptions({}).transitionOptions(
      { links: [{ nodeId: "a", data: { yawNum: -120 } }] },
      from,
      link
    );
    expect(t.rotateTo).toEqual({ yaw: "60deg", pitch: "0deg" });
  });
});
