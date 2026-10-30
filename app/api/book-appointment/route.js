import crypto from "crypto";
import { NextResponse } from "next/server";
import { fulfillBooking, ownerNotified } from "@/lib/fulfill-booking";
import { createJob, getStoreProvider } from "@/lib/pipeline/store.js";
import { uploadBuffer, getStorageProvider } from "@/lib/storage/index.js";
import { validateBooking, sniffImageType, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from "@/lib/booking/validate.js";
import { rateLimit, clientKey, truncateIp } from "@/lib/booking/rate-limit.js";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal/versions.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_ERROR = "לא הצלחנו לקלוט את ההזמנה כרגע. אפשר לנסות שוב בעוד כמה דקות או לפנות אלינו ב-WhatsApp.";

function fail(status, error, extra = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

async function readUpload(file, kind) {
  if (!file || typeof file === "string" || !file.size) return { file: null };
  if (file.size > UPLOAD_MAX_BYTES) return { error: `הקובץ (${kind}) גדול מ-2MB` };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(buf);
  if (!type || !UPLOAD_TYPES.includes(type)) return { error: `הקובץ (${kind}) חייב להיות JPG, PNG או WebP` };
  return { file: { buf, type } };
}

export async function POST(request) {
  const ip = clientKey(request);
  const rl = rateLimit(`book:${ip}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) return fail(429, "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.");

  let fields = {};
  let form = null;
  const ct = request.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      form = await request.formData();
      for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
    } else {
      fields = await request.json();
    }
  } catch {
    return fail(400, "הבקשה אינה תקינה");
  }

  // Honeypot: real users never fill this hidden field.
  if (fields.website) return NextResponse.json({ ok: true, delivered: true });

  const v = validateBooking(fields);
  if (!v.ok) return fail(400, "יש לתקן את השדות המסומנים", { fields: v.errors });
  const data = v.data;

  // Optional branding files → existing storage (Vercel Blob) under an unguessable path.
  const uploads = {};
  let uploadNote = "";
  if (form) {
    const logo = await readUpload(form.get("logo"), "לוגו");
    const photo = await readUpload(form.get("agentPhoto"), "תמונת סוכן");
    const bad = logo.error || photo.error;
    if (bad) return fail(400, bad, { fields: { upload: bad } });
    const files = [["logo", logo.file], ["agentPhoto", photo.file]].filter(([, f]) => f);
    if (files.length) {
      if (getStorageProvider() === "none") {
        uploadNote = "הלקוח צירף קבצים אך אין אחסון מוגדר — יש לבקש את הקבצים ב-WhatsApp";
      } else {
        const folder = `booking-uploads/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}`;
        for (const [key, f] of files) {
          const ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
          try {
            uploads[key] = await uploadBuffer(`${folder}/${key}.${ext}`, f.buf, f.type);
          } catch (err) {
            console.error("[booking] upload failed:", err.message);
            uploadNote = "העלאת קובץ נכשלה — יש לבקש את הקבצים מהלקוח ב-WhatsApp";
          }
        }
      }
    }
  }

  const bookingRef = `booking-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const booking = {
    ...data,
    bookingRef,
    uploads,
    uploadNote,
    consent: {
      acceptedAt: new Date().toISOString(),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      clientTermsVersion: data.termsVersion || null,
      ip: truncateIp(ip),
      userAgent: (request.headers.get("user-agent") || "").slice(0, 200),
    },
  };

  let results;
  try {
    results = await fulfillBooking(booking);
  } catch (err) {
    console.error("[booking] fulfill crashed:", err.message);
    return fail(502, GENERIC_ERROR);
  }

  // Consent record + booking copy. Persistent only when a real store is configured
  // (Supabase); the in-memory adapter is lost when the function instance recycles.
  try {
    await createJob({
      bookingId: bookingRef,
      name: booking.name,
      phone: booking.phone,
      address: booking.address,
      pkg: booking.pkg,
      date: booking.date,
      time: booking.time,
      notes: booking.notes,
      details: {
        property: { street: booking.address, houseNumber: "", apartment: "", floor: "", city: "", propertyType: "", rooms: "", sqm: "" },
        agency: { agencyId: "", agentId: "" },
        client: { name: booking.name, phone: booking.phone, email: booking.email },
        shoot: { date: booking.date, time: booking.time, pkg: booking.pkg },
        branding: { agentPhone: booking.agentPhone, wantAgentPhoto: booking.wantAgentPhoto, ...uploads },
        consent: booking.consent,
        notes: booking.notes,
      },
    });
  } catch (err) {
    console.error("[booking] createJob failed:", err.message);
  }

  if (!ownerNotified(results)) {
    console.error("[booking] NOT DELIVERED — no channel succeeded", { bookingRef, store: getStoreProvider() });
    return fail(502, GENERIC_ERROR);
  }

  return NextResponse.json({ ok: true, delivered: true, bookingRef, customerEmail: results.customerEmail });
}
