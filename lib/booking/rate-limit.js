/**
 * Best-effort in-memory rate limiter (per serverless instance).
 * It stops bursts from one client on a warm instance; it is NOT a global limit.
 * For a hard limit add a Vercel Firewall rate-limit rule on /api/book-appointment.
 */
const buckets = new Map();

export function rateLimit(key, { limit = 5, windowMs = 10 * 60 * 1000, now = Date.now() } = {}) {
  const hit = buckets.get(key);
  if (!hit || now - hit.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now - v.start > windowMs) buckets.delete(k);
    }
    return { allowed: true, remaining: limit - 1 };
  }
  hit.count += 1;
  return { allowed: hit.count <= limit, remaining: Math.max(0, limit - hit.count) };
}

export function clientKey(request) {
  const fwd = request.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Truncated IP for the consent record (keeps evidence without storing the full address). */
export function truncateIp(ip) {
  if (!ip || ip === "unknown") return "";
  if (ip.includes(".")) return ip.split(".").slice(0, 3).join(".") + ".0";
  return ip.split(":").slice(0, 3).join(":") + "::";
}

export function _resetRateLimit() { buckets.clear(); }
