// ════════════════════════════════════════════════════════════════════════════
// THE JOIN — from a Full-Time line-up to a number on a printed card.
//
// The club had genuine figures and the programme printed a dash for everybody.
// This is the trace, pinned with the real production shapes:
//
//   football_players.club_player_id  →  data/players.json .id
//
// That is the whole join, and it was null on all nineteen records because no
// identity had been confirmed. Not a bug — the system refusing to guess which
// Keiran Barnard-White scored — but nothing said so, so it read as a broken
// statistics feed.
//
// These tests fix the SHAPES in place, because every candidate failure the
// investigation had to rule out was a shape mismatch: string id versus numeric,
// slug versus database id, keyed object under an unexpected property, renderer
// looking up by name while the service returns id. Each is now a test rather
// than a thing to re-diagnose at midnight before a home game.
//
// Real values, taken from production on 7 August 2026:
//   Keiran Barnard-White — 2 appearances, 2 starts, 1 goal, 179 minutes
//   Le'Kai Chevannes     — 2 appearances, 0 goals, 160 minutes
//   club roster id       — 'player-keiran-barnard-white'  (a STRING, not a number)
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── PRODUCTION SHAPES ───────────────────────────────────────────────────────

const OUR_TEAM = 'team-rlfc';

/** football_players, exactly as production holds them. */
const KEIRAN_FWP = {
  id: 'fp-keiran',
  canonical_name: 'Keiran Barnard-White',
  current_team_id: OUR_TEAM,
  identity_status: 'confirmed',
  club_player_id: 'player-keiran-barnard-white',   // the roster's own string id
  merged_into_id: null,
  slug: 'keiran-barnard-white',
  public_slug: 'keiran-barnard-white',
};

/** football_player_season_stats, one row per scope. 'all' IS the total. */
const KEIRAN_STATS = {
  all:      { player_id: 'fp-keiran', season: '2026-2027', scope: 'all',
              appearances: 2, starts: 2, substitute_appearances: 0, goals: 1,
              minutes_played: 179, minutes_confidence: 'exact',
              yellow_cards: 0, red_cards: 0, own_goals: 0 },
  league:   { player_id: 'fp-keiran', season: '2026-2027', scope: 'league',
              appearances: 2, starts: 2, goals: 1, minutes_played: 179 },
  cup:      { player_id: 'fp-keiran', season: '2026-2027', scope: 'cup',
              appearances: 0, starts: 0, goals: 0, minutes_played: 0 },
};

/**
 * Load read-players.js with its Supabase layer replaced by a recorder, so the
 * real query strings are asserted rather than a reimplementation of them.
 */
function loadReadPlayers(rows) {
  const calls = [];
  const storePath = require.resolve(path.join(ROOT, 'netlify/functions/lib/football/store.js'));
  const target = require.resolve(path.join(ROOT, 'netlify/functions/lib/football/read-players.js'));
  const stub = {
    configured: () => true,
    rest: async (q) => { calls.push(q); return rows(q); },
    findOne: async (table, q) => {
      calls.push(table + '?' + q);
      const r = rows(table + '?' + q);
      return (r && r[0]) || null;
    },
  };
  // Seed the module cache so `require('./store')` resolves to the recorder.
  // Stubbing by require STRING missed it — read-players asks for './store'.
  const prev = require.cache[storePath];
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: stub };
  delete require.cache[target];
  let mod;
  try { mod = require(target); } finally {
    delete require.cache[target];
    if (prev) require.cache[storePath] = prev; else delete require.cache[storePath];
  }
  return { mod, calls };
}

// ── 1 · THE JOIN ITSELF ─────────────────────────────────────────────────────

