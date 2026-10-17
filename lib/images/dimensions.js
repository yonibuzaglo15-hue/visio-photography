/**
 * Read width/height from JPEG or PNG buffers without extra dependencies.
 * Used so Insta360 X4 equirects classify correctly even without "360" in the filename.
 */

/** True if width/height is equirectangular 2:1 within ±1%. */
export function isEquirectRatio(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!w || !h || h <= 0) return false;
  const ratio = w / h;
  // ±1% of 2:1 → [1.98, 2.02]
  return ratio >= 1.98 && ratio <= 2.02;
}

export function readImageDimensions(buffer) {
  if (!buffer || buffer.length < 10) return null;
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  // JPEG
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    // Standalone markers (no length)
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) break;
    // SOF0–SOF3
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }

  return null;
}

const HEADER_BYTES = 256 * 1024; // SOF is usually early; EXIF can be large

/**
 * Fetch only the start of a remote image (Range) and parse dimensions.
 * Falls back to a truncated GET if the host ignores Range.
 */
export async function fetchImageDimensionsFromUrl(url, { timeoutMs = 30_000 } = {}) {
  if (!url || typeof url !== "string") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res = await fetch(url, {
      headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
      signal: controller.signal,
    });

    if (!res.ok && res.status !== 206) {
      // Some hosts reject Range — retry a normal GET but only read the header chunk.
      res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
    }

    const ab = await res.arrayBuffer();
    const slice = ab.byteLength > HEADER_BYTES ? ab.slice(0, HEADER_BYTES) : ab;
    return readImageDimensions(Buffer.from(slice));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
