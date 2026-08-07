// ════════════════════════════════════════════════════════════════════════════
// THE PROGRAMME'S VIEW OF THE SEASON — read-only, from our own store.
//
// WHY THIS EXISTS
// ---------------
// The programme's player cards read data/players.json, where every player has
// a hand-typed `apps: 0, goals: 0, assists: 0` that nobody has ever filled in.
// Meanwhile the club already computes real figures from official Full-Time
// line-ups and scorer lines, in lib/football/player-stats.js. The two systems
// were simply never connected, so the programme printed zeros for everybody.
//
// This is the bridge, and it is deliberately thin: it adds no statistics of its
// own. read-players.statsByClubPlayer() is the canonical service and stays the
// only place a season total is computed.
//
// WHAT IT GUARANTEES, AND WHY EACH ONE MATTERS
// --------------------------------------------
//   ONE PERSON, ONE ROW. The canonical query already filters to
//   identity_status='confirmed' and merged_into_id is null, so an unresolved
//   provider string or a merged duplicate can never reach a card. A player
//   appearing twice on the squad page — or their goals counted twice — would be
//   a factual error printed on paper.
//
//   ONE SCOPE. season_stats holds a row per scope: 'all', 'league', 'cup',
//   'friendly'. 'all' IS the total; the others are subsets of it. Adding them
//   would double every appearance and goal. Only 'all' is ever read, and the
//   test suite pins that.
//
//   NO ASSISTS. Full-Time's pages carry no assist information, so there is
//   nothing to report. A printed "0 ASSISTS" claims we know a player has none.
//   The field is gone rather than guessed.
//
//   KNOWN ZERO IS NOT UNKNOWN. A confirmed player with no recorded involvement
//   genuinely has 0 appearances. A player we could not match has no answer at
//   all. The first prints 0; the second prints an em dash. `coverage` is how
//   the card tells them apart.
//
// PUBLIC because the print page is a static document with no session. It
// exposes only what already appears on the public squad pages — appearances,
// goals, minutes — and never an identity decision, an audit row or a
// provider string.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const RP = require('./lib/football/read-players');
const S = require('./lib/football/store');

const SEASON = process.env.FWP_SEASON || '2026-2027';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      // Programme drafts must see today's figures; a stale cache would print
      // last week's numbers on this week's teamsheet.
      'Cache-Control': 'public, max-age=60',
    },
    body: JSON.stringify(obj),
  };
}

/**
 * How many matches the club has actually played, so a card can tell the
 * difference between "played none of the two so far" and "we have no record".
 */
async function playedCount(season) {
  const rows = await S.rest('football_fixtures?season=eq.' + encodeURIComponent(season) +
    '&fixture_status=eq.played&select=id') || [];
  return rows.length;
}

/**
 * The card's three numbers, decided once here so the digital programme, the
 * print edition and the PDF cannot disagree.
 *
 * Outfield:    APPS · GOALS · MINS
 * Goalkeeper:  APPS · CLEAN SHEETS · MINS
 *
 * Nothing is invented to fill a box. A value we cannot establish is null, and
 * the renderer prints an em dash for it.
 */
function cardStats(t, isKeeper) {
  if (!t) {
    // Not matched to a Full-Time identity — we have no answer, not a zero.
    return { apps: null, goals: null, minutes: null, cleanSheets: null, coverage: 'unmatched' };
  }
  return {
    apps: t.appearances,
    goals: t.goals,
    // minutes are derived from substitution times and are flagged partial by
    // the canonical service; carry that honesty through rather than rounding
    // it away.
    minutes: t.minutesKnown ? t.minutes : null,
    minutesExact: !!t.minutesExact,
    cleanSheets: isKeeper && t.cleanSheets != null ? t.cleanSheets : null,
    coverage: 'confirmed',
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  const season = (event.queryStringParameters || {}).season || SEASON;

  try {
    const [byClubPlayer, played] = await Promise.all([
      RP.statsByClubPlayer(season, 'all'),   // 'all' only — never summed with subsets
      playedCount(season),
    ]);

    const players = {};
    Object.keys(byClubPlayer).forEach((clubId) => {
      const t = byClubPlayer[clubId];
      players[clubId] = Object.assign({ clubPlayerId: clubId }, t);
    });

    return resp(200, {
      ok: true,
      season: season,
      scope: 'all',
      matchesPlayed: played,
      players: players,
      // Stamped so a published programme can record exactly when its figures
      // were frozen.
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[programme-stats]', (e && e.message) || e);
    // A failure must read as "we do not know", never as a row of zeros.
    return resp(200, { ok: false, season: season, players: {}, matchesPlayed: null,
      error: 'Season statistics are unavailable.' });
  }
};

exports._internal = { cardStats };
