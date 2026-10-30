import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateBooking, normalizeIsraeliPhone, isBookableDate, isBookableSlot, sniffImageType } from "../lib/booking/validate.js";
import { escapeHtml } from "../lib/booking/escape.js";
import { rateLimit, _resetRateLimit, truncateIp } from "../lib/booking/rate-limit.js";

// Monday 2026-10-19 10:00 Asia/Jerusalem (07:00Z)
const NOW = new Date("2026-10-19T07:00:00Z");
const good = { name: "בדיקה טסט", phone: "053-000-0000", email: "test@example.com", address: "רחוב הבדיקה 1, אשדוד", pkg: "FULL", date: "2026-10-20", time: "10:00", notes: "", consentTerms: true };

describe("booking validation", () => {
  it("accepts a valid booking", () => {
    const r = validateBooking(good, NOW);
    expect(r.ok).toBe(true);
    expect(r.data.phone).toBe("0530000000");
  });
  it("requires consent to the terms", () => {
    const r = validateBooking({ ...good, consentTerms: false }, NOW);
    expect(r.ok).toBe(false);
    expect(r.errors.consentTerms).toBeTruthy();
  });
  it("requires a valid email", () => {
    expect(validateBooking({ ...good, email: "nope" }, NOW).errors.email).toBeTruthy();
    expect(validateBooking({ ...good, email: "" }, NOW).errors.email).toBeTruthy();
  });
  it("rejects unknown package, bad phone, long notes", () => {
    const r = validateBooking({ ...good, pkg: "HACK", phone: "123", notes: "x".repeat(1001) }, NOW);
    expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(["pkg", "phone", "notes"]));
  });
  it("rejects past dates, Fri/Sat and past same-day slots", () => {
    expect(isBookableDate("2026-10-18", NOW)).toBe(false);
    expect(isBookableDate("2026-10-23", NOW)).toBe(false); // Friday
    expect(isBookableDate("2026-10-24", NOW)).toBe(false); // Saturday
    expect(isBookableDate("2026-10-19", NOW)).toBe(true);
    expect(isBookableSlot("2026-10-19", "09:00", NOW)).toBe(false);
    expect(isBookableSlot("2026-10-19", "11:00", NOW)).toBe(true);
    expect(isBookableSlot("2026-10-20", "25:00", NOW)).toBe(false);
  });
  it("normalises Israeli phones", () => {
    expect(normalizeIsraeliPhone("+972 53-352-3379")).toBe("0533523379");
    expect(normalizeIsraeliPhone("08-1234567")).toBe("081234567");
    expect(normalizeIsraeliPhone("abc")).toBe(null);
  });
});

describe("escapeHtml", () => {
  it("neutralises markup", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">'&`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;");
  });
});

describe("rate limit", () => {
  beforeEach(() => _resetRateLimit());
  it("blocks the 6th request in the window", () => {
    for (let i = 0; i < 5; i++) expect(rateLimit("k", { now: 1000 + i }).allowed).toBe(true);
    expect(rateLimit("k", { now: 2000 }).allowed).toBe(false);
    expect(rateLimit("k", { now: 1000 + 11 * 60 * 1000 }).allowed).toBe(true);
  });
  it("truncates IPs for the consent record", () => {
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0");
  });
});

describe("sniffImageType", () => {
  it("detects by magic bytes, not extension", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBe(null);
  });
});

// ── Route: never claims success unless the business was notified; no internal errors leak ──
vi.mock("@/lib/fulfill-booking", () => ({
  fulfillBooking: vi.fn(),
  ownerNotified: (r) => !!(r.calendar || r.email || r.whatsapp),
}));
vi.mock("@/lib/pipeline/store.js", () => ({ createJob: vi.fn(async () => ({ id: "job_1" })), getStoreProvider: () => "memory" }));
vi.mock("@/lib/storage/index.js", () => ({ uploadBuffer: vi.fn(), getStorageProvider: () => "none" }));

const { fulfillBooking } = await import("@/lib/fulfill-booking");
const { POST } = await import("../app/api/book-appointment/route.js");

const req = (body, ip = "198.51.100.1") => new Request("http://localhost/api/book-appointment", {
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": ip },
  body: JSON.stringify(body),
});
const future = (() => { const d = new Date(Date.now() + 3 * 86400000); while ([5, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();

describe("POST /api/book-appointment", () => {
  beforeEach(() => { _resetRateLimit(); fulfillBooking.mockReset(); });
  it("returns 502 with a generic message when no channel delivered", async () => {
    fulfillBooking.mockResolvedValue({ calendar: false, email: false, whatsapp: false });
    const res = await POST(req({ ...good, date: future }));
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(JSON.stringify(json)).not.toMatch(/Calendar|SMTP|JSON|Error:/);
  });
  it("returns ok when the owner was notified, and stores the consent record", async () => {
    fulfillBooking.mockResolvedValue({ calendar: false, email: true, whatsapp: false, customerEmail: true });
    const res = await POST(req({ ...good, date: future, termsVersion: "x" }));
    expect(res.status).toBe(200);
    const arg = fulfillBooking.mock.calls[0][0];
    expect(arg.consent.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(arg.consent.termsVersion).toBeTruthy();
  });
  it("rejects without consent (400) and never calls fulfill", async () => {
    const res = await POST(req({ ...good, date: future, consentTerms: false }));
    expect(res.status).toBe(400);
    expect(fulfillBooking).not.toHaveBeenCalled();
  });
  it("rate-limits bursts (429)", async () => {
    fulfillBooking.mockResolvedValue({ email: true });
    for (let i = 0; i < 5; i++) await POST(req({ ...good, date: future }, "192.0.2.9"));
    const res = await POST(req({ ...good, date: future }, "192.0.2.9"));
    expect(res.status).toBe(429);
  });
});
