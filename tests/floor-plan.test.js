import { describe, expect, it } from "vitest";
import {
  applyAutoLinksToScenes,
  findCalibrationConflicts,
  friendlyRoomLabel,
  generateAutoLinks,
  hotspotPitch,
  hotspotYaw,
  mapBearing,
  metersPerNormFromLine,
  northOffsetFromDoorway,
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

  /**
   * Synthetic plan: image y grows downward. Pannellum: yaw 0 = equirect centre,
   * positive yaw = look right. northOffset = map bearing that yaw=0 faces.
   * yaw = bearing(A→B) − northOffset  (NOT added; NOT B→A).
   */
  describe("hotspotYaw cardinals, diagonals, northOffset", () => {
    const O = { x: 0.5, y: 0.5 };
    const N = { x: 0.5, y: 0.2 };
    const E = { x: 0.8, y: 0.5 };
    const S = { x: 0.5, y: 0.8 };
    const W = { x: 0.2, y: 0.5 };
    const NE = { x: 0.8, y: 0.2 };
    const SE = { x: 0.8, y: 0.8 };
    const SW = { x: 0.2, y: 0.8 };
    const NW = { x: 0.2, y: 0.2 };

    function yaw(to, north) {
      return hotspotYaw(O.x, O.y, to.x, to.y, north);
    }

    it("bearings: N=0 E=90 S=180 W=270 (y-down via atan2(dx,-dy))", () => {
      expect(mapBearing(O.x, O.y, N.x, N.y)).toBeCloseTo(0, 5);
      expect(mapBearing(O.x, O.y, E.x, E.y)).toBeCloseTo(90, 5);
      expect(mapBearing(O.x, O.y, S.x, S.y)).toBeCloseTo(180, 5);
      expect(mapBearing(O.x, O.y, W.x, W.y)).toBeCloseTo(270, 5);
      expect(mapBearing(O.x, O.y, NE.x, NE.y)).toBeCloseTo(45, 5);
      expect(mapBearing(O.x, O.y, SE.x, SE.y)).toBeCloseTo(135, 5);
      expect(mapBearing(O.x, O.y, SW.x, SW.y)).toBeCloseTo(225, 5);
      expect(mapBearing(O.x, O.y, NW.x, NW.y)).toBeCloseTo(315, 5);
    });

    it("A→B and B→A bearings differ by 180° (not swapped)", () => {
      const ab = mapBearing(O.x, O.y, E.x, E.y);
      const ba = mapBearing(E.x, E.y, O.x, O.y);
      let d = Math.abs(ab - ba);
      if (d > 180) d = 360 - d;
      expect(d).toBeCloseTo(180, 5);
    });

    it("northOffset 0: yaw equals map bearing (wrapped to [-180,180])", () => {
      expect(yaw(N, 0)).toBeCloseTo(0, 5);
      expect(yaw(E, 0)).toBeCloseTo(90, 5);
      expect(yaw(S, 0)).toBeCloseTo(180, 5); // or -180
      expect(Math.abs(yaw(S, 0))).toBeCloseTo(180, 5);
      expect(yaw(W, 0)).toBeCloseTo(-90, 5); // 270 → -90
      expect(yaw(NE, 0)).toBeCloseTo(45, 5);
      expect(yaw(SE, 0)).toBeCloseTo(135, 5);
      expect(yaw(SW, 0)).toBeCloseTo(-135, 5);
      expect(yaw(NW, 0)).toBeCloseTo(-45, 5);
    });

    it("northOffset 90 (yaw0 faces east): looking east → yaw 0", () => {
      expect(yaw(E, 90)).toBeCloseTo(0, 5);
      expect(yaw(N, 90)).toBeCloseTo(-90, 5);
      expect(yaw(S, 90)).toBeCloseTo(90, 5);
      expect(Math.abs(yaw(W, 90))).toBeCloseTo(180, 5);
    });

    it("northOffset 180 (yaw0 faces south)", () => {
      expect(yaw(S, 180)).toBeCloseTo(0, 5);
      expect(Math.abs(yaw(N, 180))).toBeCloseTo(180, 5);
      expect(yaw(E, 180)).toBeCloseTo(-90, 5);
      expect(yaw(W, 180)).toBeCloseTo(90, 5);
    });

    it("northOffset 270 (yaw0 faces west)", () => {
      expect(yaw(W, 270)).toBeCloseTo(0, 5);
      expect(yaw(N, 270)).toBeCloseTo(90, 5);
      expect(yaw(S, 270)).toBeCloseTo(-90, 5);
      expect(Math.abs(yaw(E, 270))).toBeCloseTo(180, 5);
    });

    it("rejects y-up atan2(dx,dy) which flips north/south by 180°", () => {
      const dx = N.x - O.x;
      const dy = N.y - O.y;
      const wrong = (Math.atan2(dx, dy) * 180) / Math.PI; // y-up mistake
      expect(Math.abs(wrong)).toBeCloseTo(180, 5);
      expect(mapBearing(O.x, O.y, N.x, N.y)).toBeCloseTo(0, 5);
    });

    it("rejects adding northOffset instead of subtracting", () => {
      const bearing = mapBearing(O.x, O.y, E.x, E.y);
      const wrongAdd = bearing + 90;
      expect(hotspotYaw(O.x, O.y, E.x, E.y, 90)).toBeCloseTo(0, 5);
      expect(wrongAdd).not.toBeCloseTo(0, 5);
    });
  });

  it("hotspotPitch never above floor line", () => {
    const far = hotspotPitch(0.9, { metersPerNorm: 12, cameraHeightM: 1.6 });
    expect(far).toBeLessThanOrEqual(FLOOR_LINE_PITCH);
    expect(far).toBeLessThan(0);
    const near = hotspotPitch(0.02, { metersPerNorm: 12, cameraHeightM: 1.6 });
    expect(near).toBeLessThan(far);
  });

  it("metersPerNormFromLine", () => {
    expect(metersPerNormFromLine(0, 0, 0.5, 0, 5)).toBeCloseTo(10, 5);
  });

  it("friendlyRoomLabel skips filenames", () => {
    expect(friendlyRoomLabel({ title: "סלון", id: "scene_0" })).toBe("סלון");
    expect(friendlyRoomLabel({ title: "IMG 20260922 130035 366", id: "scene_2" })).toBe(
      "חדר 3"
    );
  });

  it("northOffsetFromDoorway", () => {
    expect(northOffsetFromDoorway(0.5, 0.5, 0.8, 0.5, 0)).toBeCloseTo(90, 5);
    expect(northOffsetFromDoorway(0.5, 0.5, 0.8, 0.5, 90)).toBeCloseTo(0, 5);
  });

  it("findCalibrationConflicts flags mutual forward", () => {
    const scenes = [
      {
        id: "a",
        title: "A",
        mapX: 0.2,
        mapY: 0.5,
        northOffset: 0,
        hotSpots: [{ targetSceneId: "b", yaw: 5 }],
      },
      {
        id: "b",
        title: "B",
        mapX: 0.8,
        mapY: 0.5,
        northOffset: 0,
        hotSpots: [{ targetSceneId: "a", yaw: -5 }],
      },
    ];
    const c = findCalibrationConflicts(scenes);
    expect(c.length).toBe(1);
    expect(c[0].reason).toBe("both_forward");
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
