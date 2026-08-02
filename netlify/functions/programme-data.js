// Public programme data. Read-only, published editions only.
//
// RLS already restricts programme_editions and programme_versions to published
// and archived states, so a draft sitting in the database days before a match
// cannot be reached by guessing a URL. This endpoint is the second lock, not
// the only one.
'use strict';

const S = require('./lib/football/store');
const FAN = require('./lib/fan/members');

/**
 * @param {number} code
 * @param {object} obj
 * @param {number} [seconds] public cache lifetime
 * @param {boolean} [personal] true when the body depends on WHO is asking
 *
 * A member's programme must never be cached by a CDN. `public, max-age` on a
 * response that varies by Authorization is how one supporter's entitled copy
 * gets served to the next logged-out visitor who asks for the same URL — the
 * gate would hold in the function and leak at the edge.
 */
function resp(code, obj, seconds, personal) {
  const cache = personal
    ? 'private, no-store, max-age=0'
    : 'public, max-age=' + (seconds || 120) + ', stale-while-revalidate=600';
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': cache,
  };
  // Even where a cache is allowed, the answer depends on the token.
  if (personal) headers.Vary = 'Authorization';
  return { statusCode: code, headers, body: JSON.stringify(obj) };
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

      /* ── THE MEMBER GATE ─────────────────────────────────────────────────
         The programme is free. It is also a reason to join, so the complete
         edition goes only to a signed-in Fan Zone member.

         Checked SERVER-SIDE, against Supabase, on every request. Not a
         client-side boolean, not an obscure URL, not hidden markup — a
         logged-out request for the payload is refused here, before the
         payload is assembled, so there is nothing to find in the response.

         What the public still gets is everything that makes the edition worth
         opening: the cover, who we played, when, and how it finished. */
      const gate = await FAN.context(event);
      if (!gate.entitled) {
        return resp(200, {
          ok: true,
          locked: true,
          reason: gate.user
            ? (gate.member ? 'membership_' + gate.member.membership_status : 'membership_incomplete')
            : 'not_signed_in',
          edition: {
            fixtureId: ed.internal_fixture_id, slug: ed.slug, state: ed.state,
            season: ed.season, kickoffAt: ed.scheduled_kickoff_at, venue: ed.venue,
            publishedAt: ed.published_at,
            afterFullTime: !!ed.published_after_full_time,
          },
          // Cover only — the shelf, not the contents.
          cover: (v.payload && v.payload.sections && v.payload.sections.cover) || null,
          finalMatch: v.final_match_snapshot ? {
            homeTeam: v.final_match_snapshot.homeTeam, awayTeam: v.final_match_snapshot.awayTeam,
            homeScore: v.final_match_snapshot.homeScore, awayScore: v.final_match_snapshot.awayScore,
            status: v.final_match_snapshot.status,
          } : null,
        }, 0, true);
      }

      // An entitled member is reading it. Record it once per edition per day.
      if (gate.member) {
        FAN.record(gate.member.id, 'programme_opened',
          { fixtureId: ed.internal_fixture_id, programmeId: ed.id, source: 'reader' }).catch(() => null);
      }

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
      }, 0, true);
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
