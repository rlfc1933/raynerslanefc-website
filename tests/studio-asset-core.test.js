// Asset Studio core — templates, formats, layout rules and quality checks.
// The rules a person relies on without seeing them: crests and sponsor logos
// cannot be stretched, a story is laid out (not cropped), dates are London
// dates, and the checks refuse what should not be published.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/studio/core.js');
const seed = require('../js/studio/library-seed.json');

const meta = (src) => {
  const a = seed.assets.find((x) => x.src === src);
  if (a) return { w: a.w, h: a.h };
  for (const k of Object.keys(seed.sponsorLogos)) for (const v of seed.sponsorLogos[k]) if (v.colour === src || v.white === src) return { w: v.w, h: v.h };
  if (src === 'img/badge.png') return { w: 1254, h: 1254 };
  return null;
};
const ctx = { assets: seed.assets, sponsors: seed.sponsors, logos: seed.sponsorLogos, meta };
const NL = { id: 'f1', opponent: 'North Leigh', opponentCrest: 'img/crests/north-leigh.png', isHome: true, kickoffAt: '2026-10-10T14:00:00Z',
  competition: 'Combined Counties League Premier Division North', venue: 'Tithe Farm Social Club', status: 'scheduled', season: '2026-2027' };
const doc = (template, extra) => Object.assign({ template, fields: {}, formats: {}, refs: {}, facts: { fixture: NL } }, extra || {});
const NOW = Date.parse('2026-10-09T12:00:00Z');

test('formats are the exact pixel sizes the club posts at', () => {
  assert.deepStrictEqual(C.FORMAT_ORDER.map((f) => [C.FORMATS[f].w, C.FORMATS[f].h]), [[1080, 1080], [1080, 1350], [1080, 1920], [1920, 1080], [2480, 3508]]);
  assert.deepStrictEqual(C.FORMATS.a4.pdf, { wPt: 595.28, hPt: 841.89 }, 'A4 at 300 dpi on an A4 page');
});

test('the required template set exists, grouped by purpose', () => {
  const ids = C.TEMPLATES.map((t) => t.id);
  for (const id of ['next-match', 'matchday', 'starting-xi', 'full-time', 'result', 'postponed', 'match-sponsor', 'matchball-sponsor', 'new-sponsor',
    'news', 'volunteer', 'statement', 'programme-cover', 'programme-advert']) assert.ok(ids.includes(id), id);
  assert.deepStrictEqual(C.CATEGORIES.map((c) => c.id), ['matchday', 'sponsors', 'club', 'programme']);
});

test('every template composes in every format it offers, with every text layer fitted', () => {
  for (const t of C.TEMPLATES) for (const f of t.formats) {
    const sc = C.compose(doc(t.id, { refs: { sponsorKey: 'ashwood', logoVersion: 1 }, fields: { headline: 'A headline', body: 'Body' } }), f, ctx);
    assert.strictEqual(sc.w, C.FORMATS[f].w); assert.strictEqual(sc.h, C.FORMATS[f].h);
    assert.ok(sc.layers.filter((l) => l.type === 'text').every((l) => l.fit), t.id + ' ' + f);
  }
});

test('CRESTS AND LOGOS CANNOT BE DISTORTED — drawn aspect always equals the file', () => {
  for (const t of C.TEMPLATES) for (const f of t.formats) {
    const sc = C.compose(doc(t.id, { refs: { sponsorKey: 'mccafferty', logoVersion: 1 } }), f, ctx);
    for (const L of sc.layers.filter((l) => (l.role === 'crest' || l.role === 'logo') && l.draw)) {
      assert.strictEqual(L.fit, 'contain');
      assert.ok(Math.abs((L.draw.dw / L.draw.dh) / (L.natural.w / L.natural.h) - 1) < 0.001, t.id + ' ' + f + ' ' + L.name);
    }
  }
  // Even a layer asked to "cover" is forced to contain when it is a logo.
  const s = C.compose(doc('new-sponsor', { refs: { sponsorKey: 'hdl', logoVersion: 1 } }), 'square', ctx);
  assert.ok(s.layers.some((l) => l.role === 'logo'));
});

