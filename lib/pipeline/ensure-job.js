/**
 * Ensure a pipeline job row exists for a tour that already lives on Blob.
 * Needed so PUT /tour can update outputs when the store is memory-only / empty.
 */
import { buildJob } from "./job-factory.js";
import { getJob, saveJob } from "./store.js";

export async function ensureJobForTour(jobId) {
  const existing = await getJob(jobId);
  if (existing) return existing;

  const blobBase =
    process.env.NEXT_PUBLIC_BLOB_BASE_URL ||
    "https://5ltyuhgj5vbqjxug.public.blob.vercel-storage.com";

  const stub = buildJob({
    name: "Tour",
    address: "",
    notes: "auto-stub for blob-backed tour",
  });
  stub.id = jobId;
  stub.status = "ready";
  stub.phase = "b";
  stub.outputs = {
    ...stub.outputs,
    tourUrl: `/tour/${jobId}`,
    tourJsonUrl: `${blobBase}/tours/${jobId}/tour.json`,
  };
  stub.logs = [
    {
      at: new Date().toISOString(),
      agent: "system",
      message: "Stub job created from existing blob tour",
    },
  ];

  return saveJob(stub);
}
