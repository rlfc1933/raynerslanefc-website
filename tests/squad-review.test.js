// SQUAD REVIEW, PHOTOS AND THE STAFF HQ REMINDER — through the real handlers,
// on a Deploy-Preview host (so every write goes to the preview sandbox), with
// an in-memory Blob store that enforces the same conditional writes as Netlify.
// All players here are clearly fictional TEST records.
'use strict';
process.env.NODE_ENV = 'test';
process.env.MD_TOKEN_SECRET = 'test-secret-for-tests-only-long-enough';

const test = require('node:test');
const assert = require('node:assert');
const AUTH = require('../netlify/functions/lib/md-auth');
const ST = require('../netlify/functions/lib/squad/store');
const RL = require('../netlify/functions/lib/squad/review-logic');
const SCOPE = require('../netlify/functions/lib/deploy-scope');
const JP = require('../netlify/functions/lib/squad/jpeg');
const PUB = require('../netlify/functions/lib/squad/publish');

const HOST = 'deploy-preview-99--raynerslanefc.netlify.app';
const SEED = [
  { id: 'player-test-alfa-one', name: 'Test Alfa One', position: 'Defender', number: 2, photo: '' },
  { id: 'player-test-michael-adefolami', name: 'Test Michael Adefolami', position: 'Forward', number: 9, photo: '/img/players/x.webp' },
  { id: 'player-test-junior-keeper', name: 'Test Junior Keeper', position: 'Goalkeeper', number: 1, photo: '', age: 16 },
];

/* ── an in-memory Netlify Blobs store with etags and conditional writes ── */
function memoryBlobs() {
  const stores = {};
  return function (name) {
    const m = stores[name] || (stores[name] = new Map());
    let n = 0;
    return {
      async get(k, o) { const v = m.get(k); if (!v) return null; return o && o.type === 'json' ? JSON.parse(v.body) : (o && o.type === 'arrayBuffer' ? v.body : v.body); },
      async getWithMetadata(k) { const v = m.get(k); return v ? { data: JSON.parse(v.body), etag: v.etag, metadata: v.metadata } : null; },
      async setJSON(k, val, o) { return this.set(k, JSON.stringify(val), o); },
      async set(k, body, o) {
        const cur = m.get(k), opt = o || {};
        if (opt.onlyIfNew && cur) return { modified: false };
        if (opt.onlyIfMatch && (!cur || cur.etag !== opt.onlyIfMatch)) return { modified: false };
        const etag = '"' + (++n) + '-' + Math.random() + '"';
        m.set(k, { body, etag, metadata: opt.metadata || {} });
        return { modified: true, etag };
      },
    };
  };
}

let realFetch;
function setup() {
  ST.setBackend(memoryBlobs());
  realFetch = global.fetch;
  global.fetch = async (u) => {
    if (String(u).indexOf('/data/players.json') > -1) return { ok: true, json: async () => ({ players: SEED }) };
    throw new Error('unexpected network call: ' + u);
  };
  for (const k of Object.keys(require.cache)) if (/squad-(review|photo|data)\.js$/.test(k)) delete require.cache[k];
  return { review: require('../netlify/functions/squad-review'), photo: require('../netlify/functions/squad-photo'),
    data: require('../netlify/functions/squad-data') };
}
function done() { global.fetch = realFetch; ST.setBackend(null); }

