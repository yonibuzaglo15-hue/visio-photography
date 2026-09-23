import { describe, expect, it } from "vitest";
import {
  applyAutoLinksToScenes,
  generateAutoLinks,
  hotspotPitch,
  hotspotYaw,
  mapBearing,
  metersPerNormFromLine,
  normDist,
  pickNeighbours,
  remapNormToCrop,
  remapScenesToCrop,
  summarizeAutoLinks,
  FLOOR_LINE_PITCH,
  DEFAULT_MAX_NEIGHBORS,
} from "../lib/tour/floor-plan.js";
import { detectContentBoundsFromImageData } from "../lib/tour/floor-plan-crop.js";
import {
  buildPannellumConfig,
  configToEditorScenes,
  configToFloorPlanState,
} from "../lib/tour/pannellum-config.js";

describe("floor-plan geometry", () => {
  it("mapBearing: up = 0, right = 90", () => {
    expect(mapBearing(0.5, 0.5, 0.5, 0.2)).toBeCloseTo(0, 5);
    expect(mapBearing(0.5, 0.5, 0.8, 0.5)).toBeCloseTo(90, 5);
  });

  it("hotspotYaw subtracts northOffset", () => {
    expect(hotspotYaw(0, 0, 1, 0, 10)).toBeCloseTo(80, 5);
  });

  it("hotspotPitch never above floor line", () => {
    const far = hotspotPitch(0.9, { metersPerNorm: 12, cameraHeightM: 1.55 });
    expect(far).toBeLessThanOrEqual(FLOOR_LINE_PITCH);
    const near = hotspotPitch(0.02, { metersPerNorm: 12, cameraHeightM: 1.55 });
    expect(near).toBeLessThan(far);
  });

  it("metersPerNormFromLine", () => {
    expect(metersPerNormFromLine(0, 0, 0.5, 0, 5)).toBeCloseTo(10, 5);
  });

  it("remapNormToCrop", () => {
    const r = remapNormToCrop(0.5, 0.5, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(r.x).toBeCloseTo(0.5, 5);
    expect(r.y).toBeCloseTo(0.5, 5);
  });

  it("pickNeighbours skips occluded farther points", () => {
    const a = { id: "a", mapX: 0.1, mapY: 0.5 };
    const group = [
      a,
      { id: "b", mapX: 0.2, mapY: 0.5 },
      { id: "c", mapX: 0.35, mapY: 0.5 }, // same bearing, farther
      { id: "d", mapX: 0.2, mapY: 0.7 },
    ];
    const picked = pickNeighbours(a, group, {
      maxNeighbors: 3,
      maxDistNorm: 0.5,
      bearingOcclusionDeg: 28,
    });
    const ids = picked.map((p) => p.b.id);
    expect(ids).toContain("b");
    expect(ids).not.toContain("c");
    expect(ids).toContain("d");
  });

  it("generateAutoLinks max 3, bidirectional, same floor, meters", () => {
    const placed = [
      { id: "a", mapX: 0.1, mapY: 0.1, floor: 0, northOffset: 0 },
      { id: "b", mapX: 0.15, mapY: 0.1, floor: 0, northOffset: 0 },
      { id: "c", mapX: 0.2, mapY: 0.1, floor: 0, northOffset: 0 },
      { id: "d", mapX: 0.15, mapY: 0.2, floor: 0, northOffset: 0 },
      { id: "e", mapX: 0.9, mapY: 0.9, floor: 0, northOffset: 0 },
      { id: "f", mapX: 0.12, mapY: 0.12, floor: 1, northOffset: 0 },
    ];
    const edges = generateAutoLinks(placed, {
      maxLinkMeters: 6,
      metersPerNorm: 12,
      maxNeighbors: DEFAULT_MAX_NEIGHBORS,
      sameFloorOnly: true,
    });
    expect(edges.every((e) => e.pitch <= FLOOR_LINE_PITCH)).toBe(true);
    // no cross-floor
    expect(edges.some((e) => e.fromId === "a" && e.toId === "f")).toBe(false);
    const outA = edges.filter((e) => e.fromId === "a");
    expect(outA.length).toBeLessThanOrEqual(3);
    const summary = summarizeAutoLinks(placed, edges);
    expect(summary.linkCount).toBeGreaterThan(0);
    expect(summary.zeroLinkCount).toBeGreaterThanOrEqual(1); // e and/or f
  });

  it("respects deleted and added links", () => {
    const placed = [
      { id: "a", mapX: 0.1, mapY: 0.1, floor: 0 },
      { id: "b", mapX: 0.12, mapY: 0.1, floor: 0 },
      { id: "c", mapX: 0.5, mapY: 0.5, floor: 0 },
    ];
    const edges = generateAutoLinks(placed, {
      maxLinkMeters: 8,
      metersPerNorm: 12,
      deletedLinks: [["a", "b"]],
      addedLinks: [["a", "c"]],
    });
    expect(edges.some((e) => e.fromId === "a" && e.toId === "b")).toBe(false);
    expect(edges.some((e) => e.fromId === "a" && e.toId === "c")).toBe(true);
  });

  it("applyAutoLinksToScenes replaces placed-pair hotspots", () => {
    const scenes = [
      {
        id: "a",
        mapX: 0.1,
        mapY: 0.1,
        title: "A",
        hotSpots: [{ id: "old", targetSceneId: "b", yaw: 1, pitch: -20 }],
      },
      {
        id: "b",
        mapX: 0.15,
        mapY: 0.1,
        title: "B",
        hotSpots: [{ id: "keep", targetSceneId: "z", yaw: 0, pitch: -20 }],
      },
      { id: "z", title: "Z", hotSpots: [] },
    ];
    const edges = generateAutoLinks(
      scenes.filter((s) => s.mapX != null),
      { maxLinkMeters: 6, metersPerNorm: 12 }
    );
    const next = applyAutoLinksToScenes(scenes, edges);
    expect(next.find((s) => s.id === "a").hotSpots.some((h) => h.targetSceneId === "b")).toBe(
      true
    );
    expect(next.find((s) => s.id === "b").hotSpots.some((h) => h.targetSceneId === "z")).toBe(
      true
    );
  });

  it("normDist", () => {
    expect(normDist(0, 0, 0.3, 0.4)).toBeCloseTo(0.5, 5);
  });
});

describe("content detection", () => {
  it("finds bright content inside a dark frame", () => {
    const W = 100;
    const H = 100;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 20;
      data[i + 1] = 20;
      data[i + 2] = 20;
      data[i + 3] = 255;
    }
    // bright square 20..80
    for (let y = 20; y < 80; y++) {
      for (let x = 20; x < 80; x++) {
        const i = (y * W + x) * 4;
        data[i] = 180;
        data[i + 1] = 160;
        data[i + 2] = 140;
      }
    }
    const bounds = detectContentBoundsFromImageData({ width: W, height: H, data });
    expect(bounds.contentRatio).toBeLessThan(0.5);
    expect(bounds.needsCrop).toBe(true);
    expect(bounds.w).toBeGreaterThan(0.4);
    expect(bounds.w).toBeLessThan(0.8);
  });

  it("remapScenesToCrop updates coords", () => {
    const scenes = [
      { id: "a", mapX: 0.5, mapY: 0.5, floor: 0 },
      { id: "b", mapX: 0.1, mapY: 0.1, floor: 1 },
    ];
    const next = remapScenesToCrop(scenes, 0, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(next[0].mapX).toBeCloseTo(0.5, 5);
    expect(next[1].mapX).toBe(0.1);
  });
});

describe("pannellum floor-plan round-trip", () => {
  it("persists mapX/mapY/floor/northOffset and floorPlans", () => {
    const scenes = [
      {
        id: "s1",
        title: "Salon",
        panoramaUrl: "https://example.com/a.jpg",
        mapX: 0.4,
        mapY: 0.55,
        floor: 0,
        northOffset: 12.5,
        hotSpots: [
          {
            id: "h1",
            yaw: 10,
            pitch: -30,
            targetSceneId: "s2",
            text: "x",
            source: "auto",
          },
        ],
      },
      {
        id: "s2",
        title: "Kitchen",
        panoramaUrl: "https://example.com/b.jpg",
        mapX: 0.5,
        mapY: 0.5,
        floor: 0,
        hotSpots: [],
      },
    ];
    const cfg = buildPannellumConfig({
      scenes,
      firstSceneId: "s1",
      includeHidden: true,
      floorPlans: [{ floor: 0, url: "https://example.com/plan.png", label: "קומה 0" }],
      floorPlanMeta: {
        maxLinkMeters: 6,
        metersPerNorm: 12,
        deletedLinks: [["s1", "s2"]],
        addedLinks: [],
      },
    });
    expect(cfg.scenes.s1.mapX).toBe(0.4);
    expect(cfg.floorPlanMeta.maxLinkMeters).toBe(6);

    const back = configToEditorScenes(cfg);
    expect(back[0].mapX).toBe(0.4);

    const fp = configToFloorPlanState(cfg);
    expect(fp.floorPlans).toHaveLength(1);
    expect(fp.floorPlanMeta.deletedLinks[0]).toEqual(["s1", "s2"]);
  });
});
