/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — football data (public client)

   One reader for the club's own football registry. Every surface that needs a
   fixture, a result, recent form or the league table asks this, and asks it the
   same way.

   Before this, the homepage, the fixtures page and the programme each worked
   the same facts out for themselves from different sources — which is how the
   site ended up offering the match it had just played as the next fixture, and
   how the league-position tile came to read a variable nothing ever set.

   Talks only to raynerslanefc.co.uk. No browser has ever called the data
   provider and none will.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ENDPOINT = '/.netlify/functions/football-data';
  var cache = {};

  function get(what, maxAgeMs) {
    var key = what || 'summary';
    var hit = cache[key];
    if (hit && (Date.now() - hit.at) < (maxAgeMs || 60000)) return Promise.resolve(hit.data);
    var opt = {};
    if (global.AbortSignal && AbortSignal.timeout) opt.signal = AbortSignal.timeout(8000);
    return fetch(ENDPOINT + '?what=' + encodeURIComponent(key), opt)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        // A failed read must never look like "no fixtures". Callers get null and
        // keep whatever they already had.
        if (!d || d.ok !== true) return null;
        cache[key] = { at: Date.now(), data: d };
        return d;
      })
      .catch(function () { return null; });
  }

  global.RLFCFootball = {
    summary: function () { return get('summary', 30000); },
    fixtures: function () { return get('fixtures', 300000); },
    results: function () { return get('results', 60000); },
    table: function () { return get('table', 300000); },
    /** Clear the cache — used after a staff action that changes data. */
    refresh: function () { cache = {}; },
  };
})(window);
