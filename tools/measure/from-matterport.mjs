/**
 * Pull room dimensions for a hosted tour from its public Matterport model.
 *
 *   node tools/measure/from-matterport.mjs public/tours/<slug>
 *
 * tour.json must include `matterportId`. The script writes `measure.json`
 * next to it. Existing sweep poses (position + rotation) are kept, so a
 * re-run refreshes rooms without moving the panoramas. A tour that has no
 * poses yet is matched by the floor-plan dots to the nearest sweep.
 *
 * Without a Matterport model id there is nothing reliable to import.
 * Do not invent room sizes for those tours.
 */
import fs from "fs";
import path from "path";
import { wallsFromFloors } from "../../lib/tour/matterport-walls.js";
import { buildRoomRecords } from "../../lib/tour/room-dims.js";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node tools/measure/from-matterport.mjs public/tours/<slug>");
  process.exit(1);
}

const tourPath = path.join(dir, "tour.json");
const measurePath = path.join(dir, "measure.json");
const tour = JSON.parse(fs.readFileSync(tourPath, "utf8"));
const modelId = tour.matterportId;
if (!modelId || typeof modelId !== "string") {
  console.error(`${tourPath} has no matterportId. Auto dimensions need the public Matterport model id.`);
  process.exit(1);
}

async function graphql(query, variables) {
  const response = await fetch("https://my.matterport.com/api/mp/models/graph", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://my.matterport.com",
      Referer: `https://my.matterport.com/show/?m=${modelId}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Matterport graph HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
  return body.data.model;
}

const model = await graphql(
  `query ($id: ID!) {
    model(id: $id) {
      rooms {
        id
        keywords
        dimensionEstimates { area width depth height units }
        ceiling { maxHeight }
        boundary { edges { thickness vertices { position { x y } } } }
      }
      locations {
        position { x y z }
        pano { position { x y z } rotation { x y z w } }
      }
      floors {
        edges {
          type
          thickness
          vertices { position { x y } }
          openings { type width height lowerElevation relativeCenter }
        }
      }
    }
  }`,
  { id: modelId },
);

let measure = { mode: "surfaces", approx: true, source: `matterport:${modelId}`, floorZ: 0, ceilingZ: 2.85, scenes: {}, walls: [] };
if (fs.existsSync(measurePath)) {
  measure = { ...measure, ...JSON.parse(fs.readFileSync(measurePath, "utf8")) };
}

if (!measure.scenes || Object.keys(measure.scenes).length === 0) {
  measure.scenes = matchByFloorPlan(tour, model.locations || []);
  measure.walls = wallsFromFloors(model.floors || []);
  console.log(`Matched ${Object.keys(measure.scenes).length} panoramas to sweeps by floor-plan dots.`);
  console.log("Image-matched poses are more accurate. Re-run after checking a doorway.");
}

const titles = Object.fromEntries((tour.scenes || []).map((scene) => [scene.id, scene.title]));
const planPairs = [];
for (const scene of tour.scenes || []) {
  const pose = measure.scenes[scene.id];
  if (!pose?.position || !Number.isFinite(scene.map?.x)) continue;
  planPairs.push({ world: [pose.position[0], pose.position[1]], map: [scene.map.x, scene.map.y] });
}

measure.rooms = buildRoomRecords({
  apiRooms: model.rooms || [],
  scenes: measure.scenes,
  titles,
  planPairs,
});
measure.source = measure.source || `matterport:${modelId}`;
for (const scene of Object.values(measure.scenes)) delete scene.roomId;
for (const room of measure.rooms) {
  for (const id of room.sceneIds) {
    if (measure.scenes[id]) measure.scenes[id].roomId = room.id;
  }
}

fs.writeFileSync(measurePath, `${JSON.stringify(measure, null, 2)}\n`);
console.log(`Wrote ${measure.rooms.length} rooms to ${measurePath}`);
for (const room of measure.rooms) {
  const kind = room.rectangular ? "room" : "open";
  console.log(
    `  ${kind} ${room.zones.join(" / ") || room.id}  ${room.width.toFixed(2)} × ${room.length.toFixed(2)} m`
    + `${room.height ? `  h ${room.height.toFixed(2)}` : ""}`
    + `${room.area ? `  ${room.area.toFixed(0)} m²` : ""}`
    + `  [${room.source}]  ${room.sceneIds.length} sweeps`,
  );
}

/**
 * Nearest sweep for each floor-plan dot, after a similarity fit.
 * Good enough to know which room a new panorama belongs to. The manual ruler
 * is more accurate once poses are image-matched.
 */
function matchByFloorPlan(tour, locations) {
  const scenes = {};
  const dots = (tour.scenes || []).filter((scene) => Number.isFinite(scene.map?.x));
  const located = locations.filter((location) => location.pano?.position && location.pano?.rotation);
  const sweeps = located.map((location) => location.pano);
  if (dots.length < 3 || sweeps.length < 3) return scenes;
  // Use percent space directly; scale is recovered by the fit inside buildRoomRecords.
  // Here we only need a nearest neighbour in a shared frame, so match by
  // normalising both clouds to unit boxes and trying 8 flips/rotations of 90°.
  const dotPts = dots.map((scene) => [scene.map.x, scene.map.y]);
  const sweepPts = sweeps.map((pano) => [pano.position.x, pano.position.y]);
  let best = null;
  for (const flipX of [1, -1]) {
    for (const flipY of [1, -1]) {
      for (const turn of [0, 90, 180, 270]) {
        const placed = sweepPts.map((point) => rotate(point[0] * flipX, point[1] * flipY, turn));
        const fit = normalizePair(placed, dotPts);
        if (!best || fit.error < best.error) best = { ...fit, flipX, flipY, turn, placed };
      }
    }
  }
  const used = new Set();
  dots.forEach((scene, index) => {
    let nearest = null;
    best.sweepMapped.forEach((point, sweepIndex) => {
      if (used.has(sweepIndex)) return;
      const error = Math.hypot(point[0] - dotPts[index][0], point[1] - dotPts[index][1]);
      if (!nearest || error < nearest.error) nearest = { error, sweepIndex };
    });
    if (!nearest) return;
    used.add(nearest.sweepIndex);
    const pano = sweeps[nearest.sweepIndex];
    const anchor = located[nearest.sweepIndex]?.position;
    scenes[scene.id] = {
      position: [round4(pano.position.x), round4(pano.position.y), round4(pano.position.z)],
      rotation: [pano.rotation.x, pano.rotation.y, pano.rotation.z, pano.rotation.w].map((n) => round7(n)),
      floorZ: round4(anchor?.z || 0),
    };
  });
  return scenes;
}

function rotate(x, y, degrees) {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos * x - sin * y, sin * x + cos * y];
}

function normalizePair(src, dst) {
  const box = (pts) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { minX: Math.min(...xs), minY: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 1, h: Math.max(...ys) - Math.min(...ys) || 1 };
  };
  const sb = box(src);
  const db = box(dst);
  const sweepMapped = src.map((point) => [
    ((point[0] - sb.minX) / sb.w) * db.w + db.minX,
    ((point[1] - sb.minY) / sb.h) * db.h + db.minY,
  ]);
  // greedy error
  const used = new Set();
  let error = 0;
  for (const dot of dst) {
    let best = Infinity;
    let at = -1;
    sweepMapped.forEach((point, index) => {
      if (used.has(index)) return;
      const dist = Math.hypot(point[0] - dot[0], point[1] - dot[1]);
      if (dist < best) {
        best = dist;
        at = index;
      }
    });
    if (at >= 0) used.add(at);
    error += best;
  }
  return { error, sweepMapped };
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
function round7(n) {
  return Math.round(n * 1e7) / 1e7;
}
