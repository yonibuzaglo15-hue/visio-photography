import { describe, expect, it } from "vitest";
import {
  estimateBackgroundRgb,
  isInsidePlanContent,
  OUTSIDE_PLAN_MESSAGE_HE,
} from "../lib/tour/plan-content-mask.js";

function makeImageData(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = fill[0];
    data[o + 1] = fill[1];
    data[o + 2] = fill[2];
    data[o + 3] = 255;
  }
  return { data, width, height };
}

function paintRect(imageData, x0, y0, x1, y1, rgb) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * imageData.width + x) * 4;
      imageData.data[i] = rgb[0];
      imageData.data[i + 1] = rgb[1];
      imageData.data[i + 2] = rgb[2];
    }
  }
}

describe("plan-content-mask", () => {
  it("rejects clicks on background corners", () => {
    const img = makeImageData(100, 100, [250, 250, 250]);
    paintRect(img, 20, 20, 80, 80, [40, 40, 40]);
    const bg = estimateBackgroundRgb(img);
    expect(isInsidePlanContent(img, 0.02, 0.02, { background: bg }).inside).toBe(
      false
    );
  });

  it("accepts clicks on dark apartment content", () => {
    const img = makeImageData(100, 100, [250, 250, 250]);
    paintRect(img, 20, 20, 80, 80, [40, 40, 40]);
    const bg = estimateBackgroundRgb(img);
    expect(isInsidePlanContent(img, 0.5, 0.5, { background: bg }).inside).toBe(
      true
    );
  });

  it("exports a Hebrew outside message", () => {
    expect(OUTSIDE_PLAN_MESSAGE_HE).toMatch(/מחוץ/);
  });
});
