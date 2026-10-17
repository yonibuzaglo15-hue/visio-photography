import { describe, expect, it } from "vitest";
import {
  cameraHeightFromClick,
  discsFromYawCalibration,
  mapBearingDeg,
  mapDistNorm,
  normDeg,
  pitchFromHeight,
  yawOffsetFromClick,
} from "../lib/tour/geo-nav.js";

describe("geo-nav", () => {
  it("mapBearingDeg: up / right / down / left", () => {
    expect(mapBearingDeg({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.2 })).toBeCloseTo(0, 5);
    expect(mapBearingDeg({ x: 0.5, y: 0.5 }, { x: 0.8, y: 0.5 })).toBeCloseTo(90, 5);
    expect(mapBearingDeg({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.8 })).toBeCloseTo(180, 5);
    expect(mapBearingDeg({ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.5 })).toBeCloseTo(-90, 5);
  });

  it("yawOffsetFromClick + discs face the neighbour that was clicked", () => {
    const from = { x: 0.4, y: 0.5 };
    const right = { id: "R", x: 0.7, y: 0.5 };
    const up = { id: "U", x: 0.4, y: 0.2 };
    // User looks toward right neighbour; panorama click yaw = 10°.
    const bearingR = mapBearingDeg(from, right); // 90
    const clickYaw = 10;
    const offset = yawOffsetFromClick(clickYaw, bearingR);
    expect(offset).toBeCloseTo(normDeg(10 - 90), 5);

    const discs = discsFromYawCalibration({
      fromId: "A",
      fromPos: from,
      neighbours: [right, up],
      clickYaw,
      clickPitch: -35,
      towardsId: "R",
    });
    expect(discs).toHaveLength(2);
    const toR = discs.find((d) => d.targetSceneId === "R");
    const toU = discs.find((d) => d.targetSceneId === "U");
    expect(toR.yaw).toBeCloseTo(10, 5);
    // Up is 90° CCW from right on the plan → yaw 10 - 90 = -80
    expect(toU.yaw).toBeCloseTo(-80, 5);
    expect(toR.pitch).toBeLessThan(0);
    expect(toU.pitch).toBeLessThan(0);
  });

  it("camera height from click scales pitch with distance", () => {
    const d = 0.1;
    const h = cameraHeightFromClick(d, -45);
    expect(h).toBeCloseTo(0.1, 5);
    expect(pitchFromHeight(0.1, h)).toBeCloseTo(-45, 4);
    expect(pitchFromHeight(0.2, h)).toBeGreaterThan(-45); // farther → less steep
  });

  it("mapDistNorm", () => {
    expect(mapDistNorm({ x: 0, y: 0 }, { x: 0.3, y: 0.4 })).toBeCloseTo(0.5, 5);
  });
});
