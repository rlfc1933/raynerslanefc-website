/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — CLUB BRAND PALETTES

   Two jobs, deliberately separated:

     RESOLVE   given a club name, hand back its verified palette (or an honest
               neutral fallback). Pure, synchronous, no canvas, runs anywhere —
               Node tests included.

     SUGGEST   sample a crest and PROPOSE a palette for a human to confirm.
               Browser only, because it needs a canvas. Never authoritative.

   WHY A SUGGESTION IS NEVER A PALETTE.
   These colours get published under the Rayners Lane badge on graphics that
   name another club. Getting them wrong is the visual equivalent of misspelling
   the opponent. So a suggestion lands as verified:false and the engine keeps
   using the neutral fallback until a human has looked at it beside the crest
   and said yes. "Probably claret" is not a reason to publish claret.

   WHAT MAKES CREST SAMPLING HARD, AND WHAT WE DO ABOUT IT.
   A naive "most common pixel" returns white every time — crests are mostly
   background — and the second most common is the black outline. Both are true
   and both are useless. sampleCrest() therefore:

     · drops transparent and near-transparent pixels (alpha < 160), which also
       removes most anti-aliased edges;
     · drops near-white and near-black by LIGHTNESS, so a white-heavy badge
       still yields its actual colour;
     · drops near-greys by SATURATION, which is what kills the outline halo;
     · buckets what survives in HSL hue space rather than RGB, because two
       shades of the same claret should count as one colour, not two;
     · weights a bucket by pixel count AND saturation, so a small vivid flash
       beats a large muddy wash — which is usually how a badge actually reads.

   It is a decent first guess and nothing more. Sometimes it will be wrong.
   That is precisely why a human confirms.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BrandPalette = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var registry = { clubs: [], _fallback: null };

  function setRegistry(data) {
    registry = data && data.clubs ? data : { clubs: [], _fallback: null };
  }
  function fallback() {
    return registry._fallback ||
      { primary: '#3A3A3A', secondary: '#6E6E6E', accent: '#B9B9B9', text: 'light' };
  }

  /** "Penn & Tylers Green" and "penn-and-tylers-green" are the same club. */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/&/g, 'and').replace(/\bf\.?c\.?\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function find(nameOrId) {
    if (!nameOrId) return null;
    var n = norm(nameOrId);
    for (var i = 0; i < registry.clubs.length; i++) {
      var c = registry.clubs[i];
      if (norm(c.id) === n || norm(c.name) === n) return c;
      var al = c.aliases || [];
      for (var j = 0; j < al.length; j++) if (norm(al[j]) === n) return c;
    }
    return null;
  }

  /**
   * The palette a composition should actually use.
   *
   * `usable` is the flag that matters: an unverified suggestion resolves with
   * the neutral fallback colours, so nothing unconfirmed can reach artwork.
   */
  function resolve(nameOrId) {
    var c = find(nameOrId);
    var fb = fallback();
    if (!c || !c.verified || !c.primary) {
      return {
        id: c ? c.id : '', name: c ? c.name : String(nameOrId || ''),
        crest: c ? c.crest : null,
        primary: fb.primary, secondary: fb.secondary, accent: fb.accent,
        tertiary: null, text: fb.text || 'light',
        verified: false, locked: !!(c && c.locked), usable: false,
        reason: !c ? 'club not in registry' : (!c.primary ? 'no palette yet' : 'palette not confirmed by a human')
      };
    }
    return {
      id: c.id, name: c.name, crest: c.crest,
      primary: c.primary, secondary: c.secondary || c.primary, accent: c.accent || c.secondary || c.primary,
      tertiary: c.tertiary || null, text: c.text || 'light',
      verified: true, locked: !!c.locked, usable: true, reason: ''
    };
  }

  // ── colour maths ─────────────────────────────────────────────────────────

  function hex2rgb(h) {
    var s = String(h || '').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return isFinite(n) ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 } : { r: 0, g: 0, b: 0 };
  }
  function rgb2hex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var h = 0, s = 0, l = (mx + mn) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }
  /** WCAG relative luminance. */
  function lum(hex) {
    var c = hex2rgb(hex);
    var a = [c.r, c.g, c.b].map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(a, b) {
    var la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  /** Black or white — whichever a human can actually read on this colour. */
  function readableOn(hex) {
    return contrast(hex, '#FFFFFF') >= contrast(hex, '#0d0d0d') ? '#FFFFFF' : '#0d0d0d';
  }
  function mix(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b);
    return rgb2hex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t);
  }
  function darken(hex, t) { return mix(hex, '#000000', t); }
  function lighten(hex, t) { return mix(hex, '#FFFFFF', t); }

  /**
   * Force a colour to be legible as light-on-dark without losing its identity.
   *
   * An opponent whose primary is navy or maroon disappears against a dark
   * cinematic ground. Rather than substituting a different colour, lift its
   * lightness until it reads — same hue, same club, visible.
   */
  function glowable(hex, bg) {
    var out = hex, guard = 0;
    while (contrast(out, bg || '#080808') < 2.4 && guard++ < 12) out = lighten(out, 0.12);
    return out;
  }

  // ── derived tokens ───────────────────────────────────────────────────────

  /**
   * The visual token set a composition consumes.
   *
   * RAYNERS LANE STAYS DOMINANT. The home palette supplies the headline colour,
   * the key light and the accent; the opponent gets a counter-light and a muted
   * wash and nothing else. That asymmetry is deliberate and is what stops the
   * artwork looking as though the opposition produced it.
   */
  function tokens(homePal, awayPal, opts) {
    var o = opts || {};
    var bg = o.bg || '#080808';
    var lane = homePal || resolve('rayners-lane');
    var opp = awayPal || fallback();

    var laneGlow = glowable(lane.primary, bg);
    var oppGlow = glowable(opp.primary, bg);

    return {
      bg: bg,
      bgDeep: darken(bg, 0.35),
      homeGlow: laneGlow,
      awayGlow: oppGlow,
      homeMuted: mix(darken(lane.primary, 0.55), bg, 0.45),
      awayMuted: mix(darken(opp.primary, 0.55), bg, 0.45),
      homeInk: readableOn(lane.primary),
      awayInk: readableOn(opp.primary),
      headline: '#F5F3ED',
      secondaryText: 'rgba(245,243,237,.68)',
      divider: 'rgba(245,243,237,.14)',
      // THE SIGNAL COLOUR IS THE HOME PRIMARY, NOT THE HOME "ACCENT".
      // Two different meanings of the same word, and conflating them cost the
      // artwork its yellow: in the registry `accent` is a club's THIRD colour
      // (Rayners Lane's is white), while a composition's `accent` is the one
      // colour that draws the eye. For the Lane that is unambiguously the
      // yellow, which is the primary.
      accent: lane.primary || '#FFD100',
      accentInk: readableOn(lane.primary || '#FFD100'),
      tertiary: lane.accent || '#F5F3ED',
      // The club's own green stays in the system as the deep atmospheric bed —
      // it is what makes a Lane graphic feel like a Lane graphic rather than a
      // generic dark poster.
      bed: lane.secondary || '#1A5C32',
      overlay: 'rgba(8,8,8,.55)',
      oppUsable: !!(awayPal && awayPal.usable)
    };
  }

  // ── crest sampling (browser only) ────────────────────────────────────────

  /*
     TUNED AGAINST THE ACTUAL 21 CRESTS, NOT IN THEORY.

     The first pass used lMax 0.90 and scored buckets mostly by pixel count.
     Run over the real badges it got the ORDER wrong on a third of them:
     Harefield United (red on white) came back with a near-white primary,
     Abingdon United (yellow and black) returned a murky brown, and Ardley
     produced a pale mint that exists only as anti-aliasing. All three were
     large, pale, technically-saturated-enough regions outvoting the colour a
     human would name instantly.

     Two changes fixed it: pull lMax down so pale washes are excluded outright,
     and score on saturation raised to a power so vividness dominates area
     rather than merely nudging it. A crest's identity colour is almost always
     its most SATURATED substantial region, not its largest.
  */
  var SAMPLE = {
    alphaMin: 160,   // drops transparency and most anti-aliased edge pixels
    lMin: 0.14,      // near-black: outlines, drop shadows
    lMax: 0.78,      // near-white: backgrounds, highlights, AA haze
    sMin: 0.22,      // near-grey: the outline halo that ruins naive sampling
    satPower: 2.2,   // vividness beats area — see note above
    minShare: 0.02,  // a bucket under 2% of kept pixels is noise, not a colour
    hueBuckets: 24   // 15° per bucket — same claret lands in one bucket
  };

  /**
   * Propose a palette from a crest. Returns null if the image cannot be read
   * (CORS, missing file) — a null suggestion is honest, a guessed one is not.
   */
  function sampleCrest(img, opts) {
    var cfg = Object.assign({}, SAMPLE, opts || {});
    if (typeof document === 'undefined') return null;
    var W = 96, H = 96;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    try { ctx.drawImage(img, 0, 0, W, H); } catch (e) { return null; }
    var data;
    try { data = ctx.getImageData(0, 0, W, H).data; } catch (e) { return null; }

    var buckets = {}, kept = 0;
    for (var i = 0; i < data.length; i += 4) {
      var a = data[i + 3];
      if (a < cfg.alphaMin) continue;
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var hsl = rgb2hsl(r, g, b);
      if (hsl.l < cfg.lMin || hsl.l > cfg.lMax) continue;
      if (hsl.s < cfg.sMin) continue;
      kept++;
      var k = Math.floor(hsl.h / (360 / cfg.hueBuckets));
      var bk = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, b: 0, s: 0 });
      bk.n++; bk.r += r; bk.g += g; bk.b += b; bk.s += hsl.s;
    }
    // Too little chromatic pixel data to say anything — a mono/outline badge.
    if (kept < 40) return null;

    var list = Object.keys(buckets).map(function (k) {
      var b = buckets[k];
      var sat = b.s / b.n;
      return {
        hex: rgb2hex(b.r / b.n, b.g / b.n, b.b / b.n),
        n: b.n, sat: sat, share: b.n / kept,
        // Area × vividness^n. The exponent is what stops a big pale wash
        // beating the colour a human would actually name.
        score: b.n * Math.pow(sat, cfg.satPower)
      };
    })
      .filter(function (x) { return x.share >= cfg.minShare; })
      .sort(function (x, y) { return y.score - x.score; });

    if (!list.length) return null;
    return {
      primary: list[0].hex,
      secondary: list[1] ? list[1].hex : darken(list[0].hex, 0.35),
      accent: list[2] ? list[2].hex : lighten(list[0].hex, 0.42),
      text: readableOn(list[0].hex) === '#FFFFFF' ? 'light' : 'dark',
      confidence: Math.min(1, kept / 900),
      sampled: kept,
      candidates: list.slice(0, 5).map(function (x) { return x.hex; })
    };
  }

  return {
    setRegistry: setRegistry, find: find, resolve: resolve, tokens: tokens,
    sampleCrest: sampleCrest, fallback: fallback,
    contrast: contrast, readableOn: readableOn, glowable: glowable,
    mix: mix, darken: darken, lighten: lighten,
    _norm: norm, _rgb2hsl: rgb2hsl, _hex2rgb: hex2rgb, _rgb2hex: rgb2hex
  };
});
