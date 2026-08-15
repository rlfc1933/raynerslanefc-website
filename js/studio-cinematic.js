/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — THE REAL STUDIO RENDERS THE REAL CREATIVE

   THE GAP THIS CLOSES. The cinematic engine was built, tested and looked
   right in a dev gallery. The Studio the committee actually opens still drew
   the old branded document: small crests, a skewed band, a flat colour. Two
   renderers, one of them invisible to the people the club employs.

   There is now one. psRender() calls in here first for every state the
   campaign engine understands, and only falls back to the old drawing code
   for the templates the campaign has no opinion about — a birthday, a quote,
   a season ticket. Those are not fixtures and were never the problem.

   WHAT IT RENDERS FROM. CreativeCampaign.build() resolves the real fixture:
   both crests, the competition's issued mark and round, the opponent's
   CONFIRMED colour, the presenting sponsor for home or away, and the
   persistent partner rail. Nothing here is typed by a volunteer, because
   everything here is already known.

   HTML2CANVAS STILL HAS TO BE ABLE TO PHOTOGRAPH IT. The export path
   rasterises the DOM, and that library cannot draw CSS gradients,
   backdrop-filter or mix-blend-mode. The cinematic look survives because its
   atmosphere is an inline SVG image rather than CSS effects — which is why
   the engine was built that way in the first place.

   IF ANYTHING IS MISSING, THE OLD RENDERER STILL WORKS. No fixture, no
   campaign, an engine that failed to load: all fall through untouched. A
   volunteer must never open Studio to a blank card.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /**
   * WHICH TEMPLATE THE CINEMATIC RENDERER OWNS.  EXACTLY ONE: MATCH DAY.
   *
   * MATCH-DAY INCIDENT, 15 AUGUST 2026. This map used to list eleven templates
   * — matchday, countdown, preseason, lineup, offstate, kickoff, goal, yellow,
   * red, halftime, fulltime — so clicking HALF TIME set PS.type correctly, re-
   * rendered correctly, and drew the Match Day poster. Staff reported the
   * preview "not switching". It was switching; every switch just landed on the
   * same picture.
   *
   * The brief was to make the MATCH DAY GRAPHIC cinematic. It was not
   * permission for that one template's renderer to take over Goal, Half Time,
   * Full Time, Team News and the rest, which have their own designs and their
   * own fields, and which staff need during a live game.
   *
   * A template-specific renderer gets exactly the template it was designed for.
   * Anything else falls through to the renderer that has always drawn it.
   * Adding another later is one line here plus a design that has actually been
   * asked for.
   */
  var STATE = {
    matchday: 'matchday'
  };

  /** Studio size key → campaign format. */
  var FMT = { ig: 'square', pt: 'portrait', story: 'story', x: 'x' };

  var ready = false;

  /**
   * Load the registries the campaign needs, once.
   * Everything is public JSON the portal already ships.
   */
  function prepare() {
    if (ready) return Promise.resolve(true);
    var C = global.CreativeCampaign;
    if (!C) return Promise.resolve(false);
    return Promise.all([
      fetch('data/club-brands.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('data/competitions.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch('data/partners.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      // The generated campaign plates. Without this the Studio draws the
      // procedural fallback for every fixture, including the ones the club
      // has real photography for — which is exactly what it was doing.
      global.CreativePlates ? global.CreativePlates.load() : Promise.resolve(null)
    ]).then(function (r) {
      C.configure({
        brands: r[0], comps: r[1], partners: r[2],
        palette: global.BrandPalette, brand: global.CompetitionBrand
      });
      ready = !!(r[0] && r[1]);
      return ready;
    }).catch(function () { return false; });
  }

  /** The fixture Studio is currently working on. */
  function fixture() {
    if (global.PS && global.PS._fixture) return global.PS._fixture;
    var id = global.PS && global.PS._liveFixtureId;
    var list = global.psFixtures || [];
    if (id) {
      var f = list.filter(function (x) { return String(x.id) === String(id); })[0];
      if (f) return f;
    }
    return null;
  }

  /**
   * Facts a human legitimately supplies on top of the fixture.
   * The score is the one thing Studio may override, because a volunteer often
   * makes the full-time card before the feed has caught up.
   */
  function overlay(c) {
    var d = (global.PS && global.PS.data) || {};
    if (d.scoreHome != null && d.scoreAway != null) {
      var home = c.isHome !== false;
      c.score = { us: home ? d.scoreHome : d.scoreAway, them: home ? d.scoreAway : d.scoreHome };
    } else if (d.us != null && d.them != null) {
      c.score = { us: d.us, them: d.them };
    }
    if (d.player) c.player = d.player;
    if (d.minute) c.minute = d.minute;
    if (d.postponedReason) c.postponedReason = d.postponedReason;
    return c;
  }

  /**
   * Draw the cinematic card into Studio's own preview node.
   * Returns true when it rendered, false to let the old renderer run.
   */
  /** The card is shared, so a stale marker from a previous template must go. */
  function clearMark() {
    try {
      var c = document.getElementById('ps-card');
      if (c) c.removeAttribute('data-cinematic');
    } catch (e) {}
  }

  function render() {
    try {
      var PS = global.PS;
      if (!PS || !ready) { clearMark(); return false; }
      var state = STATE[PS.type];
      if (!state) { clearMark(); return false; }

      var C = global.CreativeCampaign, SQ = global.CreativeSquare;
      if (!C || !SQ) { clearMark(); return false; }

      var fx = fixture();
      if (!fx) { clearMark(); return false; }

      var campaign = C.build(fx, state);
      if (!campaign) { clearMark(); return false; }
      overlay(campaign);

      var card = document.getElementById('ps-card');
      if (!card) { clearMark(); return false; }

      var fmt = FMT[PS.size] || 'square';
      var size = SQ.formats[fmt];
      // Studio's stage scales #ps-card by transform, so it must carry the real
      // pixel size the export expects — the same contract the old renderer had.
      card.style.cssText = 'position:relative;width:' + size.w + 'px;height:' + size.h +
        'px;overflow:hidden;background:#080808';
      card.innerHTML = SQ.html(campaign, { format: fmt });
      card.setAttribute('data-cinematic', state);
      // SCALE THE PREVIEW. The old renderer did this at the end of psRender();
      // returning early from here skipped it entirely and left a 1080px card
      // overflowing the stage with its headline clipped off the top.
      try { if (typeof global.psFitCard === 'function') global.psFitCard(size.w, size.h); } catch (e) {}
      return true;
    } catch (e) {
      // A creative failure must never leave the committee looking at nothing.
      try { console.warn('[studio-cinematic] falling back', e); } catch (e2) {}
      return false;
    }
  }

  function init() {
    return prepare().then(function (ok) {
      if (ok && typeof global.psRender === 'function') { try { global.psRender(); } catch (e) {} }
      return ok;
    });
  }

  global.StudioCinematic = {
    init: init, prepare: prepare, render: render, clearMark: clearMark,
    STATE: STATE, FMT: FMT,
    handles: function (t) { return !!STATE[t]; },
    _fixture: fixture, _overlay: overlay,
    get ready() { return ready; }
  };
}(typeof window !== 'undefined' ? window : globalThis));
