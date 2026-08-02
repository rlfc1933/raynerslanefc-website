// Public programme data. Read-only, published editions only.
//
// RLS already restricts programme_editions and programme_versions to published
// and archived states, so a draft sitting in the database days before a match
// cannot be reached by guessing a URL. This endpoint is the second lock, not
// the only one.
'use strict';

const S = require('./lib/football/store');

function resp(code, obj, seconds) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=' + (seconds || 120) + ', stale-while-revalidate=600',
    },
    body: JSON.stringify(obj),
  };
}

// The ONE list of states the public may read. It appears in three places —
// this endpoint, the RLS policy, and the Match Centre's programme check — and
// they must agree, or an edition gets listed and then refuses to open.
// 'published_recovery' is public: it IS published. What differs is when, and
// the edition says so itself rather than hiding it.
// PostgREST's in.() takes BARE values. Single quotes are not string delimiters
// here — they become part of the value, so `state=in.('archived')` looks for a
// state literally equal to 'archived' WITH the quotes and matches nothing.
//
// This filter had never matched anything, and nobody could tell, because no
// edition had ever published to exercise it. The moment one did, the endpoint
// answered "no published programme for that fixture" about a programme that
// was sitting right there, published.
const PUBLIC_STATE_LIST = ['published_matchday', 'published_late',
  'full_time_current', 'archived', 'published_recovery'];
const PUBLIC_STATES = '(' + PUBLIC_STATE_LIST.join(',') + ')';

exports.handler = async function (event) {
  const q = (event && event.queryStringParameters) || {};
  if (!S.configured()) return resp(200, { ok: false, error: 'not configured' });
  try {
    if (q.id || q.slug) {
      const filter = q.id
        ? 'internal_fixture_id=eq.' + encodeURIComponent(q.id)
        : 'slug=eq.' + encodeURIComponent(q.slug);
      const rows = await S.rest('programme_editions?' + filter +
        '&state=in.' + PUBLIC_STATES + '&select=*&limit=1');
      const ed = rows && rows[0];
      if (!ed) return resp(404, { ok: false, error: 'no published programme for that fixture' });
      const vs = await S.rest('programme_versions?edition_id=eq.' + ed.id +
        '&published_at=not.is.null&select=*&order=version.desc&limit=1');
      const v = vs && vs[0];
      if (!v) return resp(404, { ok: false, error: 'no published version' });
      return resp(200, {
        ok: true,
        edition: {
          fixtureId: ed.internal_fixture_id, slug: ed.slug, state: ed.state,
          season: ed.season, kickoffAt: ed.scheduled_kickoff_at, venue: ed.venue,
          publishedAt: ed.published_at, version: v.version,
          // Said on the edition itself. A programme that appeared after the
          // final whistle must not read as though supporters had it at kick-off.
          afterFullTime: !!ed.published_after_full_time,
          publicationSource: ed.publication_source_detail || 'automatic',
        },
        programme: v.payload,
        lineups: v.lineup_snapshot,
        table: v.table_snapshot,
        finalMatch: v.final_match_snapshot,
        // Stored with the version, not resolved now — an archived edition must
        // show the footer that was current when it was published.
        legal: v.legal_footer || null,
      }, ed.state === 'archived' ? 3600 : 60);
    }

    // The library: every published edition, newest first.
    const rows = await S.rest('programme_editions?state=in.' + PUBLIC_STATES +
      '&select=internal_fixture_id,slug,season,scheduled_kickoff_at,venue,state,published_at,' +
      'published_after_full_time,publication_source_detail,home_team_id,away_team_id,competition_id' +
      '&order=scheduled_kickoff_at.desc') || [];
    const [teams, comps] = await Promise.all([
      S.rest('football_teams?select=id,canonical_name,crest_asset_path'),
      S.rest('football_competitions?select=id,canonical_name'),
    ]);
    const T = {}; (teams || []).forEach((t) => { T[t.id] = t; });
    const C = {}; (comps || []).forEach((c) => { C[c.id] = c; });

    // Scores for the cards, so a finished edition shows its result.
    const ids = rows.map((r) => '"' + r.internal_fixture_id + '"').join(',');
    let states = [];
    if (ids) {
      states = await S.rest('match_state?fixture_id=in.(' + encodeURIComponent(ids) +
        ')&select=fixture_id,home_score,away_score,is_final') || [];
    }
    const SC = {}; states.forEach((s) => { SC[s.fixture_id] = s; });

    return resp(200, {
      ok: true,
      editions: rows.map((r) => {
        const st = SC[r.internal_fixture_id];
        return {
          fixtureId: r.internal_fixture_id, slug: r.slug, season: r.season,
          kickoffAt: r.scheduled_kickoff_at, venue: r.venue, state: r.state,
          homeTeam: (T[r.home_team_id] || {}).canonical_name,
          awayTeam: (T[r.away_team_id] || {}).canonical_name,
          homeCrest: (T[r.home_team_id] || {}).crest_asset_path,
          awayCrest: (T[r.away_team_id] || {}).crest_asset_path,
          competition: (C[r.competition_id] || {}).canonical_name,
          homeScore: st ? st.home_score : null,
          awayScore: st ? st.away_score : null,
          isFinal: st ? st.is_final : false,
          isCurrent: r.state !== 'archived',
          publishedAt: r.published_at,
          // So a card can say what it is without the page guessing from state.
          afterFullTime: !!r.published_after_full_time,
          publicationSource: r.publication_source_detail || 'automatic',
        };
      }),
    }, 120);
  } catch (e) {
    return resp(200, { ok: false, error: String(e && e.message || e) });
  }
};
