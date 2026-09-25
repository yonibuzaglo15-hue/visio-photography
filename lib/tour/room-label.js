/**
 * Display name for a scene — never a raw upload filename or internal id.
 * @param {{ title?: string, id?: string }} scene
 * @param {number} [index1based]
 */
export function friendlyRoomLabel(scene, index1based) {
  const raw = String(scene?.title || "").trim();
  if (raw && !looksLikeFileOrId(raw)) return raw;
  const n =
    Number.isFinite(Number(index1based)) && Number(index1based) > 0
      ? Number(index1based)
      : (() => {
          const m = String(scene?.id || "").match(/(\d+)/);
          return m ? Number(m[1]) + 1 : 1;
        })();
  return `חדר ${n}`;
}

/** Camera filenames (IMG_20260922_130035), extensions, timestamps, scene ids. */
export function looksLikeFileOrId(text) {
  const t = String(text || "").trim();
  return (
    /^IMG[\s._-]?\d/i.test(t) ||
    /^(VID|PANO|DSC|DJI|INSTA360|LRV)[\s._-]?\d/i.test(t) ||
    /^\d{8}([\s._-]\d{4,6})?/.test(t) ||
    /\.(jpe?g|png|webp|heic|insp|dng)$/i.test(t) ||
    /^scene[_\s-]?\d+$/i.test(t)
  );
}
