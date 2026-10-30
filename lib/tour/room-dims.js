/**
 * Room dimensions for the hosted tour viewer.
 *
 * Matterport publishes room outlines in metres and, for many rooms, interior
 * width / depth / ceiling height in feet (`dimensionEstimates.units = imperial`).
 * A room is shown automatically when `measure.json` has a `rooms` entry.
 * The viewer does not invent a size for a tour that has no room geometry.
 */

const FEET_TO_METRES = 0.3048;
const MIN_WALL = 1.2;

export function feetToMetres(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n * FEET_TO_METRES;
}

/** Imperial area (sq ft) or an already-metric area. */
export function areaToMetres(value, units) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (units === "imperial") return n * FEET_TO_METRES * FEET_TO_METRES;
  return n;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function vertexKey(position) {
  return `${position.x.toFixed(2)},${position.y.toFixed(2)}`;
}

/** Order boundary edges into closed loops. Returns the longest loop, open. */
export function chainPolygon(edges) {
  const segs = [];
  for (const edge of edges || []) {
    const verts = edge.vertices || [];
    if (verts.length < 2) continue;
    const a = verts[0].position;
    const b = verts[verts.length - 1].position;
    segs.push({
      a: [a.x, a.y],
      b: [b.x, b.y],
      ka: vertexKey(a),
      kb: vertexKey(b),
      thickness: Number(edge.thickness) || 0.16,
    });
  }
  if (!segs.length) return [];
  const adj = new Map();
  const link = (key, index) => {
    const list = adj.get(key) || [];
    list.push(index);
    adj.set(key, list);
  };
  segs.forEach((seg, index) => {
    link(seg.ka, index);
    link(seg.kb, index);
  });
  const used = new Set();
  const loops = [];
  for (let start = 0; start < segs.length; start += 1) {
    if (used.has(start)) continue;
    used.add(start);
    const loop = [segs[start].a, segs[start].b];
    const keys = [segs[start].ka, segs[start].kb];
    let guard = 0;
    while (keys[keys.length - 1] !== keys[0] && guard < segs.length + 2) {
      guard += 1;
      const key = keys[keys.length - 1];
      const next = (adj.get(key) || []).find((index) => !used.has(index));
      if (next == null) break;
      used.add(next);
      const seg = segs[next];
      if (seg.ka === key) {
        loop.push(seg.b);
        keys.push(seg.kb);
      } else {
        loop.push(seg.a);
        keys.push(seg.ka);
      }
    }
    if (loop.length > 3 && keys[0] === keys[keys.length - 1]) loops.push(loop.slice(0, -1));
  }
  loops.sort((a, b) => b.length - a.length);
  return loops[0] || [];
}

export function shoelace(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function edgeRecords(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const axis = Math.abs(((angle % 180) + 180) % 180) < 20 || Math.abs(((angle % 180) + 180) % 180) > 160
      ? "h"
      : Math.abs(Math.abs(((angle % 180) + 180) % 180) - 90) < 20
        ? "v"
        : "d";
    out.push({ a, b, length, axis });
  }
  return out;
}

function longest(edges, axis) {
  let best = null;
  for (const edge of edges) {
    if (edge.axis !== axis || edge.length < MIN_WALL) continue;
    if (!best || edge.length > best.length) best = edge;
  }
  return best;
}

function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

/**
 * A dimension line on the floor, parallel to a wall and inset into the room,
 * with the published length centred on that wall.
 */
