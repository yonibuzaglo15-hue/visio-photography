import { NextResponse } from "next/server";
import { addLog, getJob, setAgentState, updateOutputs } from "@/lib/pipeline/store.js";
import { maybeFinalizeJob } from "@/lib/pipeline/finalize.js";
import { AGENTS } from "@/lib/agents/types.js";

const LOG_PREFIX = "[webhook]";

/**
 * Strict authentication — MAKE_WEBHOOK_SECRET is required.
 * Returns 401 immediately if header is missing or mismatched.
 */
function verifySecret(request) {
  const secret = process.env.MAKE_WEBHOOK_SECRET;

  if (!secret) {
    console.error(`${LOG_PREFIX} MAKE_WEBHOOK_SECRET is not configured — rejecting request`);
    return false;
  }

  const header = request.headers.get("x-visio-secret");

  if (!header) {
    console.warn(`${LOG_PREFIX} Missing X-Visio-Secret header`);
    return false;
  }

  if (header !== secret) {
    console.warn(`${LOG_PREFIX} Invalid X-Visio-Secret`);
    return false;
  }

  return true;
}

/**
 * Shared handler for Make.com completion callbacks.
 *
 * Expected body:
 * {
 *   jobId: string,
 *   bookingId?: string,
 *   status: "done" | "error",
 *   videoUrl?: string,
 *   graphicsUrls?: string[],
 *   error?: string
 * }
 */
export async function handleMakeWebhook(request, agentId, outputKey) {
  if (!verifySecret(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    console.error(`${LOG_PREFIX} Invalid JSON body`);
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = body.jobId;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ ok: false, error: "jobId required" }, { status: 400 });
  }

  const job = await getJob(jobId);
  if (!job) {
    console.warn(`${LOG_PREFIX} Job not found: ${jobId}`);
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  if (body.bookingId && job.bookingId && body.bookingId !== job.bookingId) {
    console.warn(`${LOG_PREFIX} bookingId mismatch for job ${jobId}`);
    return NextResponse.json({ ok: false, error: "bookingId mismatch" }, { status: 403 });
  }

  console.info(`${LOG_PREFIX} ${outputKey} callback`, { jobId, status: body.status });

  if (body.status === "error" || body.error) {
    await setAgentState(jobId, agentId, {
      status: "error",
      progress: 100,
      message: body.error || "שגיאה מ-Make.com",
      completedAt: new Date().toISOString(),
    });
    await addLog(jobId, agentId, `שגיאה מ-Make: ${body.error || "unknown"}`);
    await maybeFinalizeJob(jobId);
    return NextResponse.json({ ok: true, status: "error" });
  }

  const patch = {};
  if (outputKey === "video") {
    if (!body.videoUrl || typeof body.videoUrl !== "string") {
      return NextResponse.json({ ok: false, error: "videoUrl required" }, { status: 400 });
    }
    patch.videoUrl = body.videoUrl;
  }

  if (outputKey === "creative") {
    if (!Array.isArray(body.graphicsUrls) || body.graphicsUrls.length === 0) {
      return NextResponse.json({ ok: false, error: "graphicsUrls array required" }, { status: 400 });
    }
    patch.graphicsUrls = body.graphicsUrls;
  }

  await updateOutputs(jobId, patch);

  await setAgentState(jobId, agentId, {
    status: "done",
    progress: 100,
    message: outputKey === "video" ? "סרטון מוכן (Make.com)" : "גרפיקה מוכנה (Make.com)",
    completedAt: new Date().toISOString(),
  });

  await addLog(
    jobId,
    agentId,
    outputKey === "video"
      ? `סרטון התקבל מ-Make: ${body.videoUrl}`
      : `גרפיקה התקבלה מ-Make: ${body.graphicsUrls.length} קבצים`
  );

  const finalized = await maybeFinalizeJob(jobId);
  return NextResponse.json({ ok: true, job: finalized });
}

export { AGENTS };
