import { NextResponse } from "next/server";
import { listJobs } from "@/lib/pipeline/store.js";
import { requireAllowedApi } from "@/lib/auth/require.js";

export async function GET(request) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const jobs = await listJobs();
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
