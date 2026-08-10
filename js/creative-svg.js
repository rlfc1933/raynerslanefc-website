/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — SVG ATMOSPHERE

   THE ONE THING THE OLD ENGINE COULD HAVE DONE AND NEVER DID.

   The Studio already knew html2canvas cannot rasterise CSS gradients — there
   is a comment in admin.html saying so — and worked around it by drawing card
   backgrounds as inline SVG. What nobody then did was notice what else that
   unlocks: html2canvas renders inline SVG by handing it to the browser as an
   image, so the ENTIRE SVG filter set comes along with it. Across the whole
   repository there was not one feTurbulence, mask, pattern or lighting filter.

   That is the whole gap between "black rectangle plus a yellow stripe" and
   actual atmosphere, and it needs no dependency, no server and no AI:

     feTurbulence   grain, fog, smoke, paper grit
     feGaussianBlur bloom, floodlight falloff, depth
     feSpecularLighting  a real light source, not a pale ellipse
     feColorMatrix  tinting turbulence into club colour
     feBlend        screen/overlay compositing that CSS cannot export
     mask / pattern crest watermarks, pitch geometry, halftone

   EVERY FUNCTION HERE RETURNS AN SVG STRING. No DOM, no canvas, no globals —
   which keeps it testable in Node and swappable for a server renderer.

   ATMOSPHERE ONLY. Nothing in this file draws a crest, a sponsor mark, a score
   or a word of copy. Those are protected factual layers rendered as real DOM
   on top, exactly so that a lighting change can never distort a badge or
   reflow a scoreline.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CreativeSVG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /** Deterministic pseudo-random from a string — same campaign, same grain. */
  function seed(str) {
    var h = 2166136261;
    for (var i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 9973;
  }

  /**
   * GRAIN. feTurbulence fractalNoise desaturated to luminance and laid over the
   * composition at low opacity. This is what stops a flat gradient reading as a
   * PowerPoint background: real print and real photography both have noise, and
   * the eye notices its absence long before it notices its presence.
   */
  function grain(id, amount, s) {
    var a = amount == null ? 0.055 : amount;
    return '<filter id="' + id + '" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="' + (s || 7) + '" result="n"/>' +
      '<feColorMatrix in="n" type="saturate" values="0" result="g"/>' +
      '<feComponentTransfer in="g" result="gg"><feFuncA type="linear" slope="' + a + '"/></feComponentTransfer>' +
      '<feComposite in="gg" in2="SourceGraphic" operator="over"/>' +
      '</filter>';
  }

  /**
   * FOG / SMOKE. Low-frequency turbulence, heavily blurred, tinted to a club
   * colour and screened over the ground. Drifting haze in a floodlit ground is
   * the single most "football at night" texture there is.
   */
  function fog(id, tint, s, freq) {
    return '<filter id="' + id + '" x="-20%" y="-20%" width="140%" height="140%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + (freq || 0.012) + '" numOctaves="4" seed="' + (s || 3) + '" result="t"/>' +
      '<feGaussianBlur in="t" stdDeviation="18" result="b"/>' +
      '<feColorMatrix in="b" type="matrix" result="c" values="' + tintMatrix(tint) + '"/>' +
      '<feComposite in="c" in2="SourceGraphic" operator="in"/>' +
      '</filter>';
  }

  /** Turn greyscale turbulence into a single tinted channel with soft alpha. */
  function tintMatrix(hex) {
    var h = String(hex || '#FFD100').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16) / 255,
        g = parseInt(h.slice(2, 4), 16) / 255,
        b = parseInt(h.slice(4, 6), 16) / 255;
    /* TINT, DO NOT PAINT.
       The first version pushed the channel to full colour and alpha to 0.6,
       then stacked a second tinted layer on top of a green bed. Yellow fog
       plus claret fog plus green bed is khaki, and the whole frame went muddy.
       Scaling the colour back and cutting the alpha keeps fog as a VEIL that
       carries a hint of the club's colour, which is what fog under floodlights
       actually looks like — the beams carry the colour, not the haze. */
    return [
      0, 0, 0, 0, r * 0.55,
      0, 0, 0, 0, g * 0.55,
      0, 0, 0, 0, b * 0.55,
      0.34, 0.34, 0.34, 0, -0.20
    ].join(' ');
  }

  /**
   * FLOODLIGHT. A specular highlight with a real light position, blurred into
   * bloom. Not a radial gradient pretending: feSpecularLighting has a surface
   * and a source, so the falloff behaves like light rather than like a circle.
   */
  function floodlight(id, x, y, z, colour) {
    return '<filter id="' + id + '" x="-30%" y="-30%" width="160%" height="160%">' +
      '<feGaussianBlur in="SourceAlpha" stdDeviation="26" result="blur"/>' +
      '<feSpecularLighting in="blur" surfaceScale="4" specularConstant="1.1" specularExponent="22" ' +
        'lighting-color="' + esc(colour || '#FFD100') + '" result="spec">' +
        '<fePointLight x="' + x + '" y="' + y + '" z="' + (z || 220) + '"/>' +
      '</feSpecularLighting>' +
      '<feComposite in="spec" in2="SourceAlpha" operator="in" result="lit"/>' +
      '<feComposite in="lit" in2="SourceGraphic" operator="over"/>' +
      '</filter>';
  }

  /** A soft beam of light raking across the frame, as a blurred polygon. */
  function beam(x1, y1, x2, y2, w, colour, op) {
    return '<g opacity="' + (op == null ? 0.16 : op) + '" filter="url(#f-beamblur)">' +
      '<polygon points="' + x1 + ',' + y1 + ' ' + (x1 + w) + ',' + y1 + ' ' +
      (x2 + w * 2.2) + ',' + y2 + ' ' + x2 + ',' + y2 + '" fill="' + esc(colour) + '"/></g>';
  }

  /** PITCH GEOMETRY — the club's own vocabulary, not a stock texture. */
  function pitchLines(W, H, colour, op) {
    var cy = H * 0.62, r = Math.min(W, H) * 0.26;
    return '<g stroke="' + esc(colour) + '" stroke-width="2" fill="none" opacity="' + (op || 0.07) + '">' +
      '<circle cx="' + (W / 2) + '" cy="' + cy + '" r="' + r + '"/>' +
      '<line x1="0" y1="' + cy + '" x2="' + W + '" y2="' + cy + '"/>' +
      '<rect x="' + (W / 2 - r * 2.1) + '" y="' + (cy + r * 1.15) + '" width="' + (r * 4.2) + '" height="' + (r * 1.5) + '"/>' +
      '</g>';
  }

  /** Halftone dots — print culture, the programme's own texture. */
  function halftone(id, size, colour, op) {
    var s = size || 6;
    return '<pattern id="' + id + '" width="' + s + '" height="' + s + '" patternUnits="userSpaceOnUse">' +
      '<circle cx="' + (s / 2) + '" cy="' + (s / 2) + '" r="' + (s * 0.19) + '" fill="' + esc(colour) + '" opacity="' + (op || 0.5) + '"/>' +
      '</pattern>';
  }

  function vignette(id, strength) {
    return '<radialGradient id="' + id + '" cx="50%" cy="46%" r="76%">' +
      '<stop offset="55%" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="100%" stop-color="#000" stop-opacity="' + (strength == null ? 0.72 : strength) + '"/>' +
      '</radialGradient>';
  }

  /** Two clubs' colours meeting. The collision IS the fixture identity. */
  function collision(id, left, right, split) {
    var s = split == null ? 0.5 : split;
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0.35">' +
      /* Colour lives at the EDGES and the centre stays black. That is what
         makes two clubs read as meeting in the dark rather than as a gradient
         swatch, and it keeps the middle of the frame free for the lockup. */
      '<stop offset="0%" stop-color="' + esc(left) + '" stop-opacity="0.42"/>' +
      '<stop offset="' + Math.round(s * 100 - 22) + '%" stop-color="' + esc(left) + '" stop-opacity="0.04"/>' +
      '<stop offset="' + Math.round(s * 100) + '%" stop-color="#040404" stop-opacity="0.97"/>' +
      '<stop offset="' + Math.round(s * 100 + 22) + '%" stop-color="' + esc(right) + '" stop-opacity="0.04"/>' +
      '<stop offset="100%" stop-color="' + esc(right) + '" stop-opacity="0.36"/>' +
      '</linearGradient>';
  }

  function bedGradient(id, top, mid, bottom) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0.25" y2="1">' +
      '<stop offset="0%" stop-color="' + esc(top) + '"/>' +
      '<stop offset="58%" stop-color="' + esc(mid) + '"/>' +
      '<stop offset="100%" stop-color="' + esc(bottom) + '"/>' +
      '</linearGradient>';
  }

  /**
   * Compose the full atmosphere plate for a format.
   *
   * `spec` comes from a recipe and says how much of each ingredient to use.
   * Returns one self-contained <svg> string that html2canvas can rasterise.
   */
  function plate(spec) {
    var W = spec.w, H = spec.h;
    var t = spec.tokens || {};
    var s = seed(spec.seedKey || 'lane');
    var homeC = spec.homeGlow || t.homeGlow || '#FFD100';
    var awayC = spec.awayGlow || t.awayGlow || '#6E6E6E';
    var bed = spec.bed || t.bed || '#1A5C32';

    var defs = [
      bedGradient('g-bed', spec.bedTop || '#0B1410', spec.bedMid || '#060B08', '#030303'),
      collision('g-col', homeC, awayC, spec.split),
      vignette('g-vig', spec.vignette),
      grain('f-grain', spec.grain, s),
      fog('f-fog', homeC, s + 11, spec.fogFreq),
      fog('f-fog2', awayC, s + 29, (spec.fogFreq || 0.012) * 1.4),
      '<filter id="f-beamblur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="' + (spec.beamBlur || 34) + '"/></filter>',
      halftone('p-half', spec.halftoneSize, homeC, spec.halftoneOp)
    ].join('');

    var layers = [];
    layers.push('<rect width="' + W + '" height="' + H + '" fill="url(#g-bed)"/>');
    // The club's deep green, sitting under everything as the atmospheric bed.
    layers.push('<rect width="' + W + '" height="' + H + '" fill="' + esc(bed) + '" opacity="' + (spec.bedOpacity == null ? 0.16 : spec.bedOpacity) + '"/>');
    if (spec.pitch) layers.push(pitchLines(W, H, '#FFFFFF', spec.pitch));
    layers.push('<rect width="' + W + '" height="' + H + '" fill="url(#g-col)"/>');

    if (spec.fog) {
      layers.push('<rect width="' + W + '" height="' + H + '" filter="url(#f-fog)" opacity="' + spec.fog + '"/>');
      if (spec.oppUsable !== false) {
        layers.push('<rect width="' + W + '" height="' + H + '" filter="url(#f-fog2)" opacity="' + (spec.fog * 0.7) + '"/>');
      }
    }
    (spec.beams || []).forEach(function (b) {
      layers.push(beam(b.x1 * W, b.y1 * H, b.x2 * W, b.y2 * H, b.w * W, b.colour === 'away' ? awayC : homeC, b.op));
    });
    if (spec.halftone) {
      layers.push('<rect y="' + (H * 0.55) + '" width="' + W + '" height="' + (H * 0.45) + '" fill="url(#p-half)" opacity="' + spec.halftone + '"/>');
    }
    layers.push('<rect width="' + W + '" height="' + H + '" fill="url(#g-vig)"/>');
    if (spec.grain) {
      layers.push('<rect width="' + W + '" height="' + H + '" filter="url(#f-grain)" fill="#808080" opacity="0.5" style="mix-blend-mode:overlay"/>');
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<defs>' + defs + '</defs>' + layers.join('') + '</svg>';
  }

  /** As a data URI, which is how html2canvas handles it most reliably. */
  function plateURI(spec) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(plate(spec));
  }

  return {
    plate: plate, plateURI: plateURI, seed: seed,
    grain: grain, fog: fog, floodlight: floodlight, beam: beam,
    pitchLines: pitchLines, halftone: halftone, vignette: vignette,
    collision: collision, bedGradient: bedGradient, tintMatrix: tintMatrix
  };
});
