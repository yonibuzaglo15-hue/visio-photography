/**
 * Cloud storage facade.
 * STORAGE_PROVIDER: vercel-blob (default when BLOB_READ_WRITE_TOKEN set) | supabase
 */

import * as vercelBlob from "./vercel-blob.js";
import * as supabaseStorage from "./supabase.js";

function getProvider() {
  const explicit = (process.env.STORAGE_PROVIDER || "").toLowerCase();
  if (explicit === "supabase") return supabaseStorage;
  if (explicit === "vercel-blob") return vercelBlob;
  if (process.env.BLOB_READ_WRITE_TOKEN) return vercelBlob;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return supabaseStorage;
  return null;
}

export function getStorageProvider() {
  if ((process.env.STORAGE_PROVIDER || "").toLowerCase() === "supabase") return "supabase";
  if ((process.env.STORAGE_PROVIDER || "").toLowerCase() === "vercel-blob") return "vercel-blob";
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel-blob";
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  return "none";
}

export async function uploadBuffer(pathname, buffer, contentType) {
  const provider = getProvider();
  if (!provider) {
    throw new Error("No cloud storage configured. Set BLOB_READ_WRITE_TOKEN or Supabase storage env vars.");
  }
  return provider.uploadBuffer(pathname, buffer, contentType);
}

export async function uploadText(pathname, text, contentType) {
  const provider = getProvider();
  if (!provider) throw new Error("No cloud storage configured.");
  return provider.uploadText(pathname, text, contentType);
}

export async function uploadFromUrl(pathname, sourceUrl) {
  const provider = getProvider();
  if (!provider) throw new Error("No cloud storage configured.");
  return provider.uploadFromUrl(pathname, sourceUrl);
}

/** Upload a user file — returns public URL */
export async function uploadAsset(jobId, filename, buffer, contentType) {
  const safe = filename.replace(/[^a-zA-Z0-9._\u0590-\u05FF-]/g, "_");
  return uploadBuffer(`uploads/${jobId}/${safe}`, buffer, contentType);
}

/** Upload tour artifacts to tours/{jobId}/ */
export async function uploadTourFile(jobId, filename, content) {
  const safeJobId = String(jobId).replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeFile = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `tours/${safeJobId}/${safeFile}`;
  const isHtml = safeFile.endsWith(".html");
  if (Buffer.isBuffer(content)) {
    return uploadBuffer(pathname, content, isHtml ? "text/html; charset=utf-8" : "application/json");
  }
  return uploadText(pathname, content, isHtml ? "text/html; charset=utf-8" : "application/json");
}
