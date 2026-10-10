// Asset Studio file packaging: the PDF and ZIP writers produce files real
// tools accept (pdfinfo / unzip when installed), not just bytes that look right.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('../js/studio/pack.js');

// A real 2×1 baseline JPEG (generated once; tiny on purpose).
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAIBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AKp//9k=', 'base64');
const has = (bin) => { try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; } catch (e) { return false; } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pack-'));

test('imageSize reads JPEG and PNG headers', () => {
  assert.deepStrictEqual(P.imageSize(new Uint8Array(JPEG)), { format: 'jpeg', w: 2, h: 1 });
  const png = Buffer.alloc(33); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(1080, 16); png.writeUInt32BE(1920, 20);
  assert.deepStrictEqual(P.imageSize(new Uint8Array(png)), { format: 'png', w: 1080, h: 1920 });
});

test('PDF: one A4 page, image embedded as DCT, xref offsets exact', () => {
  const pdf = Buffer.from(P.pdf([{ jpeg: new Uint8Array(JPEG), pxW: 2, pxH: 1, wPt: 595.28, hPt: 841.89 }], { title: 'rlfc-test.pdf' }));
  const s = pdf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4')); assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.match(s, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(s, /\/Filter \/DCTDecode/);
  const xref = +/startxref\n(\d+)/.exec(s)[1];
  assert.strictEqual(s.slice(xref, xref + 4), 'xref');
  const offs = s.slice(xref).split('\n').slice(3).filter((l) => / n $/.test(l)).map((l) => +l.slice(0, 10));
  offs.forEach((o, i) => assert.strictEqual(s.slice(o, o + String(i + 1).length + 6), (i + 1) + ' 0 obj'));
  if (has('pdfinfo')) {
    const d = tmp(), f = path.join(d, 'a.pdf'); fs.writeFileSync(f, pdf);
    const info = execFileSync('pdfinfo', [f]).toString();
    assert.match(info, /Pages:\s+1/); assert.match(info, /Page size:\s+595\.28 x 841\.89 pts \(A4\)/);
  }
});

test('ZIP: stored entries with correct CRCs, readable by unzip', () => {
  const a = new TextEncoder().encode('hello'), b = new Uint8Array(JPEG);
  const z = Buffer.from(P.zip([{ name: 'rlfc-a.txt', bytes: a }, { name: 'rlfc-b.jpg', bytes: b }]));
  assert.strictEqual(z.readUInt32LE(0), 0x04034b50);
  assert.strictEqual(z.readUInt32LE(14), P.crc32(a));
  assert.strictEqual(P.crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'the standard CRC-32 check value');
  const eocd = z.length - 22;
  assert.strictEqual(z.readUInt32LE(eocd), 0x06054b50); assert.strictEqual(z.readUInt16LE(eocd + 10), 2);
  if (has('unzip')) {
    const d = tmp(), f = path.join(d, 'a.zip'); fs.writeFileSync(f, z);
    assert.match(execFileSync('unzip', ['-t', f]).toString(), /No errors detected/);
    execFileSync('unzip', ['-o', '-q', f, '-d', d]);
    assert.ok(fs.readFileSync(path.join(d, 'rlfc-b.jpg')).equals(JPEG));
  }
});
