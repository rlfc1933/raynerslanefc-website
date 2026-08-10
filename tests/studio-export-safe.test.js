// ════════════════════════════════════════════════════════════════════════════
// THE EXPORT SURFACE HAS TO SURVIVE html2canvas 1.4.1.
//
// The live Studio failed on DOWNLOAD PNG with:
//   "Attempting to parse an unsupported color function 'color'"
// and, once that was fixed:
//   "addColorStop: The provided double value is non-finite."
//
// Both came from CSS that every browser renders perfectly and the exporter
// cannot: color-mix(), and a radial-gradient with no explicit size. Neither was
// caught by anything, because this CSS only ever lived in dev galleries nobody
// downloaded from — putting the renderer in the real Studio put it on the
// export path for the first time.
//
// A creative system that cannot produce the file is not a creative system, so
// these rules are now enforced.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Everything that can end up inside #ps-card when html2canvas captures it.
const EXPORT_CSS = ['css/creative-engine.css', 'css/creative-square-matchday.css'];
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');   // comments may discuss them

test('no CSS Color 4 function reaches the export surface', () => {
  const bad = [];
  EXPORT_CSS.forEach((f) => {
    const src = strip(read(f));
    [/color-mix\s*\(/g, /\boklch\s*\(/g, /\boklab\s*\(/g, /\blab\s*\(/g,
     /\blch\s*\(/g, /\bhwb\s*\(/g, /[^-\w]color\s*\(/g].forEach((re) => {
      const m = src.match(re);
      if (m) bad.push(f + ': ' + m.join(' '));
    });
  });
  assert.deepStrictEqual(bad, [],
    'html2canvas 1.4.1 cannot parse these and aborts the whole PNG');
});

test('every radial gradient on the export surface is explicitly sized', () => {
  // An unsized ellipse means farthest-corner, which the exporter computes as a
  // non-finite radius on a percentage-sized box and then throws.
  const bad = [];
  EXPORT_CSS.forEach((f) => {
    const src = strip(read(f));
    const re = /radial-gradient\(\s*([^,]+),/g;
    let m;
    while ((m = re.exec(src))) {
      const head = m[1].trim();
      // Acceptable: "ellipse 88% 78% at 30% 50%" / "circle 40px at ..." /
      // an explicit extent keyword.
      const sized = /(\d|closest-side|closest-corner|farthest-side|farthest-corner)/.test(
        head.replace(/at\s+[\d.% a-z]+$/, '')
      );
      if (!sized) bad.push(f + ': radial-gradient(' + head + ', …)');
    }
  });
  assert.deepStrictEqual(bad, [], 'size the ellipse, or the export throws');
});

test('mix-blend-mode is not used on the export surface', () => {
  // Not a crash — worse in its way. The exporter ignores it, so the downloaded
  // file silently differs from the preview the operator approved.
  const bad = [];
  EXPORT_CSS.forEach((f) => {
    if (/mix-blend-mode\s*:/.test(strip(read(f)))) bad.push(f);
  });
  assert.deepStrictEqual(bad, [],
    'preview and downloaded file must be the same image');
});

test('the opponent counter-light is pre-mixed to rgba in JS', () => {
  const sq = read('js/creative-square.js');
  assert.match(sq, /function rgba\(hex, alpha\)/);
  assert.match(sq, /--sq-oppA:/, 'the CSS consumes a ready-made rgba');
  assert.match(read('css/creative-square-matchday.css'), /var\(--sq-oppA/);
});

test('the preview fits the whole canvas rather than cropping it', () => {
  const admin = read('admin.html');
  assert.match(admin, /function psFitCard\(W, H\)/, 'both render paths need one fit');
  const fn = admin.slice(admin.indexOf('function psFitCard'), admin.indexOf('function psFitCard') + 1400);
  assert.match(fn, /Math\.min\(1, availW \/ W, availH \/ H\)/,
    'contain on BOTH axes — a story at 1080x1920 must not run off the screen');
  assert.match(read('js/studio-cinematic.js'), /psFitCard\(size\.w, size\.h\)/,
    'the cinematic path returns early and must scale itself');
});

test('a failed export explains itself in English, not in parser terms', () => {
  const admin = read('admin.html');
  assert.ok(!/toast\('Render failed: ' \+ e\.message/.test(admin),
    'a volunteer should never be shown a CSS parser exception');
  assert.match(admin, /console\.error\('\[post-studio\] export failed'/,
    'the detail belongs in the console');
  assert.match(admin, /function psExportBusy/, 'and the button must show it is working');
});
