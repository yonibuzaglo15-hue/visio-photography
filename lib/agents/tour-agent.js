import { addLog, setAgentState, updateOutputs } from "../pipeline/store.js";
import {
  pruneTourVersions,
  uploadFromUrl,
  uploadTourFile,
  uploadTourVersion,
} from "../storage/index.js";
import { AGENTS } from "./types.js";
import {
  buildTourConfig,
  configToEditorScenes,
  configToFloorPlans,
  panoramasToEditorScenes,
} from "../tour/tour-config.js";
import { friendlyRoomLabel } from "../tour/room-label.js";
import { ensureViewerCopies } from "../tour/viewer-sizes-server.js";

export { buildTourConfig, configToEditorScenes, configToFloorPlans, panoramasToEditorScenes };

function sanitizeFilename(name) {
  return (name || "panorama.jpg").replace(/[^a-zA-Z0-9._\u0590-\u05FF-]/g, "_");
}

/** Site-hosted public tour URL (not Blob HTML — Blob forces download). */
export function publicTourUrl(jobId) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "")
    .replace(/\/$/, "");
  const path = `/tour/${encodeURIComponent(jobId)}`;
  return base ? `${base}${path}` : path;
}

/**
 * Legacy Blob index.html — redirects to the site-hosted PSV viewer.
 * Primary share URL is /tour/[jobId]; this file only keeps old blob links working.
 */
