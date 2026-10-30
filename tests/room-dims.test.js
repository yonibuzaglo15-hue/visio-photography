import { describe, expect, it } from "vitest";
import { loadTour } from "../lib/tours/loadTour.js";
import {
  applyPlanSimilarity,
  buildRoomRecords,
  chainPolygon,
  feetToMetres,
  fitPlanSimilarity,
  roomChip,
  roomForScene,
} from "../lib/tour/room-dims.js";

function rectRoom(id, x0, y0, x1, y1) {
  const edge = (a, b) => ({
    thickness: 0.16,
    vertices: [{ position: { x: a[0], y: a[1] } }, { position: { x: b[0], y: b[1] } }],
  });
  return {
    id,
    keywords: [],
    dimensionEstimates: { units: "imperial", height: 8.6, area: null, width: null, depth: null },
    ceiling: { maxHeight: 8.6 },
    boundary: {
      edges: [
        edge([x0, y0], [x1, y0]),
        edge([x1, y0], [x1, y1]),
        edge([x1, y1], [x0, y1]),
        edge([x0, y1], [x0, y0]),
      ],
    },
  };
}

describe("room dimensions", () => {
  it("converts Matterport feet", () => {
    expect(feetToMetres(8.6286)).toBeCloseTo(2.63, 2);
  });

  it("chains a rectangle and sizes it from the walls", () => {
    const poly = chainPolygon(rectRoom("r", 0, 0, 4, 3).boundary.edges);
    expect(poly).toHaveLength(4);
    const rooms = buildRoomRecords({
      apiRooms: [rectRoom("r", 0, 0, 4, 3)],
      scenes: { a: { position: [1, 1, 1.27], floorZ: 0 } },
      titles: { a: "חדר" },
      planPairs: [{ world: [1, 1], map: [10, 20] }, { world: [3, 1], map: [30, 20] }, { world: [1, 2], map: [10, 40] }],
    });
    expect(rooms).toHaveLength(1);
    expect(rooms[0].rectangular).toBe(true);
    expect(rooms[0].width).toBeCloseTo(3.85, 1);
    expect(rooms[0].length).toBeCloseTo(2.85, 1);
    expect(rooms[0].height).toBeCloseTo(2.62, 1);
    expect(rooms[0].sceneIds).toEqual(["a"]);
    expect(rooms[0].lines).toHaveLength(2);
  });

  it("prefers Matterport interior width and depth", () => {
    const api = rectRoom("r", 0, 0, 4, 3);
    api.dimensionEstimates.width = 4 / 0.3048;
    api.dimensionEstimates.depth = 3 / 0.3048;
    const rooms = buildRoomRecords({
      apiRooms: [api],
      scenes: { a: { position: [2, 1.5, 1.2], floorZ: 0 } },
      titles: { a: "חדר עבודה" },
      planPairs: [],
    });
    expect(rooms[0].source).toBe("matterport");
    expect(rooms[0].width).toBeCloseTo(4, 2);
    expect(rooms[0].length).toBeCloseTo(3, 2);
    const chip = roomChip(rooms[0], "חדר עבודה – חלון");
    expect(chip.title).toBe("חדר עבודה");
    expect(chip.sizeLabel.startsWith("קירות")).toBe(false);
    const open = roomChip({
      rectangular: false,
      width: 5.71,
      length: 4.96,
      height: 2.63,
      area: 57,
      zones: ["חדר שירות / כביסה", "מטבח", "סלון", "פינת אוכל"],
    }, "סלון");
    expect(open.title).toBe("סלון · מטבח · פינת אוכל");
  });

  it("fits the floor plan and skips hidden voids", () => {
    const fit = fitPlanSimilarity([
      { world: [0, 0], map: [0, 0] },
      { world: [2, 0], map: [4, 0] },
      { world: [0, 2], map: [0, 4] },
    ]);
    const mapped = applyPlanSimilarity(fit, [1, 1]);
    expect(mapped[0]).toBeCloseTo(2, 1);
    expect(mapped[1]).toBeCloseTo(2, 1);
    const rooms = buildRoomRecords({
      apiRooms: [{ ...rectRoom("v", 0, 0, 1, 1), keywords: ["hide"] }],
      scenes: { a: { position: [0.5, 0.5, 1], floorZ: 0 } },
      titles: { a: "א" },
      planPairs: [],
    });
    expect(rooms).toHaveLength(0);
  });
});

describe("שבט לוי automatic rooms", () => {
  const tour = loadTour("shevet-levi-11");

  it("has a room for the salon and a bedroom, and none invented elsewhere", () => {
    expect(tour.measure.rooms?.length).toBeGreaterThan(3);
    const salon = roomForScene(tour.measure, "p36");
    const bedroom = roomForScene(tour.measure, "p01");
    expect(salon).toBeTruthy();
    expect(bedroom).toBeTruthy();
    expect(salon.id).not.toBe(bedroom.id);
    expect(bedroom.height).toBeGreaterThan(2.4);
    expect(bedroom.height).toBeLessThan(2.8);
    expect(bedroom.rectangular).toBe(true);
    expect(bedroom.width).toBeGreaterThan(3);
    expect(bedroom.width).toBeLessThan(4.2);
    expect(salon.zones.join(" ")).toMatch(/סלון/);
    expect(loadTour("chasida-17").measure.rooms).toBeUndefined();
    expect(loadTour("yehoyakin-11").measure.rooms).toBeUndefined();
    expect(loadTour("shevet-zevulun").measure).toBeNull();
  });
});
