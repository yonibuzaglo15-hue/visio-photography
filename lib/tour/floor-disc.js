/**
 * Matterport-style translucent floor ring for VirtualTourPlugin arrowStyle.image.
 * Perspective-squashed ellipse (ry < rx) so it reads as a disc on the floor.
 * Data URL so we don't depend on a static asset deploy path.
 */
export const FLOOR_DISC_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="80" viewBox="0 0 128 80">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="64" cy="40" rx="54" ry="28" fill="url(#g)"/>
  <ellipse cx="64" cy="40" rx="48" ry="24" fill="none" stroke="#ffffff" stroke-opacity="0.88" stroke-width="4"/>
  <ellipse cx="64" cy="40" rx="34" ry="17" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="2"/>
  <ellipse cx="64" cy="40" rx="7" ry="4" fill="#ffffff" fill-opacity="0.9"/>
</svg>`);
