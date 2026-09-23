import { NextResponse } from "next/server";
import { getJob, updateOutputs, addLog } from "@/lib/pipeline/store.js";
import { requireAllowedApi } from "@/lib/auth/require.js";
import {
  configToEditorScenes,
  configToFloorPlanState,
  panoramasToEditorScenes,
  publishTour,
} from "@/lib/agents/tour-agent.js";
import { AGENTS } from "@/lib/agents/types.js";

async function fetchTourConfig(tourJsonUrl) {
  if (!tourJsonUrl) return null;
  try {
    const res = await fetch(tourJsonUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function panoramasFromJob(job) {
  const fromBucket = job.files?.panoramas;
  if (Array.isArray(fromBucket) && fromBucket.length > 0) return fromBucket;
  const all = job.files?.all || [];
  return all.filter((f) => f.type === "panorama" || f.assignedTo?.includes("tour"));
}

/**
 * GET — load editor state for a job (from tour.json or panoramas).
 */
export async function GET(request, { params }) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const job = await getJob(params.id);
    const blobBase =
      process.env.NEXT_PUBLIC_BLOB_BASE_URL ||
      "https://5ltyuhgj5vbqjxug.public.blob.vercel-storage.com";

    const panoramas = job ? panoramasFromJob(job) : [];
    const existingConfig = await fetchTourConfig(
      job?.outputs?.tourJsonUrl || `${blobBase}/tours/${params.id}/tour.json`
    );

    if (!job && !existingConfig) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    let scenes = configToEditorScenes(existingConfig);
    const { floorPlans: fromConfig, floorPlanMeta } =
      configToFloorPlanState(existingConfig);

    // Prefer job.outputs (updated immediately on crop upload) over tour.json
    // so the editor never keeps rendering a stale uncropped blob URL.
    const floorPlans =
      Array.isArray(job?.outputs?.floorPlans) && job.outputs.floorPlans.length > 0
        ? job.outputs.floorPlans
        : fromConfig;

    if (scenes.length === 0 && panoramas.length > 0) {
      scenes = panoramasToEditorScenes(panoramas);
    }

    scenes = scenes.map((scene, i) => {
      if (scene.panoramaUrl) return scene;
      const p = panoramas[i];
      return p?.url ? { ...scene, panoramaUrl: p.url } : scene;
    });

    const firstSceneId =
      existingConfig?.default?.firstScene || scenes[0]?.id || null;

    let tourUrl = job?.outputs?.tourUrl || `/tour/${params.id}`;
    if (!tourUrl || String(tourUrl).includes("blob.vercel-storage.com")) {
      tourUrl = `/tour/${params.id}`;
    }

    return NextResponse.json({
      ok: true,
      jobId: params.id,
      booking: job?.booking || null,
      status: job?.status || "blob-only",
      tourUrl,
      tourJsonUrl: job?.outputs?.tourJsonUrl || `${blobBase}/tours/${params.id}/tour.json`,
      provider: job?.outputs?.tourUrl?.includes("kuula") ? "kuula" : "pannellum",
      firstSceneId,
      scenes,
      floorPlans,
      floorPlanMeta,
      panoramaCount: panoramas.length || scenes.length,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT — save editor state, rewrite tour.json + index.html on Blob.
 */
export async function PUT(request, { params }) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const job = await getJob(params.id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    const body = await request.json();
    const scenes = Array.isArray(body.scenes) ? body.scenes : [];
    const floorPlans = Array.isArray(body.floorPlans) ? body.floorPlans : [];
    const floorPlanMeta =
      body.floorPlanMeta && typeof body.floorPlanMeta === "object"
        ? body.floorPlanMeta
        : null;

    if (scenes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "אין סצנות לשמירה" },
        { status: 400 }
      );
    }

    for (const scene of scenes) {
      if (!scene.id || !scene.panoramaUrl) {
        return NextResponse.json(
          { ok: false, error: "כל סצנה חייבת id ו-panoramaUrl" },
          { status: 400 }
        );
      }
      if (typeof scene.title === "string" && scene.title.length > 120) {
        return NextResponse.json(
          { ok: false, error: "שם סצנה ארוך מדי" },
          { status: 400 }
        );
      }
    }

    const sceneIds = new Set(scenes.map((s) => s.id));
    for (const scene of scenes) {
      for (const hs of scene.hotSpots || []) {
        if (hs.targetSceneId && !sceneIds.has(hs.targetSceneId)) {
          return NextResponse.json(
            { ok: false, error: `יעד לא קיים: ${hs.targetSceneId}` },
            { status: 400 }
          );
        }
      }
    }

    const firstSceneId =
      body.firstSceneId && sceneIds.has(body.firstSceneId)
        ? body.firstSceneId
        : scenes[0].id;

    const published = await publishTour(params.id, {
      scenes,
      firstSceneId,
      floorPlans,
      floorPlanMeta,
    });

    await updateOutputs(params.id, {
      tourUrl: published.tourUrl,
      tourJsonUrl: published.tourJsonUrl,
      ...(published.tourHtmlUrl ? { tourHtmlUrl: published.tourHtmlUrl } : {}),
      ...(floorPlans.length ? { floorPlans } : {}),
    });

    const linkCount = scenes.reduce(
      (n, s) => n + (s.hotSpots || []).filter((h) => h.targetSceneId).length,
      0
    );

    await addLog(
      params.id,
      AGENTS.TOUR,
      `עורך סיור: נשמרו ${scenes.length} סצנות, ${linkCount} קישורי חדרים`
    );

    return NextResponse.json({
      ok: true,
      tourUrl: published.tourUrl,
      tourJsonUrl: published.tourJsonUrl,
      sceneCount: published.sceneCount,
      linkCount,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