export function buildTourHtml(jobId, _config) {
  const target = publicTourUrl(jobId);
  const safeTarget = String(target).replace(/[<>"']/g, "");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex"/>
  <meta http-equiv="refresh" content="0;url=${safeTarget}"/>
  <title>VISIO סיור וירטואלי</title>
  <style>
    body { margin:0; background:#0a0a0a; color:#c9a84c; font-family:system-ui,sans-serif;
      display:flex; align-items:center; justify-content:center; min-height:100vh; }
    a { color:#e8c070; }
  </style>
</head>
<body>
  <p>מעביר לסיור… <a href="${safeTarget}">לחץ כאן</a></p>
  <script>location.replace(${JSON.stringify(safeTarget)});</script>
</body>
</html>`;
}

/**
 * Ensure viewer-sized JPEG copies, write the full versioned config (editor),
 * the public tour.json (no hidden scenes) and the legacy index.html redirect.
 * tourUrl points at the site /tour/[jobId] route (opens as a page).
 */
export async function publishTour(jobId, editorPayload) {
  const scenes = editorPayload.scenes || [];
  if (scenes.length === 0) {
    throw new Error("No scenes to publish");
  }

  const firstSceneId = editorPayload.firstSceneId || scenes[0].id;
  const sizeReport = {};

  // Generate 4096 + 6144 viewer copies (originals untouched)
  for (const scene of scenes) {
    if (!scene?.panoramaUrl || scene.hidden) continue;
    try {
      const { variants, sizes } = await ensureViewerCopies(
        jobId,
        scene.id,
        scene.panoramaUrl,
        scene.viewerSizes || {}
      );
      scene.viewerSizes = variants;
      if (Object.keys(sizes).length) sizeReport[scene.id] = sizes;
    } catch (err) {
      console.warn(`[tour-agent] viewer copy failed for ${scene.id}:`, err.message);
    }
  }

  const floorPlans = editorPayload.floorPlans || [];

  const storedConfig = buildTourConfig({ scenes, firstSceneId, includeHidden: true, floorPlans });
  const publishConfig = buildTourConfig({ scenes, firstSceneId, includeHidden: false, floorPlans });
  const configJson = JSON.stringify(storedConfig, null, 2);
  const publicJson = JSON.stringify(publishConfig, null, 2);
  const html = buildTourHtml(jobId, publishConfig);

  // Immutable full version first — the editor's source of truth (see tour-store.js).
  const versioned = await uploadTourVersion(jobId, configJson);
  // Public tour.json: hidden scenes (and links to them) are not in it at all.
  const tourJsonUrl = await uploadTourFile(jobId, "tour.json", versioned ? publicJson : configJson);
  // Keep Blob HTML for anything still pointing at it; primary URL is the site route.
  const tourHtmlUrl = await uploadTourFile(jobId, "index.html", html);
  const tourUrl = publicTourUrl(jobId);

  if (versioned) {
    await pruneTourVersions(jobId).catch((err) =>
      console.warn("[tour-agent] prune versions failed:", err.message)
    );
  }

  return {
    tourUrl,
    tourJsonUrl,
    tourJson: configJson,
    publicJson: versioned ? publicJson : configJson,
    version: versioned?.version || null,
    tourHtmlUrl,
    config: publishConfig,
    sceneCount: Object.keys(publishConfig.scenes || {}).length,
    viewerSizeReport: sizeReport,
  };
}

async function tryKuulaUpload(panoramas) {
  const apiKey = process.env.KUULA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.kuula.co/v1/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "VISIO Tour",
        panoramas: panoramas.map((p) => ({ url: p.url, name: p.name })),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedUrl || data.url || null;
  } catch (err) {
    console.warn("[tour-agent] Kuula upload skipped:", err.message);
    return null;
  }
}

/**
 * Ensure panorama is stored in cloud at uploads/{jobId}/{filename}.
 */
async function ensurePanoramaInCloud(jobId, panorama) {
  const filename = sanitizeFilename(panorama.name);
  const cloudPath = `uploads/${jobId}/${filename}`;

  if (panorama.url?.startsWith("http") && panorama.url.includes("blob.vercel-storage.com")) {
    return panorama.url;
  }

  if (panorama.url?.startsWith("http")) {
    return uploadFromUrl(cloudPath, panorama.url);
  }

  throw new Error(`Panorama missing cloud URL: ${panorama.name}`);
}

/**
 * @param {string} jobId
 * @param {Array} panoramas
 */
export async function runTourAgent(jobId, panoramas) {
  await setAgentState(jobId, AGENTS.TOUR, {
    status: "running",
    progress: 10,
    message: "מתחיל עיבוד 360°",
    startedAt: new Date().toISOString(),
  });
  await addLog(jobId, AGENTS.TOUR, `קיבל ${panoramas.length} תמונות פנורמה`);

  if (panoramas.length === 0) {
    await setAgentState(jobId, AGENTS.TOUR, {
      status: "skipped",
      progress: 100,
      message: "אין תמונות 360° — דילוג",
      completedAt: new Date().toISOString(),
    });
    return { tourUrl: null, tourJsonUrl: null };
  }

  const kuulaUrl = await tryKuulaUpload(panoramas);
  if (kuulaUrl) {
    await updateOutputs(jobId, { tourUrl: kuulaUrl, tourJsonUrl: null });
    await setAgentState(jobId, AGENTS.TOUR, {
      status: "done",
      progress: 100,
      message: "סיור הועלה ל-Kuula",
      completedAt: new Date().toISOString(),
    });
    await addLog(jobId, AGENTS.TOUR, `סיור Kuula: ${kuulaUrl}`);
    return { tourUrl: kuulaUrl, tourJsonUrl: null, provider: "kuula" };
  }

  await setAgentState(jobId, AGENTS.TOUR, { progress: 30, message: "מעלה פנורמות ל-Vercel Blob" });

  const scenes = [];
  for (let i = 0; i < panoramas.length; i++) {
    const p = panoramas[i];
    const progress = 30 + Math.round((i / panoramas.length) * 25);
    await setAgentState(jobId, AGENTS.TOUR, {
      progress,
      message: `מעלה פנורמה ${i + 1}/${panoramas.length}`,
    });

    const panoramaUrl = await ensurePanoramaInCloud(jobId, p);
    scenes.push({
      id: `scene_${i}`,
      panoramaUrl,
      title: friendlyRoomLabel({ id: `scene_${i}` }, i + 1),
      yaw: 0,
      pitch: 0,
      hfov: 100,
      hidden: false,
      hotSpots: [],
    });
  }

  await setAgentState(jobId, AGENTS.TOUR, { progress: 65, message: "בונה סיור" });

  const { tourUrl, tourJsonUrl, sceneCount } = await publishTour(jobId, {
    scenes,
    firstSceneId: scenes[0]?.id,
  });

  await updateOutputs(jobId, { tourUrl, tourJsonUrl });
  await setAgentState(jobId, AGENTS.TOUR, {
    status: "done",
    progress: 100,
    message: `סיור מוכן — ${sceneCount} סצנות (ללא קישורי חדרים — ערוך בטאב סיור 360°)`,
    completedAt: new Date().toISOString(),
  });
  await addLog(jobId, AGENTS.TOUR, `סיור: ${tourUrl}`);

  return { tourUrl, tourJsonUrl, provider: "visio", scenes: sceneCount };
}