test('a confirmed player reaches the card, keyed by the roster id', async () => {
  const { mod, calls } = loadReadPlayers((q) => {
    if (/football_teams/.test(q)) return [{ id: OUR_TEAM }];
    if (/football_players\?/.test(q)) return [KEIRAN_FWP];
    if (/season_stats/.test(q)) return [KEIRAN_STATS.all];
    return [];
  });
  const out = await mod.statsByClubPlayer('2026-2027', 'all');

  // Keyed by club_player_id — the id data/players.json uses — not by the
  // football_players id, not by the slug, not by the name.
  assert.ok(Object.prototype.hasOwnProperty.call(out, 'player-keiran-barnard-white'),
    'the card looks players up by the roster id, so that must be the key');
  const t = out['player-keiran-barnard-white'];
  assert.strictEqual(t.appearances, 2);
  assert.strictEqual(t.goals, 1);
  assert.strictEqual(t.minutes, 179);

  // And exactly one scope was asked for.
  const statsCall = calls.filter((c) => /season_stats/.test(c));
  assert.strictEqual(statsCall.length, 1);
  assert.match(statsCall[0], /scope=eq\.all/);
});

test('the key is a string, because the roster ids are strings', async () => {
  const { mod } = loadReadPlayers((q) => {
    if (/football_teams/.test(q)) return [{ id: OUR_TEAM }];
    if (/football_players\?/.test(q)) return [KEIRAN_FWP];
    if (/season_stats/.test(q)) return [KEIRAN_STATS.all];
    return [];
  });
  const out = await mod.statsByClubPlayer('2026-2027', 'all');
  const live = JSON.parse(read('data/players.json'));
  const ids = (live.players || []).map((p) => p.id);
  assert.ok(ids.every((id) => typeof id === 'string'),
    'if the roster ever moves to numeric ids this join needs revisiting');
  // Every key produced must be findable in the roster's own id space.
  Object.keys(out).forEach((k) => assert.strictEqual(typeof k, 'string'));
});

test('an unconfirmed player is absent — which is why every card showed a dash', async () => {
  const provisional = Object.assign({}, KEIRAN_FWP,
    { identity_status: 'provisional', club_player_id: null });
  const { mod, calls } = loadReadPlayers((q) => {
    if (/football_teams/.test(q)) return [{ id: OUR_TEAM }];
    if (/football_players\?/.test(q)) return [];        // the query filters him out
    if (/season_stats/.test(q)) return [KEIRAN_STATS.all];
    return [];
  });
  const out = await mod.statsByClubPlayer('2026-2027', 'all');
  assert.deepStrictEqual(out, {}, 'no confirmed identity means no figures, not zeros');
  assert.ok(!calls.some((c) => /season_stats/.test(c)),
    'and it does not even ask for statistics it could not attribute');
  assert.ok(provisional.club_player_id === null);
});

test('the query itself excludes the unconfirmed and the merged', async () => {
  const { calls } = loadReadPlayers((q) => {
    if (/football_teams/.test(q)) return [{ id: OUR_TEAM }];
    return [];
  });
  const { mod } = loadReadPlayers((q) => {
    if (/football_teams/.test(q)) return [{ id: OUR_TEAM }];
    return [];
  });
  await mod.statsByClubPlayer('2026-2027', 'all');
  const q = calls.concat([]).length ? calls : [];
  const players = read('netlify/functions/lib/football/read-players.js');
  assert.match(players, /identity_status=eq\.confirmed/);
  assert.match(players, /merged_into_id=is\.null/);
  assert.ok(q.length >= 0);
});

// ── 2 · NOTHING IS COUNTED TWICE ────────────────────────────────────────────

test('scope rows are never summed', async () => {
  // If all three rows came back, only 'all' may be used. Summing would print
  // 4 appearances and 2 goals for a player who has 2 and 1.
  const { mod } = loadReadPlayers((q) => {
    if (/football_teams/.test(q)) return [{ id: OUR_TEAM }];
    if (/football_players\?/.test(q)) return [KEIRAN_FWP];
    if (/season_stats/.test(q)) return [KEIRAN_STATS.all, KEIRAN_STATS.league, KEIRAN_STATS.cup];
    return [];
  });
  const out = await mod.statsByClubPlayer('2026-2027', 'all');
  const t = out['player-keiran-barnard-white'];
  assert.strictEqual(t.appearances, 2, 'not 4');
  assert.strictEqual(t.goals, 1, 'not 2');
  assert.strictEqual(t.minutes, 179, 'not 358');
});

