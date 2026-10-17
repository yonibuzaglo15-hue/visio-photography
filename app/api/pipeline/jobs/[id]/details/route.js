import { NextResponse } from "next/server";
import { getJob, updateJob, addLog } from "@/lib/pipeline/store.js";
import { requireAllowedApi } from "@/lib/auth/require.js";
import {
  bookingFromDetails,
  ensureJobDetails,
  softValidateIsraeliPhone,
  validateDetailsRequired,
} from "@/lib/pipeline/job-details.js";
import { AGENTS } from "@/lib/agents/types.js";

/**
 * GET — current details for a job (merged with legacy booking).
 * PATCH — update details only; never touches files / agents / outputs / tour.
 */
export async function GET(request, { params }) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const job = await getJob(params.id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }
    const details = ensureJobDetails(job);
    return NextResponse.json({ ok: true, jobId: job.id, details, booking: job.booking });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const job = await getJob(params.id);
    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
    }

    const body = await request.json();
    const check = validateDetailsRequired(body.details || body);
    if (!check.ok) {
      return NextResponse.json(
        { ok: false, error: check.errors.join(" · "), errors: check.errors },
        { status: 400 }
      );
    }

    const phoneCheck = softValidateIsraeliPhone(check.details.client.phone);
    const booking = bookingFromDetails(check.details);

    const updated = await updateJob(params.id, (current) => ({
      ...current,
      details: check.details,
      booking: {
        ...current.booking,
        ...booking,
      },
      // Explicitly preserve pipeline artefacts
      files: current.files,
      agents: current.agents,
      outputs: current.outputs,
      status: current.status,
      phase: current.phase,
      logs: current.logs,
    }));

    await addLog(
      params.id,
      AGENTS.ARIEL,
      `עודכנו פרטי הזמנה: ${booking.address || "—"}`
    );

    return NextResponse.json({
      ok: true,
      job: updated,
      phoneWarning: phoneCheck.warning,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
