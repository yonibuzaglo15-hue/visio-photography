import { describe, expect, it } from "vitest";
import {
  applyAutoLinksToScenes,
  generateAutoLinks,
  hotspotPitch,
  hotspotYaw,
  mapBearing,
  metersPerNormFromLine,
  normDist,
} from "../lib/tour/floor-plan.js";
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
    // Facing east (90) with northOffset 10 → yaw 80
    expect(hotspotYaw(0, 0, 1, 0, 10)).toBeCloseTo(80, 5);
  });

  it("hotspotPitch is more negative when closer", () => {
    const near = hotspotPitch(0.05, { metersPerNorm: 12, cameraHeightM: 1.55 });
    const far = hotspotPitch(0.3, { metersPerNorm: 12, cameraHeightM: 1.55 });
    expect(near).toBeLessThan(far);
    expect(near).toBeGreaterThanOrEqual(-62);
    expect(far).toBeLessThanOrEqual(-12);
  });

  it("metersPerNormFromLine", () => {
    expect(metersPerNormFromLine(0, 0, 0.5, 0, 5)).toBeCloseTo(10, 5);
  });

  it("generateAutoLinks is bidirectional and respects max neighbors", () => {
    const placed = [
      { id: "a", mapX: 0.1, mapY: 0.1, floor: 0, northOffset: 0 },
      { id: "b", mapX: 0.15, mapY: 0.1, floor: 0, northOffset: 0 },
      { id: "c", mapX: 0.2, mapY: 0.1, floor: 0, northOffset: 0 },
      { id: "d", mapX: 0.9, mapY: 0.9, floor: 0, northOffset: 0 },
    ];
    const edges = generateAutoLinks(placed, { maxDistNorm: 0.2, maxNeighbors: 2 });
    const pairs = new Set(
      edges.map((e) => (e.fromId < e.toId ? `${e.fromId}|${e.toId}` : `${e.toId}|${e.fromId}`))
    );
    // a-b, b-c nearby; d isolated
    expect(pairs.has("a|b")).toBe(true);
    expect(pairs.has("b|c")).toBe(true);
    expect([...pairs].some((k) => k.includes("d"))).toBe(false);
    // directed both ways
    expect(edges.filter((e) => e.fromId === "a" && e.toId === "b")).toHaveLength(1);
    expect(edges.filter((e) => e.fromId === "b" && e.toId === "a")).toHaveLength(1);
  });

  it("respects deleted and added links", () => {
    const placed = [
      { id: "a", mapX: 0.1, mapY: 0.1, floor: 0 },
      { id: "b", mapX: 0.12, mapY: 0.1, floor: 0 },
      { id: "c", mapX: 0.5, mapY: 0.5, floor: 0 },
    ];
    const edges = generateAutoLinks(placed, {
      maxDistNorm: 0.2,
      deletedLinks: [["a", "b"]],
      addedLinks: [["a", "c"]],
    });
    const hasAB = edges.some((e) => e.fromId === "a" && e.toId === "b");
    const hasAC = edges.some((e) => e.fromId === "a" && e.toId === "c");
    expect(hasAB).toBe(false);
    expect(hasAC).toBe(true);
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
      { maxDistNorm: 0.2 }
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
      floorPlanMeta: { maxDistNorm: 0.18, deletedLinks: [["s1", "s2"]], addedLinks: [] },
    });
    expect(cfg.scenes.s1.mapX).toBe(0.4);
    expect(cfg.scenes.s1.northOffset).toBe(12.5);
    expect(cfg.floorPlans[0].url).toContain("plan.png");
    expect(cfg.floorPlanMeta.maxDistNorm).toBe(0.18);

    const back = configToEditorScenes(cfg);
    expect(back[0].mapX).toBe(0.4);
    expect(back[0].hotSpots[0].source).toBe("auto");

    const fp = configToFloorPlanState(cfg);
    expect(fp.floorPlans).toHaveLength(1);
    expect(fp.floorPlanMeta.deletedLinks[0]).toEqual(["s1", "s2"]);
  });
});
