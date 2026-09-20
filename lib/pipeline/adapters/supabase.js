import { createClient } from "@supabase/supabase-js";

let _client = null;

/**
 * Singleton Supabase admin client (service role).
 */
export function getSupabaseClient() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}

const TABLE = "pipeline_jobs";

function log(op, detail) {
  console.info(`[supabase-store] ${op}`, detail ?? "");
}

function logError(op, err) {
  console.error(`[supabase-store] ${op} FAILED:`, err?.message || err);
}

function wrapError(op, err) {
  logError(op, err);
  throw new Error(`[supabase-store] ${op}: ${err?.message || err}`);
}

export async function createJob(booking) {
  const { buildJob } = await import("../job-factory.js");
  const job = buildJob(booking);

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        id: job.id,
        booking_id: job.bookingId,
        status: job.status,
        data: job,
      })
      .select("data")
      .single();

    if (error) wrapError("createJob", error);
    log("createJob", { id: job.id, bookingId: job.bookingId });
    return data?.data ?? job;
  } catch (err) {
    if (err.message?.startsWith("[supabase-store]")) throw err;
    wrapError("createJob", err);
  }
}

export async function getJob(id) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .eq("id", id)
      .maybeSingle();

    if (error) wrapError("getJob", error);
    log("getJob", { id, found: !!data });
    return data?.data ?? null;
  } catch (err) {
    if (err.message?.startsWith("[supabase-store]")) throw err;
    wrapError("getJob", err);
  }
}

export async function findJobByBookingId(bookingId) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .or(`id.eq.${bookingId},booking_id.eq.${bookingId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) wrapError("findJobByBookingId", error);
    log("findJobByBookingId", { bookingId, found: !!data });
    return data?.data ?? null;
  } catch (err) {
    if (err.message?.startsWith("[supabase-store]")) throw err;
    wrapError("findJobByBookingId", err);
  }
}

export async function listJobs() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .order("created_at", { ascending: false });

    if (error) wrapError("listJobs", error);
    log("listJobs", { count: data?.length ?? 0 });
    return (data || []).map((row) => row.data);
  } catch (err) {
    if (err.message?.startsWith("[supabase-store]")) throw err;
    wrapError("listJobs", err);
  }
}

export async function saveJob(job) {
  job.updatedAt = new Date().toISOString();

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        booking_id: job.bookingId,
        status: job.status,
        data: job,
        updated_at: job.updatedAt,
      })
      .eq("id", job.id)
      .select("data")
      .single();

    if (error) wrapError("saveJob", error);
    log("saveJob", { id: job.id, status: job.status });
    return data?.data ?? job;
  } catch (err) {
    if (err.message?.startsWith("[supabase-store]")) throw err;
    wrapError("saveJob", err);
  }
}

export async function updateJob(id, updater) {
  try {
    const current = await getJob(id);
    if (!current) {
      log("updateJob", { id, found: false });
      return null;
    }
    const updated =
      typeof updater === "function" ? updater(current) : { ...current, ...updater };
    return saveJob(updated);
  } catch (err) {
    if (err.message?.startsWith("[supabase-store]")) throw err;
    wrapError("updateJob", err);
  }
}
