function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/** Interior wall segments from Matterport floor edges, lengths left exact. */
export function wallsFromFloors(floors) {
  const walls = [];
  for (const floor of floors || []) {
    for (const edge of floor.edges || []) {
      if (edge.type && edge.type !== "wall") continue;
      const verts = edge.vertices || [];
      if (verts.length < 2) continue;
      const a = verts[0].position;
      const b = verts[verts.length - 1].position;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 0.05) continue;
      const openings = [];
      for (const opening of edge.openings || []) {
        const center = opening.relativeCenter * length;
        const half = opening.width / 2;
        const t0 = Math.max(0, center - half);
        const t1 = Math.min(length, center + half);
        if (t1 - t0 < 0.05) continue;
        const z0 = opening.lowerElevation || 0;
        openings.push({
          t0: round4(t0),
          t1: round4(t1),
          z0: round4(z0),
          z1: round4(z0 + (opening.height || 2)),
          kind: opening.type,
          width: round4(opening.width),
        });
      }
      walls.push({
        a: [round4(a.x), round4(a.y)],
        b: [round4(b.x), round4(b.y)],
        thickness: round4(edge.thickness || 0.16),
        openings,
      });
    }
  }
  return walls;
}
