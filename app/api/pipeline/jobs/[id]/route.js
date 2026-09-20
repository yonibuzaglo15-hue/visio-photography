import { NextResponse } from "next/server";
import { getJob } from "@/lib/pipeline/store.js";
import { requireAllowedApi } from "@/lib/auth/require.js";

export async function GET(request, { params }) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const job = await getJob(params.id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
