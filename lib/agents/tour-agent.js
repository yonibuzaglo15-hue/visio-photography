import { addLog, setAgentState, updateOutputs } from "../pipeline/store.js";
import { uploadTourFile, uploadFromUrl } from "../storage/index.js";
import { AGENTS } from "./types.js";

export const PANNELLUM_CSS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
export const PANNELLUM_JS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";

function sanitizeFilename(name) {
  return (name || "panorama.jpg").replace(/[^a-zA-Z0-9._\u0590-\u05FF-]/g, "_");
}

export function sceneTitle(name) {
  return (name || "חדר")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .trim();
}

/**
 * Normalize editor scenes → Pannellum multi-scene config.
 * No auto prev/next links — only explicit hotspots from the editor.
 * hotSpotDebug is always false in published tours.
 */
export function buildPannellumConfig({ scenes, firstSceneId } = {}) {
  const list = Array.isArray(scenes) ? scenes : [];
  const sceneMap = {};
  let firstScene = firstSceneId || null;

  list.forEach((scene, i) => {
    const key = scene.id || `scene_${i}`;
    if (!firstScene) firstScene = key;

    const hotSpots = (scene.hotSpots || [])
      .filter((h) => h && h.targetSceneId)
      .map((h) => ({
        id: h.id || undefined,
        pitch: Number(h.pitch) || 0,
        yaw: Number(h.yaw) || 0,
        type: "scene",
        sceneId: h.targetSceneId,
        text: h.text || sceneTitle(h.targetSceneId),
        cssClass: "visio-hotspot",
      }));

    sceneMap[key] = {
      title: scene.title || `חדר ${i + 1}`,
      type: "equirectangular",
      panorama: scene.panoramaUrl,
      yaw: Number.isFinite(Number(scene.yaw)) ? Number(scene.yaw) : 0,
      pitch: Number.isFinite(Number(scene.pitch)) ? Number(scene.pitch) : 0,
      hfov: Number.isFinite(Number(scene.hfov)) ? Number(scene.hfov) : 100,
      hotSpots,
    };
  });

  return {
    default: {
      firstScene,
      sceneFadeDuration: 1000,
      autoLoad: true,
      showControls: true,
      compass: true,
      hfov: 100,
      hotSpotDebug: false,
    },
    scenes: sceneMap,
  };
}

/**
 * Convert a stored Pannellum config back into editor scene list.
 */
export function configToEditorScenes(config) {
  if (!config?.scenes || typeof config.scenes !== "object") return [];

  return Object.entries(config.scenes).map(([id, scene]) => ({
    id,
    title: scene.title || id,
    panoramaUrl: scene.panorama,
    yaw: Number.isFinite(Number(scene.yaw)) ? Number(scene.yaw) : 0,
    pitch: Number.isFinite(Number(scene.pitch)) ? Number(scene.pitch) : 0,
    hfov: Number.isFinite(Number(scene.hfov)) ? Number(scene.hfov) : 100,
    hotSpots: (scene.hotSpots || [])
      .filter((h) => h?.type === "scene" && h.sceneId)
      .map((h, i) => ({
        id: h.id || `hs_${id}_${i}`,
        pitch: Number(h.pitch) || 0,
        yaw: Number(h.yaw) || 0,
        targetSceneId: h.sceneId,
        text: h.text || "",
      })),
  }));
}

/**
 * Build editor scenes from job panorama files (no hotspots yet).
 */
export function panoramasToEditorScenes(panoramas = []) {
  return panoramas.map((p, i) => ({
    id: `scene_${i}`,
    title: sceneTitle(p.name),
    panoramaUrl: p.url,
    yaw: 0,
    pitch: 0,
    hfov: 100,
    hotSpots: [],
  }));
}

/**
 * Production Pannellum HTML viewer — CDN + inline config.
 * hotSpotDebug is never enabled here.
 */
export function buildTourHtml(jobId, config) {
  const safeId = String(jobId).replace(/[<>&"']/g, "");
  const published = {
    ...config,
    default: {
      ...(config.default || {}),
      hotSpotDebug: false,
    },
  };
  const configJson = JSON.stringify(published).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
  <meta name="robots" content="noindex"/>
  <title>VISIO סיור וירטואלי — ${safeId}</title>
  <link rel="stylesheet" href="${PANNELLUM_CSS}"/>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }
    #panorama { width: 100vw; height: 100vh; }
    .visio-badge {
      position: fixed; bottom: 16px; left: 16px; z-index: 1000;
      background: rgba(201,168,76,0.92); color: #0a0a0a;
      padding: 6px 14px; border-radius: 2px;
      font-size: 12px; font-weight: 700; font-family: system-ui, sans-serif;
      pointer-events: none;
    }
    .visio-loading {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      background: #0a0a0a; color: #c9a84c; font-family: system-ui, sans-serif;
      font-size: 14px; z-index: 999;
    }
    .pnlm-hotspot.visio-hotspot {
      background: rgba(201,168,76,0.95);
      border: 2px solid #0a0a0a;
      width: 28px; height: 28px; border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.45);
    }
  </style>
</head>
<body>
  <div id="loading" class="visio-loading">טוען סיור וירטואלי…</div>
  <div id="panorama"></div>
  <div class="visio-badge">VISIO Photography</div>
  <script src="${PANNELLUM_JS}"></script>
  <script>
    (function () {
      var config = ${configJson};
      try {
        pannellum.viewer("panorama", config);
        document.getElementById("loading").style.display = "none";
      } catch (e) {
        document.getElementById("loading").textContent = "שגיאה בטעינת הסיור";
        console.error("Pannellum error:", e);
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Write tour.json + index.html to existing Blob paths and return URLs.
 */
export async function publishTour(jobId, editorPayload) {
  const scenes = editorPayload.scenes || [];
  if (scenes.length === 0) {
    throw new Error("No scenes to publish");
  }

  const config = buildPannellumConfig({
    scenes,
    firstSceneId: editorPayload.firstSceneId || scenes[0].id,
  });
  const configJson = JSON.stringify(config, null, 2);
  const html = buildTourHtml(jobId, config);

  const tourJsonUrl = await uploadTourFile(jobId, "tour.json", configJson);
  const tourUrl = await uploadTourFile(jobId, "index.html", html);

  return { tourUrl, tourJsonUrl, config, sceneCount: scenes.length };
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
      name: p.name,
      panoramaUrl,
      title: sceneTitle(p.name),
      yaw: 0,
      pitch: 0,
      hfov: 100,
      hotSpots: [],
    });
  }

  await setAgentState(jobId, AGENTS.TOUR, { progress: 65, message: "בונה סיור Pannellum" });

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
  await addLog(jobId, AGENTS.TOUR, `סיור Pannellum: ${tourUrl}`);

  return { tourUrl, tourJsonUrl, provider: "pannellum", scenes: sceneCount };
}
