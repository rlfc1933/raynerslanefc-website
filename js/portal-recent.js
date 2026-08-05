/**
 * MY RECENT WORK — what you actually did, not what the portal guesses.
 *
 * WHY THIS IS RECORDED IN THE BROWSER AND NOT ON THE SERVER
 * --------------------------------------------------------
 * The obvious implementation is a server-side activity table. It was not built,
 * for one reason: the portal already knows who saved what — every save carries
 * an attributed commit — and adding a second, unattributed activity log would
 * mean supporter- and staff-adjacent records accumulating in a new place with
 * no retention rule and no owner. "Where was I?" is a convenience. It does not
 * justify a new store of who-did-what.
 *
 * So this is a per-device note-to-self. It never leaves the browser, it holds
 * no supporter data, and it holds no content — only the name of a tool and a
 * timestamp.
 *
 * WHAT COUNTS AS WORK
 * -------------------
 * A save that the SERVER CONFIRMED. Not a click, not opening a panel, not a
 * form half-filled. The record is written by watching for a successful
 * response from the endpoints that actually change something, so a failed save
 * — the case where a volunteer most needs to know it did not stick — never
 * appears here as if it had worked.
 *
 * This deliberately under-reports. A tool that saves through a route not listed
 * in WATCHED will simply not appear, which is the safe direction: a missing
 * line reads as "I did not do that here", a fabricated line reads as "I did".
 */
(function (global) {
  'use strict';

  var KEY = 'rlfc_recent';
  var MAX = 12;                    // enough to answer "where was I on Tuesday"
  var KEEP_DAYS = 30;

  /* Endpoints that genuinely change something, and the wording for what the
     person just did. Anything not listed here is not recorded at all. */
  var WATCHED = [
    { match: 'save-data',            verb: 'Saved' },
    { match: 'programme-sync-now',   verb: 'Published', tool: 'programme' },
    { match: 'match-override',       verb: 'Updated',   tool: 'matchday' },
    { match: 'matchday-ops',         verb: 'Updated',   tool: 'mdops' },
    { match: 'la-publish-players',   verb: 'Published', tool: 'players' },
    { match: 'la-admin-save-squad',  verb: 'Saved',     tool: 'squad' },
    { match: 'update-submission',    verb: 'Updated',   tool: 'records' }
  ];

  function who() {
    try {
      var s = JSON.parse(sessionStorage.getItem('rlfc_staff') || 'null');
      return (s && s.username) || 'unknown';
    } catch (e) { return 'unknown'; }
  }

  function read() {
    try {
      var all = JSON.parse(localStorage.getItem(KEY) || '{}');
      return (all && all[who()]) || [];
    } catch (e) { return []; }
  }

  function write(rows) {
    try {
      var all = JSON.parse(localStorage.getItem(KEY) || '{}');
      all[who()] = rows;
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) { /* private browsing, a full quota — never block a save */ }
  }

  /** Which panel is open right now. That is the tool the person is using. */
  function currentPanel() {
    var on = document.querySelector('.panel.on');
    return on ? String(on.id).replace(/^panel-/, '') : null;
  }

  /**
   * Record one confirmed change.
   * Repeating the same tool updates the existing line rather than adding a
   * second — six "Saved Fixtures" entries from one editing session is noise,
   * not history.
   */
  function record(toolId, verb) {
    if (!toolId) return;
    var T = global.PortalTools;
    if (T && !T.byId(toolId)) return;          // not a tool we can name
    var rows = read().filter(function (r) { return r.tool !== toolId; });
    rows.unshift({ tool: toolId, verb: verb || 'Saved', at: Date.now() });
    var cutoff = Date.now() - KEEP_DAYS * 86400000;
    rows = rows.filter(function (r) { return r.at > cutoff; }).slice(0, MAX);
    write(rows);
  }

  /** Newest first, with the tool resolved. Unknown tools are dropped. */
  function list() {
    var T = global.PortalTools;
    if (!T) return [];
    return read().map(function (r) {
      var t = T.byId(r.tool);
      return t ? { tool: t, verb: r.verb, at: r.at } : null;
    }).filter(Boolean);
  }

  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 90) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(h / 24);
    if (d === 1) return 'yesterday';
    if (d < 7) return d + ' days ago';
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  }

  function clear() { write([]); }

  /**
   * Watch fetch for confirmed changes.
   *
   * Wrapping fetch is the one place that sees every save regardless of which
   * of the forty panels made it — the alternative was editing forty call sites
   * and missing some. The wrapper is transparent: it inspects a clone of the
   * response and always returns the original, so no caller behaviour changes
   * and a failure inside here cannot fail a save.
   */
  function watch() {
    if (global.__recentWrapped || typeof global.fetch !== 'function') return;
    var orig = global.fetch.bind(global);
    global.fetch = function (input, init) {
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
      var hit = null;
      for (var i = 0; i < WATCHED.length; i++) {
        if (url.indexOf(WATCHED[i].match) > -1) { hit = WATCHED[i]; break; }
      }
      var p = orig(input, init);
      if (!hit) return p;
      var panel = currentPanel();
      return p.then(function (res) {
        try {
          if (res && res.ok) {
            res.clone().json().then(function (j) {
              // The functions answer { ok:false } with a 200, so the HTTP
              // status alone is not proof that anything changed.
              if (j && j.ok === false) return;
              record(hit.tool || panel, hit.verb);
              if (global.PortalHome && global.PortalHome.paintRecent) {
                global.PortalHome.paintRecent();
              }
            }).catch(function () {});
          }
        } catch (e) {}
        return res;
      });
    };
    global.__recentWrapped = true;
  }

  global.PortalRecent = {
    watch: watch, record: record, list: list, clear: clear, ago: ago,
    _WATCHED: WATCHED, _KEY: KEY, _MAX: MAX
  };
}(window));
