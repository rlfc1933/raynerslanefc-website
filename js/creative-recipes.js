/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — ART DIRECTION RECIPES

   A recipe is an OPINION about how a particular kind of football moment should
   look. It sets atmosphere, light, colour distribution, geometry and hierarchy.
   It is not a template: the same recipe over two different fixtures produces
   two different pieces of artwork, because the palettes and crests differ.

   THE COMMITTEE NEVER SEES THESE NAMES.
   Studio offers AUTO / CINEMATIC / EDITORIAL / MINIMAL. Everything below sits
   behind that. A volunteer posting a Tuesday postponement should not have to
   know what "colour collision" means, and asking them to choose is how you end
   up with a season of inconsistent graphics.

   AUTO IS THE DEFAULT AND SHOULD USUALLY WIN. It reads competition, home/away,
   fixture status, result, kick-off time and whether the opponent palette is
   confirmed, then picks. The manual options exist for the times a human
   disagrees, not as the normal route.

   EMOTION IS THE POINT. A defeat graphic that looks like a matchday graphic is
   the tell that a system is generating documents rather than art-directing.
   VICTORY is bright, high-contrast and yellow-led. DEFEAT is dark, quiet and
   deliberately restrained — you do not celebrate losing 3-1, and you do not
   hide it either. URGENT_UPDATE is the loudest thing here, because a
   postponement has a job: stop someone driving to Harrow.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CreativeRecipes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /*
     Each recipe returns an atmosphere spec (consumed by CreativeSVG.plate) plus
     layout intent (consumed by the renderer). Numbers are deliberately
     conservative: the failure mode of a cinematic engine is a muddy, overcooked
     frame, and restraint is what separates "professional football social" from
     "esports poster".
  */
  /* BEAMS ARE LIGHT, NOT SHAPES.
     The first render put hard-edged olive stripes down the frame: the polygons
     were narrow, strongly coloured and barely blurred, so they read as painted
     bands rather than as a shaft of light through haze. Roughly doubling every
     blur radius and halving every opacity turns them back into light. Light is
     wide and weak at the edges; a stripe is neither. */
  var R = {

    CINEMATIC_SPLIT: {
      label: 'Cinematic split',
      atmos: { bedOpacity: 0.18, fog: 0.30, grain: 0.055, vignette: 0.74, split: 0.5,
        pitch: 0.055, beamBlur: 64,
        beams: [ { x1: 0.10, y1: -0.05, x2: -0.10, y2: 1.05, w: 0.16, colour: 'home', op: 0.10 },
                 { x1: 0.92, y1: -0.05, x2: 1.14, y2: 1.05, w: 0.14, colour: 'away', op: 0.15 } ] },
      layout: { crestScale: 1.0, ghostCrest: 0.055, headline: 'lower', vs: true, compTop: true }
    },

    COLOUR_COLLISION: {
      label: 'Colour collision',
      atmos: { bedOpacity: 0.10, fog: 0.38, grain: 0.06, vignette: 0.66, split: 0.5,
        fogFreq: 0.016, beamBlur: 72,
        beams: [ { x1: -0.05, y1: 0.1, x2: 0.42, y2: 1.05, w: 0.30, colour: 'home', op: 0.13 },
                 { x1: 1.05, y1: 0.1, x2: 0.62, y2: 1.05, w: 0.26, colour: 'away', op: 0.11 } ] },
      layout: { crestScale: 1.06, ghostCrest: 0.05, headline: 'lower', vs: true, compTop: true }
    },

    FLOODLIGHT: {
      label: 'Floodlight',
      atmos: { bedOpacity: 0.22, fog: 0.34, grain: 0.05, vignette: 0.80, split: 0.5,
        pitch: 0.085, beamBlur: 58,
        beams: [ { x1: 0.16, y1: -0.08, x2: 0.30, y2: 0.86, w: 0.10, colour: 'home', op: 0.14 },
                 { x1: 0.84, y1: -0.08, x2: 0.70, y2: 0.86, w: 0.10, colour: 'home', op: 0.11 } ] },
      layout: { crestScale: 0.98, ghostCrest: 0.06, headline: 'lower', vs: true, compTop: true }
    },

    CUP_NIGHT: {
      // Prestige reads as restraint and darkness, not as more effects. More
      // black, one shaft of light, the competition given room at the top.
      label: 'Cup night',
      atmos: { bedOpacity: 0.06, fog: 0.22, grain: 0.045, vignette: 0.88, split: 0.5,
        pitch: 0.04, beamBlur: 54,
        beams: [ { x1: 0.46, y1: -0.1, x2: 0.40, y2: 1.05, w: 0.22, colour: 'home', op: 0.10 } ] },
      layout: { crestScale: 1.10, ghostCrest: 0.04, headline: 'lower', vs: true, compTop: true, compProminent: true }
    },

    VICTORY: {
      label: 'Victory',
      atmos: { bedOpacity: 0.12, fog: 0.26, grain: 0.05, vignette: 0.60, split: 0.62,
        halftone: 0.10, halftoneSize: 7, halftoneOp: 0.55, beamBlur: 58,
        beams: [ { x1: 0.30, y1: -0.1, x2: 0.10, y2: 1.05, w: 0.26, colour: 'home', op: 0.17 },
                 { x1: 0.70, y1: -0.1, x2: 0.92, y2: 1.05, w: 0.20, colour: 'home', op: 0.13 } ] },
      layout: { crestScale: 0.92, ghostCrest: 0.07, headline: 'score', vs: false, compTop: true }
    },

    DEFEAT: {
      // Quiet and dark. Not sulking, not celebrating — the result stated plainly.
      label: 'Defeat',
      atmos: { bedOpacity: 0.05, fog: 0.16, grain: 0.06, vignette: 0.92, split: 0.5,
        beamBlur: 66, beams: [] },
      layout: { crestScale: 0.86, ghostCrest: 0.03, headline: 'score', vs: false, compTop: true, muted: true }
    },

    DRAW_EDITORIAL: {
      label: 'Draw',
      atmos: { bedOpacity: 0.09, fog: 0.20, grain: 0.05, vignette: 0.78, split: 0.5,
        beamBlur: 62, beams: [ { x1: 0.5, y1: -0.1, x2: 0.5, y2: 1.05, w: 0.18, colour: 'home', op: 0.14 } ] },
      layout: { crestScale: 0.9, ghostCrest: 0.045, headline: 'score', vs: false, compTop: true }
    },

    URGENT_UPDATE: {
      // The loudest recipe, because this one has to stop a journey.
      label: 'Urgent update',
      atmos: { bedOpacity: 0.04, fog: 0.14, grain: 0.07, vignette: 0.86, split: 0.5,
        beamBlur: 44, beams: [ { x1: 0.0, y1: 0.28, x2: 1.0, y2: 0.42, w: 0.05, colour: 'home', op: 0.5 } ] },
      layout: { crestScale: 0.78, ghostCrest: 0.03, headline: 'status', vs: true, compTop: false, statusBar: true }
    },

    EDITORIAL: {
      label: 'Editorial',
      atmos: { bedOpacity: 0.08, fog: 0.12, grain: 0.05, vignette: 0.62, split: 0.5,
        halftone: 0.08, halftoneSize: 5, beamBlur: 58, beams: [] },
      layout: { crestScale: 0.8, ghostCrest: 0.035, headline: 'upper', vs: true, compTop: true, rule: true }
    },

    MINIMAL_PREMIUM: {
      label: 'Minimal',
      atmos: { bedOpacity: 0.06, fog: 0.10, grain: 0.035, vignette: 0.70, split: 0.5, beamBlur: 58, beams: [] },
      layout: { crestScale: 0.94, ghostCrest: 0.025, headline: 'lower', vs: true, compTop: true }
    },

    PLAYER_FEATURE: {
      label: 'Player feature',
      atmos: { bedOpacity: 0.14, fog: 0.28, grain: 0.055, vignette: 0.82, split: 0.42,
        beamBlur: 60, beams: [ { x1: 0.34, y1: -0.1, x2: 0.22, y2: 1.05, w: 0.28, colour: 'home', op: 0.14 } ] },
      layout: { crestScale: 0.7, ghostCrest: 0.06, headline: 'lower', vs: false, compTop: false, portraitSlot: true }
    },

    CLUB_STORY: {
      label: 'Club story',
      atmos: { bedOpacity: 0.16, fog: 0.20, grain: 0.05, vignette: 0.70, split: 0.5,
        pitch: 0.05, beamBlur: 62, beams: [ { x1: 0.2, y1: -0.1, x2: 0.05, y2: 1.05, w: 0.24, colour: 'home', op: 0.11 } ] },
      layout: { crestScale: 0.76, ghostCrest: 0.07, headline: 'upper', vs: false, compTop: false }
    }
  };

  /** The four names a committee member actually sees. */
  var USER_STYLES = ['auto', 'cinematic', 'editorial', 'minimal'];

  /**
   * Pick the recipe for a campaign.
   *
   * Order matters: a postponement outranks everything, because the graphic's
   * job has changed from promoting a match to stopping a journey. A result
   * outranks the competition, because how it finished matters more than what
   * it was. Only then does competition personality decide.
   */
  function pick(campaign, style) {
    var s = (style || campaign.styleOverride || 'auto').toLowerCase();
    if (s === 'editorial') return { key: 'EDITORIAL', recipe: R.EDITORIAL, why: 'chosen by staff' };
    if (s === 'minimal') return { key: 'MINIMAL_PREMIUM', recipe: R.MINIMAL_PREMIUM, why: 'chosen by staff' };
    if (s === 'cinematic') {
      var k = campaign.competition.treatment === 'cup-night' ? 'CUP_NIGHT' : 'COLOUR_COLLISION';
      return { key: k, recipe: R[k], why: 'chosen by staff' };
    }

    // ── AUTO ────────────────────────────────────────────────────────────
    var st = campaign.state, why;

    if (st === 'postponed' || st === 'rearranged' || campaign.status === 'postponed' ||
        campaign.status === 'cancelled' || campaign.status === 'abandoned') {
      return { key: 'URGENT_UPDATE', recipe: R.URGENT_UPDATE, why: 'the match is off — this has to stop a journey' };
    }
    if (st === 'fulltime' && campaign.outcome) {
      if (campaign.outcome === 'win') return { key: 'VICTORY', recipe: R.VICTORY, why: 'full time, won' };
      if (campaign.outcome === 'loss') return { key: 'DEFEAT', recipe: R.DEFEAT, why: 'full time, lost — restrained on purpose' };
      return { key: 'DRAW_EDITORIAL', recipe: R.DRAW_EDITORIAL, why: 'full time, drawn' };
    }
    if (st === 'motm') return { key: 'PLAYER_FEATURE', recipe: R.PLAYER_FEATURE, why: 'a player leads this one' };
    if (st === 'lineup') return { key: 'EDITORIAL', recipe: R.EDITORIAL, why: 'a team sheet is information, not a poster' };
    if (st === 'preseason') return { key: 'MINIMAL_PREMIUM', recipe: R.MINIMAL_PREMIUM, why: 'a friendly should not carry cup gravity' };

    if (campaign.competition.treatment === 'cup-night') {
      return { key: 'CUP_NIGHT', recipe: R.CUP_NIGHT, why: 'FA competition — prestige reads as restraint' };
    }
    // An evening league kick-off is a floodlit game; a Saturday afternoon is not.
    var hh = parseInt(String(campaign.kickoff || '15:00').split(':')[0], 10);
    if (isFinite(hh) && hh >= 18) {
      return { key: 'FLOODLIGHT', recipe: R.FLOODLIGHT, why: 'evening kick-off — under the lights' };
    }
    // With no confirmed opponent palette a collision has nothing to collide
    // with, so fall back to something that carries on Lane colours alone.
    if (!campaign.palette.oppUsable) {
      return { key: 'CINEMATIC_SPLIT', recipe: R.CINEMATIC_SPLIT, why: 'opponent palette unconfirmed — Lane-led treatment' };
    }
    return { key: 'COLOUR_COLLISION', recipe: R.COLOUR_COLLISION, why: 'league fixture, both palettes known' };
  }

  /**
   * Atmosphere spec for a campaign at a given format.
   * Story gets its atmosphere pushed harder — it is viewed full-screen on a
   * phone in a dark room, where a subtle frame simply reads as flat.
   */
  function spec(campaign, fmt, style) {
    var chosen = pick(campaign, style);
    var t = campaign.palette.tokens || {};
    var a = Object.assign({}, chosen.recipe.atmos);

    if (fmt.name === 'Story') {
      a.fog = Math.min(0.5, (a.fog || 0.2) * 1.2);
      a.vignette = Math.min(0.95, (a.vignette || 0.7) + 0.05);
    }
    if (fmt.name === 'X / Landscape') {
      // A wide frame shows more of everything, so the same numbers read heavier.
      a.fog = (a.fog || 0.2) * 0.85;
      a.split = 0.5;
    }
    if (chosen.recipe.layout.muted) a.grain = (a.grain || 0.05) * 1.15;

    return Object.assign(a, {
      w: fmt.w, h: fmt.h, tokens: t,
      homeGlow: t.homeGlow, awayGlow: t.awayGlow, bed: t.bed,
      oppUsable: campaign.palette.oppUsable,
      seedKey: campaign.id + '|' + campaign.state + '|' + fmt.name,
      _recipe: chosen.key, _why: chosen.why
    });
  }

  return { recipes: R, pick: pick, spec: spec, USER_STYLES: USER_STYLES };
});
