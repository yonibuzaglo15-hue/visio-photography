/**
 * Branding job store — separate from pipeline_jobs / Make.com.
 * Prefers Supabase when configured; otherwise in-memory (dev).
 */

import * as memoryAdapter from "./adapters/memory.js";
import * as supabaseAdapter from "./adapters/supabase.js";

function getAdapter() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return supabaseAdapter;
  }
  return memoryAdapter;
}

export async function createBrandingJob(input) {
  return getAdapter().createJob(input);
}

export async function getBrandingJob(id) {
  return getAdapter().getJob(id);
}

export async function listBrandingJobs() {
  return getAdapter().listJobs();
}

export async function updateBrandingJob(id, updater) {
  return getAdapter().updateJob(id, updater);
}

export function getBrandingStoreKind() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return "supabase";
  return "memory";
}
