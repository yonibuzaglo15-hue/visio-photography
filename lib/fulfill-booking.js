import { google } from "googleapis";
import nodemailer from "nodemailer";
import twilio from "twilio";

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

export async function fulfillBooking({ name, phone, address, pkg, date, time, notes, bookingRef }) {
  const results = { calendar: null, email: null, whatsapp: null, error: null };
  const displayDate = formatDisplayDate(date);

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS),
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });

    const calendar = google.calendar({ version: "v3", auth });
    const parsed = parseBookingDate(date);
    const [hour, minute] = (time || "09:00").split(":").map(Number);
    const startTime = parsed
      ? new Date(parsed.year, parsed.month - 1, parsed.day, hour, minute)
      : new Date();
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    const event = {
      summary: `📸 VISIO — ${name} · ${pkg}`,
      location: address,
      description: `
לקוח: ${name}
טלפון: ${phone}
כתובת: ${address}
חבילה: VISIO ${pkg}
תשלום: ביום הצילום (מזומן / ביט / העברה)
הערות: ${notes || "אין"}
      `.trim(),
      start: { dateTime: startTime.toISOString(), timeZone: "Asia/Jerusalem" },
      end: { dateTime: endTime.toISOString(), timeZone: "Asia/Jerusalem" },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 60 },
          { method: "popup", minutes: 1440 },
          { method: "email", minutes: 1440 },
        ],
      },
      colorId: "5",
    };

    const created = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
      resource: event,
      sendUpdates: "all",
    });

    results.calendar = created.data.htmlLink;
  } catch (err) {
    console.error("Calendar error:", err.message);
    results.error = `Calendar: ${err.message}`;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_FROM,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const html = `
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; background: #060606; color: #e8dfc8; padding: 24px; border: 1px solid #1e1c14;">
  <h2 style="color: #c9a84c; letter-spacing: 4px; font-family: monospace;">📸 VISIO — הזמנה חדשה ✓</h2>
  <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
    <tr><td style="color:#4a4538; padding:8px 0;">לקוח</td><td style="color:#e8dfc8; font-weight:bold;">${name}</td></tr>
    <tr><td style="color:#4a4538; padding:8px 0;">טלפון</td><td style="color:#e8dfc8;">${phone}</td></tr>
    <tr><td style="color:#4a4538; padding:8px 0;">כתובת</td><td style="color:#e8dfc8;">${address || "—"}</td></tr>
    <tr><td style="color:#4a4538; padding:8px 0;">חבילה</td><td style="color:#c9a84c; font-weight:bold;">VISIO ${pkg}</td></tr>
    <tr><td style="color:#4a4538; padding:8px 0;">תאריך</td><td style="color:#e8dfc8;">${displayDate} בשעה ${time || "—"}</td></tr>
    <tr><td style="color:#4a4538; padding:8px 0;">תשלום</td><td style="color:#c9a84c;">ביום הצילום</td></tr>
    ${notes ? `<tr><td style="color:#4a4538; padding:8px 0;">הערות</td><td style="color:#e8dfc8;">${notes}</td></tr>` : ""}
  </table>
  ${results.calendar ? `<p style="margin-top:20px;"><a href="${results.calendar}" style="color:#c9a84c;">📅 פתח ב-Google Calendar</a></p>` : ""}
  <p style="margin-top:20px; color:#4a4538; font-size:12px;">הצילום שוריין אוטומטית ביומן · VISIO System</p>
</div>`;

    await transporter.sendMail({
      from: `"VISIO System" <${process.env.GMAIL_FROM}>`,
      to: process.env.GMAIL_OWNER,
      subject: `📸 הזמנה חדשה: ${name} · ${displayDate} ${time || ""} · VISIO ${pkg}`,
      html,
    });

    results.email = "sent";
  } catch (err) {
    console.error("Email error:", err.message);
    results.error = (results.error || "") + ` Email: ${err.message}`;
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
        to: `whatsapp:${process.env.OWNER_PHONE}`,
        body: `📸 VISIO — הזמנה חדשה!\n\nלקוח: ${name}\nטלפון: ${phone}\nכתובת: ${address || "—"}\nחבילה: ${pkg}\nתאריך: ${displayDate} ${time || ""}\nתשלום: ביום הצילום`,
      });
      results.whatsapp = "sent";
    } catch (err) {
      console.error("Twilio error:", err.message);
    }
  }

  return results;
}
