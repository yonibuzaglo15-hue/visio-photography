import { describe, expect, it } from "vitest";
import {
  buildPlanContentModel,
  clampMapView,
  contentFraction,
  coverScale,
} from "../lib/tour/map-framing.js";

const BG = [30, 31, 35];
const FLOOR = [180, 170, 140];

/**
 * 400×300 plan: dark margin of 20px, apartment is an L-shape — the top-right
 * quadrant of the content area is background (like a real scan export).
 */
function lShapedPlan() {
  const width = 400;
  const height = 300;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inContent = x >= 20 && x < 380 && y >= 20 && y < 280;
      const notch = x >= 200 && y < 150;
      const c = inContent && !notch ? FLOOR : BG;
      const i = (y * width + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe("map framing", () => {
  const model = buildPlanContentModel(lShapedPlan());
  const imageSize = { width: 400, height: 300 };

  it("finds apartment bounds inside the dark scan margin", () => {
    expect(model.bounds.x0).toBeGreaterThanOrEqual(15);
    expect(model.bounds.x0).toBeLessThanOrEqual(25);
    expect(model.bounds.x1).toBeGreaterThanOrEqual(375);
    expect(model.bounds.x1).toBeLessThanOrEqual(385);
    expect(contentFraction(model, 250, 30, 350, 120)).toBeLessThan(0.05);
    expect(contentFraction(model, 40, 200, 150, 260)).toBeGreaterThan(0.95);
  });

  it("never lets the plan get smaller than the widget", () => {
    const r = clampMapView({
      model,
      imageSize,
      viewW: 180,
      viewH: 180,
      center: { x: 100, y: 200 },
      offset: { x: 0, y: 0 },
      zoomLog: Math.log(0.05),
    });
    expect(r.scale).toBeCloseTo(coverScale(model.bounds, 180, 180), 6);
    expect(2 * r.view.halfW).toBeLessThanOrEqual(model.bounds.x1 - model.bounds.x0 + 1e-6);
    expect(2 * r.view.halfH).toBeLessThanOrEqual(model.bounds.y1 - model.bounds.y0 + 1e-6);
  });

  it("clamps panning to the content bounds at every edge", () => {
    for (const offset of [
      { x: -5000, y: 0 },
      { x: 5000, y: 0 },
      { x: 0, y: -5000 },
      { x: 0, y: 5000 },
    ]) {
      const r = clampMapView({
        model,
        imageSize,
        viewW: 180,
        viewH: 180,
        center: { x: 100, y: 200 },
        offset,
        zoomLog: Math.log(2),
      });
      const { x, y, halfW, halfH } = r.view;
      expect(x - halfW).toBeGreaterThanOrEqual(model.bounds.x0 - 1e-6);
      expect(x + halfW).toBeLessThanOrEqual(model.bounds.x1 + 1e-6);
      expect(y - halfH).toBeGreaterThanOrEqual(model.bounds.y0 - 1e-6);
      expect(y + halfH).toBeLessThanOrEqual(model.bounds.y1 + 1e-6);
      expect(r.fraction).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("steers away from an empty corner of an L-shaped plan", () => {
    // Pan into the background notch (top-right) at max zoom.
    const r = clampMapView({
      model,
      imageSize,
      viewW: 180,
      viewH: 180,
      center: { x: 100, y: 200 },
      offset: { x: 5000, y: -5000 },
      zoomLog: Math.log(2),
    });
    expect(r.fraction).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps the current-position pin visible when steering off an empty corner", () => {
    // Pin in the apartment right next to the background notch, not panned.
    const center = { x: 195, y: 155 };
    const r = clampMapView({
      model,
      imageSize,
      viewW: 180,
      viewH: 180,
      center,
      offset: { x: 0, y: 0 },
      zoomLog: Math.log(2),
    });
    expect(Math.abs(center.x - r.view.x)).toBeLessThan(r.view.halfW);
    expect(Math.abs(center.y - r.view.y)).toBeLessThan(r.view.halfH);
    expect(r.fraction).toBeGreaterThanOrEqual(0.5);
  });

  it("raises max zoom when a maximized widget needs more than the configured max", () => {
    const r = clampMapView({
      model,
      imageSize,
      viewW: 1440,
      viewH: 820,
      center: { x: 100, y: 200 },
      offset: { x: 0, y: 0 },
      zoomLog: Math.log(1),
      maxZoomLog: Math.log(2),
    });
    expect(r.scale).toBeGreaterThan(2);
    expect(r.scale).toBeCloseTo(coverScale(model.bounds, 1440, 820), 6);
  });

  it("falls back to image bounds when pixels are unavailable", () => {
    const r = clampMapView({
      model: null,
      imageSize,
      viewW: 180,
      viewH: 180,
      center: { x: 390, y: 290 },
      offset: { x: 0, y: 0 },
      zoomLog: Math.log(1),
    });
    expect(r.view.x + r.view.halfW).toBeLessThanOrEqual(400 + 1e-6);
    expect(r.view.y + r.view.halfH).toBeLessThanOrEqual(300 + 1e-6);
  });
});
