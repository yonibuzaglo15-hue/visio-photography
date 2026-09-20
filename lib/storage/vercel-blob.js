/**
 * Vercel Blob Storage — production provider.
 * Requires: BLOB_READ_WRITE_TOKEN
 *
 * Paths:
 *   uploads/{jobId}/{filename}
 *   tours/{jobId}/index.html
 *   tours/{jobId}/tour.json
 */

import { put } from "@vercel/blob";

const LOG_PREFIX = "[vercel-blob]";

function getToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(`${LOG_PREFIX} BLOB_READ_WRITE_TOKEN is required`);
  }
  return token;
}

/** Normalize pathname — no leading slash, no traversal */
export function normalizePath(pathname) {
  const clean = pathname
    .replace(/^\/+/, "")
    .replace(/\.\./g, "")
    .replace(/\/+/g, "/");
  if (!clean) throw new Error(`${LOG_PREFIX} Invalid empty pathname`);
  return clean;
}

/**
 * Upload a buffer to Vercel Blob.
 * @returns {Promise<string>} Public URL
 */
export async function uploadBuffer(pathname, buffer, contentType) {
  const path = normalizePath(pathname);
  const token = getToken();

  try {
    const blob = await put(path, buffer, {
      access: "public",
      contentType,
      token,
      addRandomSuffix: false,
    });

    console.info(`${LOG_PREFIX} uploadBuffer`, { path, bytes: buffer.length, url: blob.url });
    return blob.url;
  } catch (err) {
    console.error(`${LOG_PREFIX} uploadBuffer FAILED`, { path, error: err.message });
    throw new Error(`${LOG_PREFIX} Upload failed for ${path}: ${err.message}`);
  }
}

export async function uploadText(pathname, text, contentType = "text/plain; charset=utf-8") {
  return uploadBuffer(pathname, Buffer.from(text, "utf8"), contentType);
}

export async function uploadFromUrl(pathname, sourceUrl) {
  const path = normalizePath(pathname);

  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${sourceUrl}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    return uploadBuffer(path, buf, contentType);
  } catch (err) {
    console.error(`${LOG_PREFIX} uploadFromUrl FAILED`, { path, sourceUrl, error: err.message });
    throw new Error(`${LOG_PREFIX} uploadFromUrl failed: ${err.message}`);
  }
}
