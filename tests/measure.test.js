import fs from "fs";
import { describe, expect, it } from "vitest";
import { loadTour } from "../lib/tours/loadTour.js";
import {
  CAMERA_HEIGHT_M,
  buildWallTriangles,
  calibrateFloorModel,
  distance,
  findClearOpening,
  formatMeters,
  measureHit,
  rayDirection,
  worldToYawPitch,
  yawPitchToCss,
} from "../lib/tour/measure.js";

function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/** Pannellum 2.5.6 mouseEventToCoords, minus the container lookup. */
function pannellumForward(xPx, yPx, width, height, viewYaw, viewPitch, hfov) {
  const x = (xPx / width) * 2 - 1;
  const y = (1 - (yPx / height) * 2) * (height / width);
  const focal = 1 / Math.tan((hfov * Math.PI) / 360);
  const s = Math.sin((viewPitch * Math.PI) / 180);
  const c = Math.cos((viewPitch * Math.PI) / 180);
  const f2 = focal * c - y * s;
  const n2 = Math.hypot(x, f2);
  const pitch = (180 * Math.atan((y * c + focal * s) / n2)) / Math.PI;
  let yaw = (180 * Math.atan2(x / n2, f2 / n2)) / Math.PI + viewYaw;
  if (yaw < -180) yaw += 360;
  if (yaw > 180) yaw -= 360;
  return { yaw, pitch };
}

describe("measure projection", () => {
  it("inverts Pannellum's click mapping", () => {
    const width = 1280;
    const height = 720;
    const viewYaw = 25;
    const viewPitch = -12;
    const hfov = 100;
    for (const [x, y] of [
      [640, 360],
      [200, 150],
      [1100, 500],
      [400, 600],
    ]) {
      const ang = pannellumForward(x, y, width, height, viewYaw, viewPitch, hfov);
      const back = yawPitchToCss(ang.yaw, ang.pitch, viewYaw, viewPitch, hfov, width, height);
      expect(back.x).toBeCloseTo(x, 1);
      expect(back.y).toBeCloseTo(y, 1);
    }
  });

  it("formats Hebrew metres", () => {
    expect(formatMeters(3.416)).toBe("\u200E3.42\u00A0מ׳");
    expect(formatMeters(0.894)).toBe("\u200E0.89\u00A0מ׳");
  });
});

describe("floor calibration", () => {
  it("gives חסידא and יהויכין one scale, and refuses שבט זבולון", () => {
    const chasida = loadTour("chasida-17");
    const yehoyakin = loadTour("yehoyakin-11");
    const zevulun = loadTour("shevet-zevulun");
    expect(chasida.measure.mode).toBe("floor");
    expect(yehoyakin.measure.mode).toBe("floor");
    expect(chasida.measure.metersPerPixel).toBeGreaterThan(0.008);
    expect(chasida.measure.metersPerPixel).toBeLessThan(0.009);
    expect(zevulun.measure).toBeNull();
  });

  it("lands a floor click on the neighbouring sweep", () => {
    const tour = loadTour("chasida-17");
    const size = jpegSize("public/tours/chasida-17/plan.jpg");
    const model = calibrateFloorModel(tour, size.width, size.height);
    const scene = tour.scenes.find((item) => item.hotspots.some((h) => h.pitch < -20 && h.pitch > -50));
    const hotspot = scene.hotspots.find((h) => h.pitch < -20 && h.pitch > -50);
    const pose = model.scenes[scene.id];
    const hit = measureHit(model, pose, hotspot.yaw, hotspot.pitch, []);
    const neighbor = model.scenes[hotspot.scene].position;
    expect(hit).toBeTruthy();
    expect(Math.hypot(hit[0] - neighbor[0], hit[1] - neighbor[1])).toBeLessThan(0.08);
    expect(Math.abs(hit[2])).toBeLessThan(0.001);
    const expected = CAMERA_HEIGHT_M / Math.tan((Math.abs(hotspot.pitch) * Math.PI) / 180);
    expect(Math.hypot(hit[0] - pose.position[0], hit[1] - pose.position[1])).toBeCloseTo(expected, 2);
  });
});

describe("שבט לוי surfaces", () => {
  const tour = loadTour("shevet-levi-11");
  const model = tour.measure;
  const triangles = buildWallTriangles(model.walls, -0.2, model.ceilingZ);

  it("loads a pose for every sweep that Matterport published", () => {
    expect(model.mode).toBe("surfaces");
    expect(model.source).toBe("matterport:Hkg7xrnXgoM");
    expect(Object.keys(model.scenes)).toHaveLength(43);
    expect(model.scenes.p27.position[2]).toBeGreaterThan(1);
    expect(model.scenes.p27.position[2]).toBeLessThan(1.5);
    expect(model.scenes.p03).toBeUndefined();
  });

  it("measures a Matterport doorway from the panorama", () => {
    const shot = findClearOpening(model, triangles);
    expect(shot).toBeTruthy();
    expect(shot.catalogWidth).toBeGreaterThanOrEqual(0.85);
    expect(shot.catalogWidth).toBeLessThanOrEqual(1);
    const pose = model.scenes[shot.sceneId];
    const a = measureHit(model, pose, shot.yawA, shot.pitchA, triangles);
    const b = measureHit(model, pose, shot.yawB, shot.pitchB, triangles);
    const metres = distance(a, b);
    expect(Math.abs(metres - shot.meters)).toBeLessThan(0.02);
    expect(metres).toBeGreaterThan(0.85);
    expect(metres).toBeLessThan(1.05);
    // Round-trip: the hit sits where the click ray says it does.
    const back = worldToYawPitch(pose, a);
    const dir = rayDirection(pose, back.yaw, back.pitch);
    expect(dir[0]).toBeCloseTo(rayDirection(pose, shot.yawA, shot.pitchA)[0], 5);
  });
});