test('a story is RECOMPOSED, not a cropped square', () => {
  const sq = C.compose(doc('next-match'), 'square', ctx), st = C.compose(doc('next-match'), 'story', ctx);
  const k = (sc) => sc.layers.find((l) => l.role === 'kicker');
  assert.ok(k(st).size > k(sq).size, 'story headline is set larger');
  assert.ok(k(st).y >= C.FORMATS.story.safe.t, 'and inside the story safe area');
  const vs = st.layers.find((l) => l.role === 'versus');
  assert.ok(vs, 'story stacks the teams with a "v" between them; the square does not');
  assert.ok(!sq.layers.find((l) => l.role === 'versus'));
});

test('dates and kick-offs are London time, across the clocks changing', () => {
  assert.strictEqual(C.londonParts('2026-10-10T14:00:00Z').time, '3pm');        // BST
  assert.strictEqual(C.londonParts('2026-10-31T15:00:00Z').time, '3pm');        // GMT
  assert.strictEqual(C.londonParts('2026-11-03T19:45:00Z').time, '7:45pm');
  assert.strictEqual(C.dateLine('2026-10-10T14:00:00Z'), 'Saturday 10 October');
  // 23:30 UTC on Friday is already Saturday in London in summer.
  assert.strictEqual(C.dayRelation('2026-08-14T23:30:00Z', Date.parse('2026-08-15T09:00:00Z')), 'today');
  assert.strictEqual(C.dayRelation('2026-10-10T14:00:00Z', NOW), 'tomorrow');
});

test('QC: long text is refused, not silently shrunk to nothing', () => {
  const d = doc('news', { fields: { headline: 'An extraordinarily long headline that goes on and on about a floodlit friendly and refuses to stop at any sensible point whatsoever', body: '' } });
  const sc = C.compose(d, 'square', ctx);
  const issues = C.qc(sc, d, ctx, NOW);
  assert.ok(issues.some((i) => i.code === 'text-overflow' && i.severity === 'block') || issues.some((i) => i.code === 'field-too-long'));
});

test('QC: the hero-film still is not approved, and a photo without rights cannot be used', () => {
  const still = seed.assets.find((a) => /hero-poster/.test(a.src));
  assert.strictEqual(still.approval, 'needs_review', 'the station sign reads "Rayers Lane" — held for review');
  const d = doc('next-match', { fields: { photo: still.id } });
  const issues = C.factChecks(d, ctx, NOW);
  assert.ok(issues.some((i) => i.code === 'photo-unapproved' && i.severity === 'block'));
  const noRights = Object.assign({}, ctx, { assets: ctx.assets.concat([{ id: 'x', title: 'Mystery', category: 'ground', src: 'img/x.jpg', approval: 'approved' }]) });
  assert.ok(C.factChecks(doc('next-match', { fields: { photo: 'x' } }), noRights, NOW).some((i) => i.code === 'photo-rights'));
});

test('QC: sponsor templates need a sponsor with an approved logo', () => {
  assert.ok(C.factChecks(doc('match-sponsor'), ctx, NOW).some((i) => i.code === 'sponsor-missing'));
  assert.ok(C.factChecks(doc('new-sponsor', { refs: { sponsorKey: 'higginson-stairs' } }), ctx, NOW).some((i) => i.code === 'sponsor-logo-missing'),
    'Higginson Stairs has no logo in the repository — the Studio must not invent one');
});

test('QC: result templates need a registry score; Matchday on the wrong day is flagged', () => {
  assert.ok(C.factChecks(doc('full-time'), ctx, NOW).some((i) => i.code === 'score-missing'));
  assert.ok(C.factChecks(doc('matchday'), ctx, NOW).some((i) => i.code === 'not-today'));
  assert.ok(!C.factChecks(doc('matchday'), ctx, Date.parse('2026-10-10T08:00:00Z')).some((i) => i.code === 'not-today'));
});

test('QC: an A4 programme cover from a 1600px photograph is blocked as too soft for print', () => {
  const d = doc('programme-cover', { fields: { photo: 'repo:img/ground/tithe-farm-goalmouth-1600.jpg' } });
  const issues = C.qc(C.compose(d, 'a4', ctx), d, ctx, NOW);
  assert.ok(issues.some((i) => i.code === 'low-resolution' && i.severity === 'block'));
});