function token(role, auth, username) {
  return AUTH.issue({ username: username || 'test.editor', role: role || 'Chairman', isChairman: role === 'Chairman' || !role, auth: auth || 'custom' });
}
const FX = { date: '2099-01-01', opponent: 'Test Visitors' };
async function call(fn, body, opts) {
  const o = opts || {};
  const headers = { host: o.host || HOST };
  if (o.token !== null) headers.authorization = 'Bearer ' + (o.token || token(o.role, o.auth, o.username));
  const r = await fn.handler({ httpMethod: 'POST', headers, body: JSON.stringify(body), _deps: Object.assign({ fixtures: FX }, o.deps) });
  return Object.assign({ status: r.statusCode }, JSON.parse(r.body));
}
async function publicPlayers(F) {
  const r = await F.data.handler({ headers: { host: HOST }, queryStringParameters: { file: 'players' } });
  return r.statusCode === 200 ? JSON.parse(r.body).players : SEED;
}
const reg = (rows) => ({ registry: async () => ({ ok: true, rows }) });
const row = (key, name) => ({ sourceKey: 'fwp:' + key, name, evidence: { source: 'TEST registry', season: '2026-27', checkedAt: '2026-11-06T10:00:00Z', note: 'test' } });

/* ── access ──────────────────────────────────────────────────────────── */
test('no session, a shared-password session and a role without roster rights are all refused', async () => {
  const F = setup();
  try {
    assert.strictEqual((await call(F.review, { action: 'status' }, { token: null })).status, 401);
    const shared = await call(F.review, { action: 'confirm_current' }, { auth: 'shared' });
    assert.strictEqual(shared.status, 403);
    const vc = await call(F.review, { action: 'confirm_current' }, { role: 'V Chairman' });
    assert.strictEqual(vc.status, 403);
    assert.strictEqual((await call(F.photo, { playerId: 'pv-1' }, { auth: 'shared' })).status, 403);
    assert.strictEqual((await call(F.photo, { playerId: 'pv-1' }, { token: null })).status, 401);
    // Reading the card only needs a signed session.
    assert.strictEqual((await call(F.review, { action: 'status' }, { role: 'V Chairman' })).ok, true);
  } finally { done(); }
});

test('deploy scope: the live hosts are production, everything else is a sandbox', () => {
  assert.strictEqual(SCOPE.scopeOf({ headers: { host: 'raynerslanefc.co.uk' } }).production, true);
  assert.strictEqual(SCOPE.scopeOf({ headers: { host: 'www.raynerslanefc.co.uk' } }).production, true);
  const p = SCOPE.scopeOf({ headers: { host: HOST } });
  assert.strictEqual(p.production, false); assert.strictEqual(p.key, 'deploy-preview-99');
  assert.strictEqual(SCOPE.scopeOf({ headers: {} }).production, false, 'unknown host never counts as live');
});

/* ── the queue ───────────────────────────────────────────────────────── */
test('a proposed new player is reviewed and added once — a second answer adds nobody', async () => {
  const F = setup();
  try {
    const r = await call(F.review, { action: 'refresh' }, { deps: reg([row('900001', 'Test Newcomer Signing')]) });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.added, 1);
    const q = await call(F.review, { action: 'queue' });
    const p = q.proposals.find((x) => x.name === 'Test Newcomer Signing');
    assert.strictEqual(p.kind, 'new_player');
    assert.ok(p.evidence[0].source && p.evidence[0].season, 'evidence carries source and season');
    const noPos = await call(F.review, { action: 'resolve', proposalId: p.id, decision: 'add' });
    assert.strictEqual(noPos.ok, false);
    const add = await call(F.review, { action: 'resolve', proposalId: p.id, decision: 'add', position: 'Midfielder' });
    assert.strictEqual(add.ok, true, add.error);
    assert.strictEqual(add.website.state, 'website_updated');
    assert.ok((await publicPlayers(F)).some((x) => x.name === 'Test Newcomer Signing'), 'the preview squad page shows them');
    const again = await call(F.review, { action: 'resolve', proposalId: p.id, decision: 'add', position: 'Midfielder' });
    assert.strictEqual(again.already, true);
    const q2 = await call(F.review, { action: 'queue' });
    assert.strictEqual(q2.players.filter((x) => x.name === 'Test Newcomer Signing').length, 1, 'no duplicate player');
    const re = await call(F.review, { action: 'refresh' }, { deps: reg([row('900001', 'Test Newcomer Signing')]) });
    assert.strictEqual(re.added, 0, 'an answered source record never comes back');
  } finally { done(); }
});

