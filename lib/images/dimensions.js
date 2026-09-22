/**
 * Read width/height from JPEG or PNG buffers without extra dependencies.
 * Used so Insta360 X4 equirects classify correctly even without "360" in the filename.
 */
export function readImageDimensions(buffer) {
  if (!buffer || buffer.length < 24) return null;
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
