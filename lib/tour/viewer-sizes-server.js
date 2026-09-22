/**
 * Server-only: generate viewer-sized panorama JPEGs with sharp.
 */

import sharp from "sharp";
import { uploadBuffer } from "../storage/index.js";

export const VIEWER_SIZES = [
  { key: "4096", width: 4096, height: 2048 },
  { key: "6144", width: 6144, height: 3072 },
];

const JPEG_QUALITY = 85;

/**
 * @param {string} sourceUrl
 * @param {number} width
 * @param {number} height
 * @returns {Promise<{ buffer: Buffer, bytes: number }>}
 */
export async function resizePanoramaJpeg(sourceUrl, width, height) {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Failed to fetch panorama (${res.status})`);
  const input = Buffer.from(await res.arrayBuffer());
  const buffer = await sharp(input)
    .rotate()
    .resize(width, height, { fit: "fill" })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  return { buffer, bytes: buffer.length };
}

/**
 * Ensure 4096 + 6144 viewer copies exist for a scene; upload if missing.
 * @returns {Promise<{ variants: Record<string,string>, sizes: Record<string, number> }>}
 */
export async function ensureViewerCopies(jobId, sceneId, sourceUrl, existing = {}) {
  const out = { ...existing };
  const sizes = {};
  const safeJob = String(jobId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeScene = String(sceneId).replace(/[^a-zA-Z0-9_-]/g, "_");

  for (const { key, width, height } of VIEWER_SIZES) {
    if (out[key] && typeof out[key] === "string") {
      continue;
    }
    const { buffer, bytes } = await resizePanoramaJpeg(sourceUrl, width, height);
    sizes[key] = bytes;
    const path = `tours/${safeJob}/viewer/${safeScene}-${key}.jpg`;
    out[key] = await uploadBuffer(path, buffer, "image/jpeg");
  }

  return { variants: out, sizes };
}
