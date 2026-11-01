import fs from "fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { worldToYawPitch } from "../lib/tour/measure.js";
import { isPlanBackground, projectToPlan } from "../lib/tour/tour-build.js";
import { loadTour } from "../lib/tours/loadTour.js";

const SLUGS = [
  "eshkolit-3",
  "cheshvan-7",
  "agnon-21",
  "nahal-snir-9",
  "shevet-levi-1",
  "haptel-17",
  "haeshkol-8",
  "balfour-7",
  "keren-hayesod-43",
  "dekel-72",
];

function nearColored(image, ix, iy, radius) {
  const r2 = radius * radius;
  for (let y = iy - radius; y <= iy + radius; y += 1) {
    for (let x = ix - radius; x <= ix + radius; x += 1) {
      if ((x - ix) ** 2 + (y - iy) ** 2 > r2) continue;
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const offset = (y * image.width + x) * 3;
      const rgb = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
      if (!isPlanBackground(rgb, image.background)) return true;
    }
  }
  return false;
}

function wrap(delta) {
  let value = delta;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

async function loadPlan(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const background = [data[2 * info.width * 3 + 6], data[2 * info.width * 3 + 7], data[2 * info.width * 3 + 8]];
  return { data, width: info.width, height: info.height, background };
}

describe("Matterport floor-plan dots and floor rings", () => {
  it.each(SLUGS)("%s puts every sweep on its floor plan and aims rings at the neighbour", async (slug) => {
    const tour = loadTour(slug);
    const measure = JSON.parse(fs.readFileSync(`public/tours/${slug}/measure.json`, "utf8"));
    expect(tour.floors?.length).toBeGreaterThan(0);
    const plans = new Map();
    for (const floor of tour.floors) {
      plans.set(floor.id, { floor, image: await loadPlan(`public/tours/${slug}/${floor.plan}`) });
    }
    const missed = [];
    for (const scene of tour.scenes) {
      const pose = measure.scenes[scene.id];
      const packed = plans.get(scene.floor);
      expect(packed, scene.id).toBeTruthy();
      const { floor, image } = packed;
      expect(floor.width).toBe(image.width);
      expect(floor.height).toBe(image.height);
      const projected = projectToPlan(pose.position[0], pose.position[1], floor);
      expect(scene.map.x).toBeCloseTo((projected.px / floor.width) * 100, 1);
      expect(scene.map.y).toBeCloseTo((projected.py / floor.height) * 100, 1);
      const ix = Math.round(projected.px);
      const iy = Math.round(projected.py);
      expect(ix).toBeGreaterThanOrEqual(0);
      expect(iy).toBeGreaterThanOrEqual(0);
      expect(ix).toBeLessThan(image.width);
      expect(iy).toBeLessThan(image.height);
      const offset = (iy * image.width + ix) * 3;
      const rgb = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
      if (isPlanBackground(rgb, image.background) && !nearColored(image, ix, iy, Math.ceil(floor.resolution * 0.4))) {
        missed.push(scene.id);
      }
      for (const hotspot of scene.hotspots) {
        const other = measure.scenes[hotspot.scene];
        const aim = worldToYawPitch(
          { position: pose.position, rotation: pose.rotation },
          [other.position[0], other.position[1], other.floorZ],
        );
        expect(Math.abs(wrap(aim.yaw - hotspot.yaw))).toBeLessThan(0.2);
        expect(Math.abs(aim.pitch - hotspot.pitch)).toBeLessThan(0.2);
      }
    }
    expect(missed).toEqual([]);
    for (const room of measure.rooms) {
      if (room.height == null) continue;
      expect(room.height).toBeGreaterThan(1.9);
      expect(room.height).toBeLessThan(6);
    }
  });
});
