/**
 * Build a self-hosted VISIO tour from a public Matterport model.
 *
 *   node tools/tours/from-matterport.mjs eshkolit-3
 *   node tools/tours/from-matterport.mjs --all
 *
 * Writes public/tours/<slug>/ with tour.json, plan.jpg, pano/<id>_m.jpg,
 * pano/<id>_s.jpg and measure.json. Panorama yaw 0 is the skybox front face,
 * so the GraphQL sweep quaternion is the pose (the same frame the viewer uses).
 * Room names are Matterport's room class, in Hebrew. Width, depth and ceiling
 * in measure.json are Matterport's published numbers only.
 *
 * Already-written panorama files are kept, so a stopped run can continue.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { equirectFromSkyboxes } from "../../lib/tour/skybox.js";
import { wallsFromFloors } from "../../lib/tour/matterport-walls.js";
import { buildRoomRecords } from "../../lib/tour/room-dims.js";
import { PLAN_MODES, buildTourScenes, measureScenesFromTour, projectToPlan } from "../../lib/tour/tour-build.js";

const ROOT = path.resolve("public/tours");
const NOTE = "הסיור מבוסס על צילומי 360° ונועד להתרשמות בלבד. כלי המדידה נותן הערכה בלבד (רצפה וקירות, בלי רהיטים) ואינו מחליף מדידה מקצועית – לפרטים מדויקים יש לפנות למתווך.\nלחצו על העיגולים ברצפה כדי לעבור בין נקודות.";

export const JOBS = [
  { model: "eo6fpaEEiA9", slug: "eshkolit-3", title: "דירה · אשדוד", location: "האשכולית 3" },
  { model: "idnfQzzt684", slug: "cheshvan-7", title: "דירה · אשדוד", location: "חשוון 7" },
  { model: "JN6a8HHqRpX", slug: "agnon-21", title: "דירה · אשקלון", location: "שי עגנון 21" },
  { model: "mDADwNnNKtD", slug: "nahal-snir-9", title: "דירה · אשדוד", location: "נחל שניר 9" },
  { model: "g1C8Upb3G6q", slug: "shevet-levi-1", title: "דירה · אשדוד", location: "שבט לוי 1" },
  { model: "AF18oBWVfrm", slug: "haptel-17", title: "דירה · יבנה", location: "הפטל 17" },
  { model: "mWxuq2zaKdZ", slug: "haeshkol-8", title: "דירה · אשדוד", location: "האשכול 8" },
  { model: "9YJGFmX8KbJ", slug: "balfour-7", title: "דירה · אשדוד", location: "בלפור 7" },
  { model: "so6PszZrxgx", slug: "keren-hayesod-43", title: "פנטהאוז · אשדוד", location: "קרן היסוד 43" },
  { model: "ooDYEMx6TCr", slug: "dekel-72", title: "וילה · אשדוד", location: "דקר 72" },
];

const SNAPSHOT_CLASS = [
  ["living room", "Living Room"],
  ["dining room", "Dining Room"],
  ["bedroom", "Bedroom"],
  ["bathroom", "Bathroom"],
  ["kitchen", "Kitchen"],
  ["hallway", "Hallway"],
  ["office", "Office"],
  ["laundry", "Laundry"],
  ["closet", "Closet"],
  ["patio", "Patio"],
  ["balcony", "Balcony"],
  ["garage", "Garage"],
  ["stairs", "Stairs"],
];

function argJobs() {
  const args = process.argv.slice(2);
  if (args.includes("--all") || args.length === 0) return JOBS;
  return args.filter((arg) => !arg.startsWith("--")).map((slug) => {
    const job = JOBS.find((item) => item.slug === slug || item.model === slug);
    if (!job) throw new Error(`Unknown tour ${slug}. Known: ${JOBS.map((item) => item.slug).join(", ")}`);
    return job;
  });
}

async function graphql(modelId, query) {
  const response = await fetch("https://my.matterport.com/api/mp/models/graph", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://my.matterport.com",
      Referer: `https://my.matterport.com/show/?m=${modelId}`,
    },
    body: JSON.stringify({ query, variables: { id: modelId } }),
  });
  if (!response.ok) throw new Error(`Matterport graph HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
  return body.data.model;
}

async function fetchBuf(url, attempt = 0) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      return fetchBuf(url, attempt + 1);
    }
    throw new Error(`Download ${error.message} ${url.slice(0, 90)}`);
  }
}

const MODEL_QUERY = `query ($id: ID!) {
  model(id: $id) {
    name
    locations {
      id index
      position { x y z }
      floor { id sequence }
      pano {
        sweepUuid
        position { x y z }
        rotation { x y z w }
        skyboxes { resolution urlTemplate status }
      }
    }
    rooms {
      id keywords
      classifications { label }
      dimensionEstimates { area width depth height units }
      ceiling { maxHeight }
      boundary { edges { thickness vertices { position { x y } } } }
    }
    floors {
      id sequence label
      edges {
        type thickness
        vertices { position { x y } }
        openings { type width height lowerElevation relativeCenter }
      }
    }
    assets {
      floorplans {
        url width height resolution format filename
        origin { x y }
        floor { id sequence }
      }
    }
  }
}`;

function snapshotClasses(images) {
  const map = new Map();
  for (const image of images || []) {
    let scan = null;
    try {
      scan = JSON.parse(image.metadata || "{}").scan_id;
    } catch {
      scan = null;
    }
    if (!scan) continue;
    const key = String(scan).replace(/-/g, "");
    if (map.has(key)) continue;
    const name = String(image.name || "").toLowerCase();
    const found = SNAPSHOT_CLASS.find(([needle]) => name.includes(needle));
    if (found) map.set(key, found[1]);
  }
  return map;
}

function startPosition(player) {
  const start = player?.camera_start;
  const position = start?.position || start?.camera_position || null;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return position;
}

async function loadRgb(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function chooseMode(groups) {
  let best = null;
  for (const mode of PLAN_MODES) {
    let ink = 0;
    let inside = 0;
    let total = 0;
    for (const group of groups) {
      for (const point of group.points) {
        total += 1;
        const projected = projectToPlan(point.x, point.y, group.plan, mode);
        const ix = Math.round(projected.px * (group.sample.width / group.plan.width));
        const iy = Math.round(projected.py * (group.sample.height / group.plan.height));
        if (ix < 0 || iy < 0 || ix >= group.sample.width || iy >= group.sample.height) continue;
        inside += 1;
        const o = (iy * group.sample.width + ix) * 3;
        const sum = group.sample.data[o] + group.sample.data[o + 1] + group.sample.data[o + 2];
        if (sum < 730) ink += 1;
      }
    }
    const score = ink * 3 + inside;
    if (!best || score > best.score) best = { mode, score, ink, inside, total };
  }
  return best;
}

async function buildPlan(model, dir) {
  const plans = (model.assets?.floorplans || []).filter((plan) => plan.width && plan.resolution && plan.origin && plan.url);
  const byFloor = new Map();
  const planRank = (plan) => {
    const url = plan.url || "";
    if (url.includes("colorplan_room")) return 3;
    if (url.includes("colorplan")) return 2;
    if (plan.format === "jpg" || plan.filename?.endsWith(".jpg")) return 1;
    return 0;
  };
  for (const plan of plans) {
    const floorId = plan.floor?.id || "*";
    const current = byFloor.get(floorId);
    if (!current || planRank(plan) > planRank(current) || (planRank(plan) === planRank(current) && plan.width > current.width)) {
      byFloor.set(floorId, plan);
    }
  }
  const floors = [...(model.floors || [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const tiles = [];
  let y = 0;
  let width = 0;
  const groups = [];
  for (const floor of floors) {
    const plan = byFloor.get(floor.id) || (floors.length === 1 ? byFloor.get("*") : null) || byFloor.get("*");
    if (!plan) continue;
    if (tiles.some((tile) => tile.sourceUrl === plan.url)) continue;
    const buf = await fetchBuf(plan.url);
    const jpeg = await sharp(buf).flatten({ background: "#f4f1ea" }).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer();
    const meta = await sharp(jpeg).metadata();
    const sample = await sharp(jpeg).resize(180, 180, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const points = (model.locations || [])
      .filter((location) => !location.floor?.id || location.floor.id === floor.id || plan.floor?.id == null)
      .map((location) => location.pano?.position)
      .filter((position) => position);
    groups.push({
      plan: { origin: plan.origin, resolution: plan.resolution, width: plan.width, height: plan.height },
      points,
      sample: { data: sample.data, width: sample.info.width, height: sample.info.height },
    });
    tiles.push({
      floorId: floor.id,
      sourceUrl: plan.url,
      plan: { origin: plan.origin, resolution: plan.resolution, width: plan.width, height: plan.height },
      jpeg,
      imageWidth: meta.width,
      imageHeight: meta.height,
      offsetX: 0,
      offsetY: y,
    });
    width = Math.max(width, meta.width);
    y += meta.height + (floor === floors[floors.length - 1] ? 0 : 28);
  }
  if (!tiles.length) {
    return schematicPlan(model, dir);
  }
  const chosen = chooseMode(groups);
  console.log(`  floorplan mode ${chosen.mode}  ink ${chosen.ink}/${chosen.total}  inside ${chosen.inside}`);
  const height = tiles.reduce((sum, tile, index) => sum + tile.imageHeight + (index ? 28 : 0), 0);
  const composites = tiles.map((tile) => ({ input: tile.jpeg, left: 0, top: tile.offsetY }));
  await sharp({
    create: { width, height, channels: 3, background: "#f4f1ea" },
  }).composite(composites).jpeg({ quality: 86 }).toFile(path.join(dir, "plan.jpg"));
  const map = new Map(tiles.map((tile) => [tile.floorId, tile]));
  if (tiles.length === 1) map.set("*", tiles[0]);
  return { mode: chosen.mode, width, height, tiles: map };
}

function schematicPlan(model, dir) {
  const points = (model.locations || []).map((location) => location.pano?.position).filter(Boolean);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;
  const resolution = 40;
  const width = Math.max(200, Math.ceil((maxX - minX) * resolution));
  const height = Math.max(200, Math.ceil((maxY - minY) * resolution));
  const plan = { origin: { x: minX, y: maxY }, resolution, width, height };
  const tile = {
    floorId: "*",
    plan,
    imageWidth: width,
    imageHeight: height,
    offsetX: 0,
    offsetY: 0,
  };
  return sharp({
    create: { width, height, channels: 3, background: "#f4f1ea" },
  }).jpeg({ quality: 80 }).toFile(path.join(dir, "plan.jpg")).then(() => ({
    mode: "top-y-up",
    width,
    height,
    tiles: new Map([["*", tile], ...(model.floors || []).map((floor) => [floor.id, { ...tile, floorId: floor.id }])]),
  }));
}

async function writePanos(scenes, locations, dir) {
  const panoDir = path.join(dir, "pano");
  fs.mkdirSync(panoDir, { recursive: true });
  const bySweep = new Map(locations.map((location) => [String(location.pano?.sweepUuid || "").replace(/-/g, ""), location]));
  let cursor = 0;
  const queue = scenes.filter((scene) => {
    const medium = path.join(panoDir, `${scene.id}_m.jpg`);
    const small = path.join(panoDir, `${scene.id}_s.jpg`);
    return !(fs.existsSync(medium) && fs.existsSync(small) && fs.statSync(medium).size > 20000);
  });
  console.log(`  panoramas ${scenes.length - queue.length} kept, ${queue.length} to stitch`);
  async function worker() {
    while (cursor < queue.length) {
      const scene = queue[cursor];
      cursor += 1;
      const location = bySweep.get(String(scene.sweepUuid).replace(/-/g, ""));
      const skyboxes = (location?.pano?.skyboxes || []).filter((item) => item.urlTemplate && item.status !== "unavailable");
      const started = Date.now();
      let faces = null;
      let lastError = null;
      for (const resolution of ["2k", "high", "low"]) {
        const sky = skyboxes.find((item) => item.resolution === resolution);
        if (!sky) continue;
        try {
          const loaded = [];
          for (let face = 0; face < 6; face += 1) {
            const buf = await fetchBuf(sky.urlTemplate.replace("<face>", String(face)));
            loaded.push(await loadRgb(buf));
          }
          faces = loaded;
          break;
        } catch (error) {
          lastError = error;
          console.log(`  ${scene.id} ${resolution} failed: ${error.message.slice(0, 120)}`);
        }
      }
      if (!faces) throw new Error(`${scene.id} has no skybox${lastError ? `: ${lastError.message}` : ""}`);
      const raw = equirectFromSkyboxes(faces, 4096, 2048);
      const medium = path.join(panoDir, `${scene.id}_m.jpg`);
      const small = path.join(panoDir, `${scene.id}_s.jpg`);
      await sharp(raw, { raw: { width: 4096, height: 2048, channels: 3 } })
        .jpeg({ quality: 72, mozjpeg: true })
        .toFile(medium);
      await sharp(medium).resize(2048, 1024).jpeg({ quality: 66, mozjpeg: true }).toFile(small);
      console.log(`  ${scene.id} ${scene.title}  ${(Date.now() - started) / 1000}s`);
    }
  }
  const workers = Math.min(2, queue.length || 1);
  await Promise.all(Array.from({ length: workers }, () => worker()));
}

function nearestScene(scenes, position) {
  if (!position) return scenes[0];
  let best = scenes[0];
  let bestDist = Infinity;
  for (const scene of scenes) {
    const dist = Math.hypot(scene.position[0] - position.x, scene.position[1] - position.y);
    if (dist < bestDist) {
      best = scene;
      bestDist = dist;
    }
  }
  return best;
}

async function buildJob(job) {
  console.log(`\n${job.slug}  ${job.model}`);
  const model = await graphql(job.model, MODEL_QUERY);
  if (!model?.locations?.length) throw new Error(`${job.model} is not a public model`);
  const playerRes = await fetch(`https://my.matterport.com/api/v1/player/models/${job.model}`);
  const player = playerRes.ok ? await playerRes.json() : {};
  const dir = path.join(ROOT, job.slug);
  fs.mkdirSync(dir, { recursive: true });
  const planLayout = await buildPlan(model, dir);
  const scenes = buildTourScenes({
    locations: model.locations,
    rooms: model.rooms,
    floors: model.floors,
    planLayout,
    snapshotClass: snapshotClasses(player.images),
  });
  if (scenes.length < 2) throw new Error(`${job.slug} produced ${scenes.length} scenes`);
  const first = nearestScene(scenes, startPosition(player));
  const tour = {
    title: job.title,
    location: job.location,
    credit: "יונתן בוזגלו | VISIO",
    matterportId: job.model,
    firstScene: first.id,
    hfov: 105,
    pitch: -10,
    plan: "plan.jpg",
    note: NOTE,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      map: scene.map,
      hotspots: scene.hotspots,
    })),
  };
  const measure = {
    mode: "surfaces",
    approx: true,
    source: `matterport:${job.model}`,
    floorZ: 0,
    ceilingZ: 2.6,
    scenes: measureScenesFromTour(scenes),
    walls: wallsFromFloors(model.floors),
    rooms: [],
  };
  const titles = Object.fromEntries(tour.scenes.map((scene) => [scene.id, scene.title]));
  const planPairs = scenes
    .filter((scene) => scene.map)
    .map((scene) => ({ world: [scene.position[0], scene.position[1]], map: [scene.map.x, scene.map.y] }));
  measure.rooms = buildRoomRecords({
    apiRooms: model.rooms || [],
    scenes: measure.scenes,
    titles,
    planPairs,
  });
  for (const room of measure.rooms) {
    for (const id of room.sceneIds) {
      if (measure.scenes[id]) measure.scenes[id].roomId = room.id;
    }
  }
  fs.writeFileSync(path.join(dir, "tour.json"), `${JSON.stringify(tour, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "measure.json"), `${JSON.stringify(measure, null, 2)}\n`);
  const sweepMapPath = path.join(dir, ".sweeps.json");
  const previous = fs.existsSync(sweepMapPath) ? JSON.parse(fs.readFileSync(sweepMapPath, "utf8")) : {};
  const panoDir = path.join(dir, "pano");
  for (const scene of scenes) {
    if (previous[scene.id] && previous[scene.id] !== scene.sweepUuid) {
      fs.rmSync(path.join(panoDir, `${scene.id}_m.jpg`), { force: true });
      fs.rmSync(path.join(panoDir, `${scene.id}_s.jpg`), { force: true });
    }
  }
  fs.writeFileSync(sweepMapPath, `${JSON.stringify(Object.fromEntries(scenes.map((scene) => [scene.id, scene.sweepUuid])), null, 2)}\n`);
  console.log(`  ${scenes.length} scenes, ${measure.rooms.length} rooms, ${measure.walls.length} walls`);
  const names = [...new Set(scenes.map((scene) => scene.title.replace(/ \d+$/, "")))];
  console.log(`  names ${names.join(", ")}`);
  await writePanos(scenes, model.locations, dir);
  console.log(`  wrote ${dir}`);
}

const jobs = argJobs();
for (const job of jobs) {
  await buildJob(job);
}
