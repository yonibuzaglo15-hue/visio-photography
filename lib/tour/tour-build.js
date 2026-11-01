import { chainPolygon, shoelace } from "./room-dims.js";
import { quatNormalize, quatRotate, worldToYawPitch } from "./measure.js";

/** Matterport room classification → Hebrew. Unknown classes stay out of this map. */
export const ROOM_HEBREW = {
  "Living Room": "סלון",
  Bedroom: "חדר שינה",
  "Primary Bedroom": "חדר הורים",
  Kitchen: "מטבח",
  Bathroom: "חדר רחצה",
  Closet: "חדר ארונות",
  "Dining Room": "פינת אוכל",
  Hallway: "מסדרון",
  Corridor: "מסדרון",
  Entryway: "מבואת כניסה",
  Entrance: "כניסה",
  Balcony: "מרפסת",
  Patio: "מרפסת",
  Terrace: "מרפסת",
  Laundry: "חדר כביסה",
  "Laundry Room": "חדר כביסה",
  Office: "חדר עבודה",
  Garage: "חניה",
  Stairs: "מדרגות",
  Staircase: "מדרגות",
  Utility: "חדר שירות",
  "Utility Room": "חדר שירות",
  Outdoor: "חוץ",
  Void: "חוץ",
  "Family Room": "חדר משפחה",
  Den: "חדר משפחה",
  Pantry: "מזווה",
  Storage: "מחסן",
  Pool: "בריכה",
  Deck: "דק",
  Other: "חלל",
};

const ROOM_RANK = {
  כניסה: 0,
  "מבואת כניסה": 1,
  סלון: 2,
  "פינת אוכל": 3,
  מטבח: 4,
  מסדרון: 5,
  "חדר שינה": 6,
  "חדר הורים": 6,
  "חדר עבודה": 7,
  "חדר משפחה": 7,
  "חדר רחצה": 8,
  "חדר כביסה": 9,
  "חדר ארונות": 10,
  מזווה: 11,
  מחסן: 12,
  מרפסת: 13,
  בריכה: 14,
  דק: 15,
  חניה: 16,
  מדרגות: 17,
  חוץ: 18,
  חלל: 19,
};

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function round7(n) {
  return Math.round(n * 1e7) / 1e7;
}

export function hebrewRoomName(classification) {
  if (!classification) return "נקודה";
  return ROOM_HEBREW[classification] || "חלל";
}

/**
 * Map bearing of panorama yaw 0, degrees clockwise from plan-up.
 * planUpSign +1: image up is world +Y. −1: image up is world −Y.
 */
export function headingFromPose(rotation, planUpSign = 1) {
  const q = quatNormalize(rotation);
  const fwd = quatRotate(q, [1, 0, 0]);
  const sign = planUpSign < 0 ? -1 : 1;
  const deg = (Math.atan2(fwd[0] * sign, fwd[1] * sign) * 180) / Math.PI;
  return round1(deg);
}

/**
 * Pixel on a Matterport floorplan image.
 * `origin` is the bottom-left corner of that image in model XY metres.
 * `resolution` is pixels per metre. Image Y grows downward, model +Y is up.
 * This is the mapping Matterport uses to draw sweep dots on the color plan.
 */
export function projectToPlan(x, y, plan) {
  const originX = plan.origin.x;
  const originY = plan.origin.y;
  const px = (x - originX) * plan.resolution;
  const py = plan.height - (y - originY) * plan.resolution;
  return { px, py };
}

/** Matterport color plans use one flat grey outside the rooms. */
export function isPlanBackground(rgb, background) {
  const delta = Math.abs(rgb[0] - background[0]) + Math.abs(rgb[1] - background[1]) + Math.abs(rgb[2] - background[2]);
  const sat = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
  return delta < 36 && sat < 22;
}

function vertexKey(position) {
  return `${position.x.toFixed(2)},${position.y.toFixed(2)}`;
}

