import { NextResponse } from "next/server";
import { requireAllowedApi } from "@/lib/auth/require.js";
import { getJob, updateJob, addLog, setAgentState, updateOutputs } from "@/lib/pipeline/store.js";
import { routeFiles, splitByAgent } from "@/lib/agents/classify.js";
import { fetchImageDimensionsFromUrl } from "@/lib/images/dimensions.js";
import { runTourAgent } from "@/lib/agents/tour-agent.js";
import { maybeFinalizeJob } from "@/lib/pipeline/finalize.js";
import { AGENTS } from "@/lib/agents/types.js";

/**
 * POST /api/pipeline/jobs/[id]/reclassify
 * Re-read dimensions from Blob (Range header), reclassify, re-run Tour agent.
 * Does not re-upload files.
 */
export async function POST(request, { params }) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const { id } = params;
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    const existing = job.files?.all || [];
    if (!existing.length) {
      return NextResponse.json({ ok: false, error: "No files on job" }, { status: 400 });
    }

    await addLog(id, AGENTS.ARIEL, `Reclassify: reading dimensions for ${existing.length} files`);

    const withDims = [];
    for (const f of existing) {
      let width = f.width;
      let height = f.height;
      if ((!width || !height) && f.url) {
        const dims = await fetchImageDimensionsFromUrl(f.url);
        width = dims?.width;
        height = dims?.height;
      }
      withDims.push({
        ...f,
        width,
        height,
        type: undefined, // force fresh classification
      });
    }

    const routed = routeFiles(withDims);
    const split = splitByAgent(routed);

    await updateJob(id, {
      files: {
        all: routed,
        panoramas: split.panoramas,
        photos: split.photos,
      },
    });

    await addLog(
      id,
      AGENTS.ARIEL,
      `Reclassify done: ${split.panoramas.length} panoramas, ${split.photos.length} photos`
    );

    await setAgentState(id, AGENTS.TOUR, {
      status: "pending",
      progress: 0,
      message: "ממתין ל-reclassify",
    });

    const tourResult = await runTourAgent(id, split.panoramas);
    await updateOutputs(id, {
      tourUrl: tourResult.tourUrl || null,
      tourJsonUrl: tourResult.tourJsonUrl || null,
    });

    const finalized = await maybeFinalizeJob(id);
    const updated = finalized || (await getJob(id));

    const notPanoramas = routed
      .filter((f) => f.type !== "panorama")
      .map((f) => ({
        name: f.name,
        width: f.width ?? null,
        height: f.height ?? null,
        ratio: f.width && f.height ? Number((f.width / f.height).toFixed(4)) : null,
      }));

    return NextResponse.json({
      ok: true,
      job: updated,
      summary: {
        total: routed.length,
        panoramas: split.panoramas.length,
        photos: split.photos.length,
        notPanoramas,
        tourUrl: tourResult.tourUrl || null,
      },
    });
  } catch (err) {
    console.error("[pipeline/reclassify]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
