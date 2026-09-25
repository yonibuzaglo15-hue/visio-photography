/**
 * Read the latest saved tour for the editor.
 *
 * The editor does read → modify → write. Reading the overwritten tours/{id}/tour.json
 * through the Blob CDN can return the previous save for up to ~a minute; saving on
 * top of that silently discards the newer work. Every save therefore also writes an
 * immutable version file, and the editor always loads the newest one.
 */

import { listTourVersions } from "../storage/index.js";
import { fetchBlobJsonCached } from "../storage/blob-local-cache.js";

/** Newest version id (Blob pathname) or null for tours saved before versioning. */
export async function currentTourVersion(jobId) {
  const [latest] = await listTourVersions(jobId);
  return latest?.version || null;
}

/**
 * @param {string} jobId
 * @param {string|null} legacyTourJsonUrl used only when no version exists yet
 * @returns {Promise<{ config: object|null, version: string|null }>}
 */
export async function loadLatestTour(jobId, legacyTourJsonUrl) {
  const [latest] = await listTourVersions(jobId);
  if (latest) {
    // Immutable path — safe to serve from the local disk cache in dev.
    const config = await fetchBlobJsonCached(latest.url, { networkFirst: false, timeoutMs: 20_000 });
    if (config) return { config, version: latest.version };
  }
  if (!legacyTourJsonUrl) return { config: null, version: null };
  return {
    config: await fetchBlobJsonCached(legacyTourJsonUrl, { timeoutMs: 20_000 }),
    version: null,
  };
}
