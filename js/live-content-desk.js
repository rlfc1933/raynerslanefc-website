/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — LIVE CONTENT DESK

   What the social operator uses at the ground. Football happens, the event
   appears, one tap turns it into a finished graphic.

   BUILT AS A MODULE, ON PURPOSE. admin.html is 864KB and holds Match Day Ops,
   live-score authority and squad selection. Adding several hundred lines of
   new UI inline is how that file becomes unreviewable and how matchday breaks.
   This mounts into a container the portal provides and can be removed by
   deleting one script tag.

   IT CONSUMES AUTHORITY, IT NEVER BECOMES IT.
   Events come from RLFCLive.eventsFor() — the same match_events table the sync
   writes and Match Centre reads. This file never writes an event, never
   invents a minute, never derives a score. If the feed says nothing, the desk
   says nothing.

   IT NEVER PUBLISHES. Every action here PREPARES content: it opens Studio with
   the event's facts filled in. A human previews and exports. There is no path
   from this file to a public post, deliberately.

   POLLING REUSES WHAT EXISTS. The desk piggybacks the live cadence already in
   the portal rather than opening a second stream at the provider. When the
   fixture is not live it does not poll at all.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var POLL_MS = 20000;          // matches the portal's existing live cadence
  var state = { fixtureId: null, campaign: null, events: [], timer: null, failed: false, created: {} };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }

  /** Which graphics the operator has already made, so the desk can say so. */
  function createdKey(fixtureId) { return 'rlfc.livedesk.created.' + fixtureId; }
  function loadCreated(fixtureId) {
    try { return JSON.parse(localStorage.getItem(createdKey(fixtureId)) || '{}'); }
    catch (e) { return {}; }
  }
  function markCreated(eventId) {
    state.created[eventId] = Date.now();
    try { localStorage.setItem(createdKey(state.fixtureId), JSON.stringify(state.created)); } catch (e) {}
  }

  // ── rendering ────────────────────────────────────────────────────────────

  function scoreline(c, events) {
    // The score comes from the most recent event that carried one — the same
    // number the sync recorded, never a tally this file adds up itself.
    var withScore = events.filter(function (e) { return e.scoreHome != null; })[0];
    if (!withScore) return '';
    var homeName = c ? c.home.name : 'Home', awayName = c ? c.away.name : 'Away';
    return '<div class="lcd__score">' +
      '<span class="lcd__team">' + esc(homeName) + '</span>' +
      '<span class="lcd__nums">' + esc(withScore.scoreHome) + '<i>–</i>' + esc(withScore.scoreAway) + '</span>' +
      '<span class="lcd__team">' + esc(awayName) + '</span></div>';
  }

  function eventRow(e, isNew) {
    var E = window.LiveContentEvents;
    var done = !!state.created[e.id];
    var action = e.post
      ? '<button class="lcd__make' + (done ? ' lcd__make--done' : '') + '" data-ev="' + esc(e.id) + '">' +
        (done ? 'Made ✓' : 'Create update') + '</button>'
      : '';
    return '<li class="lcd__ev' + (isNew ? ' lcd__ev--new' : '') + ' lcd__ev--' + esc(e.tone) + '"' +
      ' data-weight="' + e.weight + '">' +
      '<span class="lcd__min">' + esc(e.minuteLabel || '·') + '</span>' +
      '<span class="lcd__body">' +
        '<span class="lcd__type">' + esc(e.label) +
          (e.corrected ? ' <em class="lcd__corr">corrected</em>' : '') + '</span>' +
        '<span class="lcd__detail">' + esc(E.describe(e)) + '</span>' +
      '</span>' + action + '</li>';
  }

  function render(newIds) {
    var host = el('live-content-desk');
    if (!host) return;

    if (state.failed) {
      // Honest, and it does not strand the operator: the manual tools are
      // still there and still authoritative.
      host.innerHTML =
        '<div class="lcd lcd--down"><div class="lcd__hd">Live content</div>' +
        '<p class="lcd__msg">Live data is temporarily unavailable. Nothing has been lost — ' +
        'the match tools still work as normal.</p>' +
        '<button class="lcd__alt" onclick="openPanel(\'mdops\')">Open Match Day Tools</button></div>';
      return;
    }

    if (!state.events.length) {
      host.innerHTML =
        '<div class="lcd"><div class="lcd__hd">Live content</div>' +
        '<p class="lcd__msg">No match events yet. They will appear here as the game happens.</p></div>';
      return;
    }

    var c = state.campaign;
    var latest = state.events.filter(function (e) { return e.weight >= 2; })[0] || state.events[0];

    host.innerHTML =
      '<div class="lcd">' +
        '<div class="lcd__hd"><span class="lcd__live">LIVE</span> Live content</div>' +
        scoreline(c, state.events) +
        (latest ? '<div class="lcd__latest">' +
          '<span class="lcd__lbl">Latest</span>' +
          '<span class="lcd__lmin">' + esc(latest.minuteLabel) + '</span>' +
          '<span class="lcd__ltype">' + esc(latest.label) + '</span>' +
          '<span class="lcd__ldet">' + esc(window.LiveContentEvents.describe(latest)) + '</span>' +
          (latest.post ? '<button class="lcd__make lcd__make--hero" data-ev="' + esc(latest.id) + '">Create update</button>' : '') +
        '</div>' : '') +
        '<ul class="lcd__list">' +
          state.events.map(function (e) { return eventRow(e, (newIds || []).indexOf(e.id) > -1); }).join('') +
        '</ul>' +
      '</div>';

    host.querySelectorAll('.lcd__make').forEach(function (b) {
      b.addEventListener('click', function () { openStudio(b.getAttribute('data-ev')); });
    });
  }

  /**
   * Hand the event to Studio, pre-filled.
   * Studio owns the creative; this only carries the facts across so the
   * operator never retypes a scorer, a minute or a score that the feed already
   * knows. Format is a recommendation, never a lock.
   */
  function openStudio(eventId) {
    var e = state.events.filter(function (x) { return x.id === eventId; })[0];
    if (!e) return;
    var pre = window.LiveContentEvents.studioPrefill(e, state.campaign);
    if (!pre) return;
    pre.format = window.LiveContentEvents.recommendedFormat(e);
    pre.returnTo = 'livedesk';
    try { window.__RLFC_STUDIO_PREFILL = pre; } catch (err) {}
    markCreated(eventId);
    if (typeof window.openPanel === 'function') window.openPanel('poststudio');
    if (typeof window.psApplyLivePrefill === 'function') {
      try { window.psApplyLivePrefill(pre); } catch (err) {}
    }
  }

  // ── polling ──────────────────────────────────────────────────────────────

  function tick() {
    if (!state.fixtureId || !window.RLFCLive || !window.RLFCLive.eventsFor) { state.failed = true; render(); return; }
    window.RLFCLive.eventsFor(state.fixtureId)
      .then(function (rows) {
        if (rows == null) { state.failed = true; render(); return; }
        state.failed = false;
        var ourSide = state.campaign && state.campaign.isHome ? 'home' : 'away';
        var merged = window.LiveContentEvents.merge(state.events, rows, { ourSide: ourSide });
        state.events = merged.events;
        render(merged.newIds);
      })
      .catch(function () { state.failed = true; render(); });
  }

  function start(fixtureId, campaign) {
    stop();
    state.fixtureId = fixtureId;
    state.campaign = campaign || null;
    state.events = [];
    state.created = loadCreated(fixtureId);
    tick();
    state.timer = setInterval(tick, POLL_MS);
  }
  function stop() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  window.LiveContentDesk = { start: start, stop: stop, _state: state, _render: render };
})();
