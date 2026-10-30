import fs from "fs";
import path from "path";
import { calibrateFloorModel } from "../tour/measure.js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function toursRoot() {
  return path.join(process.cwd(), "public", "tours");
}

function folderSlugs() {
  const root = toursRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SLUG_RE.test(entry.name))
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(root, slug, "tour.json")));
}

function readTourJson(slug) {
  try {
    return JSON.parse(fs.readFileSync(path.join(toursRoot(), slug, "tour.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Extra URLs declared as `aliases` in a tour folder. They do not get their own files. */
function aliasIndex(folders) {
  const index = new Map();
  for (const folder of folders) {
    const tour = readTourJson(folder);
    if (!Array.isArray(tour?.aliases)) continue;
    for (const alias of tour.aliases) {
      if (typeof alias !== "string" || !SLUG_RE.test(alias) || alias === folder || index.has(alias)) continue;
      if (folders.includes(alias)) continue;
      index.set(alias, folder);
    }
  }
  return index;
}

export function listTourSlugs() {
  const folders = folderSlugs();
  return [...folders, ...aliasIndex(folders).keys()].sort();
}

/** Folder that owns this URL. An alias resolves to the tour it names. */
export function canonicalTourSlug(slug) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return null;
  const folders = folderSlugs();
  if (folders.includes(slug)) return slug;
  return aliasIndex(folders).get(slug) || null;
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

function jpegSize(file) {
  let b;
  try {
    b = fs.readFileSync(file);
  } catch {
    return null;
  }
  let i = 2;
  while (i < b.length - 8) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    const size = b.readUInt16BE(i + 2);
    if (size < 2) return null;
    i += 2 + size;
  }
  return null;
}

/** Authored Matterport walls/poses, when the folder has measure.json. */
function readMeasureFile(dir) {
  const file = path.join(dir, "measure.json");
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || (data.mode !== "surfaces" && data.mode !== "floor")) return null;
    if (!data.scenes || typeof data.scenes !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Load public/tours/<slug>/tour.json.
 * Returns null for unknown, unsafe, or invalid slugs.
 */
export function loadTour(slug) {
  const canonical = canonicalTourSlug(slug);
  if (!canonical) return null;
  const dir = path.join(toursRoot(), canonical);
  const tour = readTourJson(canonical);
  if (!tour) return null;

  const remote = typeof tour.assetBase === "string" && /^https?:\/\//i.test(tour.assetBase);
  const errors = validateTour(tour, dir, !remote);
  if (errors.length) {
    console.error(`[tours] ${canonical} invalid:\n- ${errors.join("\n- ")}`);
    return null;
  }

  let measure = readMeasureFile(dir);
  if (!measure && tour.plan && !remote) {
    const size = jpegSize(path.join(dir, tour.plan));
    if (size) measure = calibrateFloorModel(tour, size.width, size.height);
  }

  return {
    ...tour,
    slug: canonical,
    assetBase: remote ? tour.assetBase.replace(/\/$/, "") : `/tours/${canonical}`,
    measure: measure || null,
  };
}
