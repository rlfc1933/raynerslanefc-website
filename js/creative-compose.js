/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — COMPOSITION (browser renderer)

   Turns a campaign + format + recipe into DOM. Two strictly separated layers:

     ATMOSPHERE   one <img> holding the SVG plate from CreativeSVG. Light, fog,
                  grain, beams, geometry. Generated, and allowed to be.

     FACTUAL      crests, competition, club names, score, date, kick-off,
                  venue, sponsors. Real DOM, real text, real image files. The
                  atmosphere layer can never distort, reflow or recolour these,
                  because it is a separate element underneath them.

   That separation is not tidiness. It is the guarantee that a lighting change
   cannot stretch a sponsor's logo or bend a crest, which is the one thing a
   club cannot ship.

   FORMAT-SPECIFIC COMPOSITION, NOT CROPS. Each format gets its own stack,
   spacing and type scale. Story is built as a tall column with everything held
   inside the safe zones Instagram's UI leaves free; X is built as a wide
   three-column lockup. Same campaign, genuinely different layouts.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CreativeCompose = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* The UMD wrapper calls factory() with no arguments, so `root` is not in
     scope in here. Resolve the sibling modules through the global object
     explicitly rather than closing over a variable that does not exist —
     which is what this file did on its first run, and it threw on every
     single render. */
  var G = typeof globalThis !== 'undefined' ? globalThis
        : (typeof window !== 'undefined' ? window : {});
  function mod(name) { return G[name] || (typeof module === 'object' && module.exports ? null : null); }

  /* Asset paths in the data are repo-root-relative ("img/badge.png"), which is
     right for pages at the root and wrong for anything served from a
     subdirectory — the dev gallery under /dev/ resolved every crest and every
     sponsor mark to /dev/img/… and rendered a grid of broken images. Callers
     outside the root pass a base; everyone else gets '' and is unaffected. */
  var ASSET_BASE = '';
  function setAssetBase(b) { ASSET_BASE = b ? String(b).replace(/\/?$/, '/') : ''; }
  function asset(p) {
    if (!p) return p;
    if (/^(https?:|data:|\/)/.test(p)) return p;   // absolute or inline: leave alone
    return ASSET_BASE + p;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function initials(name) {
    return String(name || '').replace(/\b(fc|afc|utd|united|town|city|st)\b/gi, '')
      .trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 3).toUpperCase() || '?';
  }
  function crestImg(src, name, px) {
    if (!src) {
      return '<span class="cx-ini" style="width:' + px + 'px;height:' + px + 'px;font-size:' + Math.round(px * 0.34) + 'px">' +
        esc(initials(name)) + '</span>';
    }
    return '<img class="cx-crest" src="' + esc(asset(src)) + '" alt="' + esc(name) + ' crest" ' +
      'style="width:' + px + 'px;height:' + px + 'px">';
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00Z');
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).toUpperCase();
  }
  function fmtKO(t) {
    if (!t) return '';
    var p = String(t).split(':'), h = +p[0], m = p[1] || '00';
    var ap = h >= 12 ? 'PM' : 'AM', hh = h % 12 || 12;
    return hh + (m === '00' ? '' : ':' + m) + ' ' + ap;
  }

  /**
   * The competition line.
   * When the Association-issued mark is absent this prints the competition's
   * proper name as type — a correct, permitted treatment, not a placeholder.
   */
  function competitionBlock(c, prominent) {
    var round = c.round ? '<span class="cx-round">' + esc(c.round) + '</span>' : '';
    if (c.logo) {
      return '<div class="cx-comp' + (prominent ? ' cx-comp--big' : '') + '">' +
        '<img class="cx-complogo" src="' + esc(asset(c.logo)) + '" alt="' + esc(c.label) + '">' + round + '</div>';
    }
    return '<div class="cx-comp' + (prominent ? ' cx-comp--big' : '') + '">' +
      '<span class="cx-compname">' + esc(c.label || 'Fixture') + '</span>' + round + '</div>';
  }

  function sponsorBlock(s, fmtName) {
    if (!s.presenter && !s.rail.length) return '';
    var pres = s.presenter ? '<div class="cx-pres"><span class="cx-preslbl">' +
      (s.context === 'home' ? 'Home matches presented by' : 'Away matches presented by') + '</span>' +
      '<img class="cx-preslogo" src="' + esc(asset(s.presenter.white || s.presenter.colour)) + '" alt="' + esc(s.presenter.name) + '"></div>' : '';
    var rail = s.rail.length ? '<div class="cx-rail">' + s.rail.map(function (p) {
      return '<img class="cx-raillogo" src="' + esc(asset(p.white || p.colour)) + '" alt="' + esc(p.name) + '">';
    }).join('') + '</div>' : '';
    return '<div class="cx-sponsors">' + pres + rail + '</div>';
  }

  /** The headline slot, which changes with what the graphic is FOR. */
  function headlineFor(c) {
    if (c.state === 'postponed' || c.status === 'postponed') {
      return { kicker: 'Match Postponed', big: 'CALLED OFF',
        sub: c.postponedReason || '', foot: c.rearrangedDate ? 'Rearranged for ' + fmtDate(c.rearrangedDate) : 'A new date will be announced' };
    }
    if (c.state === 'fulltime' && c.score) {
      var verdict = c.outcome === 'win' ? 'FULL TIME' : (c.outcome === 'draw' ? 'FULL TIME' : 'FULL TIME');
      return { kicker: verdict, big: c.score.us + '–' + c.score.them, sub: '', foot: '' };
    }
    if (c.state === 'halftime' && c.score) return { kicker: 'Half Time', big: c.score.us + '–' + c.score.them, sub: '', foot: '' };
    if (c.state === 'lineup') return { kicker: 'Team News', big: 'STARTING XI', sub: '', foot: '' };
    if (c.state === 'kickoff') return { kicker: 'Kick Off', big: 'WE ARE UNDERWAY', sub: '', foot: '' };
    return { kicker: c.isHome ? 'Matchday at Tithe Farm' : 'Matchday', big: '', sub: '', foot: '' };
  }

  /**
   * Compose one format.
   * Returns an HTML string sized exactly to the deliverable, so the renderer
   * can rasterise it without any scaling guesswork.
   */
  function html(campaign, fmtName, spec) {
    var C = campaign;
    var CC = mod('CreativeCampaign');
    var F = CC && CC.formats ? CC.formats[fmtName] : null;
    F = F || { w: 1080, h: 1080, name: 'Square', safeTop: 40, safeBottom: 40 };
    var L = spec._layout || {};
    var t = C.palette.tokens || {};
    var SVG = mod('CreativeSVG');
    var plate = SVG && SVG.plateURI ? SVG.plateURI(spec) : '';
    var H = headlineFor(C);

    var isStory = F.name === 'Story';
    var isX = F.name === 'X / Landscape';
    var base = Math.min(F.w, F.h);
    var crestPx = Math.round(base * (isX ? 0.26 : 0.24) * (L.crestScale || 1));
    var ghostPx = Math.round(F.w * (isX ? 0.62 : 0.86));

    var lock =
      '<div class="cx-lock">' +
        '<div class="cx-side">' + crestImg(C.home.crest, C.home.name, crestPx) +
          '<span class="cx-team">' + esc(C.home.name.toUpperCase()) + '</span></div>' +
        (L.vs !== false
          ? '<div class="cx-mid"><span class="cx-vs">V</span></div>'
          : '<div class="cx-mid"><span class="cx-score">' + esc(H.big) + '</span></div>') +
        '<div class="cx-side">' + crestImg(C.away.crest, C.away.name, crestPx) +
          '<span class="cx-team">' + esc(C.away.name.toUpperCase()) + '</span></div>' +
      '</div>';

    var meta =
      '<div class="cx-meta">' +
        (C.date ? '<div class="cx-date">' + esc(fmtDate(C.date)) + (C.kickoff ? ' &middot; ' + esc(fmtKO(C.kickoff)) : '') + '</div>' : '') +
        (C.venue ? '<div class="cx-venue">' + esc(C.venue) + '</div>' : '') +
      '</div>';

    var statusBlock = L.statusBar
      ? '<div class="cx-status"><span class="cx-statusword">' + esc(H.big) + '</span>' +
        (H.sub ? '<span class="cx-statuswhy">' + esc(H.sub) + '</span>' : '') +
        (H.foot ? '<span class="cx-statusnext">' + esc(H.foot) + '</span>' : '') + '</div>'
      : '';

    var resultBlock = (L.headline === 'score' && C.score)
      ? '<div class="cx-result"><span class="cx-ftlbl">' + esc(H.kicker) + '</span></div>' : '';

    return '' +
      '<div class="cx cx--' + esc(F.name.toLowerCase().replace(/[^a-z]/g, '')) + (L.muted ? ' cx--muted' : '') + '" ' +
        'style="width:' + F.w + 'px;height:' + F.h + 'px;' +
        '--cx-accent:' + (t.accent || '#FFD100') + ';--cx-ink:' + (t.headline || '#F5F3ED') + ';' +
        '--cx-safe-top:' + F.safeTop + 'px;--cx-safe-bottom:' + F.safeBottom + 'px">' +
        '<img class="cx-plate" src="' + plate + '" alt="">' +
        '<img class="cx-ghost" src="' + esc(asset('img/badge.png')) + '" alt="" style="width:' + ghostPx + 'px;opacity:' + (L.ghostCrest || 0.05) + '">' +
        '<div class="cx-inner">' +
          '<div class="cx-top">' +
            (L.compTop !== false ? competitionBlock(C.competition, L.compProminent) : '') +
            '<div class="cx-kicker">' + esc(H.kicker) + '</div>' +
          '</div>' +
          '<div class="cx-body">' + resultBlock + lock + statusBlock + (L.statusBar ? '' : meta) + '</div>' +
          '<div class="cx-foot">' + sponsorBlock(C.sponsors, F.name) + '</div>' +
        '</div>' +
      '</div>';
  }

  return { html: html, setAssetBase: setAssetBase, asset: asset, headlineFor: headlineFor, fmtDate: fmtDate, fmtKO: fmtKO, initials: initials };
});
