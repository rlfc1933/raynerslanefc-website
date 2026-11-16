// The legacy public draft (data/programme.json) is closed:
//   · the file is gone from the tree and 404s publicly, with the other private paths
//   · no client code fetches it, or any draft, from the public site
//   · its content survives only in the private store, seeded once from a copy
//     bundled with the save-data function (never served: /netlify/* is 404)
//   · unauthenticated reads of every private path are refused
//   · render code for draft fields escapes HTML (stored-XSS)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

process.env.GITHUB_TOKEN = 'fake';
process.env.ADMIN_PIN = 'legacy-test-pin-123456';
const PIN = process.env.ADMIN_PIN;

const ghCalls = [];
const realFetch = global.fetch;
global.fetch = async (url, opt) => { opt = opt || {};
  url = String(url);
  if (/api\.github\.com|purge\.jsdelivr/.test(url)) {
    ghCalls.push((opt.method || 'GET') + ' ' + url);
    const m = url.match(/contents\/([^?]+)\?ref=86b2143/);
    if ((!opt.method || opt.method === 'GET') && m && HISTORY[m[1]]) return { ok: true, status: 200, json: async () => ({ content: Buffer.from(JSON.stringify(HISTORY[m[1]])).toString('base64') }) };
    return { ok: false, status: 404, json: async () => ({}) };
  }
  return realFetch(url, opt);
};
const save = require(path.join(ROOT, 'netlify/functions/save-data.js'));
let blobs = {};
save._setDraftStore({ get: async (k) => (k in blobs ? JSON.parse(blobs[k]) : null), setJSON: async (k, v) => { blobs[k] = JSON.stringify(v); } });
const call = async (b) => { const r = await save.handler({ httpMethod: 'POST', body: JSON.stringify(b) }); return { status: r.statusCode, j: JSON.parse(r.body) }; };
// Synthetic stand-in for the old file. The real content is read from git
// history in production and must never be copied into the public tree.
const LEGACY = { programme: { opponent: 'Synthetic Opponent FC', date: '2026-11-28' } };
const HISTORY = { 'data/programme.json': LEGACY.programme, 'data/programmes.json': { items: [{ id: 'd1', published: false }, { id: 'p1', published: true }] } };
const PRIVATE_PATHS = ['data/programme-draft.json', 'data/news-drafts.json', 'data/programme-legacy-recovery.json'];

// ── unauthenticated reads ─────────────────────────────────────────────────
for (const p of PRIVATE_PATHS) {
  test('unauthenticated read of ' + p + ' is refused', async () => {
    blobs = {};
    for (const pin of [undefined, '', 'wrong-pin']) {
      const r = await call({ pin, read: true, path: p });
      assert.strictEqual(r.status, 401);
      assert.ok(!('data' in r.j), 'a refusal carries no data');
    }
    assert.deepStrictEqual(blobs, {}, 'a refused read does not even seed the store');
  });
}

