import { NextResponse } from "next/server";
import { createJob } from "@/lib/pipeline/store.js";
import { requireAllowedApi } from "@/lib/auth/require.js";
import { validateDetailsRequired } from "@/lib/pipeline/job-details.js";

/**
 * Admin-only. Public bookings create jobs inside /api/book-appointment instead.
 * Body may include legacy booking fields and/or a full `details` object.
 */
export async function POST(request) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const body = await request.json();

    if (body.details || body.requireDetails) {
      const check = validateDetailsRequired(body.details || body);
      if (!check.ok) {
        return NextResponse.json(
          { ok: false, error: check.errors.join(" · "), errors: check.errors },
          { status: 400 }
        );
      }
      const job = await createJob({
        bookingId: body.bookingId || body.id || null,
        details: check.details,
      });
      return NextResponse.json({ ok: true, job });
    }

    const job = await createJob({
      bookingId: body.bookingId || body.id || null,
      name: body.name || body.clientName,
      phone: body.phone,
      address: body.address,
      pkg: body.pkg || body.package,
      date: body.date,
      time: body.time,
      notes: body.notes,
      details: body.details,
      agencyId: body.agencyId,
      agentId: body.agentId,
      street: body.street,
      city: body.city,
      houseNumber: body.houseNumber,
      email: body.email,
    });

    return NextResponse.json({ ok: true, job });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
