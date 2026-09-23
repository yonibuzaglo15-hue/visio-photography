/**
 * One-shot: clear hotspots, stamp mapPlanId, drop out-of-apartment pins
 * for job_1790073394855_05316dbc. Writes tour.json (+ redirect index.html).
 *
 * Run: node --env-file=.env.local scripts/fix-tour-map-coords.mjs
 */
import sharp from "sharp";
import {
  buildPannellumConfig,
  configToEditorScenes,
  configToFloorPlanState,
} from "../lib/tour/pannellum-config.js";
import { planIdFromFloorPlan } from "../lib/tour/map-plan.js";
import { classifyMapCoordSpace } from "../lib/tour/map-plan.js";
import { buildTourHtml } from "../lib/agents/tour-agent.js";
import { uploadTourFile } from "../lib/storage/index.js";

const JOB_ID = "job_1790073394855_05316dbc";
const BLOB =
  process.env.NEXT_PUBLIC_BLOB_BASE_URL ||
  "https://5ltyuhgj5vbqjxug.public.blob.vercel-storage.com";

/** Documented crop of the original 1024×576 Matterport screenshot → 442×394. */
const CROP_NORM = {
  x: 411 / 1024,
  y: 96 / 576,
  w: 442 / 1024,
  h: 394 / 576,
};

async function isInsideApartmentContent(planUrl, mapX, mapY) {
  const buf = Buffer.from(await (await fetch(planUrl)).arrayBuffer());
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const px = Math.min(W - 1, Math.max(0, Math.round(mapX * (W - 1))));
  const py = Math.min(H - 1, Math.max(0, Math.round(mapY * (H - 1))));
  // 5×5 neighborhood mean luminance
  let sum = 0;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = Math.min(W - 1, Math.max(0, px + dx));
      const y = Math.min(H - 1, Math.max(0, py + dy));
      const i = (y * W + x) * info.channels;
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      n++;
    }
  }
  return sum / n > 45;
}

const cfg = await (await fetch(`${BLOB}/tours/${JOB_ID}/tour.json?_=${Date.now()}`)).json();
const scenes = configToEditorScenes(cfg);
const { floorPlans, floorPlanMeta } = configToFloorPlanState(cfg);
const plan = floorPlans[0];
const planId = planIdFromFloorPlan(plan) || "floorplan-f0-muemq7nx";

console.log("\n=== Stored mapX/mapY inspection ===\n");
console.log("Active plan:", plan?.url);
console.log("Plan pixels: 442×394 (cropped). Original was 1024×576.");
console.log("Crop rect (of original): x=411 y=96 w=442 h=394");
console.log("planId:", planId);
console.log("");

const report = [];
for (const s of scenes) {
  if (!Number.isFinite(Number(s.mapX))) continue;
  const space = classifyMapCoordSpace(s.mapX, s.mapY, CROP_NORM);
  const inside = await isInsideApartmentContent(plan.url, s.mapX, s.mapY);
  report.push({
    id: s.id,
    title: s.title,
    mapX: s.mapX,
    mapY: s.mapY,
    space: space.space,
    reason: space.reason,
    insideApartmentContent: inside,
    hotSpots: (s.hotSpots || []).length,
  });
}

// Ensemble: if any point is left of crop.x, the set is crop-normalized overall.
const anyLeftOfCrop = report.some((r) => r.mapX < CROP_NORM.x - 0.01);
console.log(
  "Ensemble space:",
  anyLeftOfCrop
    ? "ALL crop-normalized (0–1 of 442×394). Not mixed with original 1024×576 space."
    : "ambiguous"
);
console.log("");
for (const r of report) {
  console.log(
    `${r.id.padEnd(10)} mapX=${r.mapX.toFixed(3)} mapY=${r.mapY.toFixed(3)}  space=${r.space}  in_apartment=${r.insideApartmentContent}  hs=${r.hotSpots}`
  );
  console.log(`           ${r.reason}`);
}

const invalidateIds = report.filter((r) => !r.insideApartmentContent).map((r) => r.id);
console.log("\nInvalidate (outside apartment content on cropped plan):", invalidateIds);

const fixedScenes = scenes.map((s) => {
  // Clear ALL hotspots
  const base = { ...s, hotSpots: [] };
  if (!Number.isFinite(Number(s.mapX)) || !Number.isFinite(Number(s.mapY))) {
    return base;
  }
  if (invalidateIds.includes(s.id)) {
    const { mapX, mapY, mapPlanId, ...rest } = base;
    console.log(`  cleared map placement for ${s.id}`);
    return rest;
  }
  return { ...base, mapPlanId: planId };
});

const fixedPlans = floorPlans.map((p, i) =>
  i === 0
    ? {
        ...p,
        planId,
        cropped: true,
        cropRect: { ...CROP_NORM },
      }
    : { ...p, planId: planIdFromFloorPlan(p) || p.planId }
);

const stored = buildPannellumConfig({
  scenes: fixedScenes,
  firstSceneId: cfg.default?.firstScene,
  includeHidden: true,
  floorPlans: fixedPlans,
  floorPlanMeta,
});
const publish = buildPannellumConfig({
  scenes: fixedScenes,
  firstSceneId: cfg.default?.firstScene,
  includeHidden: false,
  floorPlans: fixedPlans,
  floorPlanMeta,
});

const tourJsonUrl = await uploadTourFile(JOB_ID, "tour.json", JSON.stringify(stored, null, 2));
const html = buildTourHtml(JOB_ID, publish);
const tourHtmlUrl = await uploadTourFile(JOB_ID, "index.html", html);

const hsLeft = fixedScenes.reduce((n, s) => n + (s.hotSpots || []).length, 0);
const placedLeft = fixedScenes.filter(
  (s) => Number.isFinite(Number(s.mapX)) && Number.isFinite(Number(s.mapY))
).length;

console.log("\n=== Wrote ===");
console.log("tourJsonUrl", tourJsonUrl);
console.log("tourHtmlUrl", tourHtmlUrl);
console.log("hotspots remaining", hsLeft);
console.log("map placements remaining", placedLeft);
console.log("re-place required:", invalidateIds);