test('a spelling variation is matched to the existing player without creating a duplicate', async () => {
  const F = setup();
  try {
    await call(F.review, { action: 'refresh' }, { deps: reg([row('900002', 'Test Michael Adefolarni')]) });
    const q = await call(F.review, { action: 'queue' });
    const p = q.proposals.find((x) => x.name === 'Test Michael Adefolarni');
    assert.strictEqual(p.kind, 'name_variant');
    const cand = p.candidates.find((c) => c.name === 'Test Michael Adefolami');
    assert.ok(cand, 'the existing player is offered');
    // "Add" is stopped by the duplicate check unless deliberately overridden.
    const add = await call(F.review, { action: 'resolve', proposalId: p.id, decision: 'add', position: 'Forward' });
    assert.strictEqual(add.duplicate, true);
    const same = await call(F.review, { action: 'resolve', proposalId: p.id, decision: 'same', playerId: cand.id });
    assert.strictEqual(same.ok, true);
    const after = await call(F.review, { action: 'queue' });
    assert.strictEqual(after.players.length, SEED.length, 'still the same number of players');
  } finally { done(); }
});

test('a player missing from the team sheets or the source is never removed or proposed as departed', async () => {
  const F = setup();
  try {
    // The source lists only one of the three players.
    await call(F.review, { action: 'refresh' }, { deps: reg([row('900003', 'Test Alfa One')]) });
    const q = await call(F.review, { action: 'queue' });
    assert.ok(!q.proposals.some((p) => p.kind === 'departure'), 'absence produced no departure');
    assert.strictEqual(q.players.filter((p) => p.status === 'active').length, SEED.length);
    // A source outage changes nothing at all.
    const down = await call(F.review, { action: 'refresh' }, { deps: { registry: async () => ({ ok: false, error: 'TEST outage.' }) } });
    assert.strictEqual(down.ok, false); assert.strictEqual(down.sourceUnavailable, true);
    const q2 = await call(F.review, { action: 'queue' });
    assert.deepStrictEqual(q2.players, q.players);
    assert.deepStrictEqual(q2.proposals.map((p) => p.id), q.proposals.map((p) => p.id));
    assert.match(q2.sources.registry.lastError, /outage/);
  } finally { done(); }
});

test('a confirmed, sourced departure removes the player from the current squad but keeps the record', async () => {
  const F = setup();
  try {
    const q = await call(F.review, { action: 'queue' });
    const alfa = q.players.find((p) => p.name === 'Test Alfa One');
    const bare = await call(F.review, { action: 'report_departure', playerId: alfa.id });
    assert.strictEqual(bare.status, 400, 'a departure needs a source');
    const js = await call(F.review, { action: 'report_departure', playerId: alfa.id, sourceUrl: 'javascript:alert(1)' });
    assert.strictEqual(js.status, 400, 'a non-web link is not a source');
    const rep = await call(F.review, { action: 'report_departure', playerId: alfa.id, sourceUrl: 'https://example.test/announcement' });
    assert.strictEqual(rep.ok, true);
    const r = await call(F.review, { action: 'resolve', proposalId: rep.proposal, decision: 'departed' });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.website.state, 'website_updated');
    assert.ok(!(await publicPlayers(F)).some((p) => p.name === 'Test Alfa One'), 'off the public current squad');
    const after = await call(F.review, { action: 'queue' });
    assert.strictEqual(after.players.find((p) => p.name === 'Test Alfa One').status, 'left', 'history kept, not deleted');
    // Marking someone departed straight from a source question needs a note.
    await call(F.review, { action: 'refresh' }, { deps: reg([row('900004', 'Test Somebody Else')]) });
    const p2 = (await call(F.review, { action: 'queue' })).proposals.find((x) => x.name === 'Test Somebody Else');
    const noNote = await call(F.review, { action: 'resolve', proposalId: p2.id, decision: 'departed', playerId: alfa.id });
    assert.strictEqual(noNote.status, 400);
  } finally { done(); }
});

