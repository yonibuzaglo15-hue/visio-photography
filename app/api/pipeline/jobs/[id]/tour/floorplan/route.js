import { NextResponse } from "next/server";
import { getJob, updateOutputs, addLog } from "@/lib/pipeline/store.js";
import { requireAllowedApi } from "@/lib/auth/require.js";
import { uploadBuffer } from "@/lib/storage/index.js";
import { AGENTS } from "@/lib/agents/types.js";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/**
 * POST multipart — upload a floor-plan image to tours/{jobId}/floorplan-f{N}.{ext}
 * Form fields: file, floor (number), label (optional string)
 */
export async function POST(request, ctx) {
  const params = await ctx.params;
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const job = await getJob(params.id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || !file.arrayBuffer) {
      return NextResponse.json({ ok: false, error: "חסר קובץ תוכנית" }, { status: 400 });
    }

    const type = (file.type || "").toLowerCase();
    if (!ALLOWED.has(type) && !/\.(jpe?g|png|webp)$/i.test(file.name || "")) {
      return NextResponse.json(
        { ok: false, error: "רק jpg / png / webp" },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "קובץ ריק או גדול מדי (מקס׳ 12MB)" },
        { status: 400 }
      );
    }

    const floorRaw = form.get("floor");
    const floor = Number.isFinite(Number(floorRaw)) ? Number(floorRaw) : 0;
    const label =
      typeof form.get("label") === "string" && String(form.get("label")).trim()
        ? String(form.get("label")).trim()
        : `קומה ${floor}`;

    const ext =
      type.includes("png") || /\.png$/i.test(file.name || "")
        ? "png"
        : type.includes("webp") || /\.webp$/i.test(file.name || "")
          ? "webp"
          : "jpg";
    const contentType =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    // Unique path per upload so CDN/browser never serve a cached uncropped plan
    // under the same URL as the cropped one.
    const stamp = Date.now().toString(36);
    const filename = `floorplan-f${floor}-${stamp}.${ext}`;
    const safeJobId = String(params.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const url = await uploadBuffer(
      `tours/${safeJobId}/${filename}`,
      buf,
      contentType
    );

    const existing = Array.isArray(job.outputs?.floorPlans)
      ? [...job.outputs.floorPlans]
      : [];
    const next = existing.filter((p) => Number(p.floor) !== floor);
    next.push({ floor, url, label, cropped: true, uploadedAt: Date.now() });
    next.sort((a, b) => a.floor - b.floor);

    await updateOutputs(params.id, { floorPlans: next });
    await addLog(params.id, AGENTS.TOUR, `תוכנית קומה הועלתה: קומה ${floor}`);

    return NextResponse.json({
      ok: true,
      floorPlan: { floor, url, label },
      floorPlans: next,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
