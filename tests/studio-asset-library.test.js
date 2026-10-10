// Asset Studio library API (netlify/functions/studio-assets.js over an
// in-memory Supabase): revisions, approval, exports, publication records and
// sponsor-logo versions — scenarios D and F at the rules level.
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
const test = require('node:test');
const assert = require('node:assert');
const { makeDb, install } = require('../quality/tests/support/fake-supabase');

const TABLES = { studio_assets: [], studio_sponsor_logos: [], studio_compositions: [], studio_revisions: [], studio_exports: [], studio_publications: [] };
function setup() {
  const db = makeDb(JSON.parse(JSON.stringify(TABLES)));
  const restore = install(db);
  delete require.cache[require.resolve('../netlify/functions/studio-assets')];
  const fn = require('../netlify/functions/studio-assets');
  const call = async (actor, body) => JSON.parse((await fn.handler({ httpMethod: 'POST', body: JSON.stringify(Object.assign({ pin: '1933', actor }, body)) })).body);
  return { db, restore, call, fn };
}
const NL = { id: 'rl-north-leigh', opponent: 'North Leigh', opponentCrest: 'img/crests/north-leigh.png', isHome: true,
  kickoffAt: new Date(Date.now() + 864e5).toISOString(), competition: 'Combined Counties League Premier Division North', venue: 'Tithe Farm Social Club', status: 'scheduled' };
const DOC = { template: 'next-match', fields: { photo: 'repo:img/ground/tithe-farm-goalmouth-1600.jpg' }, formats: {}, refs: {}, facts: { fixture: NL }, variant: 'night' };
const PNG1x1 = 'data:image/png;base64,' + 'A'.repeat(400);

test('no committee password, no library', async () => {
  const { fn, restore } = setup();
  const r = await fn.handler({ httpMethod: 'POST', body: JSON.stringify({ pin: '0000', action: 'list' }) });
  assert.strictEqual(r.statusCode, 401); restore();
});

test('writes need a named person', async () => {
  const { call, restore } = setup();
  assert.match((await call('', { action: 'save', doc: DOC })).error, /who you are/); restore();
});

test('missing tables are reported as not set up, not as success', async () => {
  const db = makeDb({}); const restore = install(db);
  delete require.cache[require.resolve('../netlify/functions/studio-assets')];
  const fn = require('../netlify/functions/studio-assets');
  const r = JSON.parse((await fn.handler({ httpMethod: 'POST', body: JSON.stringify({ pin: '1933', actor: 'Pete', action: 'save', doc: DOC }) })).body);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.notSetUp, true); restore();
});

test('SCENARIO C/F — draft, review, approve; later edits never overwrite the approved revision', async () => {
  const { call, db, restore } = setup();
  const s1 = await call('Jenny', { action: 'save', doc: DOC, title: 'Next match — North Leigh' });
  assert.ok(s1.ok); const id = s1.composition.id;
  assert.strictEqual(s1.composition.head_rev, 1);

  // The same Save pressed twice is not a conflict and makes no second revision.
  const again = await call('Jenny', { action: 'save', id, base_rev: 0, doc: DOC });
  assert.ok(again.ok && again.repeated); assert.strictEqual(db.studio_revisions.length, 1);

  // A final export before approval is refused; a proof is allowed and recorded as a proof.
  const early = await call('Jenny', { action: 'recordExport', id, rev: 1, format: 'square', kind: 'png', w: 1080, h: 1080, bytes: 1000, filename: 'rlfc-x-square-1080x1080.png' });
  assert.match(early.error, /approved/);
  const proof = await call('Jenny', { action: 'recordExport', id, rev: 1, format: 'square', kind: 'png', w: 1080, h: 1080, bytes: 1000, filename: 'rlfc-x-square-1080x1080-PROOF.png', proof: true });
  assert.ok(proof.ok); assert.strictEqual(proof.composition.state, 'draft');

  assert.ok((await call('Jenny', { action: 'move', id, to: 'review' })).ok);
  // The browser saying "no layout problems" cannot remove a server check: a wrong-size claim is still refused below.
  const appr = await call('Pete', { action: 'move', id, to: 'approved', layout_blocking: 0 });
  assert.ok(appr.ok, appr.error); assert.strictEqual(appr.composition.approved_rev, 1);

  // Wrong pixel size claimed → not recorded.
  assert.match((await call('Pete', { action: 'recordExport', id, rev: 1, format: 'story', kind: 'png', w: 1080, h: 1080, bytes: 9, filename: 'rlfc-a-story.png' })).error, /must be 1080×1920/);
  const ex = await call('Pete', { action: 'recordExport', id, rev: 1, format: 'story', kind: 'png', w: 1080, h: 1920, bytes: 812345, sha256: 'ab'.repeat(32), filename: 'rlfc-next-match-north-leigh-story-1080x1920.png' });
  assert.ok(ex.ok); assert.strictEqual(ex.composition.state, 'exported');

  // Correct a factual error after approval: revision 2 is a draft; revision 1 stays approved and exportable.
  const doc2 = JSON.parse(JSON.stringify(DOC)); doc2.fields.kicker = 'Next up';
  const s2 = await call('Jenny', { action: 'save', id, base_rev: 1, doc: doc2 });
  assert.ok(s2.ok); assert.strictEqual(s2.composition.head_rev, 2); assert.strictEqual(s2.composition.approved_rev, 1); assert.strictEqual(s2.keptApproved, 1);
  assert.deepStrictEqual(db.studio_revisions.find((r) => r.rev === 1).doc, DOC, 'approved document untouched');
  assert.strictEqual(db.studio_revisions.find((r) => r.rev === 1).state, 'approved');
  // Final files still come only from revision 1.
  assert.match((await call('Pete', { action: 'recordExport', id, rev: 2, format: 'square', kind: 'png', w: 1080, h: 1080, bytes: 5, filename: 'rlfc-b-square.png' })).error, /not the approved revision/);
  assert.ok((await call('Pete', { action: 'recordExport', id, rev: 1, format: 'square', kind: 'jpeg', w: 1080, h: 1080, bytes: 5, filename: 'rlfc-b-square.jpg' })).ok);

  // Someone else saving from a stale copy is told, not overwritten.
  const stale = await call('Nigel', { action: 'save', id, base_rev: 1, doc: Object.assign({}, DOC, { variant: 'green' }) });
  assert.strictEqual(stale.ok, false); assert.strictEqual(stale.conflict, true); assert.match(stale.error, /revision 2/);
  // The audit log names who did what.
  assert.ok(db.hq_audit.some((a) => a.entity === 'studio_composition' && a.action === 'move' && a.actor === 'Pete'));
  restore();
});

