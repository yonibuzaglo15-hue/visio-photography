/**
 * Matterport-style translucent floor ring for VirtualTourPlugin arrowStyle.image.
 * Data URL so we don't depend on a static asset deploy path.
 */
export const FLOOR_DISC_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="64" cy="64" rx="54" ry="54" fill="url(#g)"/>
  <ellipse cx="64" cy="64" rx="48" ry="48" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="5"/>
  <ellipse cx="64" cy="64" rx="34" ry="34" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2"/>
  <ellipse cx="64" cy="64" rx="8" ry="8" fill="#ffffff" fill-opacity="0.95"/>
</svg>`);
