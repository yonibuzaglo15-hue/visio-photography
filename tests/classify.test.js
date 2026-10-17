import { describe, it, expect } from "vitest";
import { classifyFile, routeFiles } from "../lib/agents/classify.js";
import { isEquirectRatio, readImageDimensions } from "../lib/images/dimensions.js";

describe("isEquirectRatio", () => {
  it("accepts exact 2:1 and ±1%", () => {
    expect(isEquirectRatio(11968, 5984)).toBe(true);
    expect(isEquirectRatio(2000, 1000)).toBe(true);
    expect(isEquirectRatio(2020, 1000)).toBe(true); // +1%
    expect(isEquirectRatio(1980, 1000)).toBe(true); // -1%
  });

  it("rejects outside ±1%", () => {
    expect(isEquirectRatio(2100, 1000)).toBe(false);
    expect(isEquirectRatio(1800, 1000)).toBe(false);
    expect(isEquirectRatio(4000, 3000)).toBe(false);
  });
});

describe("classifyFile dimensions", () => {
  it("classifies Insta360-style names by ratio, not filename", () => {
    expect(
      classifyFile({ name: "IMG_20260922_130041_136.JPG", width: 11968, height: 5984 })
    ).toBe("panorama");
  });

  it("does not use stale type=photo when dims say equirect", () => {
    const routed = routeFiles([
      { id: "1", name: "IMG_20260922_130041_136.JPG", type: "photo", width: 11968, height: 5984 },
    ]);
    expect(routed[0].type).toBe("panorama");
  });
});

describe("readImageDimensions JPEG", () => {
  it("parses SOF0 from a short JPEG buffer", () => {
    const buf = Buffer.from([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x20, 0x01, 0x01, 0x11, 0x00,
      0xff, 0xd9,
    ]);
    expect(buf.length).toBeGreaterThanOrEqual(10);
    expect(readImageDimensions(buf)).toEqual({ width: 32, height: 16 });
  });
});