/** Door jambs are spurs. Drop them so the room outline is one loop. */
function withoutSpurs(edges) {
  let segs = (edges || []).map((edge) => {
    const verts = edge.vertices || [];
    if (verts.length < 2) return null;
    return {
      edge,
      ka: vertexKey(verts[0].position),
      kb: vertexKey(verts[verts.length - 1].position),
    };
  }).filter(Boolean);
  for (let guard = 0; guard < segs.length + 2; guard += 1) {
    const degree = new Map();
    for (const seg of segs) {
      degree.set(seg.ka, (degree.get(seg.ka) || 0) + 1);
      degree.set(seg.kb, (degree.get(seg.kb) || 0) + 1);
    }
    const next = segs.filter((seg) => degree.get(seg.ka) > 1 && degree.get(seg.kb) > 1);
    if (next.length === segs.length) break;
    segs = next;
  }
  return segs.map((seg) => seg.edge);
}

function preparedRooms(apiRooms) {
  return (apiRooms || []).map((room) => {
    const poly = chainPolygon(withoutSpurs(room.boundary?.edges));
    return {
      id: room.id,
      poly,
      area: poly.length ? shoelace(poly) : 0,
      classification: room.classifications?.[0]?.label || null,
      hide: (room.keywords || []).includes("hide"),
    };
  }).filter((room) => room.poly.length >= 3);
}

function distanceToPoly(x, y, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t)));
  }
  return best;
}

export function roomAt(x, y, prepared) {
  let best = null;
  for (const room of prepared) {
    if (!pointInPoly(x, y, room.poly)) continue;
    if (!best) {
      best = room;
      continue;
    }
    if (best.hide && !room.hide) {
      best = room;
      continue;
    }
    if (!best.hide && room.hide) continue;
    if (room.area < best.area) best = room;
  }
  if (best) return best;
  let nearest = null;
  for (const room of prepared) {
    if (room.hide || room.poly.length < 3) continue;
    const dist = distanceToPoly(x, y, room.poly);
    if (!nearest || dist < nearest.dist) nearest = { room, dist };
  }
  if (nearest && nearest.dist <= 0.8) return nearest.room;
  return null;
}

/**
 * Build scene records (ids, Hebrew titles, poses, map percents, floor rings)
 * from public Matterport locations. Panorama bytes are filled in by the CLI.
 */
