// ════════════════════════════════════════════════════════════════════════════
// SQUAD SOURCES — what outside records say, with the evidence attached.
//
// The club football registry (football_players, filled from Football Web Pages
// and FA Full-Time line-ups by football-registry-sync) is the one automated
// source the club is permitted to use. footballwebpages.co.uk refuses
// automated page requests and FWP_API_KEY is not set, so nothing here scrapes
// a website. Anything else — a club announcement, a registration list from the
// league — comes in through the manual import, with its URL.
//
// What a registry row proves: that a name appeared in a MATCH LINE-UP. Not a
// registration, not membership of the current squad. The evidence says so.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const SEASON = '2026-27';
const FWP_URL = 'https://www.footballwebpages.co.uk/rayners-lane';

/** @returns {{ok:boolean, rows?:Array, error?:string}} — never throws */
async function registry(opts) {
  const o = opts || {};
  try {
    const S = o.store || require('../football/store');
    if (!S.configured()) return { ok: false, error: 'The football registry is not connected.' };
    const teams = await S.rest('football_teams?select=id,name&name=ilike.*rayners*lane*&limit=5');
    const team = (teams || [])[0];
    if (!team) return { ok: false, error: 'Rayners Lane is not in the football registry yet.' };
    const rows = await S.rest('football_players?select=id,canonical_name,display_name,external_provider,external_player_id,club_player_id,identity_status,merged_into_id' +
      '&current_team_id=eq.' + team.id + '&active=eq.true');
    const at = new Date(o.now || Date.now()).toISOString();
    return {
      ok: true,
      rows: (rows || []).filter((r) => !r.merged_into_id).map((r) => ({
        sourceKey: (r.external_provider || 'fwp') + ':' + (r.external_player_id || ('registry-' + r.id)),
        name: r.display_name || r.canonical_name,
        linkedPlayerId: r.club_player_id || null,
        evidence: { source: 'Club football registry (Football Web Pages / FA Full-Time line-ups)', url: FWP_URL,
          season: SEASON, checkedAt: at,
          note: 'Named in a ' + SEASON + ' match line-up (registry record ' + (r.external_provider || 'fwp') + ':' +
            (r.external_player_id || r.id) + ', identity ' + (r.identity_status || 'provisional') +
            '). A match appearance — not a registration or confirmation of squad membership.' },
      })),
    };
  } catch (e) {
    return { ok: false, error: 'The football registry could not be read just now.' };
  }
}

/** Staff-entered names from a named source (announcement, league list). */
function manual(names, meta) {
  const m = meta || {};
  const raw = String(m.sourceUrl || '').trim();
  const url = /^https?:\/\/\S+$/i.test(raw) ? raw.slice(0, 400) : '';
  const at = new Date(m.now || Date.now()).toISOString();
  return (names || []).map((n) => String(n || '').trim()).filter(Boolean).slice(0, 60).map((name) => ({
    sourceKey: 'manual:' + name.toLowerCase().replace(/\s+/g, ' ') + '|' + url,
    name,
    evidence: { source: String(m.sourceName || 'Entered by staff').slice(0, 120), url: url || null,
      season: String(m.season || SEASON).slice(0, 10), checkedAt: at,
      note: String(m.note || '').slice(0, 300) || null, enteredBy: m.by || null },
  }));
}

module.exports = { registry, manual, SEASON, FWP_URL };