// ── recovery ──────────────────────────────────────────────────────────────
test('first signed-in read of the draft seeds it from the legacy copy, once', async () => {
  blobs = {}; ghCalls.length = 0;
  const r = await call({ pin: PIN, read: true, path: 'data/programme-draft.json' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.j.exists, true);
  assert.strictEqual(r.j.data.opponent, LEGACY.programme.opponent);
  assert.strictEqual(r.j.data.revision, 0);
  assert.ok(blobs['programme-legacy-recovery'], 'the recovery copy is stored privately');
  assert.ok(ghCalls.length && ghCalls.every((c) => /^GET .*\?ref=86b2143/.test(c)), 'only reads git history; never writes to the repository');
  // A later save replaces it; the seed never comes back over staff work.
  await call({ pin: PIN, path: 'data/programme-draft.json', content: Buffer.from(JSON.stringify({ revision: 1, opponent: 'Hilltop' })).toString('base64'), expectRevision: 0 });
  const again = await call({ pin: PIN, read: true, path: 'data/programme-draft.json' });
  assert.strictEqual(again.j.data.opponent, 'Hilltop');
});

test('an existing private draft is never overwritten by the seed', async () => {
  blobs = { 'programme-draft': JSON.stringify({ revision: 7, opponent: 'Burnham' }) };
  const r = await call({ pin: PIN, read: true, path: 'data/programme-draft.json' });
  assert.strictEqual(r.j.data.opponent, 'Burnham');
});

test('the legacy recovery copy is readable by staff and cannot be written', async () => {
  blobs = {};
  const r = await call({ pin: PIN, read: true, path: 'data/programme-legacy-recovery.json' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.j.data.programme.opponent, LEGACY.programme.opponent);
  const w = await call({ pin: PIN, path: 'data/programme-legacy-recovery.json', content: Buffer.from('{}').toString('base64') });
  assert.strictEqual(w.status, 403);
  const m = await call({ pin: PIN, merge: true, domain: 'programme-legacy-recovery', key: 'x', idField: 'id', upserts: [{ id: 1 }] });
  assert.strictEqual(m.status, 403);
  assert.strictEqual(JSON.parse(blobs['programme-legacy-recovery']).programme.opponent, LEGACY.programme.opponent);
});

// ── the public surface ────────────────────────────────────────────────────
test('the legacy file is gone and the public archive holds no unpublished items', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'data/programme.json')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'js/programme.js')), 'the dead public reader is gone');
  const a = JSON.parse(read('data/programmes.json'));
  assert.ok((a.items || []).every((i) => i.published === true));
});

test('netlify.toml forces a 404 for every private data path and the functions dir', () => {
  const toml = read('netlify.toml');
  for (const p of ['/data/programme.json', '/data/programme-draft.json', '/data/news-drafts.json', '/data/programme-legacy-recovery.json', '/netlify/*']) {
    const re = new RegExp('\\[\\[redirects\\]\\]\\s*from = "' + p.replace(/[.*/]/g, '\\$&') + '"\\s*to = "/404.html"\\s*status = 404\\s*force = true');
    assert.match(toml, re, p + ' must be a forced 404');
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'netlify/functions/lib/legacy-programme-draft.json')), 'no copy of the draft in the public tree');
});

