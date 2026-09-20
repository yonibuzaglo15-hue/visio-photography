/**
 * Pipeline store facade — swap adapters via PIPELINE_STORE env.
 *   memory   → dev / fallback (default)
 *   supabase → production (PostgreSQL via Supabase)
 */

import * as memoryAdapter from "./adapters/memory.js";
import * as supabaseAdapter from "./adapters/supabase.js";
import { AGENTS } from "../agents/types.js";

function getAdapter() {
  const store = (process.env.PIPELINE_STORE || "").toLowerCase();
  if (store === "supabase" || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return supabaseAdapter;
  }
  return memoryAdapter;
}

const adapter = getAdapter();

export async function createJob(booking = {}) {
  return adapter.createJob(booking);
}

export async function getJob(id) {
  return adapter.getJob(id);
}

export async function findJobByBookingId(bookingId) {
  return adapter.findJobByBookingId(bookingId);
}

export async function listJobs() {
  return adapter.listJobs();
}

export async function updateJob(id, updater) {
  return adapter.updateJob(id, updater);
}

export async function addLog(jobId, agent, message) {
  return updateJob(jobId, (job) => ({
    ...job,
    logs: [...(job.logs || []), { at: new Date().toISOString(), agent, message }],
  }));
}

export async function setAgentState(jobId, agentId, patch) {
  return updateJob(jobId, (job) => ({
    ...job,
    agents: {
      ...job.agents,
      [agentId]: { ...job.agents[agentId], ...patch },
    },
  }));
}

export async function updateOutputs(jobId, patch) {
  return updateJob(jobId, (job) => ({
    ...job,
    outputs: { ...job.outputs, ...patch },
  }));
}

export function getStoreProvider() {
  const store = (process.env.PIPELINE_STORE || "").toLowerCase();
  if (store === "supabase" || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return "supabase";
  }
  return "memory";
}

export { AGENTS };
