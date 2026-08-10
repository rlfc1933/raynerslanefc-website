/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — GENERATED CAMPAIGN PLATES

   THE ARTWORK THE CLUB PAID FOR, ACTUALLY REACHING THE PRODUCT.

   Four real photographic plates were generated for the New Bradwell FA Vase
   campaign and stored under img/creative/. They were then consumed by exactly
   two dev pages and nothing else: no Studio, no programme, no fixture page.
   Every user-facing surface drew the procedural SVG instead, which is the
   fallback, not the intent. This module is the missing lookup.

   WHAT IT IS. campaign id + format → the locked plate for that campaign, or
   null. That is all. It resolves nothing about design and decides nothing
   about football.

   LOCKED MEANS A HUMAN CHOSE IT. A generated candidate is a suggestion in
   exactly the way an unconfirmed club colour is a suggestion — it does not
   reach artwork until someone picks it. An unlocked campaign returns null and
   the procedural plate carries the frame, which still looks deliberate.

   MOST FIXTURES HAVE NO PLATE, AND THAT IS FINE. Premium campaign art is for
   the matches worth it — cup ties, derbies, big home games. This must never
   pretend a plate exists, because a broken image behind a matchday graphic is
   worse than no photograph at all.

   FORMATS THAT WERE NEVER GENERATED derive from one that was, so a fixture
   shows the same environment in every format rather than two different
   worlds — and the club is not billed twice for one campaign.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CreativePlates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var cache = null;      // the parsed manifest
  var BASE = '';

  function setAssetBase(b) { BASE = b ? String(b).replace(/\/?$/, '/') : ''; }
  function setCache(data) { cache = data || null; return cache; }

  function load(url) {
    if (cache) return Promise.resolve(cache);
    return fetch(url || 'data/creative-cache.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return setCache(d); })
      .catch(function () { return null; });
  }

  function campaign(id) {
    if (!cache || !cache.campaigns || !id) return null;
    return cache.campaigns[id] || null;
  }

  /**
   * The locked plate for a campaign and format.
   * Returns { file, id, format, derivedFrom, model, note } or null.
   */
  function resolve(campaignId, format) {
    var c = campaign(campaignId);
    if (!c || !c.locked) return null;
    var fmt = format || 'square';

    // A format may be generated in its own right, or derive from one that was.
    var derivedFrom = null;
    if (!c.locked[fmt]) {
      var d = (c.derives || {})[fmt];
      if (!d || !c.locked[d]) return null;
      derivedFrom = fmt;
      fmt = d;
    }

    var wantId = c.locked[fmt];
    var list = (c.candidates && c.candidates[fmt]) || [];
    var hit = list.filter(function (x) { return x.id === wantId; })[0];
    if (!hit || !hit.file) return null;

    return {
      file: BASE + hit.file,
      id: hit.id,
      format: fmt,
      derivedFrom: derivedFrom,
      model: hit.model || '',
      note: hit.note || '',
      recipe: c.recipe || ''
    };
  }

  /** Does this campaign have any locked photography at all? */
  function has(campaignId) {
    var c = campaign(campaignId);
    return !!(c && c.locked && (c.locked.square || c.locked.story));
  }

  /** Every candidate for a format, so staff can change the selection. */
  function candidates(campaignId, format) {
    var c = campaign(campaignId);
    if (!c) return [];
    return ((c.candidates || {})[format || 'square'] || []).map(function (x) {
      return {
        id: x.id, file: BASE + x.file, model: x.model || '', note: x.note || '',
        locked: !!(c.locked && c.locked[format || 'square'] === x.id)
      };
    });
  }

  return {
    load: load, setCache: setCache, setAssetBase: setAssetBase,
    resolve: resolve, has: has, candidates: candidates, campaign: campaign,
    get raw() { return cache; }
  };
});
