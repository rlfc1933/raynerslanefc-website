/* ════════════════════════════════════════════════════════════════════════
   SQUARE — the approved blueprint, generalised.

   The New Bradwell proof was one hand-built page. This is the same design
   driven entirely by campaign data, so every fixture in the season gets it and
   nothing about any single opponent is hardcoded. The proof established the
   art direction; this makes it a system.

   WHAT VARIES PER FIXTURE, AUTOMATICALLY
     crests, club names and which side each sits on (home/away)
     the opponent's counter-light colour, when a human has confirmed it
     the competition mark, its round, and the art direction that follows
     the presenting sponsor — HDL at home, McCafferty's away
     the persistent rail — Ashwood, The King Denham, AHiQ, always
     the headline and hierarchy, which change with the content state

   WHAT NEVER VARIES
     Rayners Lane is the master brand. Lane yellow is the key light and the
     signal colour whether we are home or away; the opponent only ever gets a
     counter-light. An away graphic must still look like the Lane published it.

   THE STATES ARE NOT ONE LAYOUT WITH A DIFFERENT WORD IN IT.
   Full Time promotes the score to the largest element on the canvas and drops
   the crests back. Postponed promotes the status and the reason and demotes
   everything about kick-off, because the kick-off is no longer happening.
   Matchday promotes the confrontation. Same campaign, genuinely different
   hierarchies — that is the difference between art direction and a template.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CreativeSquare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var G = typeof globalThis !== 'undefined' ? globalThis : {};
  var BASE = '';
  function setAssetBase(b) { BASE = b ? String(b).replace(/\/?$/, '/') : ''; }
  function A(p) { return !p ? p : (/^(https?:|data:|\/)/.test(p) ? p : BASE + p); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(n) {
    return String(n || '').replace(/\b(fc|afc|utd|united|town|city|st)\b/gi, '')
      .trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 3).toUpperCase() || '?';
  }
  function crest(src, name) {
    if (!src) return '<span class="sq__crest sq__crest--ini">' + esc(initials(name)) + '</span>';
    return '<img class="sq__crest" src="' + esc(A(src)) + '" alt="' + esc(name) + ' crest">';
  }

  /**
   * Club names in this division run from "Burnham" to "Wallingford & Crowmarsh".
   * A single font size cannot serve both, and shrinking to fit produces a name
   * nobody can read. Break at a sensible word and step the size down instead.
   */
  function teamName(name) {
    var n = String(name || '').toUpperCase();
    if (n.length <= 13) return { html: esc(n), cls: '' };
    var words = n.split(' ');
    if (words.length === 1) return { html: esc(n), cls: 'sq__team--long' };
    var mid = Math.ceil(words.length / 2);
    // "NEW BRADWELL ST PETER" reads better split 2/2 than 3/1.
    if (words.length === 4) mid = 2;
    return {
      html: esc(words.slice(0, mid).join(' ')) + '<br>' + esc(words.slice(mid).join(' ')),
      cls: n.length > 20 ? 'sq__team--xlong' : 'sq__team--long'
    };
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
    return (h % 12 || 12) + (m === '00' ? '' : ':' + m) + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  /** The competition block: issued mark where we hold one, proper name where not. */
  function competition(c) {
    var round = c.round ? '<div class="sq__round">' + esc(c.round).replace(/ /g, '<br>') + '</div>' : '';
    if (c.logo) {
      return '<div class="sq__comp"><img class="sq__complogo" src="' + esc(A(c.logo)) +
        '" alt="' + esc(c.label) + '">' + round + '</div>';
    }
    return '<div class="sq__comp"><div class="sq__compname">' + esc(c.label || 'Fixture') + '</div>' + round + '</div>';
  }

  function sponsors(s) {
    var pres = s.presenter
      ? '<div class="sq__pres"><span class="sq__preslbl">' +
        (s.context === 'home' ? 'Home match presented by' : 'Away match presented by') + '</span>' +
        '<img class="sq__preslogo" src="' + esc(A(s.presenter.white || s.presenter.colour)) +
        '" alt="' + esc(s.presenter.name) + '"></div>'
      : '<div class="sq__pres"></div>';
    var rail = '<div class="sq__rail">' + s.rail.map(function (p) {
      return '<img class="sq__raillogo" src="' + esc(A(p.white || p.colour)) + '" alt="' + esc(p.name) + '">';
    }).join('') + '</div>';
    return '<div class="sq__sponsors">' + pres + rail + '</div>';
  }

  /**
   * HIERARCHY PER STATE. The headline word, what it demotes, and what it promotes.
   */
  function hierarchy(c) {
    var st = c.state, off = ['postponed', 'cancelled', 'abandoned'].indexOf(String(c.status).toLowerCase()) > -1;
    if (st === 'postponed' || st === 'rearranged' || off) {
      return {
        word: 'POSTPONED', mode: 'status', tone: 'urgent',
        why: c.postponedReason || '',
        next: c.rearrangedDate ? 'Rearranged for ' + fmtDate(c.rearrangedDate) : 'A new date will be announced'
      };
    }
    if (st === 'fulltime' && c.score) {
      return { word: 'FULL TIME', mode: 'score', tone: c.outcome || 'draw' };
    }
    if (st === 'halftime' && c.score) return { word: 'HALF TIME', mode: 'score', tone: 'neutral' };
    if (st === 'lineup') return { word: 'TEAM NEWS', mode: 'info', tone: 'tactical' };
    if (st === 'kickoff') return { word: 'KICK OFF', mode: 'confront', tone: 'energy' };
    if (st === 'countdown') return { word: 'NEXT UP', mode: 'confront', tone: 'anticipation' };
    return { word: 'MATCHDAY', mode: 'confront', tone: 'anticipation' };
  }

  /**
   * Render the square.
   * `plate` is an optional generated photograph; without one the SVG procedural
   * plate carries the frame and the design still holds.
   */
  /** The four deliverables. Each is a composition, never a crop of another. */
  var FMT = {
    square:   { w: 1080, h: 1080, cls: 'sq--f-square' },
    portrait: { w: 1080, h: 1350, cls: 'sq--f-portrait' },
    story:    { w: 1080, h: 1920, cls: 'sq--f-story' },
    x:        { w: 1600, h: 900,  cls: 'sq--f-x' }
  };

  function html(campaign, opts) {
    var o = opts || {};
    var c = campaign;
    var F = FMT[o.format || 'square'] || FMT.square;
    var H = hierarchy(c);
    var t = (c.palette && c.palette.tokens) || {};
    var SVG = G.CreativeSVG;
    var spec = o.spec || {};
    var proc = SVG && SVG.plateURI ? SVG.plateURI(Object.assign({ w: F.w, h: F.h, tokens: t }, spec)) : '';
    var photo = o.plate ? A(o.plate) : null;

    var home = teamName(c.home.name), away = teamName(c.away.name);
    // The counter-light only appears when a human confirmed the opponent's
    // colours. An unconfirmed club gets Lane light alone rather than a guess.
    var oppLight = c.palette.oppUsable ? c.palette.opponent.primary : null;

    var centre = H.mode === 'score'
      ? '<div class="sq__scorewrap"><div class="sq__score">' + esc(c.score.us) + '<span>&ndash;</span>' + esc(c.score.them) + '</div></div>'
      : '';

    var facts = H.mode === 'status'
      ? '<div class="sq__statusblock">' +
          '<div class="sq__statusword">' + esc(H.word) + '</div>' +
          (H.why ? '<div class="sq__statuswhy">' + esc(H.why) + '</div>' : '') +
          '<div class="sq__statusnext">' + esc(H.next) + '</div>' +
        '</div>'
      : '<div class="sq__rule"></div>' +
        '<div class="sq__date">' + esc(fmtDate(c.date)) +
          (c.kickoff ? ' <span class="sq__ko">&middot; ' + esc(fmtKO(c.kickoff)) + '</span>' : '') + '</div>' +
        (c.venue ? '<div class="sq__venue">' + esc(c.venue) + '</div>' : '');

    return '' +
    '<div class="sq ' + F.cls + ' sq--' + esc(H.mode) + ' sq--' + esc(H.tone) + '" style="' +
        'width:' + F.w + 'px;height:' + F.h + 'px;' +
        '--sq-opp:' + (oppLight || 'transparent') + ';--sq-lane:' + (t.accent || '#FFD100') + '">' +
      (photo ? '<img class="sq__photo" src="' + esc(photo) + '" alt="">' : '') +
      '<img class="sq__grade' + (photo ? '' : ' sq__grade--solo') + '" src="' + proc + '" alt="">' +
      '<div class="sq__scrim"></div>' +
      '<div class="sq__lightL"></div>' +
      (oppLight ? '<div class="sq__lightR"></div>' : '') +
      '<img class="sq__ghost" src="' + esc(A('img/badge.png')) + '" alt="">' +
      (H.mode === 'confront' ? '<div class="sq__slash sq__slash--ghost"></div><div class="sq__slash"></div>' : '') +

      (H.mode !== 'status' ? '<div class="sq__word sq__word--back">' + esc(H.word) + '</div>' +
                             '<div class="sq__word">' + esc(H.word) + '</div>' : '') +

      '<div class="sq__lock">' +
        '<div class="sq__side">' + crest(c.home.crest, c.home.name) +
          '<div class="sq__team ' + home.cls + '"><span>' + home.html + '</span></div></div>' +
        centre +
        '<div class="sq__side">' + crest(c.away.crest, c.away.name) +
          '<div class="sq__team ' + away.cls + '"><span>' + away.html + '</span></div></div>' +
      '</div>' +

      '<div class="sq__in">' +
        competition(c.competition) +
        '<div class="sq__facts">' + facts + sponsors(c.sponsors) + '</div>' +
      '</div>' +
    '</div>';
  }

  return { html: html, formats: FMT, setAssetBase: setAssetBase, hierarchy: hierarchy,
           teamName: teamName, fmtDate: fmtDate, fmtKO: fmtKO };
});
