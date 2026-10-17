import { NextResponse } from "next/server";
import { requireAllowedApi } from "@/lib/auth/require.js";
import { isValidAgencyAgent } from "@/lib/branding/catalog.js";
import { createBrandingJob, listBrandingJobs } from "@/lib/branding/store.js";

const PROPERTY_TYPES = new Set(["apartment", "house", "land", "commercial", "other", ""]);

/** GET /api/branding/jobs */
export async function GET(request) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const jobs = await listBrandingJobs();
    return NextResponse.json({ ok: true, jobs });
  } catch (err) {
    console.error("[branding/jobs GET]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/branding/jobs
 * Body: { city, street, agencyId, agentId, title?, propertyType?, notes? }
 * Creates a pending branding job (originals uploaded next).
 */
export async function POST(request) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const body = await request.json();
    const city = String(body.city || "").trim();
    const street = String(body.street || "").trim();
    const agencyId = String(body.agencyId || "").trim();
    const agentId = String(body.agentId || "").trim();
    const title = String(body.title || "").trim();
    const propertyType = String(body.propertyType || "").trim();
    const notes = String(body.notes || "").trim();

    if (!city || !street) {
      return NextResponse.json(
        { ok: false, error: "city and street are required" },
        { status: 400 }
      );
    }
    if (!agencyId || !agentId) {
      return NextResponse.json(
        { ok: false, error: "agencyId and agentId are required" },
        { status: 400 }
      );
    }
    if (!isValidAgencyAgent(agencyId, agentId)) {
      return NextResponse.json(
        { ok: false, error: `agent ${agentId} is not under agency ${agencyId}` },
        { status: 400 }
      );
    }
    if (!PROPERTY_TYPES.has(propertyType)) {
      return NextResponse.json(
        { ok: false, error: "invalid propertyType" },
        { status: 400 }
      );
    }

    const job = await createBrandingJob({
      city,
      street,
      agencyId,
      agentId,
      title,
      propertyType,
      notes,
      createdBy: gate.session.user.email,
    });

    return NextResponse.json({ ok: true, job }, { status: 201 });
  } catch (err) {
    console.error("[branding/jobs POST]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
