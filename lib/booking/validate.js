/**
 * Server-side validation for the public booking form.
 * Pure functions (no I/O) so they are unit-tested in tests/booking.test.js.
 */

export const PACKAGE_IDS = ["CONSULTATION", "PHOTOS", "PHOTOS_VIDEO", "FULL", "INSTAGRAM"];
export const SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

export const LIMITS = { name: 80, phone: 20, email: 120, address: 160, notes: 1000, agentPhone: 20 };

/** Upload limits (client + server). Vercel functions accept ~4.5MB bodies, so keep the total below that. */
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];

const clean = (v) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

/** Israeli phone: 0X-XXXXXXX / 05X-XXXXXXX / +972..., digits only after normalising. */
export function normalizeIsraeliPhone(raw) {
  let d = String(raw || "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+972")) d = "0" + d.slice(4);
  else if (d.startsWith("972")) d = "0" + d.slice(3);
  return /^0\d{8,9}$/.test(d) ? d : null;
}

export function isValidEmail(raw) {
  const e = String(raw || "").trim();
  return e.length <= LIMITS.email && /^[^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,}$/.test(e);
}

/** YYYY-MM-DD, not in the past (Asia/Jerusalem), not Friday/Saturday, within 365 days. */
export function isBookableDate(date, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  const todayIL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now); // YYYY-MM-DD
  if (date < todayIL) return false;
  const dow = dt.getUTCDay();
  if (dow === 5 || dow === 6) return false;
  const max = new Date(now.getTime() + 365 * 86400000);
  return dt <= max;
}

/** Same-day slots must be in the future (Asia/Jerusalem). */
export function isBookableSlot(date, time, now = new Date()) {
  if (!SLOTS.includes(time)) return false;
  const todayIL = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
  if (date !== todayIL) return true;
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return time > hhmm;
}

/**
 * @returns {{ ok: true, data: object } | { ok: false, errors: Record<string,string> }}
 */
export function validateBooking(input, now = new Date()) {
  const errors = {};
  const data = {
    name: clean(input.name),
    phone: clean(input.phone),
    email: clean(input.email).toLowerCase(),
    address: clean(input.address),
    pkg: clean(input.pkg),
    date: clean(input.date),
    time: clean(input.time),
    notes: clean(input.notes),
    agentPhone: clean(input.agentPhone),
    wantAgentPhoto: input.wantAgentPhoto === true || input.wantAgentPhoto === "true",
    consentTerms: input.consentTerms === true || input.consentTerms === "true",
    termsVersion: clean(input.termsVersion),
  };

  if (!data.name || data.name.length < 2 || data.name.length > LIMITS.name) errors.name = "יש להזין שם מלא";
  const phone = normalizeIsraeliPhone(data.phone);
  if (!phone) errors.phone = "יש להזין מספר טלפון ישראלי תקין";
  else data.phone = phone;
  if (!isValidEmail(data.email)) errors.email = "יש להזין כתובת אימייל תקינה";
  if (!data.address || data.address.length < 3 || data.address.length > LIMITS.address) errors.address = "יש להזין את כתובת הנכס";
  if (!PACKAGE_IDS.includes(data.pkg)) errors.pkg = "חבילה לא תקינה";
  if (!isBookableDate(data.date, now)) errors.date = "יש לבחור תאריך פנוי";
  else if (!isBookableSlot(data.date, data.time, now)) errors.time = "יש לבחור שעה פנויה";
  if (data.notes.length > LIMITS.notes) errors.notes = `עד ${LIMITS.notes} תווים`;
  if (data.agentPhone) {
    const ap = normalizeIsraeliPhone(data.agentPhone);
    if (!ap) errors.agentPhone = "מספר הטלפון שיופיע על התמונות אינו תקין";
    else data.agentPhone = ap;
  }
  if (!data.consentTerms) errors.consentTerms = "יש לאשר את תנאי השירות ומדיניות הפרטיות";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

/** Detect real image type from magic bytes (do not trust the browser's MIME). */
export function sniffImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
