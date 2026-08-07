// ════════════════════════════════════════════════════════════════════════════
// REAL NUMBERS ON THE CARDS — and an archive that stays history.
//
// The cards read data/players.json, where all 26 players carry a hand-typed
// `apps: 0, goals: 0, assists: 0` that nobody ever filled in. Meanwhile the
// club already computes genuine figures from official Full-Time line-ups and
// scorer lines. The two systems were never connected, so every card printed
// zeros.
//
// TWO WAYS THIS COULD GO WRONG ON PAPER, WHICH IS WHY THEY ARE PINNED HERE:
//
//   DOUBLE COUNTING. football_player_season_stats holds a row per scope —
//   'all', 'league', 'cup', 'friendly'. 'all' IS the total; the rest are
//   subsets of it. Summing them would double every appearance and goal in the
//   printed programme.
//
//   A DRIFTING ARCHIVE. If a published edition re-read the season service, last
//   August's programme would show a player on 25 appearances in March, quietly
//   rewriting a document supporters already hold.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const admin = read('admin.html');
const print = read('programme-print.html');
const statsFn = read('netlify/functions/programme-stats.js');
const readPlayers = read('netlify/functions/lib/football/read-players.js');

// ── 1 · ONE FULL-TIME PLAYER = ONE PROGRAMME PLAYER ─────────────────────────

test('only confirmed identities reach a card', () => {
  // An unresolved provider string must never become a person in print.
  const q = readPlayers.match(/football_players\?current_team_id[\s\S]*?\|\| \[\]/)[0];
  assert.match(q, /identity_status=eq\.confirmed/);
});

test('merged duplicates cannot produce a second card', () => {
  const q = readPlayers.match(/football_players\?current_team_id[\s\S]*?\|\| \[\]/)[0];
  assert.match(q, /merged_into_id=is\.null/,
    'a merged record would print the same person twice, with their goals split across both');
});

test('one row per player — the map is keyed, not appended', () => {
  const fn = readPlayers.match(/async function statsByClubPlayer[\s\S]*?\n\}/)[0];
  assert.match(fn, /byPlayer\[t\.player_id\] = t/,
    'assignment by id collapses duplicates; pushing to an array would not');
  assert.ok(!/\.push\(/.test(fn), 'nothing may accumulate rows for one player');
});

test('SCOPE ROWS CANNOT BE ADDED TOGETHER', () => {
  // The single most dangerous mistake available here.
  const fn = readPlayers.match(/async function statsByClubPlayer[\s\S]*?\n\}/)[0];
  assert.match(fn, /scope=eq\.'? ?\+? ?\(?scope \|\| 'all'\)?/,
    'exactly one scope must be selected');
  assert.ok(!/\+=|reduce\(|sum/i.test(fn), 'scopes must never be summed');
  // …and the caller must ask for the total scope, not a subset.
  assert.match(statsFn, /statsByClubPlayer\(season, 'all'\)/);
  assert.match(statsFn, /'all' only — never summed with subsets/);
});

test('the four scopes are a total plus subsets, not four separate seasons', () => {
  const ps = read('netlify/functions/lib/football/player-stats.js');
  const scopes = ps.match(/const scopes = \{[\s\S]*?\};/)[0];
  assert.match(scopes, /all: \{\}/, "'all' is unfiltered — it is the total");
  ['league', 'cup', 'friendly'].forEach((k) => assert.ok(scopes.includes(k + ':')));
});

test('a name alias cannot create a second identity', () => {
  // Identity is resolved once, in the football store, against a stable
  // provider id — never re-derived from the display name in the programme.
  const cardBlock = print.match(/var pc = club\.players\.map\(function\(p\)\{[\s\S]*?\n      \}\);/)[0];
  assert.match(cardBlock, /playerSeason\[p\.id\]/,
    'lookup must be by club player id, never by name');
  assert.ok(!/\.name\s*===|toLowerCase\(\)\s*===/.test(cardBlock),
    'no name matching may happen at render time');
});

test('the programme adds no statistics of its own', () => {
  const code = strip(statsFn);
  assert.ok(!/\+\+|\+= *1/.test(code), 'nothing may be incremented here');
  assert.match(code, /RP\.statsByClubPlayer/, 'the canonical service is the only source');
});