test('sponsor logo versions: a graphic keeps the version it was made with', () => {
  const rows = [{ sponsor_key: 'hdl', version: 2, colour: 'data:image/png;base64,AA', w: 800, h: 400, ar: 2, approval: 'approved', current: true }];
  const logos = C.mergeLogos(seed.sponsorLogos, rows);
  const c2 = Object.assign({}, ctx, { logos });
  assert.strictEqual(C.currentLogo(c2, 'hdl').version, 2);
  assert.strictEqual(logos.hdl.find((v) => v.version === 1).current, false, 'v1 superseded, not deleted');
  const old = doc('match-sponsor', { refs: { sponsorKey: 'hdl', logoVersion: 1 } });
  assert.strictEqual(C.resolveSponsor(old, c2).logo.version, 1, 'history stays accurate');
  assert.ok(C.factChecks(old, c2, NOW).some((i) => i.code === 'sponsor-logo-outdated' && i.severity === 'warn'));
  // A logo awaiting approval is never "current".
  const pending = C.mergeLogos(seed.sponsorLogos, [{ sponsor_key: 'hdl', version: 2, colour: 'x', w: 1, h: 1, ar: 1, approval: 'needs_review', current: false }]);
  assert.strictEqual(C.currentLogo(Object.assign({}, ctx, { logos: pending }), 'hdl').version, 1);
});

test('sponsor artwork sits on the ground it was drawn for', () => {
  assert.strictEqual(seed.sponsorLogos.hdl[0].ground, 'dark', 'HDL has white lettering');
  assert.strictEqual(seed.sponsorLogos.ashwood[0].ground, 'light');
  const sc = C.compose(doc('new-sponsor', { refs: { sponsorKey: 'hdl', logoVersion: 1 }, variant: 'night' }), 'square', ctx);
  const plate = sc.layers.find((l) => l.role === 'logo-plate');
  assert.notStrictEqual(plate.fill, '#F5F3ED', 'never a light plate under a white-lettered logo');
});

test('workflow: export is not publication, and publication needs evidence', () => {
  assert.match(C.guardMove({ state: 'draft' }, 'approved', { actor: 'Pete' }), /cannot go/);
  assert.match(C.guardMove({ state: 'review' }, 'approved', { actor: 'Pete', blocking: [{}] }), /Fix the 1 blocking/);
  assert.match(C.guardMove({ state: 'review' }, 'approved', {}), /who you are/);
  assert.strictEqual(C.guardMove({ state: 'review' }, 'approved', { actor: 'Pete', blocking: [] }), null);
  assert.match(C.guardMove({ state: 'approved' }, 'published', { actor: 'Pete' }), /cannot go/, 'approved → published skips the export');
  assert.match(C.guardMove({ state: 'exported' }, 'published', { actor: 'Pete', channel: 'Instagram' }), /link/);
  assert.strictEqual(C.guardMove({ state: 'exported' }, 'published', { actor: 'Pete', channel: 'Instagram', url: 'https://instagram.com/p/x' }), null);
});

test('file names say what, who against, when and what size', () => {
  assert.strictEqual(C.fileName(doc('next-match'), 'story', 'png'), 'rlfc-next-match-north-leigh-2026-10-10-story-1080x1920.png');
  assert.strictEqual(C.fileName(doc('new-sponsor', { facts: {}, refs: { sponsorKey: 'ashwood' } }), 'square', 'jpg'), 'rlfc-new-sponsor-ashwood-square-1080x1080.jpg');
});

test('the registry changing is reported, never silently applied', () => {
  const diff = C.factDiff(NL, Object.assign({}, NL, { kickoffAt: '2026-10-10T18:45:00Z' }));
  assert.strictEqual(diff.length, 1);
  assert.match(diff[0].was, /3pm/); assert.match(diff[0].now, /7:45pm/);
});

test('the library seed lists only genuine club files, with real dimensions', () => {
  const fs = require('fs');
  for (const a of seed.assets) {
    assert.ok(fs.existsSync(a.src), a.src);
    assert.ok(!/img\/creative\//.test(a.src), 'generated campaign plates are not photography');
    assert.ok(a.w > 0 && a.h > 0 && a.rights_holder && a.licence, a.src);
  }
  assert.ok(seed.assets.some((a) => a.category === 'player') && seed.assets.some((a) => a.category === 'crest'));
});
