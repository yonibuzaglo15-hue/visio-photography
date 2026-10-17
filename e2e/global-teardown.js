/**
 * Runs once after desktop + mobile: restores the pinned baseline through the app
 * API and verifies both the editor's view and the public tour.json.
 */
const fs = require("fs");
const path = require("path");
const {
  apiContext,
  dataSignature,
  getEditorPayload,
  placementsOf,
  putEditorPayload,
  waitForBlobTourJson,
  writeJson,
} = require("./map-probes.js");

const JOB_ID = process.env.E2E_JOB_ID || "job_1790073394855_05316dbc";

const LOCK = path.join(process.cwd(), ".data", "e2e", "run.lock");

module.exports = async function globalTeardown(config) {
  // Only the run that owns the lock may restore (a refused second run must not).
  if (!fs.existsSync(LOCK) || Number(fs.readFileSync(LOCK, "utf8")) !== process.pid) return;
  try {
    await restore(config);
  } finally {
    fs.rmSync(LOCK, { force: true });
  }
};

async function restore(config) {
  const file = path.join(process.cwd(), ".data", "e2e", `${JOB_ID}.json`);
  if (!fs.existsSync(file)) return;
  const pinned = JSON.parse(fs.readFileSync(file, "utf8")).payload;
  const api = await apiContext(config.projects[0].use.baseURL);
  try {
    await putEditorPayload(api, JOB_ID, pinned);
    const viaApp = await getEditorPayload(api, JOB_ID);
    const wantedPublic = JSON.stringify(placementsOf(pinned.scenes.filter((s) => !s.hidden)));
    const { cfg, waitedMs, timedOut } = await waitForBlobTourJson(
      api,
      JOB_ID,
      (c) => JSON.stringify(placementsOf(c)) === wantedPublic
    );
    const result = {
      appStateMatchesBaseline: dataSignature(viaApp) === dataSignature(pinned),
      publicPlacements: placementsOf(cfg),
      publicMatches: !timedOut,
      blobPropagationMs: waitedMs,
    };
    writeJson("restore.json", result);
    if (!result.appStateMatchesBaseline || !result.publicMatches) {
      throw new Error(`restore failed: ${JSON.stringify(result)}`);
    }
  } finally {
    await api.dispose();
  }
}
