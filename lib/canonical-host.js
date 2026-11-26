export const LEGACY_VERCEL_HOST = "visio-photography.vercel.app";
export const CANONICAL_ORIGIN = "https://visioisrael.com";

/** 308 target for the production Vercel host only. Preview hosts stay put. */
export function legacyHostRedirect(hostHeader, pathname, search = "") {
  const host = String(hostHeader || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (host !== LEGACY_VERCEL_HOST) return null;
  const path = pathname && String(pathname).startsWith("/") ? String(pathname) : `/${pathname || ""}`;
  const query = !search ? "" : String(search).startsWith("?") ? String(search) : `?${search}`;
  return `${CANONICAL_ORIGIN}${path}${query}`;
}
