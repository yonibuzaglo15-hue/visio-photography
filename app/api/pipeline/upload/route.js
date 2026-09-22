import { NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import { getJob, findJobByBookingId, updateJob } from "@/lib/pipeline/store.js";
import { uploadAsset } from "@/lib/storage/index.js";
import { runPipeline } from "@/lib/agents/ariel.js";
import { requireAllowedApi } from "@/lib/auth/require.js";
import { readImageDimensions } from "@/lib/images/dimensions.js";

function mimeFromName(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

/**
 * POST /api/pipeline/upload
 * Accepts:
 *  - JSON: { bookingId, jobId?, files: [{ name, url, type? }] }
 *  - multipart/form-data: bookingId, jobId?, files[], urls[]
 */
export async function POST(request) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const contentType = request.headers.get("content-type") || "";
    let bookingId, jobId, fileEntries = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      bookingId = form.get("bookingId")?.toString() || null;
      jobId = form.get("jobId")?.toString() || null;

      for (const u of form.getAll("urls")) {
        if (u) fileEntries.push({ name: path.basename(u.toString()), url: u.toString() });
      }

      const files = form.getAll("files");
      const targetJobId = jobId || bookingId;
      if (!targetJobId) {
        return NextResponse.json({ ok: false, error: "jobId or bookingId required" }, { status: 400 });
      }

      for (const file of files) {
        if (!file || typeof file === "string") continue;
        const buf = Buffer.from(await file.arrayBuffer());
        const safeName = file.name.replace(/[^a-zA-Z0-9._\u0590-\u05FF-]/g, "_");
        const dims = readImageDimensions(buf);
        const url = await uploadAsset(targetJobId, safeName, buf, file.type || mimeFromName(safeName));
        fileEntries.push({
          name: safeName,
          url,
          width: dims?.width,
          height: dims?.height,
        });
      }
    } else {
      const body = await request.json();
      bookingId = body.bookingId || null;
      jobId = body.jobId || null;
      fileEntries = (body.files || []).map((f) => ({
        name: f.name,
        url: f.url,
        type: f.type,
        width: f.width,
        height: f.height,
      }));
    }

    const targetId = jobId || bookingId;
    if (!targetId) {
      return NextResponse.json({ ok: false, error: "jobId or bookingId required" }, { status: 400 });
    }

    let job = await getJob(targetId);
    if (!job) job = await findJobByBookingId(bookingId || targetId);
    if (!job) {
      return NextResponse.json({ ok: false, error: `Job not found: ${targetId}` }, { status: 404 });
    }

    const enriched = fileEntries.map((f) => ({
      id: crypto.randomBytes(6).toString("hex"),
      name: f.name,
      url: f.url,
      type: f.type,
      width: f.width,
      height: f.height,
    }));

    await updateJob(job.id, { bookingId: bookingId || job.bookingId });

    const result = await runPipeline(job.id, enriched);
    const updatedJob = await getJob(job.id);

    return NextResponse.json({ ok: true, job: updatedJob, result });
  } catch (err) {
    console.error("[pipeline/upload]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
