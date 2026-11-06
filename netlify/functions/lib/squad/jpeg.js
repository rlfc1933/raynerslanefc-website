// JPEG checks for player headshots: is it really a JPEG, how big is it, and
// remove every metadata segment (EXIF — which carries phone GPS location —
// XMP, comments) before anything is stored. The browser already re-encodes
// through a canvas, which drops EXIF; this is the server refusing to trust it.
'use strict';

function isJpeg(buf) { return buf && buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF; }

/** Width/height from the first SOF marker, or null. */
function size(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xFF) return null;
    const m = buf[i + 1];
    if (m === 0xD9 || m === 0xDA) return null;
    const len = buf.readUInt16BE(i + 2);
    if ((m >= 0xC0 && m <= 0xC3) || (m >= 0xC5 && m <= 0xC7) || (m >= 0xC9 && m <= 0xCB) || (m >= 0xCD && m <= 0xCF)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/** Copy of the image without APP1–APP15 and COM segments. */
function strip(buf) {
  const out = [buf.slice(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xFF) throw new Error('not a well-formed JPEG');
    const m = buf[i + 1];
    if (m === 0xDA) { out.push(buf.slice(i)); return Buffer.concat(out); }   // image data: keep the rest
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.slice(i, i + 2 + len);
    const metadata = (m >= 0xE1 && m <= 0xEF) || m === 0xFE;
    if (!metadata) out.push(seg);
    i += 2 + len;
  }
  throw new Error('not a well-formed JPEG');
}

function hasMetadata(buf) {
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xFF) {
    const m = buf[i + 1];
    if (m === 0xDA) return false;
    if ((m >= 0xE1 && m <= 0xEF) || m === 0xFE) return true;
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return false;
}

module.exports = { isJpeg, size, strip, hasMetadata };
