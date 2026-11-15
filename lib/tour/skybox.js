/**
 * Stitch a Matterport skybox into a Pannellum equirectangular image.
 *
 * Face order from the public model (verified by matching shared edges):
 * 0 up, 1 front (+Z), 2 right (+X), 3 back (−Z), 4 left (−X), 5 down.
 * Side images keep world-up toward the top of the file. The up face's
 * bottom edge meets the front face. The down face's top edge meets the front.
 *
 * Equirectangular layout matches Pannellum: image centre is yaw 0 / pitch 0
 * (front), image right is positive yaw, image top is pitch up.
 */

const FACES = 6;

function sample(data, size, u, v) {
  const x = Math.min(size - 1, Math.max(0, u * size - 0.5));
  const y = Math.min(size - 1, Math.max(0, v * size - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * size + x0) * 3;
  const i10 = (y0 * size + x1) * 3;
  const i01 = (y1 * size + x0) * 3;
  const i11 = (y1 * size + x1) * 3;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  return [
    data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11,
    data[i00 + 1] * w00 + data[i10 + 1] * w10 + data[i01 + 1] * w01 + data[i11 + 1] * w11,
    data[i00 + 2] * w00 + data[i10 + 2] * w10 + data[i01 + 2] * w01 + data[i11 + 2] * w11,
  ];
}

/**
 * @param {{ data: Uint8Array, width: number, height: number }[]} faces six RGB faces, same size
 * @param {number} outW
 * @param {number} outH
 * @returns {Buffer} RGB, outW * outH * 3
 */
export function equirectFromSkyboxes(faces, outW, outH) {
  if (!faces || faces.length !== FACES) throw new Error("A Matterport skybox needs 6 faces");
  const size = faces[0].width;
  if (!faces.every((face) => face.width === size && face.height === size && face.data?.length === size * size * 3)) {
    throw new Error("Skybox faces must be square RGB images of one size");
  }
  const src = faces.map((face) => face.data);
  const out = Buffer.alloc(outW * outH * 3);
  const twoPi = Math.PI * 2;
  for (let y = 0; y < outH; y += 1) {
    const phi = (0.5 - (y + 0.5) / outH) * Math.PI;
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const row = y * outW * 3;
    for (let x = 0; x < outW; x += 1) {
      const lambda = ((x + 0.5) / outW - 0.5) * twoPi;
      const dx = cp * Math.sin(lambda);
      const dy = sp;
      const dz = cp * Math.cos(lambda);
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const az = Math.abs(dz);
      let face = 1;
      let u = 0.5;
      let v = 0.5;
      if (ay >= ax && ay >= az) {
        if (dy > 0) {
          face = 0;
          const nd = dy;
          u = (dx / nd + 1) * 0.5;
          v = (dz / nd + 1) * 0.5;
        } else {
          face = 5;
          const nd = -dy || 1e-8;
          u = (dx / nd + 1) * 0.5;
          v = (-dz / nd + 1) * 0.5;
        }
      } else if (ax >= az) {
        if (dx > 0) {
          face = 2;
          const nd = dx;
          u = (-dz / nd + 1) * 0.5;
          v = (-dy / nd + 1) * 0.5;
        } else {
          face = 4;
          const nd = -dx || 1e-8;
          u = (dz / nd + 1) * 0.5;
          v = (-dy / nd + 1) * 0.5;
        }
      } else if (dz > 0) {
        face = 1;
        const nd = dz;
        u = (dx / nd + 1) * 0.5;
        v = (-dy / nd + 1) * 0.5;
      } else {
        face = 3;
        const nd = -dz || 1e-8;
        u = (-dx / nd + 1) * 0.5;
        v = (-dy / nd + 1) * 0.5;
      }
      const rgb = sample(src[face], size, u, v);
      const o = row + x * 3;
      out[o] = rgb[0];
      out[o + 1] = rgb[1];
      out[o + 2] = rgb[2];
    }
  }
  return out;
}
