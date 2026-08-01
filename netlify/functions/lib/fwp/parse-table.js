// League table parsing.
//
// The provider's table has two header rows (Home / Away / Total split across
// eighteen columns) and leading columns that vary — a crest cell, the position,
// the club, then a recent-result cell.
//
// So the stats are read from the RIGHT-HAND END, where the order is fixed:
//   … Total P W D L, F, A, +/-, Pts
// Counting from the left would silently shift every number the first time the
// provider adds or removes a leading column.
'use strict';

const N = require('./normalise');

function text(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'").replace(/&rsquo;/g, '’')
    .replace(/\s+/g, ' ').trim();
}
function num(v) {
  const m = String(v == null ? '' : v).match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * @returns {{rows: Array, ourRow: Object|null}} or null when this is not a table.
 */
function parseLeagueTable(html) {
  if (!html || !/<t[rd]/i.test(html)) return null;
  const trs = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rows = [];

  for (const tr of trs) {
    const cells = (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || [])
      .map((c) => text(c.replace(/^<t[hd][^>]*>/i, '').replace(/<\/t[hd]>$/i, '')));
    if (cells.length < 12) continue;                 // header or spacer
    const position = num(cells[1]);
    const team = cells[2];
    if (position == null || !team || /^p$/i.test(team)) continue;

    // Fixed from the end: Pts, +/-, A, F, then Total L, D, W, P.
    const n = cells.length;
    const points         = num(cells[n - 1]);
    const goalDifference = num(cells[n - 2]);
    const goalsAgainst   = num(cells[n - 3]);
    const goalsFor       = num(cells[n - 4]);
    const lost           = num(cells[n - 5]);
    const drawn          = num(cells[n - 6]);
    const won            = num(cells[n - 7]);
    const played         = num(cells[n - 8]);
    if (points == null || played == null) continue;

    rows.push({
      position, providerTeamName: team, teamKey: N.clubKey(team),
      played, won, drawn, lost,
      goalsFor, goalsAgainst, goalDifference, points,
      // The provider marks our own row; trust its marker over a name match.
      isUs: /\bthis-team\b/i.test(tr),
    });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.position - b.position);
  return { rows, ourRow: rows.filter((r) => r.isUs)[0] || null };
}

/** Sanity gate before a table is allowed anywhere near the public site. */
function validateTable(parsed, expect) {
  const errors = [];
  if (!parsed || !parsed.rows.length) return { ok: false, errors: ['no rows parsed'] };
  const positions = parsed.rows.map((r) => r.position);
  if (new Set(positions).size !== positions.length) errors.push('duplicate positions');
  if (positions[0] !== 1) errors.push('table does not start at position 1');
  if (parsed.rows.some((r) => r.played == null || r.points == null)) errors.push('row missing played/points');
  if (parsed.rows.some((r) => r.won + r.drawn + r.lost !== r.played)) errors.push('W+D+L does not equal P');
  if (!parsed.ourRow) errors.push('Rayners Lane is not in this table');
  if (expect && expect.minTeams && parsed.rows.length < expect.minTeams) {
    errors.push('only ' + parsed.rows.length + ' teams — wrong division?');
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { parseLeagueTable, validateTable, _text: text };
