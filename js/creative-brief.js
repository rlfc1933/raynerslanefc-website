/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — ART DIRECTION BRIEF

   THE LAYER THAT THINKS BEFORE IT GENERATES.

   A prompt written by hand is a wish. A prompt derived from the fixture is a
   brief. This file turns a campaign into a structured art-direction brief —
   mood, focal point, light direction, colour weighting, motifs, negative space,
   prohibitions — and only then renders that brief into provider text.

   The intermediate object matters more than the string. It can be inspected,
   diffed, tested and shown to a human before a single credit is spent, and the
   same brief can drive a different provider later without rewriting prose.

   TWO RULES THAT ARE NOT NEGOTIABLE.

   1. NO TEXT, NO MARKS, NO CRESTS in a generated plate. Every prompt carries an
      explicit prohibition list. Generated typography is misspelt, generated
      badges are fiction, and both would be published under the club's name.
      Crests, sponsors, competition marks, scores and dates are deterministic
      overlays and always will be.

   2. NEGATIVE SPACE IS SPECIFIED, NOT HOPED FOR. A beautiful plate with its
      subject dead centre is useless once the lockup lands on it. Each format
      states where the image must stay quiet, in plain language the model can
      act on, because that is the difference between art and a background.

   And a third that is about honesty rather than craft: the brief never claims
   the image is Tithe Farm. Unless a real approved photograph of the ground is
   supplied as a reference, the prompt asks for a generic English non-league
   ground. Inventing a club's own stadium and captioning it as home is a lie a
   supporter would spot immediately.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CreativeBrief = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Never generated, always overlaid. Stated to the model every single time. */
  var PROHIBITED = [
    'text', 'letters', 'words', 'numbers', 'typography', 'captions', 'watermarks',
    'logos', 'badges', 'crests', 'emblems', 'club insignia', 'sponsor marks',
    'trophies', 'scoreboards', 'shirt numbers', 'readable signage',
    // Aesthetic prohibitions — the failure modes that make football look fake.
    'esports styling', 'neon cyberpunk', 'fantasy architecture', 'superhero energy effects',
    'fire', 'lightning', 'video game splash screen', 'American football imagery',
    'baseball imagery', 'giant modern megastadium', 'CGI plastic look', 'oversaturated HDR'
  ];

  /** Where each format must stay visually quiet so the overlay can land. */
  var NEGATIVE_SPACE = {
    square: 'Keep the upper fifth and the lower third visually calm and uncluttered — ' +
      'these carry headline type and a sponsor strip. Keep the horizontal band across the ' +
      'middle relatively open on the left, centre and right, where three separate marks sit.',
    story: 'Vertical 9:16. Keep the top 20 percent and the bottom 25 percent very quiet and ' +
      'dark — they carry type and a sponsor strip and are partly covered by app interface. ' +
      'Concentrate the visual interest in the middle band, and keep its left, centre and ' +
      'right thirds open enough for three marks to sit clearly.',
    x: 'Wide 16:9. Keep the left third comparatively open for a headline block, and keep a ' +
      'clear horizontal channel through the vertical middle where a row of marks will sit. ' +
      'Push the strongest visual interest to the upper right and into the depth of the frame.',
    portrait: 'Vertical 4:5. Keep the top sixth and the bottom quarter calm. Hold the middle ' +
      'band open across its full width for a three-part lockup.'
  };

  /** Per-recipe direction: mood, light, energy, environment. */
  var DIRECTION = {
    CUP_NIGHT: {
      mood: 'prestige, knockout tension, hushed anticipation',
      energy: 'restrained and heavy',
      light: 'a single hard floodlight source high and slightly left, deep falloff into black',
      texture: 'fine photographic grain, damp air',
      motifs: ['floodlight pylon silhouette against a dark sky', 'drifting haze across the beam',
        'wet cut grass catching the light', 'empty terrace rail in deep shadow'],
      homeWeight: 0.62, oppWeight: 0.38
    },
    COLOUR_COLLISION: {
      mood: 'two clubs meeting, confident and direct',
      energy: 'charged but controlled',
      light: 'two opposing light sources raking in from either edge, meeting in a dark centre',
      texture: 'photographic grain, atmospheric haze',
      motifs: ['floodlit pitch surface', 'low drifting smoke', 'blurred supporter silhouettes at the far edge'],
      homeWeight: 0.6, oppWeight: 0.4
    },
    FLOODLIGHT: {
      mood: 'a midweek evening under the lights',
      energy: 'atmospheric, everyday, real',
      light: 'floodlight glare from high left, long shadows, cold night air',
      texture: 'heavy grain, moisture in the beam',
      motifs: ['four-lamp floodlight pylon', 'breath and haze in cold light',
        'worn grass in the goalmouth', 'dark treeline behind the ground'],
      homeWeight: 0.7, oppWeight: 0.3
    },
    VICTORY: {
      mood: 'earned, warm, celebratory but not triumphalist',
      energy: 'bright and open',
      light: 'warm low sun or floodlight bloom breaking through from the left',
      texture: 'lifted grain, soft bloom',
      motifs: ['light breaking across the pitch', 'dust and haze catching the sun'],
      homeWeight: 0.8, oppWeight: 0.2
    },
    DEFEAT: {
      mood: 'sober, documentary, quiet',
      energy: 'still and low',
      light: 'flat overcast or dying floodlight, almost no highlight',
      texture: 'coarse grain, desaturated',
      motifs: ['empty pitch after a match', 'rain on grass', 'grey overcast sky'],
      homeWeight: 0.5, oppWeight: 0.2
    },
    DRAW_EDITORIAL: {
      mood: 'even, factual, editorial',
      energy: 'level',
      light: 'balanced side light from both edges',
      texture: 'clean grain',
      motifs: ['centre circle in low light', 'still evening air'],
      homeWeight: 0.55, oppWeight: 0.45
    },
    URGENT_UPDATE: {
      mood: 'bleak, abandoned, unambiguous',
      energy: 'empty and still',
      light: 'weak floodlight in poor weather, heavy overcast',
      texture: 'wet, cold, high grain',
      motifs: ['waterlogged pitch with standing water', 'rain falling through a floodlight beam',
        'empty ground', 'goalmouth churned and unplayable'],
      homeWeight: 0.55, oppWeight: 0.15
    },
    EDITORIAL: {
      mood: 'considered, magazine, informational',
      energy: 'calm',
      light: 'even directional light, gentle falloff',
      texture: 'paper grain, print halftone feel',
      motifs: ['clean pitch geometry', 'shallow depth'],
      homeWeight: 0.6, oppWeight: 0.3
    },
    MINIMAL_PREMIUM: {
      mood: 'quiet, premium, understated',
      energy: 'low',
      light: 'one soft source, generous shadow',
      texture: 'very fine grain',
      motifs: ['near-abstract grass texture in shadow'],
      homeWeight: 0.7, oppWeight: 0.2
    },
    PLAYER_FEATURE: {
      mood: 'player-led editorial, premium announcement',
      energy: 'poised',
      light: 'studio-style rim light from the left against a dark ground',
      texture: 'fine grain, subtle vignette',
      motifs: ['dark tunnel depth', 'shaft of light from an opening'],
      homeWeight: 0.75, oppWeight: 0.1
    },
    CINEMATIC_SPLIT: {
      mood: 'two sides of a fixture, cinematic',
      energy: 'building',
      light: 'strong key from the left, cooler counter-light from the right',
      texture: 'photographic grain, haze',
      motifs: ['floodlit pitch at dusk', 'smoke drifting across the frame'],
      homeWeight: 0.68, oppWeight: 0.32
    },
    CLUB_STORY: {
      mood: 'grounded, community, local',
      energy: 'warm',
      light: 'late afternoon side light',
      texture: 'documentary grain',
      motifs: ['a small ground with a low stand', 'grass and touchline detail'],
      homeWeight: 0.8, oppWeight: 0.05
    }
  };

  function colourWords(pal) {
    if (!pal || !pal.usable) return null;
    return { primary: pal.primary, secondary: pal.secondary };
  }

  /**
   * Build the structured brief. Pure data — inspectable before anything is spent.
   */
  function build(campaign, recipeKey, formatName, opts) {
    var o = opts || {};
    var d = DIRECTION[recipeKey] || DIRECTION.CINEMATIC_SPLIT;
    var lane = campaign.palette.lane;
    var opp = colourWords(campaign.palette.opponent);
    var fmt = String(formatName || 'square').toLowerCase().replace(/[^a-z]/g, '');
    if (fmt === 'xlandscape') fmt = 'x';

    return {
      campaignId: campaign.id,
      recipe: recipeKey,
      format: fmt,
      mood: d.mood,
      energy: d.energy,
      focalPoint: fmt === 'x' ? 'upper right, with depth' : 'the middle band of the frame',
      lightDirection: d.light,
      texture: d.texture,
      homeColour: { hex: lane.primary, secondary: lane.secondary, weight: d.homeWeight },
      opponentColour: opp ? { hex: opp.primary, secondary: opp.secondary, weight: d.oppWeight } : null,
      environmentalMotifs: d.motifs,
      composition: 'wide establishing atmosphere, strong foreground-to-background separation',
      negativeSpace: NEGATIVE_SPACE[fmt] || NEGATIVE_SPACE.square,
      // Only ever true when a real approved photograph is supplied as reference.
      groundIsReal: !!o.groundReference,
      prohibited: PROHIBITED.slice()
    };
  }

  /** Colour phrasing that describes light, not paint. */
  function lightPhrase(brief) {
    var parts = [];
    parts.push('Dominant colour temperature comes from a ' + brief.homeColour.hex +
      ' yellow-gold light source and a deep forest green ' + brief.homeColour.secondary + ' ambient shadow');
    if (brief.opponentColour) {
      parts.push('with a secondary counter-light in ' + brief.opponentColour.hex +
        ' and ' + brief.opponentColour.secondary + ' entering from the opposite edge, clearly weaker than the main light');
    }
    return parts.join(', ') + '.';
  }

  /**
   * Render the brief as provider prompt text.
   *
   * Deliberately describes a PHOTOGRAPH, not a poster. Asking for a "poster
   * background" invites the model to add its own composition, borders and —
   * worst of all — its own lettering. Asking for a photograph taken at a
   * football ground gives a plate the deterministic layer can own.
   */
  function toPrompt(brief) {
    var lines = [];
    lines.push('A cinematic photographic plate of an English non-league football ground. ' +
      'No people in the foreground, no subject in sharp close-up — this is an environment, an atmosphere.');
    lines.push('Mood: ' + brief.mood + '. Energy: ' + brief.energy + '.');
    lines.push('Lighting: ' + brief.lightDirection + '. ' + lightPhrase(brief));
    lines.push('Include: ' + brief.environmentalMotifs.join('; ') + '.');
    lines.push('Texture: ' + brief.texture + '. Shot on a full-frame camera with a fast prime, ' +
      'shallow depth in the background, natural imperfection, documentary realism.');
    lines.push('Composition: ' + brief.composition + '. ' + brief.negativeSpace);
    if (!brief.groundIsReal) {
      lines.push('A modest, authentic English non-league ground — low stands, a rail, a treeline. ' +
        'Not a large modern stadium.');
    }
    lines.push('ABSOLUTELY NO ' + brief.prohibited.join(', ') + '.');
    return lines.join(' ');
  }

  return { build: build, toPrompt: toPrompt, DIRECTION: DIRECTION, PROHIBITED: PROHIBITED, NEGATIVE_SPACE: NEGATIVE_SPACE };
});
