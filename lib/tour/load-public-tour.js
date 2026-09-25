/**
 * Load public tour payload for /tour/[jobId] (no auth).
 */

import { getJob } from "../pipeline/store.js";
import { buildTourConfig, configToEditorScenes, configToFloorPlans } from "./tour-config.js";
import {
  fetchBlobJsonCached,
  rewriteConfigBlobUrls,
} from "../storage/blob-local-cache.js";

function bookingTitle(job) {
  const d = job?.details?.property;
  const street = (d?.street || "").trim();
  const num = (d?.houseNumber || "").trim();
  const city = (d?.city || "").trim();
  const line = [street && num ? `${street} ${num}` : street || num, city]
    .filter(Boolean)
    .join(", ");
  // Never show an internal job id as the tour title.
  const isId = (t) => /\bjob_\d/i.test(t);
  if (line && !isId(line)) return `סיור וירטואלי — ${line}`;
  const addr = (job?.booking?.address || "").trim();
  if (addr && !isId(addr)) return `סיור וירטואלי — ${addr}`;
  return "סיור וירטואלי — VISIO";
}

async function fetchTourConfig(tourJsonUrl) {
  if (!tourJsonUrl) return null;
  return fetchBlobJsonCached(tourJsonUrl, { timeoutMs: 25_000 });
}

/**
 * @returns {Promise<null | { jobId, pageTitle, ogImage, config, firstSceneId }>}
 */
export async function loadPublicTour(jobId) {
  const id = String(jobId || "").trim();
  if (!id || !/^[\w-]+$/.test(id)) return null;

  const job = await getJob(id).catch(() => null);
  let config = null;

  if (job?.outputs?.tourJsonUrl) {
    config = await fetchTourConfig(job.outputs.tourJsonUrl);
  }

  if (!config) {
    const blobBase =
      process.env.NEXT_PUBLIC_BLOB_BASE_URL ||
      "https://5ltyuhgj5vbqjxug.public.blob.vercel-storage.com";
    config = await fetchTourConfig(`${blobBase}/tours/${id}/tour.json`);
  }

  if (!config?.scenes || typeof config.scenes !== "object") return null;

  const scenes = configToEditorScenes(config);
  const fromConfig = configToFloorPlans(config);
  // Prefer latest cropped upload on the job over a stale URL baked into tour.json.
  const floorPlans =
    Array.isArray(job?.outputs?.floorPlans) && job.outputs.floorPlans.length > 0
      ? job.outputs.floorPlans
      : fromConfig;
  // Public: hidden scenes and every hotspot pointing at them are dropped.
  let publishConfig = buildTourConfig({
    scenes,
    firstSceneId: config.default?.firstScene,
    includeHidden: false,
    floorPlans,
  });

  // Local/dev: serve panoramas + plans via disk-cached proxy (no paid Blob bandwidth).
  publishConfig = rewriteConfigBlobUrls(publishConfig);

  if (!publishConfig.default?.firstScene || !Object.keys(publishConfig.scenes || {}).length) {
    return null;
  }

  const firstId = publishConfig.default.firstScene;
  const first = publishConfig.scenes[firstId];
  const ogImage =
    first?.viewerSizes?.["4096"] ||
    first?.panorama ||
    null;

  return {
    jobId: id,
    pageTitle: bookingTitle(job),
    ogImage,
    config: publishConfig,
    firstSceneId: firstId,
  };
}
