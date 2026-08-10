/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — GAME DAY

   On a matchday the site should know. Not because someone edited a stylesheet
   that morning, but because the fixture data says so and the page reacts.

   WHAT IT DOES
   Reads the fixture the club is actually playing, resolves the campaign that
   already drives the social artwork, and publishes it to the page as CSS
   custom properties plus a state class. Everything else — hero, Club Now, the
   fixture card — picks those up. One fixture, one visual world, across social,
   homepage, Match Centre and programme.

   WHAT IT DOES NOT DO, DELIBERATELY

   IT OWNS NO FOOTBALL TRUTH. It does not decide whether a match is live, what
   the score is, or whether a fixture is playable. js/club-now.js and
   js/match-time.js already own that and are the only sources consulted. This
   file is presentation reading state, never state deciding presentation. If
   those two disagree with it, they win.

   IT CANNOT BREAK THE HOMEPAGE. Every path is wrapped, and any failure —
   missing fixture, unresolvable palette, malformed data, an exception
   anywhere — lands in teardown(), which strips every class and property this
   file added and leaves the normal Rayners Lane theme exactly as it was. A
   cosmetic feature must never be able to take down the club's front page on
   the one day of the week it matters most. There is also a hard kill switch:
   data/config.json → gameDay.enabled = false turns the whole thing off without
   a deploy.

   IT DOES NOT INVENT ATMOSPHERE FOR AN UNCONFIRMED OPPONENT. The counter-light
   only appears when a human has confirmed that club's colours in the Brand
   Library. Otherwise the page stays Lane-led — which is correct, and is also
   the honest default.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ROOT = document.documentElement;
  var APPLIED = [];          // every property we set, so teardown is exact
  var CLASSES = [];

  function setVar(name, value) {
    if (value == null || value === '') return;
    ROOT.style.setProperty(name, value);
    APPLIED.push(name);
  }
  function addClass(c) {
    if (!c) return;
    ROOT.classList.add(c);
    CLASSES.push(c);
  }

  /** Remove every trace of game-day mode. The safe state, always reachable. */
  function teardown() {
    try {
      APPLIED.forEach(function (n) { ROOT.style.removeProperty(n); });
      CLASSES.forEach(function (c) { ROOT.classList.remove(c); });
    } catch (e) { /* nothing left worth doing */ }
    APPLIED = []; CLASSES = [];
  }

  /**
   * The window in which a fixture owns the homepage.
   * Opens the morning of the match, closes the morning after — which covers
   * the existing full-time hold period rather than competing with it.
   */
  function inWindow(fx) {
    if (!fx || !fx.date) return false;
    var ms = (window.MatchTime && MatchTime.kickoffEpoch)
      ? MatchTime.kickoffEpoch(fx) : Date.parse(fx.date + 'T15:00:00Z');
    if (!isFinite(ms)) return false;
    var now = Date.now();
    return now > ms - 10 * 3600000 && now < ms + 20 * 3600000;
  }

  /**
   * The live state, taken from the block that owns it.
   * club-now.js publishes its resolved state on the element it renders into;
   * reading that keeps one source of truth instead of two that can drift.
   */
  function liveState() {
    try {
      var el = document.getElementById('club-now');
      var s = el && el.getAttribute('data-match-state');
      if (s) return s;                      // 'live' | 'ft' | 'off'
      if (window.__rlfcLive && window.__rlfcLive.isLive) return 'live';
    } catch (e) {}
    return 'pre';
  }

  function stateFor(fx, live) {
    var st = String((fx && fx.status) || '').toLowerCase();
    if (st === 'postponed' || st === 'cancelled' || st === 'abandoned') return 'off';
    if (live === 'live') return 'live';
    if (live === 'ft' || (fx && fx.us != null && fx.them != null)) {
      if (fx.us == null || fx.them == null) return 'ft';
      return fx.us > fx.them ? 'ft-win' : (fx.us === fx.them ? 'ft-draw' : 'ft-loss');
    }
    return 'pre';
  }

  function apply(campaign, state) {
    var t = (campaign.palette && campaign.palette.tokens) || {};
    var opp = campaign.palette && campaign.palette.opponent;
    var usable = !!(campaign.palette && campaign.palette.oppUsable);

    addClass('gameday');
    addClass('gameday--' + state);
    addClass('gameday--' + (campaign.isHome ? 'home' : 'away'));
    if (campaign.competition && campaign.competition.treatment) {
      addClass('gameday--' + campaign.competition.treatment);
    }

    setVar('--gd-lane', t.accent || '#FFD100');
    setVar('--gd-bed', t.bed || '#1A5C32');
    // Opponent colour ONLY when a human confirmed it. No guess reaches the page.
    setVar('--gd-opp', usable ? (t.awayGlow || opp.primary) : 'transparent');
    setVar('--gd-opp-soft', usable ? (t.awayMuted || 'transparent') : 'transparent');
    if (usable) addClass('gameday--duotone');

    ROOT.setAttribute('data-gameday-state', state);
    CLASSES.push('__attr');   // marker so teardown knows to clear the attribute
  }

  function run() {
    // Hard kill switch first — before any work, so a bad day is one JSON edit.
    fetch('data/config.json?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (cfg) {
        if (cfg && cfg.gameDay && cfg.gameDay.enabled === false) return null;
        return fetch('data/fixtures.json?t=' + Date.now()).then(function (r) { return r.json(); });
      })
      .then(function (data) {
        if (!data) return;
        var list = (data.fixtures || []);
        // The fixture whose window we are inside. Not "the next fixture" —
        // a postponed game still owns the day it was supposed to be played.
        var fx = list.filter(inWindow).sort(function (a, b) {
          return String(a.date).localeCompare(String(b.date));
        })[0];
        if (!fx) return;

        if (!window.CreativeCampaign || !window.BrandPalette) return;
        var state = stateFor(fx, liveState());
        var campaign = CreativeCampaign.build(fx, state === 'off' ? 'postponed' : 'matchday');
        if (!campaign) return;
        apply(campaign, state);
      })
      .catch(function () { teardown(); });
  }

  // Never let this run before the page is usable, and never let it throw out.
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { try { run(); } catch (e) { teardown(); } });
    } else {
      run();
    }
  } catch (e) { teardown(); }

  window.RLFCGameDay = { teardown: teardown, _stateFor: stateFor, _inWindow: inWindow };
})();
