/**
 * Fill measure.json for any hosted tour that has a public matterportId
 * and does not have measurements yet.
 *
 *   node tools/measure/sync-missing.mjs
 *
 * Tours without matterportId are listed and left alone. This does not run
 * during `next build` — Matterport has to be reachable, and a failed fetch
 * must not take the site down.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const root = path.resolve("public/tours");
let failed = 0;
for (const slug of fs.readdirSync(root)) {
  const dir = path.join(root, slug);
  const tourPath = path.join(dir, "tour.json");
  if (!fs.existsSync(tourPath)) continue;
  const tour = JSON.parse(fs.readFileSync(tourPath, "utf8"));
  if (!tour.matterportId) {
    console.log(`${slug}: no matterportId — automatic dimensions stay off`);
    continue;
  }
  const measurePath = path.join(dir, "measure.json");
  if (fs.existsSync(measurePath)) {
    console.log(`${slug}: measure.json present`);
    continue;
  }
  const result = spawnSync(process.execPath, ["tools/measure/from-matterport.mjs", dir], { stdio: "inherit" });
  if (result.status !== 0) failed += 1;
}
if (failed) process.exit(1);
