import { NextResponse } from "next/server";
import { fulfillBooking } from "@/lib/fulfill-booking";
import { createJob } from "@/lib/pipeline/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const { name, phone, address, pkg, date, time, notes, bookingRef } = await request.json();

  if (!name || !phone) {
    return NextResponse.json({ error: "שם וטלפון נדרשים" }, { status: 400 });
  }

  const ref = bookingRef || `booking-${Date.now()}`;

  try {
    const results = await fulfillBooking({
      name,
      phone,
      address: address || "",
      pkg: pkg || "SIGNATURE",
      date: date || "",
      time: time || "",
      notes: notes || "",
      bookingRef: ref,
    });

    // Create pipeline job server-side (create-job API is admin-only).
    let job = null;
    try {
      job = await createJob({
        bookingId: ref,
        name,
        phone,
        address: address || "",
        pkg: pkg || "SIGNATURE",
        date: date || "",
        time: time || "",
        notes: notes || "",
      });
    } catch (jobErr) {
      console.error("book-appointment createJob:", jobErr.message);
    }

    return NextResponse.json({ success: true, jobId: job?.id || null, ...results });
  } catch (err) {
    console.error("book-appointment error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