test('one roster player receives exactly one row', async () => {
  const twin = Object.assign({}, KEIRAN_FWP, { id: 'fp-keiran-2', slug: 'keiran-b-w' });
  const { mod } = loadReadPlayers((q) => {
    if (/football_teams/.test(q)) return [{ id: OUR_TEAM }];
    if (/football_players\?/.test(q)) return [KEIRAN_FWP, twin];
    if (/season_stats/.test(q)) return [KEIRAN_STATS.all,
      Object.assign({}, KEIRAN_STATS.all, { player_id: 'fp-keiran-2' })];
    return [];
  });
  const out = await mod.statsByClubPlayer('2026-2027', 'all');
  assert.strictEqual(Object.keys(out).length, 1,
    'two records claiming one roster player must not make two cards');
});

test('a merged record cannot produce a second card', () => {
  const s = read('netlify/functions/lib/football/read-players.js');
  assert.match(s, /merged_into_id=is\.null/);
  const fnSrc = read('netlify/functions/football-players.js');
  assert.match(fnSrc, /is already confirmed as that player/,
    'and one roster player cannot be claimed twice in the first place');
});

// ── 3 · KNOWN ZERO IS NOT UNKNOWN ───────────────────────────────────────────

const PS = require(path.join(ROOT, 'netlify/functions/programme-stats.js'));

test('a confirmed player with nothing recorded prints 0, not a dash', () => {
  const c = PS._internal.cardStats(
    { appearances: 0, goals: 0, minutes: 0, minutesKnown: true, cleanSheets: 0 }, false);
  assert.strictEqual(c.apps, 0);
  assert.strictEqual(c.goals, 0);
  assert.strictEqual(c.coverage, 'confirmed');
});

test('an unmatched player prints a dash, not a zero', () => {
  const c = PS._internal.cardStats(null, false);
  assert.strictEqual(c.apps, null);
  assert.strictEqual(c.goals, null);
  assert.strictEqual(c.coverage, 'unmatched');
});

test("Keiran's real figures survive the card layer intact", () => {
  const c = PS._internal.cardStats(
    { appearances: 2, goals: 1, minutes: 179, minutesKnown: true, minutesExact: true }, false);
  assert.deepStrictEqual([c.apps, c.goals, c.minutes], [2, 1, 179]);
});

test('a goalkeeper gets clean sheets in place of goals', () => {
  const gk = PS._internal.cardStats(
    { appearances: 2, goals: 0, minutes: 180, minutesKnown: true, cleanSheets: 1 }, true);
  assert.strictEqual(gk.cleanSheets, 1);
  const out = PS._internal.cardStats(
    { appearances: 2, goals: 0, minutes: 180, minutesKnown: true, cleanSheets: 1 }, false);
  assert.strictEqual(out.cleanSheets, null, 'an outfielder is not credited a clean sheet');
});

test('assists are nowhere', () => {
  const c = PS._internal.cardStats({ appearances: 2, goals: 1, minutes: 179, minutesKnown: true }, false);
  assert.ok(!('assists' in c));
  assert.ok(!/assists/i.test(read('netlify/functions/programme-stats.js').replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')));
});

// ── 4 · THE RENDERER READS BY ID, NOT BY NAME ───────────────────────────────

const print = read('programme-print.html');

test('the card looks up by roster id', () => {
  const block = print.slice(print.indexOf('var pc = club.players.map'),
                            print.indexOf('var pc = club.players.map') + 900);
  assert.match(block, /playerSeason\[p\.id\]/, 'by id — a name lookup would break on any alias');
  assert.ok(!/\.name\s*===|toLowerCase\(\)\s*===/.test(block));
});

test('the renderer reads the players property the endpoint returns', () => {
  assert.match(print, /d\.playerStats && d\.playerStats\.players/,
    'programme-stats returns { players: {...} } — the shapes must agree');
  assert.match(read('netlify/functions/programme-stats.js'), /players: players/);
});

test('a missing headshot cannot affect a number', () => {
  const block = print.slice(print.indexOf('var pc = club.players.map'),
                            print.indexOf('var pc = club.players.map') + 1400);
  const statLine = block.slice(block.indexOf('var st = playerSeason[p.id]'));
  assert.ok(!/photo|image/.test(statLine.slice(0, 300)),
    'the figures are derived before, and independently of, any photograph');
});

// ── 5 · DRAFT REFRESHES, PUBLISHED IS FROZEN ────────────────────────────────

function loadSeasonStats(doc, fetchImpl) {
  const src = print.slice(print.indexOf('function loadSeasonStats(doc){'),
                          print.indexOf('Promise.all([ loadProgrammeDoc()'));
  return new Function('fetch', src + '; return loadSeasonStats;')(fetchImpl)(doc);
}
const LIVE = { ok: true, players: { 'player-keiran-barnard-white': { appearances: 2, goals: 1 } } };
const liveFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(LIVE) });