export function insetDimension(edge, meters, center, floorZ, inset = 0.45) {
  const mx = (edge.a[0] + edge.b[0]) / 2;
  const my = (edge.a[1] + edge.b[1]) / 2;
  let nx = center[0] - mx;
  let ny = center[1] - my;
  const nlen = Math.hypot(nx, ny) || 1;
  nx /= nlen;
  ny /= nlen;
  const cx = mx + nx * inset;
  const cy = my + ny * inset;
  const dx = edge.b[0] - edge.a[0];
  const dy = edge.b[1] - edge.a[1];
  const len = Math.hypot(dx, dy) || 1;
  const span = Math.min(meters, len);
  const half = span / 2;
  const ux = dx / len;
  const uy = dy / len;
  const z = floorZ + 0.03;
  return {
    a: [round2(cx - ux * half), round2(cy - uy * half), round2(z)],
    b: [round2(cx + ux * half), round2(cy + uy * half), round2(z)],
    meters: round2(span),
  };
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 2D similarity: map percent ≈ scale * R * world + t. */
export function fitPlanSimilarity(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  let dx = 0;
  let dy = 0;
  for (const pair of pairs) {
    mx += pair.world[0];
    my += pair.world[1];
    dx += pair.map[0];
    dy += pair.map[1];
  }
  mx /= n;
  my /= n;
  dx /= n;
  dy /= n;
  let sxx = 0;
  let sxy = 0;
  let syx = 0;
  let syy = 0;
  let den = 0;
  for (const pair of pairs) {
    const vx = pair.world[0] - mx;
    const vy = pair.world[1] - my;
    const ux = pair.map[0] - dx;
    const uy = pair.map[1] - dy;
    sxx += vx * ux;
    sxy += vx * uy;
    syx += vy * ux;
    syy += vy * uy;
    den += vx * vx + vy * vy;
  }
  if (!(den > 1e-8)) return null;
  const rot = Math.atan2(sxy - syx, sxx + syy);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  let num = 0;
  for (const pair of pairs) {
    const vx = pair.world[0] - mx;
    const vy = pair.world[1] - my;
    const ux = pair.map[0] - dx;
    const uy = pair.map[1] - dy;
    const rx = cos * vx - sin * vy;
    const ry = sin * vx + cos * vy;
    num += rx * ux + ry * uy;
  }
  const scale = num / den;
  return {
    scale,
    rot,
    tx: dx - scale * (cos * mx - sin * my),
    ty: dy - scale * (sin * mx + cos * my),
  };
}

export function applyPlanSimilarity(model, point) {
  if (!model) return null;
  const { scale, rot, tx, ty } = model;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return [
    scale * (cos * point[0] - sin * point[1]) + tx,
    scale * (sin * point[0] + cos * point[1]) + ty,
  ];
}

function zoneName(title) {
  return String(title || "").split(" – ")[0].split(" - ")[0].trim();
}

const ZONE_RANK = ["סלון", "מטבח", "פינת אוכל", "חדר שינה הורים", "חדר ילדים", "חדר עבודה", "חדר רחצה", "חדר רחצה הורים", "מרפסת"];

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Build viewer room records from Matterport rooms + already matched scene poses.
 * @param {object} input
 * @param {object[]} input.apiRooms GraphQL rooms (boundary, dimensionEstimates, ceiling, keywords)
 * @param {Record<string, {position: number[], floorZ?: number}>} input.scenes
 * @param {Record<string, string>} input.titles scene id → Hebrew title
 * @param {{world: number[], map: number[]}[]} [input.planPairs] world XY → map percent
 */
export function buildRoomRecords(input) {
  const plan = fitPlanSimilarity(input.planPairs || []);
  const rooms = [];
  for (const apiRoom of input.apiRooms || []) {
    const keywords = apiRoom.keywords || [];
    if (keywords.includes("hide")) continue;
    const polygon = chainPolygon(apiRoom.boundary?.edges);
    if (polygon.length < 4) continue;
    const areaPoly = shoelace(polygon);
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const box = spanX * spanY;
    if (!(areaPoly > 2) || !(box > 0)) continue;

    const edges = edgeRecords(polygon);
    const horizontal = longest(edges, "h");
    const vertical = longest(edges, "v");
    if (!horizontal || !vertical) continue;

    const estimates = apiRoom.dimensionEstimates || {};
    const units = estimates.units || "imperial";
    const mpWidth = feetToMetres(estimates.width);
    const mpDepth = feetToMetres(estimates.depth);
    const ceilingRaw = apiRoom.ceiling?.maxHeight ?? estimates.height;
    const height = ceilingRaw == null ? null : round2(feetToMetres(ceilingRaw));
    const area = areaToMetres(estimates.area, units);

    const sceneIds = Object.entries(input.scenes || [])
      .filter(([, pose]) => {
        const [x, y] = pose.position || [];
        return Number.isFinite(x) && pointInPoly(x, y, polygon);
      })
      .map(([id]) => id);
    if (!sceneIds.length) continue;

    const floorZ = median(sceneIds.map((id) => {
      const pose = input.scenes[id];
      return Number.isFinite(pose.floorZ) ? pose.floorZ : 0;
    }));
    const center = centroid(polygon);
    const rectangular = areaPoly / box >= 0.78 || Boolean(mpWidth && mpDepth);
    // Interior size. Matterport's own width/depth win. Otherwise the long
    // wall minus one wall thickness (centreline span is about 15 cm too big).
    let hMeters = horizontal.length;
    let vMeters = vertical.length;
    let source = "walls";
    if (mpWidth && mpDepth) {
      source = "matterport";
      const direct = Math.abs(mpWidth - horizontal.length) + Math.abs(mpDepth - vertical.length);
      const swapped = Math.abs(mpDepth - horizontal.length) + Math.abs(mpWidth - vertical.length);
      hMeters = direct <= swapped ? mpWidth : mpDepth;
      vMeters = direct <= swapped ? mpDepth : mpWidth;
    } else {
      hMeters = Math.max(0.8, horizontal.length - 0.15);
      vMeters = Math.max(0.8, vertical.length - 0.15);
    }

    const lines = [
      insetDimension(horizontal, hMeters, center, floorZ, 1.05),
      insetDimension(vertical, vMeters, center, floorZ, 1.05),
    ].filter((line) => line.meters >= 0.8);

    const zones = [];
    for (const id of sceneIds) {
      const zone = zoneName(input.titles?.[id]);
      if (zone && !zones.includes(zone)) zones.push(zone);
    }
    const mapPoint = plan ? applyPlanSimilarity(plan, center) : null;
    rooms.push({
      id: apiRoom.id,
      zones,
      width: round2(Math.max(hMeters, vMeters)),
      length: round2(Math.min(hMeters, vMeters)),
      height,
      area: area == null ? null : round2(area),
      rectangular: Boolean(rectangular || (mpWidth && mpDepth)),
      source,
      floorZ: round2(floorZ),
      sceneIds,
      lines,
      map: mapPoint ? { x: round2(mapPoint[0]), y: round2(mapPoint[1]) } : null,
    });
  }
  return rooms;
}

export function roomForScene(model, sceneId) {
  if (!model?.rooms || !sceneId) return null;
  return model.rooms.find((room) => room.sceneIds?.includes(sceneId)) || null;
}

/** Hebrew chip for the current room. Numbers stay left-to-right. */
export function roomChip(room, sceneTitle) {
  if (!room) return null;
  const zone = zoneName(sceneTitle);
  const size = `\u200E${room.width.toFixed(2)} × ${room.length.toFixed(2)}\u00A0מ׳`;
  const height = room.height ? `\u200Eגובה ${room.height.toFixed(2)}\u00A0מ׳` : null;
  const area = !room.rectangular && room.area ? `\u200E${Math.round(room.area)}\u00A0מ״ר` : null;
  const ranked = [...(room.zones || [])].filter((name) => ZONE_RANK.includes(name));
  ranked.sort((a, b) => ZONE_RANK.indexOf(a) - ZONE_RANK.indexOf(b));
  const title = !room.rectangular && ranked.length > 1
    ? ranked.slice(0, 3).join(" · ")
    : (zone || ranked[0] || room.zones?.[0] || "");
  return {
    title,
    sizeLabel: room.rectangular ? size : `קירות ${size}`,
    height,
    area,
  };
}
