/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — live match data (shared client)

   ONE source of truth for every surface that shows a live score: the homepage
   bar, the Club Now panel and the Match Centre all read through here. Adding a
   fourth surface must not mean a fourth copy of this logic.

   The browser talks ONLY to Rayners Lane's own Supabase. It never calls the
   data provider — that happens server-side in netlify/functions/fwp-sync.js.
   Supporters' devices are not a polling fleet pointed at someone else's site.

   Rollout is controlled by window.RLFC_LIVE.useV2 (js/live-config.js). While
   that is false this module still loads and can be inspected, but the public
   surfaces keep using the existing matchday.json / live_match path. Flipping
   one boolean switches the site over, and flipping it back is the rollback.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CFG = global.RLFC_LIVE || {};
  var SB = global.RLFC_SUPABASE || {};

  // How old a live score may be before we stop calling it live. The provider
  // updates every ~30s, so 3 minutes of silence is a genuine problem worth
  // telling supporters about rather than quietly showing a stale number.
  var STALE_MS = (CFG.staleAfterSeconds || 180) * 1000;
  var POLL_MS = (CFG.pollSeconds || 15) * 1000;
  var HOLD_MS = (CFG.resultHoldHours == null ? 24 : CFG.resultHoldHours) * 3600000;

  function enabled() { return !!CFG.useV2 && !!(SB.url && SB.anonKey); }

  function rest(path) {
    var opt = { headers: { apikey: SB.anonKey } };
    if (global.AbortSignal && AbortSignal.timeout) opt.signal = AbortSignal.timeout(6000);
    return fetch(SB.url + '/rest/v1/' + path, opt).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; });
  }

  /* ── freshness, stated honestly ──────────────────────────────────────────
     The rule this whole module exists to enforce: never present a stale score
     as confidently live. Every surface reads `presentation` and does what it
     says rather than inventing its own idea of what counts as live. */
  function assess(row) {
    if (!row) return { state: 'none' };
    var now = Date.now();
    var synced = row.last_synced_at ? Date.parse(row.last_synced_at) : 0;
    var age = synced ? now - synced : Infinity;
    var p = row.period;

    if (row.manual_override) {
      return { state: 'manual', label: 'Live', note: 'Updated by the club', age: age };
    }
    if (p === 'postponed')  return { state: 'postponed', label: 'Postponed' };
    if (p === 'cancelled')  return { state: 'cancelled', label: 'Cancelled' };
    if (p === 'abandoned')  return { state: 'abandoned', label: 'Abandoned' };
    if (p === 'delayed')    return { state: 'delayed', label: 'Kick-off delayed' };
    if (row.is_final || p === 'full_time') {
      // A finished match holds the hero for a day, then stands aside for the
      // next fixture. `held` is what the homepage uses to decide which.
      var endedAt = row.source_updated_at ? Date.parse(row.source_updated_at)
        : (row.last_synced_at ? Date.parse(row.last_synced_at) : 0);
      var heldFor = endedAt ? (now - endedAt) : Infinity;
      return {
        state: 'full_time', label: 'Full Time',
        held: heldFor < HOLD_MS, endedAt: endedAt, heldFor: heldFor,
      };
    }
    if (p === 'pre_match' || p === 'unknown') {
      if (!row.is_live) return { state: 'pre_match', label: 'Kick-off soon' };
    }
    if (row.is_live) {
      if (row.sync_status === 'failing') {
        return { state: 'delayed_updates', label: 'Updates delayed', note: 'We are having trouble reaching the match feed', age: age };
      }
      if (age > STALE_MS) {
        return { state: 'delayed_updates', label: 'Updates delayed', note: 'Waiting for the latest from the ground', age: age };
      }
      return { state: 'live', label: 'Live', age: age };
    }
    return { state: 'idle', label: '' };
  }

  var PERIOD_LABEL = {
    first_half: 'First Half', half_time: 'Half Time', second_half: 'Second Half',
    extra_time: 'Extra Time', penalties: 'Penalties', full_time: 'Full Time',
    in_play: 'In Play', pre_match: 'Kick-off soon', delayed: 'Delayed',
    postponed: 'Postponed', cancelled: 'Cancelled', abandoned: 'Abandoned', unknown: '',
  };

  /** "Second Half · 67'" — the clock only when there genuinely is one. */
  function clockLabel(row) {
    if (!row) return '';
    var period = PERIOD_LABEL[row.period] || '';
    if (row.match_minute == null) return period;
    var m = row.match_minute + (row.stoppage_minute ? '+' + row.stoppage_minute : '');
    return period ? period + ' · ' + m + "'" : m + "'";
  }

  /** Our goals first, whatever the venue. */
  function ourView(row) {
    if (!row) return null;
    var home = row.is_home !== false;
    return {
      isHome: home,
      us: home ? row.home_score : row.away_score,
      them: home ? row.away_score : row.home_score,
      opponent: home ? row.away_team : row.home_team,
    };
  }

  function ago(ms) {
    if (!isFinite(ms)) return '';
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return s + ' seconds ago';
    var m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var h = Math.round(m / 60);
    return h + (h === 1 ? ' hour ago' : ' hours ago');
  }

  /* ── data access ─────────────────────────────────────────────────────── */
  function currentMatches() {
    if (!enabled()) return Promise.resolve([]);
    // Anything live, plus anything that finished in the last few hours so the
    // Match Centre still shows the result rather than snapping to empty.
    var since = new Date(Date.now() - 6 * 3600000).toISOString();
    return rest('match_state?or=(is_live.eq.true,last_synced_at.gte.' + encodeURIComponent(since) +
      ')&select=*&order=scheduled_kickoff.asc').then(function (rows) {
      return rows || [];
    });
  }

  function matchFor(fixtureId) {
    if (!enabled() || !fixtureId) return Promise.resolve(null);
    return rest('match_state?fixture_id=eq.' + encodeURIComponent(fixtureId) + '&select=*')
      .then(function (r) { return (r && r[0]) || null; });
  }

  function eventsFor(fixtureId) {
    if (!enabled() || !fixtureId) return Promise.resolve([]);
    return rest('match_events?fixture_id=eq.' + encodeURIComponent(fixtureId) +
      '&retracted_at=is.null&select=*&order=minute.asc,stoppage_minute.asc')
      .then(function (r) { return r || []; });
  }

  /** The one match the homepage should lead with. */
  function primary(rows) {
    if (!rows || !rows.length) return null;
    var live = rows.filter(function (r) { return r.is_live; });
    if (live.length) return live[0];
    // Only a result still inside its hold window may lead. Once the day has
    // passed it stops being news and the next fixture takes the hero.
    var done = rows.filter(function (r) { return r.is_final && assess(r).held; })
      .sort(function (a, b) { return Date.parse(b.last_synced_at || 0) - Date.parse(a.last_synced_at || 0); });
    return done[0] || null;
  }

  /* ── subscription ────────────────────────────────────────────────────────
     Short polling against our OWN Supabase. Deliberately not Realtime for the
     first release: polling is what the current site already does successfully
     on match-day phone networks, it needs no extra client library on a site
     with no build step, and it degrades predictably. The data shape is
     unchanged if Realtime is layered on later. */
  function subscribe(onChange, intervalMs) {
    var timer = null, lastSig = '';
    function tick() {
      currentMatches().then(function (rows) {
        var sig = rows.map(function (r) {
          return [r.fixture_id, r.home_score, r.away_score, r.period,
            r.match_minute, r.stoppage_minute, r.sync_status, r.last_synced_at].join(':');
        }).join('|');
        if (sig !== lastSig) { lastSig = sig; onChange(rows); }
        else { onChange(rows, true); }   // unchanged: let the caller refresh "x ago"
      });
    }
    tick();
    timer = setInterval(tick, intervalMs || POLL_MS);
    return function stop() { if (timer) clearInterval(timer); };
  }

  global.RLFCLive = {
    enabled: enabled,
    currentMatches: currentMatches,
    matchFor: matchFor,
    eventsFor: eventsFor,
    primary: primary,
    assess: assess,
    clockLabel: clockLabel,
    periodLabel: function (p) { return PERIOD_LABEL[p] || ''; },
    ourView: ourView,
    ago: ago,
    subscribe: subscribe,
    STALE_MS: STALE_MS,
    HOLD_MS: HOLD_MS,
  };
})(window);
