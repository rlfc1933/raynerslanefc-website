// Season fixture list.
//
// Reads the club's fixtures/results embed into fixture records carrying the
// provider's own match id — which is the only safe way to tie a provider match
// to one of ours. Opponent text plus a date is a guess; an id is an identity.
//
// The kick-off cell does double duty: a time before the match, a score after
// it. So a played fixture has no time in it at all, and defaulting that to
// 15:00 would overwrite a real 19:45 midweek kick-off. Null means "the provider
// is not telling us", never "three o'clock".
'use strict';

const N = require('./normalise');

function text(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'").replace(/&rsquo;/g, '’')
    .replace(/\s+/g, ' ').trim();
}

/** "3pm" / "7.45pm" / "2:00pm" → "19:45". Null when it is not a time. */
function parseKickoff(s) {
  const m = String(s || '').match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return String(h).padStart(2, '0') + ':' + (m[2] || '00');
}
/** "1/8/2026" (D/M/YYYY) → "2026-08-01". */
function toISODate(d) {
  const p = String(d || '').split('/');
  if (p.length !== 3 || !/^\d{4}$/.test(p[2])) return '';
  return p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
}
/** "3 - 1" → {home:3, away:1}; a kick-off time → null. */
function parseScore(s) {
  const m = String(s || '').match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

/**
 * @returns {{fixtures: Array, seasonsSeen: string[]}}
 */
function parseFixtureList(html) {
  if (!html) return { fixtures: [], seasonsSeen: [] };
  const rows = html.match(/<tr[^>]*data-href=[\s\S]*?<\/tr>/gi) || [];
  const fixtures = [];
  const seasons = {};

  for (const row of rows) {
    const href = (row.match(/data-href="([^"]+)"/) || [])[1] || '';
    // match/<season>/<competition>/<home>/<away>/<id>
    const seg = href.split('/');
    if (seg.length < 6) continue;
    const season = seg[1] || '';
    const competitionSlug = seg[2] || '';
    const homeSlug = seg[3] || '';
    const awaySlug = seg[4] || '';
    const externalFixtureId = seg[seg.length - 1] || '';
    if (!/^\d+$/.test(externalFixtureId)) continue;
    if (season) seasons[season] = (seasons[season] || 0) + 1;

    const date = toISODate((row.match(/class="date"[^>]*data-export="([^"]+)"/) || [])[1] || '');
    const opponent = text((row.match(/class="opponent"[^>]*data-export="([^"]+)"/) || [])[1] || '');
    const venueCell = text((row.match(/class="[^"]*venue[^"]*"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
    const isHome = /^h$/i.test(venueCell);
    const competition = text((row.match(/class="[^"]*competition[^"]*"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
    const koCell = text((row.match(/class="ko-score"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
    const attendance = text((row.match(/class="[^"]*attendance[^"]*"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
    const scorers = text((row.match(/class="[^"]*scorers[^"]*"[^>]*>([\s\S]*?)<\/td>/) || [])[1] || '');
    // The title carries an unambiguous home-away scoreline once played:
    //   "Rayners Lane 3-3 Wallingford & Crowmarsh"
    const title = text((row.match(/<tr[^>]*title="([^"]*)"/) || [])[1] || '');

    if (!date || !opponent) continue;

    const score = parseScore(koCell);
    fixtures.push({
      externalFixtureId, season, date,
      kickoff: parseKickoff(koCell),          // null once played
      opponent, isHome,
      competition, competitionSlug,
      homeSlug, awaySlug,
      homeTeam: isHome ? 'Rayners Lane' : opponent,
      awayTeam: isHome ? opponent : 'Rayners Lane',
      opponentKey: N.clubKey(opponent),
      played: !!score,
      homeScore: score ? score.home : null,
      awayScore: score ? score.away : null,
      scorers: scorers || '',
      attendance: attendance || '',
      providerTitle: title,
      providerKoCell: koCell,                 // audit: what the cell actually said
      matchPath: href,
    });
  }
  return { fixtures, seasonsSeen: Object.keys(seasons) };
}

/**
 * Refuse an import from the wrong season outright. This guard already exists in
 * import-fixtures.js and stopped a 2024-25 list being written over the current
 * one; it is repeated here because the consequence is a whole wrong season.
 */
function validateFixtureList(parsed, expectedSeason) {
  const errors = [];
  if (!parsed || !parsed.fixtures.length) return { ok: false, errors: ['no fixtures parsed'] };
  const wrong = parsed.seasonsSeen.filter((s) => s !== expectedSeason);
  if (wrong.length) errors.push('season mismatch: expected ' + expectedSeason + ', saw ' + wrong.join(', '));
  const expYear = Number(String(expectedSeason).slice(0, 4));
  if (parsed.fixtures.some((f) => {
    const y = Number(f.date.slice(0, 4));
    return y < expYear || y > expYear + 1;
  })) errors.push('a fixture date falls outside the season window');
  const ids = parsed.fixtures.map((f) => f.externalFixtureId);
  if (new Set(ids).size !== ids.length) errors.push('duplicate provider fixture ids');
  return { ok: errors.length === 0, errors };
}

module.exports = { parseFixtureList, validateFixtureList, parseKickoff, toISODate, parseScore };