// ── 2 · KNOWN ZERO IS NOT UNKNOWN ───────────────────────────────────────────

test('an unmatched player yields nulls, not zeros', () => {
  const { cardStats } = require(path.join(ROOT, 'netlify/functions/programme-stats.js'))._internal;
  const none = cardStats(null, false);
  assert.strictEqual(none.apps, null);
  assert.strictEqual(none.goals, null);
  assert.strictEqual(none.minutes, null);
  assert.strictEqual(none.coverage, 'unmatched');
});

test('a confirmed player with no involvement is a real zero', () => {
  const { cardStats } = require(path.join(ROOT, 'netlify/functions/programme-stats.js'))._internal;
  const z = cardStats({ appearances: 0, goals: 0, minutesKnown: false }, false);
  assert.strictEqual(z.apps, 0, 'we know he has not played — that is a fact, not a gap');
  assert.strictEqual(z.goals, 0);
  assert.strictEqual(z.minutes, null, 'but minutes are still unknown');
  assert.strictEqual(z.coverage, 'confirmed');
});

test('the card prints a dash for unknown and a digit for zero', () => {
  const cell = print.match(/function statCell\(v, label\)\{[\s\S]*?\n      \}/)[0];
  assert.match(cell, /v !== null && v !== undefined/, 'zero must count as known');
  assert.match(cell, /&mdash;/);
  assert.ok(!/v \?/.test(cell), 'a truthiness test would turn 0 into a dash');
});

// ── 3 · NO ASSISTS ANYWHERE ─────────────────────────────────────────────────

