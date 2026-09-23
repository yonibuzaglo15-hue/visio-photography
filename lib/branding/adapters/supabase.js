import { getSupabaseClient } from "@/lib/pipeline/adapters/supabase.js";
import { buildBrandingJob } from "../job-factory.js";

const TABLE = "branding_jobs";

function log(op, detail) {
  console.info(`[branding-supabase] ${op}`, detail ?? "");
}

function wrapError(op, err) {
  console.error(`[branding-supabase] ${op} FAILED:`, err?.message || err);
  throw new Error(`[branding-supabase] ${op}: ${err?.message || err}`);
}

function rowToJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    city: row.city || "",
    street: row.street || "",
    agencyId: row.agency_id || "",
    agentId: row.agent_id || "",
    title: row.title || "",
    propertyType: row.property_type || "",
    notes: row.notes || "",
    createdBy: row.created_by || null,
    originals: row.originals || [],
    outputs: row.outputs || [],
    error: row.error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function jobToRow(job) {
  return {
    id: job.id,
    status: job.status,
    city: job.city,
    street: job.street,
    agency_id: job.agencyId,
    agent_id: job.agentId,
    title: job.title || null,
    property_type: job.propertyType || null,
    notes: job.notes || null,
    created_by: job.createdBy || null,
    originals: job.originals || [],
    outputs: job.outputs || [],
    error: job.error || null,
    data: {},
    updated_at: new Date().toISOString(),
  };
}

export async function createJob(input) {
  const job = buildBrandingJob(input);
  try {
    const supabase = getSupabaseClient();
    const row = {
      ...jobToRow(job),
      created_at: job.createdAt,
    };
    const { data, error } = await supabase.from(TABLE).insert(row).select("*").single();
    if (error) wrapError("createJob", error);
    log("createJob", { id: data.id });
    return rowToJob(data);
  } catch (err) {
    if (err.message?.startsWith("[branding-supabase]")) throw err;
    wrapError("createJob", err);
  }
}

export async function getJob(id) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) wrapError("getJob", error);
    return rowToJob(data);
  } catch (err) {
    if (err.message?.startsWith("[branding-supabase]")) throw err;
    wrapError("getJob", err);
  }
}

export async function listJobs() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) wrapError("listJobs", error);
    log("listJobs", { count: data?.length ?? 0 });
    return (data || []).map(rowToJob);
  } catch (err) {
    if (err.message?.startsWith("[branding-supabase]")) throw err;
    wrapError("listJobs", err);
  }
}

export async function saveJob(job) {
  try {
    const supabase = getSupabaseClient();
    const row = jobToRow(job);
    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq("id", job.id)
      .select("*")
      .single();
    if (error) wrapError("saveJob", error);
    return rowToJob(data);
  } catch (err) {
    if (err.message?.startsWith("[branding-supabase]")) throw err;
    wrapError("saveJob", err);
  }
}

export async function updateJob(id, updater) {
  const current = await getJob(id);
  if (!current) return null;
  const updated = typeof updater === "function" ? updater({ ...current }) : { ...current, ...updater };
  return saveJob(updated);
}
