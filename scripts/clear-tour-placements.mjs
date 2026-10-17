/**
 * Clear ALL map placements (and, unless --placements-only, hotspots) on a real job.
 * Does NOT invent placements — only strips them. Scenes, titles, hidden flags kept.
 * Reads the latest saved version and publishes through the normal save path.
 *
 * Run: node --env-file=.env.local scripts/clear-tour-placements.mjs [jobId] [--placements-only]
 */
import { configToEditorScenes, configToFloorPlans } from "../lib/tour/tour-config.js";
import { loadLatestTour } from "../lib/tour/tour-store.js";
import { publishTour } from "../lib/agents/tour-agent.js";

const args = process.argv.slice(2);
const PLACEMENTS_ONLY = args.includes("--placements-only");
const JOB_ID = args.find((a) => !a.startsWith("--")) || "job_1790073394855_05316dbc";
const BLOB =
  process.env.NEXT_PUBLIC_BLOB_BASE_URL ||
  "https://5ltyuhgj5vbqjxug.public.blob.vercel-storage.com";

const { config: cfg, version } = await loadLatestTour(JOB_ID, `${BLOB}/tours/${JOB_ID}/tour.json`);
if (!cfg) throw new Error(`no tour for ${JOB_ID}`);

const before = configToEditorScenes(cfg);
const scenes = before.map((s) => {
  const { mapX, mapY, mapPlanId, ...rest } = s;
  if (PLACEMENTS_ONLY) return rest;
  const { floor, ...noFloor } = rest;
  return { ...noFloor, hotSpots: [] };
});

const published = await publishTour(JOB_ID, {
  scenes,
  firstSceneId: cfg.default?.firstScene,
  floorPlans: configToFloorPlans(cfg),
});

const stored = JSON.parse(published.tourJson);
const after = Object.values(stored.scenes || {});
const placed = after.filter((s) => Number.isFinite(s.mapX) || Number.isFinite(s.mapY) || s.mapPlanId).length;
const hs = after.reduce((n, s) => n + (s.hotSpots || []).length, 0);
const hidden = after.filter((s) => s.hidden).length;
const titlesUnchanged =
  JSON.stringify(after.map((s) => s.title)) === JSON.stringify(before.map((s) => s.title));

console.log(
  JSON.stringify(
    {
      jobId: JOB_ID,
      mode: PLACEMENTS_ONLY ? "placements-only" : "placements+hotspots",
      readVersion: version,
      newVersion: published.version,
      scenes: after.length,
      placements: placed,
      hotspots: hs,
      hidden,
      hiddenBefore: before.filter((s) => s.hidden).length,
      titlesUnchanged,
    },
    null,
    2
  )
);

if (
  placed !== 0 ||
  (!PLACEMENTS_ONLY && hs !== 0) ||
  hidden !== before.filter((s) => s.hidden).length ||
  after.length !== before.length ||
  !titlesUnchanged
) {
  console.error("FAILED: placements not cleared or scenes/names/hidden changed");
  process.exit(1);
}
