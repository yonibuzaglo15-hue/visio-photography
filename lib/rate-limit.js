const buckets = new Map();

export function rateLimit(key, limit = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((at) => now - at < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