test('assists are gone from the programme entirely', () => {
  // Full-Time's pages carry none, so "0 ASSISTS" claimed knowledge we never had.
  assert.ok(!/assists/i.test(strip(print).replace(/Assists are gone[\s\S]*?\*\//g, '')),
    'no assist figure may be rendered anywhere in the programme');
});

test('the third stat is one we genuinely hold', () => {
  const cardBlock = print.match(/var pc = club\.players\.map\(function\(p\)\{[\s\S]*?\n      \}\);/)[0];
  assert.match(cardBlock, /statCell\(mins,'Mins'\)/);
  assert.match(cardBlock, /statCell\(apps,'Apps'\)/);
});

// ── 4 · GOALKEEPERS ─────────────────────────────────────────────────────────

test('a goalkeeper gets clean sheets where an outfielder gets goals', () => {
  const cardBlock = print.match(/var pc = club\.players\.map\(function\(p\)\{[\s\S]*?\n      \}\);/)[0];
  assert.match(cardBlock, /keeper[\s\S]*?statCell\(sheets, 'Clean Sheets'\)/);
  assert.match(cardBlock, /statCell\(goals, 'Goals'\)/);
});

test('clean sheets are only ever claimed for a keeper, and only if derived', () => {
  const { cardStats } = require(path.join(ROOT, 'netlify/functions/programme-stats.js'))._internal;
  assert.strictEqual(cardStats({ appearances: 2, cleanSheets: 1 }, false).cleanSheets, null,
    'an outfielder must never be credited with a clean sheet');
  assert.strictEqual(cardStats({ appearances: 2, cleanSheets: 1 }, true).cleanSheets, 1);
  assert.strictEqual(cardStats({ appearances: 2 }, true).cleanSheets, null,
    'a keeper with no derived figure shows a dash, not zero');
});

// ── 5 · THE ARCHIVE IS HISTORY ──────────────────────────────────────────────

test('a draft reads today’s figures; a published edition never does', () => {
  const fn = print.match(/function loadSeasonStats\(doc\)\{[\s\S]*?\n  \}/)[0];
  // PUBLISHED decides, not "is there a snapshot". The old test was
  // `if (doc.playerStats)`, and an empty object is truthy — so a draft that
  // had ever been handed a {} was treated as settled history and printed
  // dashes for ever. See tests/programme-stats-join.test.js, which exercises
  // the four cases rather than matching the source.
  assert.match(fn, /var published = !!\(doc && doc\.published\)/);
  assert.match(fn, /if \(published\) return Promise\.resolve\(\(doc && doc\.playerStats\) \|\| null\)/,
    'a published edition must never fall through to the live service');
  assert.ok(fn.indexOf('if (published)') < fn.indexOf('programme-stats'),
    'the guard comes before the live call, so an archived edition cannot drift');
});

test('publishing freezes the figures, the table and the moment', () => {
  const fn = admin.match(/async function publishProgramme\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /doc\.playerStats = ps/, 'player figures are copied in');
  assert.match(fn, /doc\.leagueTable = tb/, 'so is the table');
  assert.match(fn, /doc\.published = true/);
  assert.match(fn, /doc\.publishedAt/);
});

test('saving a draft never freezes anything', () => {
  const b = admin.match(/function prBuildDoc\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(b, /data\.published = false/);
  assert.ok(!/playerStats|leagueTable/.test(b),
    'only publishProgramme may attach a snapshot');
});

test('TEMPORAL REGRESSION — an archived edition cannot drift', () => {
  // Programme A published when a player had 2 apps must still say 2 when the
  // canonical service later says 25. The renderer proves this: with a
  // playerStats snapshot present it returns immediately and never calls out.
  const fn = print.match(/function loadSeasonStats\(doc\)\{[\s\S]*?\n  \}/)[0];
  const frozenReturn = fn.indexOf('if (published) return Promise.resolve');
  const liveCall = fn.indexOf("fetch('/.netlify/functions/programme-stats')");
  assert.ok(frozenReturn > -1 && liveCall > frozenReturn,
    'the live call must be unreachable once an edition is published');

  // And the cards read that document, not a service.
  const cardBlock = print.match(/var playerSeason = [^\n]*\n/)[0];
  assert.match(cardBlock, /d\.playerStats/,
    'cards must render from the document, so an archived edition renders its own past');
});

test('print uses whichever snapshot the edition being viewed carries', () => {
  // Draft print → the draft's figures. Published print → the frozen ones.
  // Both go through the same loader, so they cannot diverge.
  const loader = print.match(/function loadProgrammeDoc\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(loader, /draftSnapshot\(\)/);
  assert.match(loader, /items\.filter\(function\(it\)\{return it\.id===id;\}\)/,
    'an archived edition is fetched by id and rendered from its own stored fields');
});

test('the club’s live pages may still move — only the archive is frozen', () => {
  // The canonical service is untouched: it keeps recomputing for the website.
  const ps = read('netlify/functions/lib/football/player-stats.js');
  assert.match(ps, /Everything here RECOMPUTES/,
    'the season service must stay live for the public squad pages');
});

// ── 6 · NOTHING ELSE MOVED ──────────────────────────────────────────────────

test('the Full-Time ingestion is untouched and remains the source of truth', () => {
  const client = read('netlify/functions/lib/fwp-client.js');
  // The phrase wraps across two comment lines in the source.
  assert.match(client, /the only file in the repo that makes a[\s\S]{0,12}network call/);
  assert.match(client, /FWP_SYNC_ENABLED/, 'the permission gate stays');
  // No new provider call was introduced anywhere.
  const dir = path.join(ROOT, 'netlify/functions');
  const hits = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const f = path.join(d, e.name);
      if (e.isDirectory()) return walk(f);
      if (!e.name.endsWith('.js')) return;
      if (/footballwebpages/.test(fs.readFileSync(f, 'utf8'))) hits.push(path.relative(dir, f));
    });
  }(dir));
  assert.deepStrictEqual(hits.sort(), ['import-fixtures.js', 'lib/fwp-adapter.js', 'lib/fwp-client.js'],
    'no new file may talk to Full-Time');
});

test('the programme never calls Full-Time itself', () => {
  assert.ok(!/footballwebpages/.test(statsFn), 'it reads our own store, not the provider');
  assert.ok(!/footballwebpages/.test(print));
  assert.match(statsFn, /read-players/, 'via the canonical service');
});

test('the fixture repair just deployed is not regressed', () => {
  assert.match(admin, /function prBuildDoc\(\)/);
  assert.match(admin, /data\.fixtureId = gv\('pr-fixture'\)/);
  assert.match(admin, /function prHandOverDraft\(\)/);
  assert.ok(!/Press Publish first/.test(strip(admin)));
  assert.match(print, /aspect-ratio:4\/5/, 'the headshot fix must survive');
  assert.match(print, /league-mark/, 'Cherry Red placement must survive');
});

