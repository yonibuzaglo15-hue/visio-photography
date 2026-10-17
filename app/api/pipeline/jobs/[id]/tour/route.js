import { NextResponse } from "next/server";
import { getJob, updateOutputs, addLog } from "@/lib/pipeline/store.js";
import { ensureJobForTour } from "@/lib/pipeline/ensure-job.js";
import { requireAllowedApi } from "@/lib/auth/require.js";
import {
  configToEditorScenes,
  configToFloorPlans,
  panoramasToEditorScenes,
  publishTour,
} from "@/lib/agents/tour-agent.js";
import { AGENTS } from "@/lib/agents/types.js";
import { currentTourVersion, loadLatestTour } from "@/lib/tour/tour-store.js";
import {
  invalidateBlobCache,
  rewriteEditorBlobUrls,
  unwrapEditorBlobUrls,
  writeBlobCache,
} from "@/lib/storage/blob-local-cache.js";

const BLOB_BASE =
  process.env.NEXT_PUBLIC_BLOB_BASE_URL ||
  "https://5ltyuhgj5vbqjxug.public.blob.vercel-storage.com";

function panoramasFromJob(job) {
  const fromBucket = job.files?.panoramas;
  if (Array.isArray(fromBucket) && fromBucket.length > 0) return fromBucket;
  const all = job.files?.all || [];
  return all.filter((f) => f.type === "panorama" || f.assignedTo?.includes("tour"));
}

/**
 * GET — load editor state: the newest saved version (never a stale CDN copy).
 */
export async function GET(request, { params }) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const job = await getJob(params.id);
    const panoramas = job ? panoramasFromJob(job) : [];
    const { config: existingConfig, version } = await loadLatestTour(
      params.id,
      job?.outputs?.tourJsonUrl || `${BLOB_BASE}/tours/${params.id}/tour.json`
    );

    if (!job && !existingConfig) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    let scenes = configToEditorScenes(existingConfig);
    // Prefer job.outputs (updated immediately on crop upload) over tour.json
    // so the editor never keeps rendering a stale uncropped blob URL.
    const floorPlans =
      Array.isArray(job?.outputs?.floorPlans) && job.outputs.floorPlans.length > 0
        ? job.outputs.floorPlans
        : configToFloorPlans(existingConfig);

    if (scenes.length === 0 && panoramas.length > 0) {
      scenes = panoramasToEditorScenes(panoramas);
    }
    scenes = scenes.map((scene, i) => {
      if (scene.panoramaUrl) return scene;
      const p = panoramas[i];
      return p?.url ? { ...scene, panoramaUrl: p.url } : scene;
    });

    const firstSceneId = existingConfig?.default?.firstScene || scenes[0]?.id || null;
    let tourUrl = job?.outputs?.tourUrl || `/tour/${params.id}`;
    if (!tourUrl || String(tourUrl).includes("blob.vercel-storage.com")) {
      tourUrl = `/tour/${params.id}`;
    }

    // Local/dev: serve media via disk-cached proxy (unwrapped back to Blob URLs on PUT).
    const rewritten = rewriteEditorBlobUrls(scenes, floorPlans);

    return NextResponse.json({
      ok: true,
      jobId: params.id,
      version,
      booking: job?.booking || null,
      status: job?.status || "blob-only",
      tourUrl,
      tourJsonUrl: job?.outputs?.tourJsonUrl || `${BLOB_BASE}/tours/${params.id}/tour.json`,
      provider: job?.outputs?.tourUrl?.includes("kuula") ? "kuula" : "visio",
      firstSceneId,
      scenes: rewritten.scenes,
      floorPlans: rewritten.floorPlans,
      panoramaCount: panoramas.length || scenes.length,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT — save editor state. Rejected (409) when someone saved after this editor
 * loaded (`baseVersion` ≠ newest), so an old copy can never overwrite newer work.
 */
export async function PUT(request, { params }) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const body = await request.json();
    const rawScenes = Array.isArray(body.scenes) ? body.scenes : [];
    const rawFloorPlans = Array.isArray(body.floorPlans) ? body.floorPlans : [];
    const { scenes, floorPlans } = unwrapEditorBlobUrls(rawScenes, rawFloorPlans);

    if (scenes.length === 0) {
      return NextResponse.json({ ok: false, error: "אין סצנות לשמירה" }, { status: 400 });
    }
    for (const scene of scenes) {
      if (!scene.id || !scene.panoramaUrl) {
        return NextResponse.json(
          { ok: false, error: "כל סצנה חייבת id ו-panoramaUrl" },
          { status: 400 }
        );
      }
      if (typeof scene.title === "string" && scene.title.length > 120) {
        return NextResponse.json({ ok: false, error: "שם סצנה ארוך מדי" }, { status: 400 });
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

    const latest = await currentTourVersion(params.id);
    const baseVersion = typeof body.baseVersion === "string" ? body.baseVersion : null;
    if (latest && baseVersion !== latest) {
      return NextResponse.json(
        {
          ok: false,
          conflict: true,
          latestVersion: latest,
          error: "הסיור נשמר ממקום אחר אחרי שנטען כאן. טען מחדש לפני שמירה כדי לא לדרוס עבודה.",
        },
        { status: 409 }
      );
    }

    // Blob-backed tours may have no in-memory/Supabase row yet — create a stub
    // so outputs can be updated after publish.
    let job = await getJob(params.id);
    if (!job) job = await ensureJobForTour(params.id);

    const firstSceneId =
      body.firstSceneId && sceneIds.has(body.firstSceneId) ? body.firstSceneId : scenes[0].id;

    const published = await publishTour(params.id, { scenes, firstSceneId, floorPlans });

    // Local/dev: keep the just-published tour.json as the authoritative copy for
    // the public viewer — the Blob CDN can keep serving the previous version.
    for (const url of new Set([published.tourJsonUrl, `${BLOB_BASE}/tours/${params.id}/tour.json`])) {
      if (!url) continue;
      invalidateBlobCache(url);
      writeBlobCache(url, Buffer.from(published.publicJson), "application/json", {
        authoritative: true,
      });
    }

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
      version: published.version,
      tourUrl: published.tourUrl,
      tourJsonUrl: published.tourJsonUrl,
      sceneCount: published.sceneCount,
      linkCount,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