test('a draft carrying an EMPTY snapshot still loads current figures', async () => {
  // The trap: `if (doc.playerStats)` — an empty object is truthy, so a draft
  // that had ever been handed a {} was treated as settled history for ever.
  const got = await loadSeasonStats({ playerStats: {} }, liveFetch);
  assert.strictEqual(got, LIVE, 'a draft is not history; it refreshes');
});

test('a draft carrying a stale snapshot still loads current figures', async () => {
  const stale = { ok: true, players: { 'player-keiran-barnard-white': { appearances: 0, goals: 0 } } };
  const got = await loadSeasonStats({ playerStats: stale }, liveFetch);
  assert.strictEqual(got, LIVE);
});

test('a draft with no snapshot loads current figures', async () => {
  assert.strictEqual(await loadSeasonStats({}, liveFetch), LIVE);
});

test('a published edition never asks again', async () => {
  const frozen = { ok: true, players: { 'player-keiran-barnard-white': { appearances: 2, goals: 1 } } };
  let asked = false;
  const got = await loadSeasonStats({ published: true, playerStats: frozen },
    () => { asked = true; return Promise.resolve({ ok: true, json: () => Promise.resolve(LIVE) }); });
  assert.strictEqual(got, frozen);
  assert.strictEqual(asked, false, 'an archived edition must not be rewritten by later seasons');
});

test('a published edition that froze nothing stays empty', async () => {
  let asked = false;
  const got = await loadSeasonStats({ published: true },
    () => { asked = true; return Promise.resolve({ ok: true, json: () => Promise.resolve(LIVE) }); });
  assert.strictEqual(got, null, 'dashes are what that afternoon honestly knew');
  assert.strictEqual(asked, false);
});

test('the draft overwrite is not blocked by a stale snapshot', () => {
  const line = print.match(/if \(ps && !d\.published\) d\.playerStats = ps;/);
  assert.ok(line, 'a draft must take the figures it just fetched');
});

test('the league table follows the same published-decides rule', () => {
  const block = print.slice(print.indexOf('var frozenTable ='), print.indexOf('var club = {'));
  assert.match(block, /d\.published/, 'a draft shows current standings; only a published edition is pinned');
  assert.match(block, /liveTable/);
});

// ── 6 · THE EDITOR EXPLAINS ITSELF ──────────────────────────────────────────

const admin = read('admin.html');

test('the programme editor says why the cards are blank', () => {
  assert.match(admin, /Player statistics are waiting for player matching/);
  assert.match(admin, /still need to be checked/);
  assert.match(admin, /A dash means &ldquo;we do not know&rdquo;/);
});

test('it offers the way to fix it, and the way to see the fix', () => {
  assert.match(admin, /CHECK THE PLAYERS/);
  assert.match(admin, /function prGoCheckPlayers\(\)/);
  const go = admin.match(/function prGoCheckPlayers\(\)[\s\S]*?\n\}/)[0];
  assert.match(go, /openPanel\('settings'\)/);
  assert.match(go, /ident-status/, 'straight to the block that does the job');
  assert.match(admin, /Refresh football data/);
  assert.match(admin, /async function prRefreshFootball\(\)/);
});

test('the status is drawn from the queue, not guessed', () => {
  const f = admin.match(/async function prStatsStatus\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /action: 'queue'/);
  assert.match(f, /q\.ours/, 'opposition names are not our job and must not be counted');
});

test('the editor shows the status when it opens', () => {
  assert.match(admin, /if \(name === 'programme'\) \{ initProgramme\(\); prStatsStatus\(\); \}/);
});
