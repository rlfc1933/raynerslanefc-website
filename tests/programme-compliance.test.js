// ════════════════════════════════════════════════════════════════════════════
// WHAT THE LEAGUE ACTUALLY ASKS FOR — checked against the rule, not against
// our own assumptions.
//
// I previously reported that because the Combined Counties League dropped the
// requirement to PRODUCE a programme at its June 2026 AGM, nothing in one was
// required. That was wrong, and Rule 8.14 says why. The rule was never about
// compelling production — it opens "Where physical programmes are produced..."
// and states "An acceptable match programme shall include any official sponsor
// provided advertisements which shall be forwarded to members by the Board."
// Conditions attached to producing one survive a change to whether you must.
//
// Auditing the document against the real wording found a genuine gap: the
// League's published minimum is both sides' players with playing numbers, THE
// COLOURS THE TEAMS WILL PLAY IN, and the match officials. The colours were
// absent from the programme entirely, and the page carrying the other two only
// rendered if somebody had typed a line-up into a form.
//
// These tests hold the corrected position: claims about regulation carry a
// source, and the required content cannot quietly disappear.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MANIFEST = JSON.parse(read('data/programme-compliance.json'));
const print = read('programme-print.html');

// ── 1 · NOTHING IS CALLED A REGULATION WITHOUT A SOURCE ─────────────────────

test('every league claim carries a source that exists', () => {
  const ids = new Set(MANIFEST.sources.map((s) => s.id));
  MANIFEST.requirements
    .filter((r) => r.status.startsWith('league'))
    .forEach((r) => {
      assert.ok(r.source, `"${r.requirement}" claims a league status with no source`);
      assert.ok(ids.has(r.source), `unknown source "${r.source}"`);
      assert.ok(r.quote && r.quote.length > 20,
        `"${r.requirement}" must quote the wording it relies on`);
    });
});

test('club preferences are never dressed up as regulation', () => {
  ['safeguarding', 'equality', 'ground-regulations'].forEach((id) => {
    const r = MANIFEST.requirements.find((x) => x.id === id);
    assert.strictEqual(r.status, 'club-policy',
      `${id} is the club's own choice — calling it a league rule would be inventing one`);
    assert.strictEqual(r.source, null);
  });
  const acerbis = MANIFEST.requirements.find((x) => x.id === 'acerbis');
  assert.strictEqual(acerbis.status, 'optional');
});

test('the status vocabulary is closed', () => {
  const allowed = ['league-when-produced', 'league-baseline', 'club-policy', 'recommended', 'optional'];
  MANIFEST.requirements.forEach((r) =>
    assert.ok(allowed.includes(r.status), `unknown status "${r.status}"`));
});

test('the advert requirement is sourced to the rule, not the guide', () => {
  const r = MANIFEST.requirements.find((x) => x.id === 'league-adverts');
  assert.strictEqual(r.source, 'rule-8-14');
  assert.strictEqual(r.status, 'league-when-produced');
  assert.match(r.quote, /official sponsor provided advertisements/);
});

test('the guide is recorded as a baseline that predates this season', () => {
  const g = MANIFEST.sources.find((s) => s.id === 'admin-guide');
  assert.strictEqual(g.edition, '2023-2024');
  assert.notStrictEqual(g.edition, MANIFEST.season, 'it must not be presented as current');
  assert.match(g.note, /baseline/);
});

test('the AGM report is treated as evidence, not as the rule book', () => {
  const a = MANIFEST.sources.find((s) => s.id === 'agm-2026');
  assert.match(a.note, /Press report, not the rule book/);
});

