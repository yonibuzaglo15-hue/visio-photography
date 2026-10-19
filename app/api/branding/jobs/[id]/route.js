import { NextResponse } from "next/server";
import { requireAllowedApi } from "@/lib/auth/require.js";
import { getBrandingJob } from "@/lib/branding/store.js";

/** GET /api/branding/jobs/[id] */
export async function GET(request, ctx) {
  const params = await ctx.params;
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const { id } = params;
    const job = await getBrandingJob(id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    console.error("[branding/jobs/:id GET]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
