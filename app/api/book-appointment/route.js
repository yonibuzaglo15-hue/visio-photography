import { NextResponse } from "next/server";
import { fulfillBooking } from "@/lib/fulfill-booking";
import { createJob } from "@/lib/pipeline/store.js";
import { parseBookingConsent } from "@/lib/booking-consent.js";
import { cleanPackage, cleanPhone, cleanText, clientIp } from "@/lib/public-input.js";
import { rateLimit } from "@/lib/rate-limit.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE = 8 * 1024 * 1024;

async function readUpload(value) {
  if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function") return null;
  if (!value.size) return null;
  if (value.size > MAX_FILE) {
    const error = new Error("הקובץ גדול מדי");
    error.status = 400;
    throw error;
  }
  return {
    filename: value.name || "upload",
    type: value.type || "application/octet-stream",
    buffer: Buffer.from(await value.arrayBuffer()),
  };
}

async function readBooking(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const field = (key) => {
      const value = form.get(key);
      return typeof value === "string" ? value : "";
    };
    return {
      name: field("name"),
      phone: field("phone"),
      address: field("address"),
      pkg: field("pkg"),
      date: field("date"),
      time: field("time"),
      notes: field("notes"),
      bookingRef: field("bookingRef"),
      agentPhone: field("agentPhone"),
      customerType: field("customerType"),
      ownerConsent: field("ownerConsent"),
      termsAccepted: field("termsAccepted"),
      company_website: field("company_website"),
      logo: await readUpload(form.get("logo")),
      agentPhoto: await readUpload(form.get("agentPhoto")),
    };
  }
  const body = await request.json();
  return {
    name: body.name || "",
    phone: body.phone || "",
    address: body.address || "",
    pkg: body.pkg || "",
    date: body.date || "",
    time: body.time || "",
    notes: body.notes || "",
    bookingRef: body.bookingRef || "",
    agentPhone: body.agentPhone || "",
    customerType: body.customerType || "",
    ownerConsent: body.ownerConsent || "",
    termsAccepted: body.termsAccepted || "",
    company_website: body.company_website || "",
    logo: null,
    agentPhoto: null,
  };
}

export async function POST(request) {
  if (!rateLimit(`book:${clientIp(request)}`)) {
    return NextResponse.json({ success: false, error: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות." }, { status: 429 });
  }
  let booking;
  try {
    booking = await readBooking(request);
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message || "בקשה לא תקינה" }, { status: err.status || 400 });
  }
  if (cleanText(booking.company_website, 200)) {
    return NextResponse.json({ success: true, ignored: true });
  }
  const name = cleanText(booking.name, 80);
  const phone = cleanPhone(booking.phone);
  const address = cleanText(booking.address, 160);
  const pkg = cleanPackage(booking.pkg) || "FULL";
  const date = cleanText(booking.date, 12);
  const time = cleanText(booking.time, 8);
  const notes = cleanText(booking.notes, 1000);
  const bookingRef = cleanText(booking.bookingRef, 80);
  const agentPhone = cleanPhone(booking.agentPhone);
  const { logo, agentPhoto } = booking;
  const consent = parseBookingConsent(booking);
  if (!consent.ok) {
    return NextResponse.json({ success: false, error: consent.error }, { status: 400 });
  }

  if (!name || !phone) {
    return NextResponse.json({ success: false, error: "שם וטלפון נדרשים" }, { status: 400 });
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
      agentPhone: agentPhone || "",
      logo,
      agentPhoto,
      customerType: consent.customerType,
      customerTypeLabel: consent.customerTypeLabel,
      ownerConsentAt: consent.ownerConsentAt,
      ownerConsentText: consent.ownerConsentText,
    });

    // Create pipeline job server-side (create-job API is admin-only).
    // Maps public form fields into booking + details; agency/property extras stay empty until admin edits.
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
        details: {
          property: {
            street: address || "",
            houseNumber: "",
            apartment: "",
            floor: "",
            city: "",
            propertyType: "",
            rooms: "",
            sqm: "",
          },
          agency: { agencyId: "", agentId: "" },
          client: { name: name || "", phone: phone || "", email: "" },
          shoot: {
            date: date || "",
            time: time || "",
            pkg: pkg || "SIGNATURE",
          },
          notes: notes || "",
          consent: {
            customerType: consent.customerType,
            customerTypeLabel: consent.customerTypeLabel,
            ownerConsent: true,
            ownerConsentAt: consent.ownerConsentAt,
            ownerConsentText: consent.ownerConsentText,
            termsAcceptedAt: consent.termsAcceptedAt,
          },
          branding: {
            agentPhone: agentPhone || "",
            logoFilename: logo?.filename || "",
            agentPhotoFilename: agentPhoto?.filename || "",
          },
        },
      });
    } catch (jobErr) {
      console.error("book-appointment createJob:", jobErr.message);
    }

    const delivered = Boolean(results.calendar || results.email);
    if (!delivered) {
      return NextResponse.json({ success: false, error: results.error || "השליחה נכשלה" }, { status: 502 });
    }
    return NextResponse.json({ success: true, jobId: job?.id || null, ...results });
  } catch (err) {
    console.error("book-appointment error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