test('two people answering the same question at once: one change, the other is told', async () => {
  const F = setup();
  try {
    await call(F.review, { action: 'refresh' }, { deps: reg([row('900005', 'Test Race Condition')]) });
    const p = (await call(F.review, { action: 'queue' })).proposals[0];
    const [a, b] = await Promise.all([
      call(F.review, { action: 'resolve', proposalId: p.id, decision: 'ignore' }, { username: 'a' }),
      call(F.review, { action: 'resolve', proposalId: p.id, decision: 'ignore' }, { username: 'b' }),
    ]);
    assert.ok(a.ok && b.ok);
    assert.strictEqual([a.changed, b.changed].filter(Boolean).length + [a.already, b.already].filter(Boolean).length >= 1, true);
    const q = await call(F.review, { action: 'queue' });
    assert.strictEqual(q.proposals.length, 0);
  } finally { done(); }
});

/* ── the Staff HQ card ───────────────────────────────────────────────── */
test('the card: due until a person confirms; "remind me later" is per person; confirming is recorded', async () => {
  const F = setup();
  try {
    const s = await call(F.review, { action: 'status' });
    assert.strictEqual(s.show, true);
    assert.ok(s.reasons.some((r) => /not been confirmed/.test(r)));
    assert.deepStrictEqual(s.missingHeadshots.map((p) => p.name).sort(), ['Test Alfa One', 'Test Junior Keeper']);
    await call(F.review, { action: 'remind_later', days: 3 }, { username: 'pete' });
    assert.strictEqual((await call(F.review, { action: 'status' }, { username: 'pete' })).show, false);
    assert.strictEqual((await call(F.review, { action: 'status' }, { username: 'russell' })).show, true, 'only for that person');
    const c = await call(F.review, { action: 'confirm_current' }, { username: 'russell' });
    assert.strictEqual(c.confirmed.by, 'russell', 'who comes from the session');
    const s2 = await call(F.review, { action: 'status' }, { username: 'russell' });
    assert.strictEqual(s2.lastConfirmed.by, 'russell');
    assert.strictEqual(s2.show, false, 'nothing waiting and recently confirmed');
  } finally { done(); }
});

/* ── photos ──────────────────────────────────────────────────────────── */
function jpeg(w, h, withExif) {
  const soi = Buffer.from([0xFF, 0xD8]);
  const app0 = Buffer.from([0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const exifBody = Buffer.from('Exif\0\0GPS-51.57,-0.36');
  const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1, 0, exifBody.length + 2]), exifBody]);
  const sof = Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const sos = Buffer.from([0xFF, 0xDA, 0x00, 0x0C, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3F, 0, 1, 2, 3, 4, 0xFF, 0xD9]);
  return Buffer.concat([soi, app0].concat(withExif ? [app1] : []).concat([sof, sos]));
}
const durl = (b) => 'data:image/jpeg;base64,' + b.toString('base64');

