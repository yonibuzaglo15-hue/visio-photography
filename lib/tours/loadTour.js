import fs from "fs";
import path from "path";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function toursRoot() {
  return path.join(process.cwd(), "public", "tours");
}

export function listTourSlugs() {
  const root = toursRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SLUG_RE.test(entry.name))
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(root, slug, "tour.json")))
    .sort();
}

/**
 * @param {object} tour parsed tour.json
 * @param {string | null} dir absolute folder, or null to skip file checks
 * @param {boolean} checkFiles
 */
export function validateTour(tour, dir, checkFiles = true) {
  const errors = [];
  if (!tour || typeof tour !== "object") return ["tour.json is not an object"];
  if (!Array.isArray(tour.scenes) || tour.scenes.length === 0) {
    errors.push("scenes must be a non-empty array");
    return errors;
  }

  const ids = new Set();
  for (const scene of tour.scenes) {
    if (!scene?.id || typeof scene.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(scene.id)) {
      errors.push(`bad scene id: ${scene?.id}`);
      continue;
    }
    if (ids.has(scene.id)) errors.push(`duplicate scene id: ${scene.id}`);
    ids.add(scene.id);
    if (typeof scene.title !== "string" || !scene.title.trim()) {
      errors.push(`${scene.id} missing title`);
    }
    if (typeof scene.map?.x !== "number" || typeof scene.map?.y !== "number") {
      errors.push(`${scene.id} missing map.x / map.y`);
    }
    if (checkFiles && dir) {
      for (const suffix of ["_m", "_s"]) {
        const file = path.join(dir, "pano", `${scene.id}${suffix}.jpg`);
        if (!fs.existsSync(file)) errors.push(`missing pano/${scene.id}${suffix}.jpg`);
      }
    }
    for (const hotspot of scene.hotspots || []) {
      if (!hotspot?.scene || typeof hotspot.yaw !== "number" || typeof hotspot.pitch !== "number") {
        errors.push(`${scene.id} has a hotspot without scene, yaw, and pitch`);
      }
    }
  }

  for (const scene of tour.scenes) {
    for (const hotspot of scene.hotspots || []) {
      if (hotspot?.scene && !ids.has(hotspot.scene)) {
        errors.push(`${scene.id} hotspot target missing: ${hotspot.scene}`);
      }
    }
  }

  const first = tour.firstScene || tour.scenes[0]?.id;
  if (first && !ids.has(first)) errors.push(`firstScene not found: ${first}`);

  if (checkFiles && dir && tour.plan) {
    if (!fs.existsSync(path.join(dir, tour.plan))) errors.push(`missing plan: ${tour.plan}`);
  }

  return errors;
}

/**
 * Load public/tours/<slug>/tour.json.
 * Returns null for unknown, unsafe, or invalid slugs.
 */
export function loadTour(slug) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return null;
  const dir = path.join(toursRoot(), slug);
  const file = path.join(dir, "tour.json");
  if (!fs.existsSync(file)) return null;

  let tour;
  try {
    tour = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }

  const remote = typeof tour.assetBase === "string" && /^https?:\/\//i.test(tour.assetBase);
  const errors = validateTour(tour, dir, !remote);
  if (errors.length) {
    console.error(`[tours] ${slug} invalid:\n- ${errors.join("\n- ")}`);
    return null;
  }

  return {
    ...tour,
    slug,
    assetBase: remote ? tour.assetBase.replace(/\/$/, "") : `/tours/${slug}`,
  };
}
