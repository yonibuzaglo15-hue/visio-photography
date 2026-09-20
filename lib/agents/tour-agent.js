import { addLog, setAgentState, updateOutputs } from "../pipeline/store.js";
import { uploadTourFile, uploadFromUrl } from "../storage/index.js";
import { AGENTS } from "./types.js";

const PANNELLUM_CSS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
const PANNELLUM_JS = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";

function sanitizeFilename(name) {
  return (name || "panorama.jpg").replace(/[^a-zA-Z0-9._\u0590-\u05FF-]/g, "_");
}

function sceneTitle(name) {
  return (name || "חדר")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .trim();
}

/**
 * Build Pannellum config with inter-scene navigation hotspots.
 */
function buildPannellumConfig(scenes) {
  const sceneMap = {};
  let firstScene = null;

  scenes.forEach((scene, i) => {
    const key = `scene_${i}`;
    if (!firstScene) firstScene = key;

    const hotSpots = [];
    if (i > 0) {
      hotSpots.push({
        pitch: 0,
        yaw: -90,
        type: "scene",
        sceneId: `scene_${i - 1}`,
        text: scenes[i - 1].title || "חדר קודם",
      });
    }
    if (i < scenes.length - 1) {
      hotSpots.push({
        pitch: 0,
        yaw: 90,
        type: "scene",
        sceneId: `scene_${i + 1}`,
        text: scenes[i + 1].title || "חדר הבא",
      });
    }

    sceneMap[key] = {
      title: scene.title || `חדר ${i + 1}`,
      type: "equirectangular",
      panorama: scene.panoramaUrl,
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
    },
    scenes: sceneMap,
  };
}

/**
 * Production Pannellum HTML viewer — CDN + inline config (script-safe).
 */
function buildTourHtml(jobId, config) {
  const safeId = String(jobId).replace(/[<>&"']/g, "");
  const configJson = JSON.stringify(config).replace(/</g, "\\u003c");

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
      padding: 6px 14px; border-radius: 20px;
      font-size: 12px; font-weight: 700; font-family: system-ui, sans-serif;
      pointer-events: none;
    }
    .visio-loading {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      background: #0a0a0a; color: #c9a84c; font-family: system-ui, sans-serif;
      font-size: 14px; z-index: 999;
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
      name: p.name,
      panoramaUrl,
      title: sceneTitle(p.name),
    });
  }

  await setAgentState(jobId, AGENTS.TOUR, { progress: 65, message: "בונה סיור Pannellum" });

  const config = buildPannellumConfig(scenes);
  const configJson = JSON.stringify(config, null, 2);
  const html = buildTourHtml(jobId, config);

  await setAgentState(jobId, AGENTS.TOUR, { progress: 80, message: "מעלה סיור ל-Vercel Blob" });

  const tourJsonUrl = await uploadTourFile(jobId, "tour.json", configJson);
  const tourUrl = await uploadTourFile(jobId, "index.html", html);

  await updateOutputs(jobId, { tourUrl, tourJsonUrl });
  await setAgentState(jobId, AGENTS.TOUR, {
    status: "done",
    progress: 100,
    message: `סיור מוכן — ${scenes.length} סצנות`,
    completedAt: new Date().toISOString(),
  });
  await addLog(jobId, AGENTS.TOUR, `סיור Pannellum: ${tourUrl}`);

  return { tourUrl, tourJsonUrl, provider: "pannellum", scenes: scenes.length };
}
