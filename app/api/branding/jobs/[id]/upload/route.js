import { NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import { requireAllowedApi } from "@/lib/auth/require.js";
import { getBrandingJob, updateBrandingJob } from "@/lib/branding/store.js";
import { uploadBuffer } from "@/lib/storage/index.js";

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

function mimeFromName(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic" || ext === ".heif") return "image/heic";
  return "image/jpeg";
}

/**
 * POST /api/branding/jobs/[id]/upload
 * multipart/form-data with one or more `files` fields.
 * Stores originals under branding/{jobId}/originals/ on Blob.
 * HEIC is stored as-is — conversion is Phase 3 (local worker), not here.
 */
export async function POST(request, { params }) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const { id } = params;
    const job = await getBrandingJob(id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "pending") {
      return NextResponse.json(
        { ok: false, error: `Job status is ${job.status}; uploads only while pending` },
        { status: 409 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { ok: false, error: "multipart/form-data required" },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const files = form.getAll("files");
    if (!files.length) {
      return NextResponse.json({ ok: false, error: "no files" }, { status: 400 });
    }

    const uploaded = [];
    for (const file of files) {
      if (!file || typeof file === "string") continue;
      const originalName = file.name || "photo.jpg";
      const ext = path.extname(originalName).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return NextResponse.json(
          { ok: false, error: `unsupported type: ${ext || "(none)"}` },
          { status: 400 }
        );
      }
      const safeName = originalName.replace(/[^a-zA-Z0-9._\u0590-\u05FF-]/g, "_");
      const buf = Buffer.from(await file.arrayBuffer());
      const mime = file.type || mimeFromName(safeName);
      const blobPath = `branding/${id}/originals/${safeName}`;
      const url = await uploadBuffer(blobPath, buf, mime);
      uploaded.push({
        id: crypto.randomBytes(6).toString("hex"),
        name: safeName,
        url,
        contentType: mime,
        size: buf.length,
        heic: ext === ".heic" || ext === ".heif",
      });
    }

    if (!uploaded.length) {
      return NextResponse.json({ ok: false, error: "no valid files" }, { status: 400 });
    }

    const updated = await updateBrandingJob(id, (current) => ({
      ...current,
      originals: [...(current.originals || []), ...uploaded],
      status: "pending",
    }));

    return NextResponse.json({ ok: true, job: updated, uploaded });
  } catch (err) {
    console.error("[branding/jobs/:id/upload]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
