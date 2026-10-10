/* ════════════════════════════════════════════════════════════════════════
   ASSET STUDIO — FILE PACKAGING: PDF and ZIP, written byte by byte.

   Why no library. The Studio needs exactly two container formats and both
   are small, fixed specifications:
     • PDF 1.4 with one full-page JPEG image per page (DCTDecode) — the A4
       export. The JPEG is the canvas render at 300 dpi; the PDF page is
       exactly A4 (595.28 × 841.89 pt).
     • ZIP with STORED entries (no compression — PNG and JPEG are already
       compressed) — the batch download.
   A vendored zip or PDF library would be 10–100× this size and add a
   dependency to audit. Both writers are unit-tested by parsing their output
   back (tests/studio-pack.test.js) and by Playwright on real downloads.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudioPack = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function ascii(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s, 'utf8'));
  }
  function concat(parts) {
    var n = 0; parts.forEach(function (p) { n += p.length; });
    var out = new Uint8Array(n), o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }
  /** PDF string literal: escape the three characters that matter, keep ASCII only. */
  function pdfText(s) { return '(' + String(s || '').replace(/[^\x20-\x7e]/g, '-').replace(/([()\\])/g, '\\$1') + ')'; }
  function pdfDate(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'D:' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }

  /**
   * pages: [{ jpeg: Uint8Array, pxW, pxH, wPt, hPt }]
   * Each JPEG fills its page edge to edge.
   */
  function pdf(pages, meta) {
    meta = meta || {};
    var chunks = [], offsets = [], pos = 0;
    function push(bytes) { chunks.push(bytes); pos += bytes.length; }
    function obj(n, body, stream) {
      offsets[n] = pos;
      push(ascii(n + ' 0 obj\n' + body));
      if (stream) { push(ascii('\nstream\n')); push(stream); push(ascii('\nendstream')); }
      push(ascii('\nendobj\n'));
    }
    push(ascii('%PDF-1.4\n%'));
    push(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    var n = pages.length;
    var kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    pages.forEach(function (pg, i) {
      var pObj = 3 + i * 3, imObj = pObj + 1, cObj = pObj + 2;
      var W = pg.wPt.toFixed(2), H = pg.hPt.toFixed(2);
      obj(pObj, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im' + i + ' ' + imObj + ' 0 R >> >> /Contents ' + cObj + ' 0 R >>');
      obj(imObj, '<< /Type /XObject /Subtype /Image /Width ' + pg.pxW + ' /Height ' + pg.pxH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.jpeg.length + ' >>', pg.jpeg);
      var content = ascii('q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im' + i + ' Do Q');
      obj(cObj, '<< /Length ' + content.length + ' >>', content);
    });
    var infoObj = 3 + n * 3;
    obj(infoObj, '<< /Title ' + pdfText(meta.title || 'Rayners Lane FC') + ' /Producer (Rayners Lane FC Asset Studio) /CreationDate (' + pdfDate(meta.date || new Date()) + ') >>');
    var size = infoObj + 1;
    var xref = pos;
    var x = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
    for (var k = 1; k < size; k++) x += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
    push(ascii(x));
    push(ascii('trailer\n<< /Size ' + size + ' /Root 1 0 R /Info ' + infoObj + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'));
    return concat(chunks);
  }

  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  }());
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function dosTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }
  /** files: [{ name, bytes: Uint8Array }] → a STORED zip archive. */
  function zip(files, when) {
    var d = dosTime(when || new Date());
    var local = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.bytes, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, d.time, true); h.setUint16(12, d.date, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      local.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, d.time, true); c.setUint16(14, d.date, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cd = concat(central);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true);
    e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cd.length, true); e.setUint32(16, offset, true); e.setUint16(20, 0, true);
    return concat(local.concat([cd, new Uint8Array(e.buffer)]));
  }

  /** Read PNG/JPEG pixel size from bytes — used to verify a render before it is offered. */
  function imageSize(b) {
    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      var v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      return { format: 'png', w: v.getUint32(16), h: v.getUint32(20) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      var i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        var m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { format: 'jpeg', h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
        i += 2 + len;
      }
    }
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { format: 'pdf' };
    return null;
  }

  return { pdf: pdf, zip: zip, crc32: crc32, imageSize: imageSize };
}));
