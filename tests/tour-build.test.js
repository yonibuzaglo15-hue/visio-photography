import { describe, expect, it } from "vitest";
import { buildTourScenes, headingFromPose, hebrewRoomName, projectToPlan } from "../lib/tour/tour-build.js";

const room = (id, label, poly) => ({
  id,
  keywords: ["indoor"],
  classifications: [{ label }],
  boundary: {
    edges: poly.map((point, index) => ({
      vertices: [
        { position: { x: point[0], y: point[1] } },
        { position: { x: poly[(index + 1) % poly.length][0], y: poly[(index + 1) % poly.length][1] } },
      ],
    })),
  },
});

describe("tour build", () => {
  it("translates Matterport room classes to Hebrew and numbers repeats", () => {
    expect(hebrewRoomName("Living Room")).toBe("סלון");
    expect(hebrewRoomName("Bathroom")).toBe("חדר רחצה");
    const locations = [0, 1, 2].map((index) => ({
      index,
      floor: { id: "f", sequence: 0 },
      position: { x: index, y: 0, z: 0 },
      pano: {
        sweepUuid: `s${index}`,
        position: { x: index, y: 0, z: 1.2 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
    }));
    const scenes = buildTourScenes({
      locations,
      rooms: [room("r", "Bedroom", [[-1, -1], [4, -1], [4, 2], [-1, 2]])],
      floors: [{ id: "f", sequence: 0 }],
      planLayout: {
        tiles: new Map([["f", {
          sequence: 0,
          frame: { origin: { x: -1, y: -1 }, resolution: 10, width: 50, height: 30 },
        }]]),
      },
    });
    expect(scenes.map((scene) => scene.title)).toEqual(["חדר שינה 1", "חדר שינה 2", "חדר שינה 3"]);
    expect(scenes.every((scene) => scene.hotspots.length > 0)).toBe(true);
    expect(scenes[0].floor).toBe("0");
    expect(scenes[0].hotspots[0].pitch).toBeLessThan(-8);
    expect(scenes[0].hotspots[0].pitch).toBeGreaterThan(-70);
    expect(scenes[0].map.x).toBeGreaterThan(0);
    expect(scenes[0].map.y).toBeGreaterThan(0);
    expect(scenes[0].map.y).toBeLessThan(100);
  });

  it("reads yaw 0 as clockwise from plan-up", () => {
    expect(headingFromPose([0, 0, 0, 1], 1)).toBe(90);
    expect(headingFromPose([0, 0, 0, 1], -1)).toBe(-90);
  });

  it("projects a sweep from Matterport's bottom-left floorplan origin", () => {
    const plan = { origin: { x: -10, y: -5 }, resolution: 100, width: 1000, height: 800 };
    expect(projectToPlan(-10, -5, plan)).toEqual({ px: 0, py: 800 });
    expect(projectToPlan(-9, -4, plan)).toEqual({ px: 100, py: 700 });
  });
});