test('match sponsors stay tied to their own edition', () => {
  const b = admin.match(/function prBuildDoc\(\) \{[\s\S]*?\n\}/)[0];
  ['matchSponsor', 'ballSponsor', 'matchdaySponsor'].forEach((k) => {
    assert.ok(new RegExp(k + ':\\s*gv\\(').test(b));
  });
  // They are part of the document, so publishing freezes them with everything
  // else and the next fixture starts clean.
  const pub = admin.match(/async function publishProgramme\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(pub, /var doc = prBuildDoc\(\)/);
});

// ── 7 · AI WRITES THE STORY, NEVER THE STATISTICS ───────────────────────────

const ai = read('netlify/functions/programme-ai.js');

test('the facts are assembled on the server, never accepted from the browser', () => {
  // If the browser posted the numbers, anybody could post different ones and
  // the programme would print them under the club's name.
  const h = ai.match(/exports\.handler = async function[\s\S]*?\n\};/)[0];
  assert.match(h, /await playerFacts\(id, season\)/);
  assert.ok(!/b\.appearances|b\.goals|b\.stats|b\.facts/.test(h),
    'no statistic may arrive in the request body');
});

test('the model is given a closed list of facts and told it may add none', () => {
  const sys = ai.match(/const SYSTEM = \[[\s\S]*?\]\.join\('\\n'\);/)[0];
  assert.match(sys, /COMPLETE LIST OF FACTS/);
  ['age', 'nationality', 'previous clubs', 'career history', 'injuries', 'awards']
    .forEach((k) => assert.ok(sys.includes(k), `the prompt must forbid inventing ${k}`));
  assert.match(sys, /Do not invent quotes/);
  assert.match(sys, /if the list says 2 appearances, write 2/);
});

test('AI cannot overwrite a verified number', () => {
  // The numbers are computed before the call and returned alongside the prose,
  // so the card and the paragraph cannot disagree.
  // Slice the whole spotlight branch, up to the next mode.
  const h = ai.slice(ai.indexOf("if (mode === 'spotlight')"), ai.indexOf("if (mode === 'form')"));
  assert.match(h, /facts: facts/, 'the verified figures are returned unchanged');
  assert.match(h, /basis: 'Based on official match data/);
  // And the programme's own cards never read from this function.
  assert.ok(!/programme-ai/.test(print), 'cards must not source numbers from the assistant');
});

test('AI output is always a draft', () => {
  const spots = ai.match(/draft: true/g) || [];
  assert.ok(spots.length >= 2, 'every successful mode must mark its output a draft');
  // Strip trailing comments too, then assert there is no publish path at all.
  const code = ai.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
  assert.ok(!/pushToGitHub|saveProgramme|publishProgramme/.test(code),
    'it may not write or publish anything');
});

test('insufficient data produces an honest refusal, not filler', () => {
  const { NOT_ENOUGH } = require(path.join(ROOT, 'netlify/functions/programme-ai.js'))._internal;
  assert.strictEqual(NOT_ENOUGH.ok, false);
  assert.strictEqual(NOT_ENOUGH.insufficient, true);
  assert.match(NOT_ENOUGH.error, /isn't enough verified club information/);
  // A player with no recorded involvement gives a writer nothing.
  const pf = ai.match(/async function playerFacts[\s\S]*?\n\}/)[0];
  assert.match(pf, /if \(!t\.appearances\) return null/);
});

test('the assistant reads the canonical service, not the provider', () => {
  assert.match(ai, /RP\.statsByClubPlayer/);
  assert.ok(!/footballwebpages/.test(ai));
});

test('the assistant is gated like every other staff tool', () => {
  assert.match(ai, /if \(!adminOk\(b\.pin\)\) return resp\(401/);
});

test('AI copy is frozen with the edition once published', () => {
  // Approved copy lives in the programme document, which publishProgramme()
  // freezes wholesale — so an archived spotlight is never regenerated.
  const pub = admin.match(/async function publishProgramme\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(pub, /var doc = prBuildDoc\(\)/,
    'the editorial fields are part of the document that gets frozen');
  assert.ok(!/programme-ai/.test(pub), 'publishing must never regenerate copy');
});
