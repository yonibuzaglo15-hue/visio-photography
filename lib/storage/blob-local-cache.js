/**
 * Local-first disk cache for Vercel Blob reads in development / Playwright.
 *
 * Enabled when NODE_ENV !== "production" AND VERCEL_ENV !== "production"
 * (or BLOB_LOCAL_CACHE=1). Impossible to enable in production.
 *
 * Goal: each unique Blob URL is downloaded at most once per machine; subsequent
 * editor / public-tour / E2E hits are served from `.data/blob-cache/`.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const CACHE_ROOT = path.join(process.cwd(), ".data", "blob-cache");

const ALLOWED_HOST_SUFFIXES = [
  ".public.blob.vercel-storage.com",
  ".blob.vercel-storage.com",
];

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isBlobLocalCacheEnabled(env = process.env) {
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL_ENV === "production") return false;
  if (env.BLOB_LOCAL_CACHE === "0") return false;
  // Default on in local/dev/test; explicit 1 also enables.
  return true;
}

export function isAllowedBlobHost(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOST_SUFFIXES.some(
      (s) => u.hostname === s.slice(1) || u.hostname.endsWith(s)
    );
  } catch {
    return false;
  }
}

/** Strip cache-bust query so the same asset shares one cache entry. */
export function normalizeBlobUrl(urlString) {
  const u = new URL(urlString);
  u.searchParams.delete("_");
  u.searchParams.delete("t");
  u.searchParams.delete("download");
  u.hash = "";
  return u.toString();
}

function cacheKey(urlString) {
  return crypto.createHash("sha256").update(normalizeBlobUrl(urlString)).digest("hex");
}

