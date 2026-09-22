const PANORAMA_PATTERNS = [
  /360/i, /panorama/i, /pano/i, /equirect/i, /ricoh/i, /theta/i,
  /insta360/i, /insta/i, /x4/i, /sphere/i, /vr/i, /_pano_/i,
];

/**
 * Classify a file as panorama (360) or regular photo.
 * @param {{ name: string, type?: string, width?: number, height?: number }} file
 * @returns {'panorama' | 'photo'}
 */
export function classifyFile(file) {
  if (file.type === "panorama" || file.type === "360") return "panorama";
  if (file.type === "photo") return "photo";

  const name = file.name || "";
  if (PANORAMA_PATTERNS.some((p) => p.test(name))) return "panorama";

  if (file.width && file.height) {
    const ratio = file.width / file.height;
    if (ratio >= 1.8 && ratio <= 2.2) return "panorama";
  }

  return "photo";
}

/**
 * Route classified files to agents.
 * @param {Array} files
 */
export function routeFiles(files) {
  return files.map((f) => {
    const type = classifyFile(f);
    const assignedTo =
      type === "panorama"
        ? ["tour"]
        : ["creative", "video"];
    return { ...f, type, assignedTo };
  });
}

export function splitByAgent(routedFiles) {
  return {
    tour: routedFiles.filter((f) => f.assignedTo.includes("tour")),
    creative: routedFiles.filter((f) => f.assignedTo.includes("creative")),
    video: routedFiles.filter((f) => f.assignedTo.includes("video")),
    panoramas: routedFiles.filter((f) => f.type === "panorama"),
    photos: routedFiles.filter((f) => f.type === "photo"),
  };
}
