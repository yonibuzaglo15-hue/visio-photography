/**
 * Local-only floor-plan CV via tools/floorplan-cv/assist.py (OpenCV).
 * Never runs on Vercel — requireLocalCv() gates the API.
 */

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ASSIST_PY = path.join(ROOT, "tools/floorplan-cv/assist.py");

export function isLocalCvAvailable() {
  // Production/serverless has no OpenCV worker and must not shell out.
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    // Allow explicit local override for `next start` on a Mac with OpenCV.
    if (process.env.VISIO_LOCAL_CV === "1") return fs.existsSync(ASSIST_PY);
    return false;
  }
  return fs.existsSync(ASSIST_PY);
}

function runPython(args, stdinText = null, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [ASSIST_PY, ...args], {
      cwd: ROOT,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("floorplan-cv timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `python exit ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`bad CV JSON: ${err.message}; stderr=${stderr.slice(0, 200)}`));
      }
    });
    if (stdinText != null) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }
  });
}

async function withTempImage(buffer, fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "visio-cv-"));
  const file = path.join(dir, "plan.jpg");
  try {
    await fs.promises.writeFile(file, buffer);
    return await fn(file);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** @param {Buffer} imageBuffer */
export async function detectPlanDots(imageBuffer) {
  return withTempImage(imageBuffer, (file) => runPython(["detect", file]));
}

/**
 * @param {Buffer} imageBuffer
 * @param {{ id: string, x: number, y: number }[]} positions
 */
export async function suggestPlanLinks(imageBuffer, positions) {
  return withTempImage(imageBuffer, (file) =>
    runPython(["suggest-links", file, "-"], JSON.stringify(positions))
  );
}
