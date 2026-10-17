/**
 * Client-safe panorama size helpers (no sharp / Node APIs).
 */

/**
 * Pick best viewer URL for this device from scene config.
 * @param {{ panorama?: string, viewerSizes?: Record<string,string> }} scene
 * @param {number|null} maxTextureSize
 */
export function pickPanoramaForDevice(scene, maxTextureSize) {
  const variants = scene?.viewerSizes || {};
  const max = Number(maxTextureSize) || 4096;
  if (max >= 6144 && variants["6144"]) return variants["6144"];
  if (variants["4096"]) return variants["4096"];
  if (variants["6144"]) return variants["6144"];
  return scene?.panorama || null;
}

/**
 * Mutate tour config scenes in-place to use device-appropriate panoramas.
 */
export function applyDevicePanoramas(config, maxTextureSize) {
  if (!config?.scenes) return config;
  Object.keys(config.scenes).forEach((id) => {
    const sc = config.scenes[id];
    const picked = pickPanoramaForDevice(sc, maxTextureSize);
    if (picked) sc.panorama = picked;
  });
  return config;
}

export function probeMaxTextureSize() {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return null;
    return gl.getParameter(gl.MAX_TEXTURE_SIZE);
  } catch {
    return null;
  }
}
