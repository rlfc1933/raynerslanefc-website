/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — CREATIVE CAMPAIGN

   ONE FIXTURE, ONE VISUAL IDENTITY, EVERY OUTPUT.

   The old Studio treated each graphic as an isolated template, so Matchday,
   Half Time, Full Time and the programme cover for the SAME game could look
   like four unrelated pieces of design. A campaign fixes the identity once —
   palettes, competition, sponsors, crests, recipe — and every content state
   and every format inherits it. Full Time is the same campaign wearing a
   different emotion, not a new design.

   DETERMINISTIC. Given the same fixture and the same registries this returns
   the same campaign, every time. No randomness anywhere: a graphic the club
   regenerates next week must not quietly change.

   WHAT IT WILL NOT DO.
   It resolves presentation only. It never decides whether a match is playable,
   what the score is, or who is in the team — that authority lives in
   MatchTime, the registry and Match Day Ops, and this file only reads.

   RENDERER BOUNDARY. A campaign is plain data. It knows nothing about
   html2canvas, canvas, SVG or the DOM, so the browser renderer can be replaced
   by a server one without touching the creative model. That separation is the
   whole reason this is a separate file.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CreativeCampaign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** The four social deliverables, each a real composition and never a crop. */
  var FORMATS = {
    story:    { w: 1080, h: 1920, ratio: '9:16',  safeTop: 250, safeBottom: 340, name: 'Story' },
    portrait: { w: 1080, h: 1350, ratio: '4:5',   safeTop: 40,  safeBottom: 40,  name: 'Portrait' },
    square:   { w: 1080, h: 1080, ratio: '1:1',   safeTop: 40,  safeBottom: 40,  name: 'Square' },
    x:        { w: 1600, h: 900,  ratio: '16:9',  safeTop: 32,  safeBottom: 32,  name: 'X / Landscape' }
  };
  /*
     THE STORY SAFE ZONES ARE NOT DECORATION.
     Instagram overlays its own UI across roughly the top 250px and bottom 340px
     of a 1080x1920 story — profile row up top, reply bar and link sticker below.
     Anything factual placed there is partly covered on a real phone. This is the
     single commonest way an otherwise good graphic fails in the wild, so the
     composition treats these as hard bounds for crests, score and copy, and
     lets only atmosphere run underneath them.
  */

  var deps = { brands: null, comps: null, partners: null, palette: null, brand: null, rail: null };

  function configure(o) {
    deps.brands = o.brands || deps.brands;         // data/club-brands.json
    deps.comps = o.comps || deps.comps;            // data/competitions.json
    deps.partners = o.partners || deps.partners;   // data/partners.json
    deps.palette = o.palette || deps.palette;      // BrandPalette
    deps.brand = o.brand || deps.brand;            // CompetitionBrand
    deps.rail = o.rail || deps.rail;               // SponsorRail
    if (deps.palette && deps.brands) deps.palette.setRegistry(deps.brands);
    if (deps.brand && deps.comps) deps.brand.setRegistry(deps.comps.competitions || []);
    return api;
  }

  /** Content states a campaign can wear. */
  var STATES = {
    matchday:  { group: 'match', emotion: 'anticipation' },
    countdown: { group: 'match', emotion: 'anticipation' },
    preseason: { group: 'match', emotion: 'light' },
    lineup:    { group: 'match', emotion: 'tactical' },
    postponed: { group: 'match', emotion: 'urgent' },
    rearranged:{ group: 'match', emotion: 'urgent' },
    kickoff:   { group: 'live',  emotion: 'energy' },
    goal:      { group: 'live',  emotion: 'peak' },
    halftime:  { group: 'live',  emotion: 'neutral' },
    fulltime:  { group: 'live',  emotion: 'result' },
    motm:      { group: 'player', emotion: 'feature' }
  };

  function esc(s) { return String(s == null ? '' : s); }

  /** A stable id for the fixture, so a campaign can be found again. */
  function campaignId(fx) {
    var d = esc(fx.date).replace(/-/g, '');
    var o = esc(fx.opponent).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'c-' + d + '-' + o;
  }

  /**
   * Which way a finished match went, from OUR point of view.
   * Returns null when there is no score — never a guess, and never a draw
   * inferred from two nulls, which is a mistake this codebase has made before.
   */
  function outcome(fx) {
    if (!fx || fx.us == null || fx.them == null) return null;
    if (!isFinite(Number(fx.us)) || !isFinite(Number(fx.them))) return null;
    return fx.us > fx.them ? 'win' : (fx.us === fx.them ? 'draw' : 'loss');
  }

  /**
   * Build the campaign.
   *
   * `state` is the content state being produced. The campaign identity does not
   * change with it — only the emotion and the recipe do.
   */
  function build(fx, state, opts) {
    if (!fx) return null;
    var o = opts || {};
    state = STATES[state] ? state : 'matchday';

    var isHome = fx.isHome !== false;
    var ident = deps.brand
      ? deps.brand.identity(fx)
      : { id: fx.competitionId || '', label: fx.competition || '', round: '', logo: null, known: false };

    var comp = (deps.comps && (deps.comps.competitions || []).filter(function (c) { return c.id === ident.id; })[0]) || null;

    var lane = deps.palette ? deps.palette.resolve('rayners-lane') : null;
    var opp = deps.palette ? deps.palette.resolve(fx.opponent) : null;
    var tokens = deps.palette ? deps.palette.tokens(lane, opp, { bg: '#080808' }) : {};

    // Sponsor context is KIT-based, not venue-based — the existing rail's rule,
    // and the reason an away game still carries the away shirt sponsor.
    var ctx = isHome ? 'home' : 'away';
    var presenterId = deps.partners && deps.partners.presents ? deps.partners.presents[ctx] : null;
    var presenter = presenterId && deps.partners.sponsors ? deps.partners.sponsors[presenterId] : null;
    var railIds = (deps.partners && deps.partners.contexts && deps.partners.contexts[ctx]) || [];
    // The presenter has its own prominent slot, so it is dropped from the
    // secondary rail rather than printed twice at two different sizes.
    var rail = railIds.filter(function (id) { return id !== presenterId; })
      .map(function (id) { return Object.assign({ id: id }, (deps.partners.sponsors || {})[id]); })
      .filter(function (s) { return s.colour || s.white; });

    var res = outcome(fx);
    var status = String(fx.status || 'scheduled').toLowerCase();

    return {
      id: campaignId(fx),
      fixtureId: fx.id || null,
      state: state,
      group: STATES[state].group,
      emotion: state === 'fulltime' && res ? res : STATES[state].emotion,

      home: { name: isHome ? 'Rayners Lane' : fx.opponent, crest: isHome ? 'img/badge.png' : (fx.oppCrest || (opp && opp.crest)) },
      away: { name: isHome ? fx.opponent : 'Rayners Lane', crest: isHome ? (fx.oppCrest || (opp && opp.crest)) : 'img/badge.png' },
      opponent: fx.opponent,
      isHome: isHome,

      competition: {
        id: ident.id, label: ident.label, round: ident.round,
        logo: ident.logo || (comp && comp.logo) || null,
        logoRequired: !!(comp && comp.logoStatus === 'official-artwork-required'),
        sponsorLogo: (comp && comp.sponsorLogo) || null,
        sponsorName: (comp && comp.sponsorName) || null,
        treatment: (comp && comp.creativeTreatment) || 'league',
        known: ident.known
      },

      date: fx.date || '', kickoff: fx.kickoff || '', venue: fx.venue || '',
      status: status, postponedReason: fx.postponedReason || '', rearrangedDate: fx.rearrangedDate || null,
      score: res ? { us: fx.us, them: fx.them } : null,
      outcome: res,

      palette: { lane: lane, opponent: opp, tokens: tokens, oppUsable: !!(opp && opp.usable) },
      sponsors: { presenter: presenter ? Object.assign({ id: presenterId }, presenter) : null, rail: rail, context: ctx },

      photo: o.photo || null,
      headline: o.headline || null,
      strapline: o.strapline || null,
      styleOverride: o.style || 'auto',

      // A snapshot, so re-exporting an old campaign after a brand change still
      // produces the artwork that was originally approved.
      snapshot: {
        takenAt: o.now || null,
        lanePalette: lane ? { primary: lane.primary, secondary: lane.secondary, accent: lane.accent } : null,
        oppPalette: opp && opp.usable ? { primary: opp.primary, secondary: opp.secondary, accent: opp.accent } : null
      }
    };
  }

  function format(name) { return FORMATS[name] || FORMATS.square; }

  /* ── RENDERER BOUNDARY ──────────────────────────────────────────────────
     A renderer takes (campaign, format) and produces something. The browser
     one builds DOM+SVG and rasterises with html2canvas; a future server one
     could emit SVG directly. Campaign code must never reference either. */
  var renderers = {};
  function registerRenderer(name, impl) { renderers[name] = impl; return api; }
  function renderer(name) { return renderers[name] || renderers.browser || null; }

  var api = {
    configure: configure, build: build, format: format, formats: FORMATS,
    states: STATES, campaignId: campaignId, outcome: outcome,
    registerRenderer: registerRenderer, renderer: renderer
  };
  return api;
});