test('the manifest is versioned and has a review date', () => {
  assert.ok(MANIFEST.version >= 1);
  assert.match(MANIFEST.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(MANIFEST.reviewDue, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(MANIFEST.reviewDue > MANIFEST.checkedOn);
  assert.ok(MANIFEST.seasonCheck.length >= 6, 'a season rollover checklist must exist');
});

// ── 2 · THE REQUIRED CONTENT CANNOT VANISH ──────────────────────────────────

test('the page carrying the minimum always renders', () => {
  // It used to be gated on somebody having typed a line-up, so an otherwise
  // finished edition could ship without any of the three required items.
  assert.ok(!/if \(lines\(d\.homeXI\)\.length \|\| lines\(d\.homeSubs\)\.length/.test(print),
    'the required page must not be conditional on an optional form field');
  assert.match(print, /ALWAYS RENDERED/);
});

test('the colours the teams will play in are printed', () => {
  assert.match(print, /Playing Colours/);
  assert.match(print, /function kitStrip\(label, k\)\{/);
  assert.match(print, /kitStrip\('Rayners Lane', ourKit\)/);
  assert.match(print, /kitStrip\(opp, oppKit\)/, "the opposition's colours too — the rule says teams");
});

test('unknown colours say so rather than guessing', () => {
  const f = print.match(/function kitStrip\(label, k\)\{[\s\S]*?\n      \}/)[0];
  assert.match(f, /To be confirmed/);
  assert.ok(!/Yellow|Green/.test(f), 'no colour may be hard-coded as a fallback');
});

test("the club's own colours are stored once, not retyped", () => {
  const cfg = JSON.parse(read('data/config.json'));
  assert.ok(cfg.kit && cfg.kit.home && cfg.kit.away);
  // The HOME outfield kit is known, so it must be complete.
  ['shirt', 'shorts', 'socks'].forEach((k) => {
    assert.ok(cfg.kit.home[k] && cfg.kit.home[k].name, `home ${k} missing`);
  });
  // The goalkeeper and away colours are NOT recorded, and must stay that way
  // until the club confirms them. I had filled both in with a plausible green;
  // that is how an invented detail reaches print unchallenged.
  assert.strictEqual(cfg.kit.home.goalkeeper, null);
  ['shirt', 'shorts', 'socks', 'goalkeeper'].forEach((k) => {
    assert.strictEqual(cfg.kit.away[k], null, `away ${k} must not be guessed`);
  });
  assert.match(print, /cfgKit = \(res\[10\] && res\[10\]\.kit\) \|\| null/);
});

test('the strip follows home or away, not a fixed assumption', () => {
  assert.match(print, /var ourKit = \(d\.isHome===false\) \? \(cfgKit && cfgKit\.away\) : \(cfgKit && cfgKit\.home\)/);
});

test('the match officials print on the page the rule expects', () => {
  assert.match(print, /Match Officials/);
  assert.match(print, /\['Referee', d\.referee\]/);
  assert.match(print, /\['Fourth Official', d\.fourthOfficial\]/);
});

test('officials that have not been appointed are not invented', () => {
  assert.match(print, /Appointments to be confirmed/);
  assert.match(print, /\.filter\(function\(r\)\{ return \(r\[1\]\|\|''\)\.trim\(\); \}\);/,
    'an empty appointment must be dropped, never filled in');
});

// ── 3 · LEAGUE ADVERTISERS ARE NOT CLUB PARTNERS ────────────────────────────

test('league advert artwork is sourced only from the League', () => {
  assert.ok(MANIFEST.leagueAdverts.length >= 3);
  MANIFEST.leagueAdverts.forEach((a) => {
    assert.match(a.official, /^https?:\/\/(www\.)?combinedcountiesleague\.co\.uk\//,
      `${a.sponsor} artwork must come from the League's own site`);
    assert.ok(a.sourcePage && a.season && a.addedOn && a.lastChecked,
      `${a.sponsor} must record where it came from and when it was checked`);
  });
});

test('the current season advert is identified as current', () => {
  const pst = MANIFEST.leagueAdverts.find((a) => a.id === 'pst-sport-2026');
  assert.strictEqual(pst.season, MANIFEST.season);
  assert.match(pst.official, /26-27-PST-Sport/, 'the League files it as this season');
  assert.ok(!/title sponsor|principal/i.test(pst.note),
    "no commercial title may be claimed that the League's own material does not state");
});

test('MJM Sports is no longer claimed as a Rayners Lane partner', () => {
  const s = JSON.parse(read('data/sponsors.json')).sponsors;
  const mjm = s.find((x) => x.name === 'MJM Sports');
  assert.ok(mjm, 'the record stays — only the unevidenced designation goes');
  assert.strictEqual(mjm.tier, '', 'the tier was asserted on no evidence and is withdrawn');
  assert.strictEqual(mjm.unconfirmed, true);
  assert.match(mjm._note, /League/, 'and the note says where the real relationship points');
  const advert = MANIFEST.leagueAdverts.find((a) => a.sponsor === 'MJM Sports');
  assert.ok(advert, 'MJM is handled as a league advertiser instead');
});

test('Cherry Red Records is treated as the competition sponsor', () => {
  const s = JSON.parse(read('data/sponsors.json')).sponsors;
  assert.ok(!s.some((x) => /cherry red/i.test(x.name)),
    'the competition title sponsor is not a Rayners Lane sponsor');
  assert.ok(MANIFEST.leagueAdverts.some((a) => a.sponsor === 'Cherry Red Records'));
});

// ── 4 · WHAT THE SOFTWARE MUST NOT PRETEND TO KNOW ──────────────────────────

test('copy counts are a human checklist, not a system claim', () => {
  const r = MANIFEST.requirements.find((x) => x.id === 'physical-copies');
  assert.strictEqual(r.blocking, false);
  assert.match(r.note, /cannot verify it and does not pretend to/);
  assert.ok(MANIFEST.printChecklist.length >= 5);
  assert.ok(MANIFEST.printChecklist.some((l) => /visiting team dressing room/.test(l)));
  assert.ok(MANIFEST.printChecklist.some((l) => /before kick-off/.test(l)));
});

test('editorial liability is recorded with the wording it comes from', () => {
  const r = MANIFEST.requirements.find((x) => x.id === 'editorial-liability');
  assert.match(r.quote, /attributed to the club/);
  assert.match(r.quote, /County FA/);
  assert.match(r.note, /never censors on keywords alone/);
});

test('the Secretary is recorded as responsible, with delegation allowed', () => {
  const r = MANIFEST.requirements.find((x) => x.id === 'secretary-responsible');
  assert.match(r.quote, /club secretary is responsible/);
  assert.match(r.quote, /may be delegated/);
});