test('a headshot goes on the named player, versioned, with location data removed', async () => {
  const F = setup();
  try {
    const q = await call(F.review, { action: 'queue' });
    const alfa = q.players.find((p) => p.name === 'Test Alfa One');
    const ghost = await call(F.photo, { playerId: 'nobody', web: durl(jpeg(400, 500)), consentConfirmed: true });
    assert.strictEqual(ghost.status, 404, 'a photo never creates a player');
    const png = await call(F.photo, { playerId: alfa.id, web: 'data:image/png;base64,iVBORw0KGgo=', consentConfirmed: true });
    assert.strictEqual(png.status, 400); assert.match(png.error, /HEIC|JPEG/);
    const tiny = await call(F.photo, { playerId: alfa.id, web: durl(jpeg(120, 150)), consentConfirmed: true });
    assert.strictEqual(tiny.status, 400); assert.match(tiny.error, /too small/);
    const noConsent = await call(F.photo, { playerId: alfa.id, web: durl(jpeg(400, 500)) });
    assert.strictEqual(noConsent.needsConsent, 'player');
    const ok = await call(F.photo, { playerId: alfa.id, web: durl(jpeg(400, 500, true)), original: durl(jpeg(2000, 2500, true)), consentConfirmed: true });
    assert.strictEqual(ok.ok, true, ok.error);
    assert.strictEqual(ok.website.state, 'website_updated');
    assert.match(ok.photo, /squad-data\?photo=[a-f0-9]{10}$/, 'a new, versioned address');
    const pub = (await publicPlayers(F)).find((p) => p.name === 'Test Alfa One');
    assert.strictEqual(pub.photo, ok.photo, 'the public profile shows the new headshot');
    const img = await F.data.handler({ headers: { host: HOST }, queryStringParameters: { photo: ok.photo.split('=')[1] } });
    const served = Buffer.from(img.body, 'base64');
    assert.ok(JP.isJpeg(served)); assert.strictEqual(JP.hasMetadata(served), false, 'EXIF/GPS stripped');
    assert.ok(served.indexOf('GPS') < 0);
  } finally { done(); }
});

test('an under-18 player needs the parent or guardian confirmation', async () => {
  const F = setup();
  try {
    const q = await call(F.review, { action: 'queue' });
    const kid = q.players.find((p) => p.name === 'Test Junior Keeper');
    const r = await call(F.photo, { playerId: kid.id, web: durl(jpeg(400, 500)), consentConfirmed: true });
    assert.strictEqual(r.needsConsent, 'guardian');
    const ok = await call(F.photo, { playerId: kid.id, web: durl(jpeg(400, 500)), consentConfirmed: true, guardianConsent: true });
    assert.strictEqual(ok.ok, true);
  } finally { done(); }
});

/* ── honesty on the live site ────────────────────────────────────────── */
test('live site: "Website updated" only after the public copy is read back', async () => {
  const live = { production: true };
  const want = (ps) => ps.some((p) => p.name === 'Test X');
  const fail = await PUB.publishAndVerify(live, want, { publish: async () => ({ ok: false }) });
  assert.strictEqual(fail.state, 'failed'); assert.strictEqual(fail.retry, true);
  const queued = await PUB.publishAndVerify(live, want, { publish: async () => ({ ok: true }), fetchPublic: async () => [] });
  assert.strictEqual(queued.state, 'queued');
  const upd = await PUB.publishAndVerify(live, want, { publish: async () => ({ ok: true }), fetchPublic: async () => [{ name: 'Test X' }] });
  assert.strictEqual(upd.state, 'website_updated');
});

test('the live site never serves the preview sandbox', async () => {
  const F = setup();
  try {
    const r = await F.data.handler({ headers: { host: 'raynerslanefc.co.uk' }, queryStringParameters: { file: 'players' } });
    assert.strictEqual(r.statusCode, 404);
  } finally { done(); }
});

/* ── matching rules ─────────────────────────────────────────────────── */
test('names: variants are questions, different people are not merged', () => {
  assert.ok(RL.similar('Michael Adefolami', 'Michael Adefolarni'));
  assert.ok(RL.similar('Temi Animashaun', 'Temiloluwa Animashaun'));
  assert.ok(!RL.similar('Josh Adams', 'Jack Evans'));
  const roster = [{ id: 1, name: 'Josh Adams', status: 'active' }];
  const p = RL.proposalsFromSource(roster, [{ sourceKey: 'fwp:1', name: 'Josh Adams', evidence: {} }], {});
  assert.strictEqual(p[0].kind, 'confirm_link', 'even an identical name is a question, not a merge');
});
