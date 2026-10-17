/**
 * Runs once before desktop + mobile: verifies the job still matches the pinned
 * baseline (refuses to run otherwise — no writes) and records it for teardown.
 */
const fs = require("fs");
const path = require("path");
const { apiContext, loadPinnedBaseline, placementsOf, writeJson } = require("./map-probes.js");

const JOB_ID = process.env.E2E_JOB_ID || "job_1790073394855_05316dbc";

const LOCK = path.join(process.cwd(), ".data", "e2e", "run.lock");

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

module.exports = async function globalSetup(config) {
  // One suite at a time: two runs writing the same job would fight over saves.
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  if (fs.existsSync(LOCK)) {
    const pid = Number(fs.readFileSync(LOCK, "utf8"));
    if (pid && pid !== process.pid && alive(pid)) {
      throw new Error(`Another acceptance run (pid ${pid}) is using ${JOB_ID}; refusing to start.`);
    }
  }
  fs.writeFileSync(LOCK, String(process.pid));
  const baseURL = config.projects[0].use.baseURL;
  const api = await apiContext(baseURL);
  try {
    const baseline = await loadPinnedBaseline(api, JOB_ID);
    fs.mkdirSync(path.join(process.cwd(), "test-output", "acceptance"), { recursive: true });
    writeJson("baseline.json", {
      source: baseline.source,
      scenes: baseline.payload.scenes.length,
      placements: placementsOf(baseline.payload.scenes),
      hotspots: baseline.payload.scenes.reduce((n, s) => n + (s.hotSpots || []).length, 0),
      hidden: baseline.payload.scenes.filter((s) => s.hidden).map((s) => s.id),
    });
  } finally {
    await api.dispose();
  }
};
