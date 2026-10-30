import { describe, expect, it } from "vitest";
import { buildWallTriangles } from "../lib/tour/measure.js";
import { visibleWallSegments, wallFaces } from "../lib/tour/wall-view.js";

const wall = {
  a: [0, 0],
  b: [4, 0],
  thickness: 0.2,
  openings: [{ t0: 1.2, t1: 2.1, width: 0.9, kind: "doorway" }],
};

describe("Matterport wall segments", () => {
  it("keeps Matterport's length and opening width, and offsets only by half the thickness", () => {
    const faces = wallFaces(wall, 0);
    expect(faces).toHaveLength(2);
    for (const face of faces) {
      const length = Math.hypot(face.b[0] - face.a[0], face.b[1] - face.a[1]);
      expect(length).toBeCloseTo(4, 5);
      expect(face.meters).toBe(4);
      expect(face.openings[0].width).toBe(0.9);
      expect(Math.abs(face.a[1])).toBeCloseTo(0.1, 5);
    }
  });

  it("hides the wall behind the camera and a wall blocked by another", () => {
    const pose = {
      position: [2, -2, 1.27],
      floorZ: 0,
      heading: 0,
    };
    const blocker = { a: [0.5, -1], b: [2.5, -1], thickness: 0.16, openings: [] };
    const triangles = buildWallTriangles([wall, blocker], -0.2, 2.8);
    const seen = visibleWallSegments(pose, [wall, blocker], triangles, () => 2);
    expect(seen.map((segment) => segment.meters)).toEqual([2]);
    const far = visibleWallSegments(
      { ...pose, position: [2, 2, 1.27] },
      [wall],
      buildWallTriangles([wall], -0.2, 2.8),
      () => -1,
    );
    expect(far).toHaveLength(0);
  });
});
