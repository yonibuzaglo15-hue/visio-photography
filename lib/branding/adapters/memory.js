import { buildBrandingJob } from "../job-factory.js";

const GLOBAL_KEY = "__visio_branding_jobs";

function getMap() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new Map();
  }
  return globalThis[GLOBAL_KEY];
}

export async function createJob(input) {
  const job = buildBrandingJob(input);
  getMap().set(job.id, job);
  return job;
}

export async function getJob(id) {
  return getMap().get(id) || null;
}

export async function listJobs() {
  return Array.from(getMap().values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

export async function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  getMap().set(job.id, job);
  return job;
}

export async function updateJob(id, updater) {
  const current = await getJob(id);
  if (!current) return null;
  const updated = typeof updater === "function" ? updater({ ...current }) : { ...current, ...updater };
  return saveJob(updated);
}