export function buildTourScenes({ locations, rooms, floors, planLayout, snapshotClass }) {
  const prepared = preparedRooms(rooms);
  const floorIndex = new Map((floors || []).map((floor, index) => [floor.id, floor.sequence ?? index]));
  const sweeps = [];
  for (const location of locations || []) {
    const pano = location.pano;
    if (!pano?.position || !pano?.rotation) continue;
    const [x, y] = [pano.position.x, pano.position.y];
    const room = roomAt(x, y, prepared);
    const snap = snapshotClass?.get?.(pano.sweepUuid) || snapshotClass?.[pano.sweepUuid] || null;
    let classification = room?.classification || null;
    if ((!classification || classification === "Other" || classification === "Void") && snap) {
      classification = snap;
    }
    if (room?.hide && classification === "Void") classification = snap || "Outdoor";
    sweeps.push({
      sweepUuid: pano.sweepUuid,
      index: Number.isFinite(location.index) ? location.index : sweeps.length,
      floorId: location.floor?.id || null,
      floorSequence: floorIndex.get(location.floor?.id) ?? 0,
      position: [pano.position.x, pano.position.y, pano.position.z],
      rotation: [pano.rotation.x, pano.rotation.y, pano.rotation.z, pano.rotation.w],
      floorZ: round4(location.position?.z || 0),
      classification,
      roomId: room?.hide ? null : room?.id || null,
    });
  }
  sweeps.sort((a, b) => a.floorSequence - b.floorSequence || a.index - b.index);

  const scenes = sweeps.map((sweep) => {
    const base = hebrewRoomName(sweep.classification);
    return {
      id: "",
      title: base,
      base,
      sweepUuid: sweep.sweepUuid,
      floorId: sweep.floorId,
      floorSequence: sweep.floorSequence,
      classification: sweep.classification,
      rank: ROOM_RANK[base] ?? 50,
      index: sweep.index,
      position: sweep.position,
      rotation: sweep.rotation,
      floorZ: sweep.floorZ,
      roomId: sweep.roomId,
      map: null,
      hotspots: [],
    };
  });

  scenes.sort((a, b) => a.floorSequence - b.floorSequence || a.rank - b.rank || a.index - b.index);
  const classCounts = new Map();
  for (const scene of scenes) classCounts.set(scene.base, (classCounts.get(scene.base) || 0) + 1);
  const seenClass = new Map();
  scenes.forEach((scene, order) => {
    scene.id = `p${String(order + 1).padStart(2, "0")}`;
    const total = classCounts.get(scene.base) || 1;
    const n = (seenClass.get(scene.base) || 0) + 1;
    seenClass.set(scene.base, n);
    scene.title = total > 1 ? `${scene.base} ${n}` : scene.base;
    delete scene.base;
  });

  const used = new Set();
  for (const scene of scenes) {
    const tile = planLayout.tiles.get(scene.floorId) || planLayout.tiles.get("*");
    scene.floor = tile.sequence == null ? "0" : String(tile.sequence);
    const projected = projectToPlan(scene.position[0], scene.position[1], tile.frame);
    let mx = round2((projected.px / tile.frame.width) * 100);
    let my = round2((projected.py / tile.frame.height) * 100);
    let key = `${scene.floor}:${mx},${my}`;
    let nudge = 0;
    while (used.has(key) && nudge < 8) {
      nudge += 1;
      mx = round2(mx + 0.01);
      key = `${scene.floor}:${mx},${my}`;
    }
    used.add(key);
    scene.map = {
      x: mx,
      y: my,
      heading: headingFromPose(scene.rotation, 1),
    };
  }

  for (const scene of scenes) {
    const pose = { position: scene.position, rotation: scene.rotation, floorZ: scene.floorZ };
    const candidates = [];
    for (const other of scenes) {
      if (other.id === scene.id || other.floorId !== scene.floorId) continue;
      const dist = Math.hypot(other.position[0] - scene.position[0], other.position[1] - scene.position[1]);
      if (dist < 0.45 || dist > 7.5) continue;
      const aim = worldToYawPitch(pose, [other.position[0], other.position[1], other.floorZ]);
      if (aim.pitch > -8 || aim.pitch < -70) continue;
      candidates.push({ scene: other.id, yaw: round1(aim.yaw), pitch: round1(aim.pitch), dist });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    scene.hotspots = candidates.slice(0, 6).map(({ scene: id, yaw, pitch }) => ({ scene: id, yaw, pitch }));
    if (scene.hotspots.length === 0) {
      let nearest = null;
      for (const other of scenes) {
        if (other.id === scene.id) continue;
        const dist = Math.hypot(other.position[0] - scene.position[0], other.position[1] - scene.position[1]);
        if (!nearest || dist < nearest.dist) nearest = { other, dist };
      }
      if (nearest) {
        const aim = worldToYawPitch(pose, [nearest.other.position[0], nearest.other.position[1], nearest.other.floorZ]);
        scene.hotspots = [{ scene: nearest.other.id, yaw: round1(aim.yaw), pitch: round1(aim.pitch) }];
      }
    }
  }

  return scenes;
}

export function measureScenesFromTour(scenes) {
  const out = {};
  for (const scene of scenes) {
    out[scene.id] = {
      position: scene.position.map(round4),
      rotation: scene.rotation.map(round7),
      floorZ: scene.floorZ,
    };
  }
  return out;
}
