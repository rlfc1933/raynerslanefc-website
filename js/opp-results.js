/* ════════════════════════════════════════════════════════════════════════
   OPPOSITION RECENT RESULTS — the rules, in one place, shared by the
   programme editor, the print page and the server.

   · Only COMPLETED matches count. Postponed, abandoned, void and cancelled
     matches are excluded, and so is anything without two whole-number scores.
   · A correction wins. A manual correction (or a provider row marked
     corrected) replaces the original row for the same match.
   · Missing stays missing. No source → state 'unavailable', never "no results".
   · A cache older than three days is 'stale' and says so.
   · Attaching results to a programme writes ONLY doc.oppRecentResults. It
     never touches oppSummary or any other staff-written field.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var STALE_MS = 3 * 24 * 3600 * 1000;
  var NOT_PLAYED = /postpon|abandon|void|cancel|called\s*off|walkover|expunged|awarded|^p\s*-\s*p$|^a\s*-\s*a$/i;

  function key(s) {
    return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\b(fc|f\.c\.|afc)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= 0 && n < 100; }
  function matchKey(r) { return String(r.date || '').slice(0, 10) + '|' + key(r.home) + '|' + key(r.away); }

  function isCompleted(r) {
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '').slice(0, 10))) return false;
    if (NOT_PLAYED.test(String(r.status || ''))) return false;
    if (r.postponed || r.abandoned || r.void) return false;
    return isInt(r.homeScore) && isInt(r.awayScore) && !!r.home && !!r.away;
  }

  /** Corrections replace the row they correct; a manual row beats a provider row. */
  function merge(auto, manual) {
    var map = {}, order = [];
    function put(r, rank) {
      var k = r.correctsKey || matchKey(r);
      var have = map[k];
      if (!have) { order.push(k); map[k] = { r: r, rank: rank }; return; }
      if (rank > have.rank || (rank === have.rank && String(r.enteredAt || r.fetchedAt || '') > String(have.r.enteredAt || have.r.fetchedAt || ''))) map[k] = { r: r, rank: rank };
    }
    (auto || []).forEach(function (r) { if (r) put(r, r.corrected ? 1 : 0); });
    (manual || []).forEach(function (r) { if (r) put(r, 2); });
    return order.map(function (k) { return map[k].r; });
  }

  /** The last N completed results on or before `cutoff` (YYYY-MM-DD, optional). */
  function lastCompleted(items, n, cutoff) {
    return (items || []).filter(isCompleted)
      .filter(function (r) { return !cutoff || String(r.date).slice(0, 10) <= cutoff; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })
      .slice(0, n == null ? 5 : n);
  }

  /** available / stale / unavailable — from the age of the newest fetch. */
  function state(fetchedAt, nowMs, hasItems) {
    var t = Date.parse(fetchedAt || '');
    if (!isFinite(t) || hasItems === false) return 'unavailable';
    return ((nowMs == null ? Date.now() : nowMs) - t) > STALE_MS ? 'stale' : 'available';
  }

  /** "W 3-1 v Hilltop (H)" from the club's own point of view. */
  function line(r, club) {
    var ck = key(club), home = key(r.home) === ck;
    var us = home ? r.homeScore : r.awayScore, them = home ? r.awayScore : r.homeScore;
    var res = us > them ? 'W' : us < them ? 'L' : 'D';
    return { res: res, score: us + '–' + them, opp: home ? r.away : r.home, venue: home ? 'H' : 'A' };
  }

  /**
   * Turn a provider fixture row (lib/fwp/parse-fixtures, read from the
   * opponent's OWN page) into a result row for that club. The parser names
   * the page's team 'Rayners Lane' by construction, so the club is restored.
   */
  function fromProviderRow(row, club, sourceUrl, fetchedAt) {
    var home = row.isHome ? club : row.opponent, away = row.isHome ? row.opponent : club;
    return {
      id: 'auto:' + (row.externalFixtureId || (row.date + '-' + key(home) + '-' + key(away))),
      club: club, date: row.date, competition: row.competition || '', home: home, away: away,
      homeScore: row.homeScore, awayScore: row.awayScore,
      status: row.postponed ? 'postponed' : (row.played ? 'completed' : (NOT_PLAYED.test(row.providerKoCell || '') ? String(row.providerKoCell) : 'scheduled')),
      sourceUrl: sourceUrl || null, fetchedAt: fetchedAt, provenance: { kind: 'auto' }
    };
  }

  /** The ONE stored shape of a manual result or correction. Null → refuse. */
  function toManual(r, nowIso) {
    r = r || {};
    var hs = Number(r.homeScore), as = Number(r.awayScore);
    var by = String(r.enteredBy || '').replace(/[^\w ’'.-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    var src = String(r.sourceText || '').replace(/[<>]/g, '').trim().slice(0, 200);
    var date = String(r.date || '').slice(0, 10);
    var clean = function (s) { return String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80); };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !clean(r.club) || !clean(r.home) || !clean(r.away)) return null;
    if (!isInt(hs) || !isInt(as) || !by || !src) return null;
    var out = {
      id: String(r.id || ('manual:' + date + '-' + key(r.home) + '-' + key(r.away))).slice(0, 120),
      club: clean(r.club), date: date, competition: clean(r.competition), home: clean(r.home), away: clean(r.away),
      homeScore: hs, awayScore: as, status: 'completed',
      sourceUrl: /^https?:\/\//.test(String(r.sourceUrl || '')) ? String(r.sourceUrl).slice(0, 300) : null,
      enteredBy: by, sourceText: src, enteredAt: String(r.enteredAt || nowIso || new Date().toISOString()).slice(0, 30),
      provenance: { kind: 'manual', enteredBy: by, sourceText: src, enteredAt: String(r.enteredAt || nowIso || new Date().toISOString()).slice(0, 30) }
    };
    if (r.correctsKey) out.correctsKey = String(r.correctsKey).slice(0, 200);
    return out;
  }

  /**
   * Attach the chosen results to a programme document. Returns a NEW doc in
   * which only `oppRecentResults` differs. A published edition is returned
   * unchanged: its results were frozen with it.
   */
  function attach(doc, items, meta) {
    var out = {}; Object.keys(doc || {}).forEach(function (k) { out[k] = doc[k]; });
    if (doc && doc.published === true) return out;
    meta = meta || {};
    out.oppRecentResults = {
      items: (items || []).filter(isCompleted).map(function (r) {
        return { date: r.date, competition: r.competition || '', home: r.home, away: r.away, homeScore: r.homeScore, awayScore: r.awayScore,
          sourceUrl: r.sourceUrl || null, kind: (r.provenance && r.provenance.kind) || (r.enteredBy ? 'manual' : 'auto'),
          enteredBy: r.enteredBy || null, sourceText: r.sourceText || null };
      }),
      source: meta.source || null, fetchedAt: meta.fetchedAt || null, cutoff: meta.cutoff || null
    };
    return out;
  }

  var api = { isCompleted: isCompleted, merge: merge, lastCompleted: lastCompleted, state: state, line: line, key: key,
    matchKey: matchKey, fromProviderRow: fromProviderRow, toManual: toManual, attach: attach, STALE_MS: STALE_MS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OppResults = api;
})(typeof window !== 'undefined' ? window : this);