function walk(dir, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'tests', 'docs', 'quality', '.claude'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(html|js|txt|xml|json|toml)$/.test(f.name)) out.push(p);
  }
  return out;
}
test('no client code fetches data/programme.json or a draft from the public site', () => {
  const offenders = [];
  for (const f of walk(ROOT, [])) {
    const rel = path.relative(ROOT, f);
    if (rel.startsWith('netlify') ) continue;
    const s = fs.readFileSync(f, 'utf8');
    if (/fetch\(\s*['"][^'"]*data\/programme(-draft|-legacy-recovery)?\.json/.test(s)) offenders.push(rel + ': fetch');
    if (/(getJSON|fetchJSON|dataFile|\bj)\(\s*'(data\/)?programme(\.json)?'/.test(s)) offenders.push(rel + ': helper');
    if (/raynerslanefc-website@[^'"]*\/data\/programme\.json/.test(s)) offenders.push(rel + ': cdn');
  }
  assert.deepStrictEqual(offenders, []);
  assert.doesNotMatch(read('sw.js'), /programme\.json/);
});

test('print with no edition never renders a draft', () => {
  const p = read('programme-print.html');
  const l = p.match(/function loadProgrammeDoc\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(l, /if \(!id\) \{ window\.__pxBlocked = 'No edition chosen'/);
  assert.match(l, /hit\.published!==true\) hit=null/);
});

// ── stored XSS ────────────────────────────────────────────────────────────
const PAYLOADS = ['<img src=x onerror=alert(1)>', '" onmouseover="x', "' onmouseover='x"];
function clean(html) {
  assert.doesNotMatch(html, /<img src=x/i, 'raw tag');
  assert.doesNotMatch(html, /" onmouseover=/, 'attribute breakout');
}
// Pull a named function's source out of a file, matching braces outside strings.
function fnSrc(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, name + ' not found');
  let i = src.indexOf('{', start), depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced ' + name);
}
// One-line helpers (escapers) hold regex literals the brace matcher cannot read.
function lineSrc(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, name + ' not found');
  return src.slice(start, src.indexOf('\n', start)) + '\n';
}
function fakeEl() { return { hidden: false, innerHTML: '', querySelectorAll: () => [], scrollIntoView() {} }; }

test('programme editor: carry-over list, checks and opponent source escape HTML', () => {
  const s = read('js/programme-editor.js');
  for (const x of PAYLOADS) {
    const el = fakeEl();
    const PRE = { carry: { from: x, to: x, items: [{ label: x, el: x, field: x }] }, checks: () => [{ level: 'must', kind: x, text: x, el: x }] };
    const f = new Function('$', 'PRE', 'val', 'profileFor', lineSrc(s, 'h') + "var DISCLAIMER = 'This checklist does not certify legal or league compliance.';\n" + fnSrc(s, 'renderCarry') + fnSrc(s, 'renderChecks') + fnSrc(s, 'renderOppSource') +
      'renderCarry(); var a = $().innerHTML; renderChecks(); var b = $().innerHTML; renderOppSource(); return [a, b, $().innerHTML];');
    const out = f(() => el, PRE, () => x, () => ({ key: x, founded: x, ground: x, verification: x, reviewedOn: x, reviewNote: x }));
    out.forEach(clean);
    if (x[0] === '<') assert.ok(out[0].includes('&lt;img'), 'the text is still shown, escaped');
  }
});

test('admin news drafts list and preview escape HTML', () => {
  const s = read('admin.html');
  for (const x of PAYLOADS) {
    const el = fakeEl();
    const doc = { getElementById: () => el };
    const draft = { id: x, title: x, savedAt: x, savedBy: x };
    const f = new Function('document', 'nwDrafts', 'nwForm', 'imgStore', lineSrc(s, 'escH') + fnSrc(s, 'nwRenderDrafts') + fnSrc(s, 'nwPreview') +
      'nwRenderDrafts(); var a = el().innerHTML; nwPreview(); return [a, el().innerHTML]; function el(){ return document.getElementById(); }');
    const out = f(doc, [draft], () => ({ image: x, category: x, date: x, title: x, excerpt: x, body: x, author: x }), {});
    out.forEach(clean);
  }
});

test('print page: esc covers attributes; kit, officials and banners escape', () => {
  const p = read('programme-print.html');
  const esc = new Function(lineSrc(p, 'esc') + 'return esc;')();
  for (const x of PAYLOADS) {
    clean('<i style="background:' + esc(x) + '">' + esc(x) + '</i>');
    const kit = new Function('esc', 'X', fnSrc(p, 'kitStrip') + fnSrc(p, 'kitText') + 'return [kitStrip(X, {shirt:{name:X,hex:X},shorts:X,socks:X,goalkeeper:X}), kitText(X, X, false)];')(esc, x);
    kit.forEach(clean);
    // Officials are printed through esc wherever they appear.
    assert.doesNotMatch(p, /\+\s*r\[1\]\s*\+/, 'an official name is never concatenated raw');
  }
  // Every dynamic part of a pxNote banner goes through esc().
  const calls = p.match(/pxNote\('(?:warn|err|ok)',[^;]*\);/g) || [];
  assert.ok(calls.length >= 4);
  for (const c of calls) {
    // A bare value concatenated into the banner (not wrapped in esc) is a hole.
    assert.doesNotMatch(c, /\+\s*(?!esc\()[A-Za-z_$][\w$.]*\s*(\+|\|\|)/, 'unescaped banner value: ' + c);
  }
});
