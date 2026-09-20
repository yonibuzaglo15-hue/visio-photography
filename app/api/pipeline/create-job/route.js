import { NextResponse } from "next/server";
import { createJob } from "@/lib/pipeline/store.js";
import { requireAllowedApi } from "@/lib/auth/require.js";

/**
 * Admin-only. Public bookings create jobs inside /api/book-appointment instead.
 */
export async function POST(request) {
  const gate = await requireAllowedApi(request);
  if (gate.errorResponse) return gate.errorResponse;

  try {
    const body = await request.json();
    const job = await createJob({
      bookingId: body.bookingId || body.id || null,
      name: body.name || body.clientName,
      phone: body.phone,
      address: body.address,
      pkg: body.pkg || body.package,
      date: body.date,
      time: body.time,
      notes: body.notes,
    });

    return NextResponse.json({ ok: true, job });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
