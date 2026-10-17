import { NextResponse } from "next/server";
import { requireAllowedApi } from "@/lib/auth/require.js";
import { loadBrandingCatalog } from "@/lib/branding/catalog.js";

/** GET /api/branding/catalog — agencies + agents from pack snapshot (Phase 3 refreshes). */
export async function GET(request) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const catalog = loadBrandingCatalog();
    return NextResponse.json({ ok: true, catalog });
  } catch (err) {
    console.error("[branding/catalog]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