function pathsFor(urlString) {
  const key = cacheKey(urlString);
  const dir = path.join(CACHE_ROOT, key.slice(0, 2));
  return {
    key,
    body: path.join(dir, key),
    meta: path.join(dir, `${key}.json`),
  };
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * Read cached bytes if present.
 * @returns {{ buffer: Buffer, contentType: string, fromCache: true } | null}
 */
export function readBlobCache(urlString) {
  if (!isBlobLocalCacheEnabled() || !isAllowedBlobHost(urlString)) return null;
  const { body, meta } = pathsFor(urlString);
  try {
    if (!fs.existsSync(body) || !fs.existsSync(meta)) return null;
    const info = JSON.parse(fs.readFileSync(meta, "utf8"));
    const buffer = fs.readFileSync(body);
    return {
      buffer,
      contentType: info.contentType || "application/octet-stream",
      fromCache: true,
      cachedAt: info.cachedAt || null,
      authoritative: Number(info.authoritativeUntil) > Date.now(),
      url: info.url || normalizeBlobUrl(urlString),
    };
  } catch {
    return null;
  }
}

/**
 * Vercel Blob's CDN ignores query strings and can serve the previous copy of an
 * overwritten file for a while, so a just-published tour.json is kept as the
 * authoritative local copy for this long.
 */
export const AUTHORITATIVE_MS = 5 * 60 * 1000;

/**
 * @param {string} urlString
 * @param {Buffer} buffer
 * @param {string} contentType
 * @param {{ authoritative?: boolean }} [opts] true for content we just uploaded
 */
export function writeBlobCache(urlString, buffer, contentType, opts = {}) {
  if (!isBlobLocalCacheEnabled() || !isAllowedBlobHost(urlString)) return;
  const { body, meta } = pathsFor(urlString);
  try {
    ensureDir(body);
    fs.writeFileSync(body, buffer);
    fs.writeFileSync(
      meta,
      JSON.stringify(
        {
          url: normalizeBlobUrl(urlString),
          contentType: contentType || "application/octet-stream",
          bytes: buffer.length,
          cachedAt: new Date().toISOString(),
          ...(opts.authoritative
            ? { authoritativeUntil: Date.now() + AUTHORITATIVE_MS }
            : {}),
        },
        null,
        2
      )
    );
  } catch (err) {
    console.warn("[blob-local-cache] write failed:", err.message);
  }
}

/**
 * Invalidate one URL (e.g. after publishing a new tour.json).
 */
export function invalidateBlobCache(urlString) {
  if (!urlString || !isAllowedBlobHost(urlString)) return;
  const { body, meta } = pathsFor(urlString);
  try {
    if (fs.existsSync(body)) fs.unlinkSync(body);
    if (fs.existsSync(meta)) fs.unlinkSync(meta);
  } catch {
    /* ignore */
  }
}

function withCacheBust(urlString) {
  const u = new URL(normalizeBlobUrl(urlString));
  u.searchParams.set("_", String(Date.now()));
  return u.toString();
}

/**
 * Fetch Blob URL: local disk first, then network (and populate cache).
 * `networkFirst` is for small mutable files (tour.json): always fetch a
 * cache-busted copy so a save is never read stale from the Blob CDN, and fall
 * back to disk only when the network fails.
 * @param {string} urlString
 * @param {{ forceRefresh?: boolean, networkFirst?: boolean, timeoutMs?: number }} [opts]
 * @returns {Promise<{ buffer: Buffer, contentType: string, fromCache: boolean } | null>}
 */
export async function fetchBlobCached(urlString, opts = {}) {
  if (!urlString) return null;
  const networkFirst = Boolean(opts.networkFirst);
  const forceRefresh = Boolean(opts.forceRefresh) || networkFirst;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  if (!forceRefresh) {
    const hit = readBlobCache(urlString);
    if (hit) return hit;
  } else if (networkFirst) {
    // Our own fresh publish beats a CDN copy that may still be the old one.
    const hit = readBlobCache(urlString);
    if (hit?.authoritative) return hit;
  }

  if (!isAllowedBlobHost(urlString)) {
    // Non-blob URL — plain fetch, no cache.
    try {
      const res = await fetch(urlString, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        buffer,
        contentType: res.headers.get("content-type") || "application/octet-stream",
        fromCache: false,
      };
    } catch {
      return null;
    }
  }

  try {
    const target = networkFirst ? withCacheBust(urlString) : normalizeBlobUrl(urlString);
    const res = await fetch(target, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await res.arrayBuffer());
    writeBlobCache(urlString, buffer, contentType);
    return { buffer, contentType, fromCache: false };
  } catch (err) {
    // Network failed — fall back to stale cache if any.
    const stale = readBlobCache(urlString);
    if (stale) {
      console.warn("[blob-local-cache] network failed, using stale cache:", err.message);
      return stale;
    }
    return null;
  }
}

/**
 * JSON convenience for tour.json (network-first unless told otherwise).
 */
export async function fetchBlobJsonCached(urlString, opts = {}) {
  const hit = await fetchBlobCached(urlString, { networkFirst: true, ...opts });
  if (!hit) return null;
  try {
    return JSON.parse(hit.buffer.toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Same-origin proxy path for browser loads in local/dev (avoids direct Blob hits).
 */
export function localBlobProxyPath(remoteUrl) {
  if (!isBlobLocalCacheEnabled() || !isAllowedBlobHost(remoteUrl)) return remoteUrl;
  return `/api/dev/blob-cache?url=${encodeURIComponent(normalizeBlobUrl(remoteUrl))}`;
}

/**
 * Rewrite panorama / floor-plan URLs inside a tour config for local proxying.
 */
export function rewriteConfigBlobUrls(config) {
  if (!config || !isBlobLocalCacheEnabled()) return config;
  const out = { ...config, scenes: { ...(config.scenes || {}) } };

  for (const [id, scene] of Object.entries(out.scenes)) {
    if (!scene) continue;
    const next = { ...scene };
    if (typeof next.panorama === "string") next.panorama = localBlobProxyPath(next.panorama);
    if (typeof next.panoramaOriginal === "string") {
      next.panoramaOriginal = localBlobProxyPath(next.panoramaOriginal);
    }
    if (next.viewerSizes && typeof next.viewerSizes === "object") {
      const vs = { ...next.viewerSizes };
      for (const k of Object.keys(vs)) {
        if (typeof vs[k] === "string") vs[k] = localBlobProxyPath(vs[k]);
      }
      next.viewerSizes = vs;
    }
    out.scenes[id] = next;
  }

  if (Array.isArray(config.floorPlans)) {
    out.floorPlans = config.floorPlans.map((p) =>
      p && typeof p.url === "string" ? { ...p, url: localBlobProxyPath(p.url) } : p
    );
  }

  return out;
}

/**
 * Rewrite editor scene list + floor plan URLs.
 */
export function rewriteEditorBlobUrls(scenes, floorPlans) {
  if (!isBlobLocalCacheEnabled()) {
    return { scenes, floorPlans };
  }
  const nextScenes = (scenes || []).map((s) => {
    if (!s) return s;
    const out = { ...s };
    if (typeof out.panoramaUrl === "string") out.panoramaUrl = localBlobProxyPath(out.panoramaUrl);
    if (out.viewerSizes && typeof out.viewerSizes === "object") {
      const vs = { ...out.viewerSizes };
      for (const k of Object.keys(vs)) {
        if (typeof vs[k] === "string") vs[k] = localBlobProxyPath(vs[k]);
      }
      out.viewerSizes = vs;
    }
    return out;
  });
  const nextPlans = (floorPlans || []).map((p) =>
    p && typeof p.url === "string" ? { ...p, url: localBlobProxyPath(p.url) } : p
  );
  return { scenes: nextScenes, floorPlans: nextPlans };
}

/** Undo localBlobProxyPath so we never publish proxy URLs to Blob. */
export function unwrapLocalBlobUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("/api/dev/blob-cache")) return url;
  try {
    const abs = url.startsWith("http") ? url : `http://local${url}`;
    const u = new URL(abs);
    const remote = u.searchParams.get("url");
    return remote || url;
  } catch {
    return url;
  }
}

export function unwrapEditorBlobUrls(scenes, floorPlans) {
  const nextScenes = (scenes || []).map((s) => {
    if (!s) return s;
    const out = { ...s };
    if (typeof out.panoramaUrl === "string") out.panoramaUrl = unwrapLocalBlobUrl(out.panoramaUrl);
    if (out.viewerSizes && typeof out.viewerSizes === "object") {
      const vs = { ...out.viewerSizes };
      for (const k of Object.keys(vs)) {
        if (typeof vs[k] === "string") vs[k] = unwrapLocalBlobUrl(vs[k]);
      }
      out.viewerSizes = vs;
    }
    return out;
  });
  const nextPlans = (floorPlans || []).map((p) =>
    p && typeof p.url === "string" ? { ...p, url: unwrapLocalBlobUrl(p.url) } : p
  );
  return { scenes: nextScenes, floorPlans: nextPlans };
}
