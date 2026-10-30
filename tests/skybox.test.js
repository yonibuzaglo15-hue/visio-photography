import { describe, expect, it } from "vitest";
import { equirectFromSkyboxes } from "../lib/tour/skybox.js";

function solid(size, rgb) {
  const data = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    data[i * 3] = rgb[0];
    data[i * 3 + 1] = rgb[1];
    data[i * 3 + 2] = rgb[2];
  }
  return { data, width: size, height: size };
}

describe("Matterport skybox stitch", () => {
  it("puts the front face at yaw 0 and the right face at yaw +90", () => {
    const size = 8;
    const faces = [
      solid(size, [0, 0, 255]),
      solid(size, [255, 0, 0]),
      solid(size, [0, 255, 0]),
      solid(size, [255, 255, 0]),
      solid(size, [0, 255, 255]),
      solid(size, [255, 0, 255]),
    ];
    const outW = 64;
    const outH = 32;
    const raw = equirectFromSkyboxes(faces, outW, outH);
    const at = (x, y) => {
      const o = (y * outW + x) * 3;
      return [raw[o], raw[o + 1], raw[o + 2]];
    };
    expect(at(outW / 2, outH / 2)).toEqual([255, 0, 0]);
    expect(at(Math.round(outW * 0.75), outH / 2)).toEqual([0, 255, 0]);
    expect(at(outW / 2, 2)).toEqual([0, 0, 255]);
    expect(at(outW / 2, outH - 3)).toEqual([255, 0, 255]);
  });
});
