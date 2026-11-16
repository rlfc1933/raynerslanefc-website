// Compliance language after the June 2026 AGM: producing a programme is not
// mandatory; conditions apply WHEN publishing; nothing is called verified
// without a current source; the checklist certifies nothing.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const M = JSON.parse(read('data/programme-compliance.json'));

test('statuses use the five categories; nothing is competition-verified without a current handbook', () => {
  const allowed = Object.keys(M.statuses);
  assert.deepStrictEqual(allowed.sort(), ['awaiting-secretary', 'club-policy', 'competition-verified', 'recommended', 'when-publishing']);
  M.requirements.forEach((r) => assert.ok(allowed.includes(r.status), r.id));
  assert.equal(M.requirements.filter((r) => r.status === 'competition-verified').length, 0, 'the 2026-27 handbook is not published');
  assert.equal(M.productionMandatory, false);
  assert.equal(M.disclaimer, 'This checklist does not certify legal or league compliance.');
  ['current-advert-set', 'electronic-notify'].forEach((id) => assert.equal(M.requirements.find((r) => r.id === id).status, 'awaiting-secretary'));
  const ad = M.requirements.find((r) => r.id === 'league-adverts');
  assert.equal(ad.status, 'when-publishing'); assert.match(ad.note, /logo is not an advert/);
});

test('no UI text says a programme is mandatory', () => {
  for (const f of ['admin.html', 'programme.html', 'programmes.html', 'programme-print.html', 'js/programme-editor.js']) {
    const s = read(f);
    assert.ok(!/must produce|Step 5 standard|programmes? (is|are) (mandatory|required)/i.test(s), f);
  }
});

test('programme checks carry category labels and the disclaimer', () => {
  const els = {};
  const win = { document: { getElementById: (id) => els[id] || null, querySelectorAll: () => [] }, localStorage: { getItem: () => null } };
  win.window = win;
  vm.runInNewContext(read('js/programme-editor.js'), win);
  win.prBuildDoc = () => ({ fixtureId: 'x', customPages: [] });
  win._prFixtures = [{ id: 'x', date: '2999-01-01', opponent: 'A', isHome: true }];
  const list = win.PRE.checks();
  const cats = new Set(list.map((c) => c.cat));
  ['when-publishing', 'awaiting-secretary'].forEach((c) => assert.ok(cats.has(c), c));
  list.forEach((c) => assert.ok(win.PRE.CHECK_CATEGORIES[c.cat], c.text));
  const adv = list.find((c) => /official adverts/.test(c.text));
  assert.equal(adv.cat, 'when-publishing'); assert.match(adv.text, /Required when publishing/); assert.match(adv.text, /logo is not an advert/);
  els['pr-checks'] = { innerHTML: '', querySelectorAll: () => [] };
  win.PRE.renderChecks();
  assert.match(els['pr-checks'].innerHTML, /This checklist does not certify legal or league compliance\./);
  assert.match(els['pr-checks'].innerHTML, /When publishing/);
});
