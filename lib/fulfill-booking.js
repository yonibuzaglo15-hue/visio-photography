import { google } from "googleapis";
import nodemailer from "nodemailer";
import twilio from "twilio";
import { escapeHtml } from "./booking/escape.js";

/**
 * Delivers a validated booking to the business.
 *
 * Required env vars (set in Vercel → Project → Settings → Environment Variables):
 *   GOOGLE_CALENDAR_CREDENTIALS  service-account JSON (Calendar API enabled)
 *   GOOGLE_CALENDAR_ID           the business calendar id (e.g. yoni@visioisrael.com),
 *                                shared with the service account ("Make changes to events")
 *   GMAIL_FROM, GMAIL_APP_PASSWORD, GMAIL_OWNER   SMTP sender + app password + owner inbox
 * Optional: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, OWNER_PHONE
 *
 * Never returns raw provider error messages to callers (they are logged server-side only).
 */

const PKG_LABELS = {
  CONSULTATION: "ייעוץ טלפוני",
  PHOTOS: "VISIO Essential",
  PHOTOS_VIDEO: "VISIO Motion",
  FULL: "VISIO Signature",
  INSTAGRAM: "VISIO Social",
};

function parseBookingDate(date) {
  if (!date) return null;
  if (date.includes("-")) {
    const [year, month, day] = date.split("-").map(Number);
    return { day, month, year };
  }
  if (date.includes("/")) {
    const [day, month, year] = date.split("/").map(Number);
    return { day, month, year };
  }
  return null;
}

export function formatDisplayDate(date) {
  const parsed = parseBookingDate(date);
  if (!parsed) return date || "";
  const { day, month, year } = parsed;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** Wall-clock Asia/Jerusalem date+time → RFC3339 local string (Calendar applies timeZone). */
function localDateTime(date, time, addMinutes = 0) {
  const p = parseBookingDate(date);
  const [h, m] = (time || "09:00").split(":").map(Number);
  const total = h * 60 + m + addMinutes;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${hh}:${mm}:00`;
}

export function bookingSummaryLines(b) {
  const lines = [
    ["לקוח", b.name],
    ["טלפון", b.phone],
    ["אימייל", b.email],
    ["כתובת הנכס", b.address],
    ["חבילה", PKG_LABELS[b.pkg] || b.pkg],
    ["תאריך", `${formatDisplayDate(b.date)} ${b.time}`],
    ["תשלום", "בעת ההזמנה (תשלום מקוון טרם הופעל — לתאם מול הלקוח)"],
    ["הערות", b.notes || "—"],
  ];
  if (b.agentPhone) lines.push(["טלפון על התמונות", b.agentPhone]);
  if (b.uploads?.logo) lines.push(["לוגו", b.uploads.logo]);
  if (b.uploads?.agentPhoto) lines.push(["תמונת סוכן", b.uploads.agentPhoto]);
  if (b.uploadNote) lines.push(["קבצים", b.uploadNote]);
  lines.push(["הסכמה לתנאים", `${b.consent.acceptedAt} · גרסת תנאים ${b.consent.termsVersion} · פרטיות ${b.consent.privacyVersion}`]);
  lines.push(["מזהה הזמנה", b.bookingRef]);
  return lines;
}

export async function fulfillBooking(b) {
  const results = { calendar: false, email: false, whatsapp: false, customerEmail: false };
  const lines = bookingSummaryLines(b);
  const subjectDate = `${formatDisplayDate(b.date)} ${b.time}`;

  // 1) Google Calendar
  if (process.env.GOOGLE_CALENDAR_CREDENTIALS) {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS),
        scopes: ["https://www.googleapis.com/auth/calendar.events"],
      });
      const calendar = google.calendar({ version: "v3", auth });
      await calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
        requestBody: {
          summary: `📸 VISIO — ${b.name} · ${PKG_LABELS[b.pkg] || b.pkg}`,
          location: b.address,
          description: lines.map(([k, v]) => `${k}: ${v}`).join("\n"),
          start: { dateTime: localDateTime(b.date, b.time), timeZone: "Asia/Jerusalem" },
          end: { dateTime: localDateTime(b.date, b.time, 120), timeZone: "Asia/Jerusalem" },
          reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "popup", minutes: 1440 }] },
          colorId: "5",
        },
        sendUpdates: "none",
      });
      results.calendar = true;
    } catch (err) {
      console.error("[booking] calendar failed:", err.message);
    }
  } else {
    console.error("[booking] GOOGLE_CALENDAR_CREDENTIALS not set — calendar skipped");
  }

  // 2) Email to owner (+ confirmation to customer)
  if (process.env.GMAIL_FROM && process.env.GMAIL_APP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_FROM, pass: process.env.GMAIL_APP_PASSWORD },
    });
    const rows = lines
      .map(([k, v]) => `<tr><td style="color:#555;padding:6px 0;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:6px 12px 6px 0;color:#111">${escapeHtml(v)}</td></tr>`)
      .join("");
    try {
      await transporter.sendMail({
        from: `"VISIO System" <${process.env.GMAIL_FROM}>`,
        to: process.env.GMAIL_OWNER || process.env.GMAIL_FROM,
        replyTo: b.email,
        subject: `📸 בקשת הזמנה חדשה: ${b.name} · ${subjectDate}`,
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px"><h2>בקשת הזמנה חדשה</h2><table style="border-collapse:collapse">${rows}</table></div>`,
        text: lines.map(([k, v]) => `${k}: ${v}`).join("\n"),
      });
      results.email = true;
    } catch (err) {
      console.error("[booking] owner email failed:", err.message);
    }
    try {
      const custRows = lines.filter(([k]) => !["מזהה הזמנה"].includes(k));
      await transporter.sendMail({
        from: `"VISIO Photography" <${process.env.GMAIL_FROM}>`,
        to: b.email,
        replyTo: process.env.GMAIL_OWNER || process.env.GMAIL_FROM,
        subject: `VISIO Photography — קיבלנו את בקשת ההזמנה (${subjectDate})`,
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#111">
<p>שלום ${escapeHtml(b.name)},</p>
<p>קיבלנו את בקשת ההזמנה שלך. ההזמנה תיכנס לתוקף לאחר שנאשר את המועד מולך.</p>
<table style="border-collapse:collapse">${custRows.map(([k, v]) => `<tr><td style="color:#555;padding:4px 0">${escapeHtml(k)}</td><td style="padding:4px 12px 4px 0">${escapeHtml(v)}</td></tr>`).join("")}</table>
<p>המחירים אינם כוללים מע״מ (18% יתווספו לחשבון). תנאי השירות: https://visioisrael.com/?page=charter · מדיניות הפרטיות: https://visioisrael.com/privacy</p>
<p>VISIO Photography · yoni@visioisrael.com</p></div>`,
      });
      results.customerEmail = true;
    } catch (err) {
      console.error("[booking] customer email failed:", err.message);
    }
  } else {
    console.error("[booking] GMAIL_FROM / GMAIL_APP_PASSWORD not set — email skipped");
  }

  // 3) WhatsApp to owner (optional)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.OWNER_PHONE) {
    try {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
        to: `whatsapp:${process.env.OWNER_PHONE}`,
        body: `📸 VISIO — בקשת הזמנה חדשה\n\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}`.slice(0, 1500),
      });
      results.whatsapp = true;
    } catch (err) {
      console.error("[booking] whatsapp failed:", err.message);
    }
  }

  return results;
}

/** The business was actually notified through at least one channel. */
export function ownerNotified(results) {
  return !!(results.calendar || results.email || results.whatsapp);
}