test('server-side checks refuse to approve an unlicensed or unreviewed photograph whatever the browser says', async () => {
  const { call, restore } = setup();
  const bad = JSON.parse(JSON.stringify(DOC)); bad.fields.photo = 'repo:video/hero-poster-1920.jpg';
  const s = await call('Jenny', { action: 'save', doc: bad });
  const r = await call('Jenny', { action: 'move', id: s.composition.id, to: 'review', layout_blocking: 0 });
  assert.strictEqual(r.ok, false); assert.ok(r.blocking.some((b) => b.code === 'photo-unapproved'));
  restore();
});

test('publication is recorded only with a channel and a link', async () => {
  const { call, restore } = setup();
  const s = await call('J', { action: 'save', doc: DOC }); const id = s.composition.id;
  await call('J', { action: 'move', id, to: 'review' }); await call('P', { action: 'move', id, to: 'approved' });
  await call('P', { action: 'recordExport', id, rev: 1, format: 'square', kind: 'png', w: 1080, h: 1080, bytes: 10, filename: 'rlfc-c-square.png' });
  assert.match((await call('P', { action: 'move', id, to: 'published', channel: 'Instagram' })).error, /link/);
  const ok = await call('P', { action: 'move', id, to: 'published', channel: 'Instagram', url: 'https://www.instagram.com/p/test' });
  assert.ok(ok.ok); assert.strictEqual(ok.composition.state, 'published');
  restore();
});

test('SCENARIO D — a new sponsor logo is a new version; only an approved version becomes current', async () => {
  const { call, db, restore } = setup();
  assert.match((await call('J', { action: 'uploadLogo', sponsor_key: 'hdl', colour: PNG1x1, w: 120, h: 60, ground: 'dark' })).error, /too small/);
  assert.match((await call('J', { action: 'uploadLogo', sponsor_key: 'hdl', colour: PNG1x1, w: 1200, h: 600 })).error, /light or a dark/);
  assert.match((await call('J', { action: 'uploadLogo', sponsor_key: 'made-up-co', colour: PNG1x1, w: 1200, h: 600, ground: 'dark' })).error, /not on the sponsor list/);
  const up = await call('J', { action: 'uploadLogo', sponsor_key: 'hdl', colour: PNG1x1, w: 1200, h: 600, ground: 'dark' });
  assert.ok(up.ok); assert.strictEqual(up.logo.version, 2, 'continues after the repository version 1');
  let lib = (await call('J', { action: 'library' })).library;
  assert.strictEqual(lib.logos.hdl.find((v) => v.current).version, 1, 'unapproved upload is not used');
  assert.ok((await call('P', { action: 'approveLogo', sponsor_key: 'hdl', version: 2 })).ok);
  lib = (await call('J', { action: 'library' })).library;
  assert.deepStrictEqual(lib.logos.hdl.filter((v) => v.current).map((v) => v.version), [2]);
  // A third version, approved, retires the second without deleting it.
  await call('J', { action: 'uploadLogo', sponsor_key: 'hdl', colour: PNG1x1, w: 1200, h: 600, ground: 'light' });
  await call('P', { action: 'approveLogo', sponsor_key: 'hdl', version: 3 });
  assert.deepStrictEqual(db.studio_sponsor_logos.map((r) => [r.version, r.current]), [[2, false], [3, true]]);
  restore();
});

test('uploaded images need a rights holder and licence, and start unapproved', async () => {
  const { call, restore } = setup();
  assert.match((await call('J', { action: 'registerAsset', title: 'Crowd v Burnham', category: 'matchday', src: PNG1x1, w: 2400, h: 1600 })).error, /who owns/);
  const r = await call('J', { action: 'registerAsset', title: 'Crowd v Burnham', category: 'matchday', src: PNG1x1, w: 2400, h: 1600, rights_holder: 'Club photographer', licence: 'Club use' });
  assert.ok(r.ok); assert.strictEqual(r.asset.approval, 'needs_review');
  restore();
});
