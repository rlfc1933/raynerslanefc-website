// FOOTBALL WEB PAGES — the OFFICIAL API adapter (v2), server-side only.
//
// STATUS: BUILT, NOT CONNECTED. The club does not yet hold an API key. Until
// FWP_API_KEY is set in the Netlify environment every call returns
// { ok:false, degraded:true } and the programme reads the club's existing
// football registry instead. Nothing here has been run against the live API,
// and nothing claims it has.
//
// Documented at https://www.footballwebpages.co.uk/api (read 9 Oct 2026):
//   base     https://api.footballwebpages.co.uk/v2/<endpoint>.json
//   auth     header  FWP-API-Key: <key>
//   limit    ten requests per minute
//   terms    free to non-league clubs for their official/public WEBSITE.
//            Print/download use is not addressed — ask FWP before API-derived
//            data goes into a printed or downloadable programme.
//
// Only the documented endpoints and parameters are accepted below. There is
// no news endpoint and none is invented. Response FIELD names are not
// published in the documentation, so this adapter stores raw snapshots and
// does not guess a schema: normalisation is written against a real response
// once the key arrives (see the programme-football-data skill).
//
// The key never leaves this module: it is not logged, not echoed in errors,
// not returned to a caller, and never reaches a browser.
'use strict';

var BASE = 'https://api.footballwebpages.co.uk/v2/';

// endpoint → allowed query parameters (exact names from the documentation)
var ENDPOINTS = {
  'fixtures-results': ['comp', 'round', 'team'],
  'match': ['match'],
  'teams': ['comp'],
  'team': ['team'],
  'league-table': ['comp', 'team', 'sort'],
  'form-guide': ['comp', 'team', 'count', 'type'],
  'goalscorers': ['comp', 'team', 'page'],
  'appearances': ['comp', 'team', 'page'],
  'attendances': ['comp', 'team', 'sort', 'type'],
  'competitions': ['include'],
  'rounds': ['comp'],
  'vidiprinter': ['comp', 'team', 'date'],
  'league-progress': ['team'],
};
var REQUIRED = {
  'match': [['match']], 'team': [['team']], 'league-progress': [['team']],
  'fixtures-results': [['comp', 'team']], 'league-table': [['comp', 'team']], 'form-guide': [['comp', 'team']],
  'goalscorers': [['comp', 'team']], 'appearances': [['comp', 'team']], 'attendances': [['comp', 'team']],
  'vidiprinter': [['comp', 'team']],
};

var PER_MINUTE = Number(process.env.FWP_API_PER_MINUTE || 10);

/** An in-process sliding window. The DB budget below is the shared one. */
function memoryBudget(limit) {
  var stamps = [];
  return {
    take: function (nowMs) {
      var now = nowMs == null ? Date.now() : nowMs;
      stamps = stamps.filter(function (t) { return now - t < 60000; });
      if (stamps.length >= limit) return Promise.resolve({ ok: false, waitMs: 60000 - (now - stamps[0]) });
      stamps.push(now);
      return Promise.resolve({ ok: true });
    },
    record: function () { return Promise.resolve(); },
  };
}

/**
 * The SHARED budget: every scheduled job and button press counts against the
 * same ten-per-minute allowance, recorded in programme_provider_requests.
 * @param store lib/football/store (rest)
 */
function dbBudget(store, limit) {
  var local = memoryBudget(limit);
  return {
    take: function (nowMs) {
      var now = nowMs == null ? Date.now() : nowMs;
      var since = new Date(now - 60000).toISOString();
      return store.rest('programme_provider_requests?provider=eq.fwp_api&requested_at=gte.' +
        encodeURIComponent(since) + '&select=id').then(function (rows) {
        if ((rows || []).length >= limit) return { ok: false, waitMs: 60000 };
        return local.take(now);
      }).catch(function () { return local.take(now); });
    },
    record: function (endpoint, status, ok) {
      return store.rest('programme_provider_requests', { method: 'POST',
        body: [{ provider: 'fwp_api', endpoint: endpoint, status: status, ok: ok }],
        headers: { Prefer: 'return=minimal' } }).catch(function () { return null; });
    },
  };
}

function validate(endpoint, params) {
  var allowed = ENDPOINTS[endpoint];
  if (!allowed) return 'undocumented endpoint: ' + endpoint;
  var keys = Object.keys(params || {});
  for (var i = 0; i < keys.length; i++) {
    if (allowed.indexOf(keys[i]) === -1) return 'undocumented parameter for ' + endpoint + ': ' + keys[i];
  }
  var need = REQUIRED[endpoint] || [];
  for (var j = 0; j < need.length; j++) {
    if (!need[j].some(function (k) { return params && params[k] != null && params[k] !== ''; })) {
      return endpoint + ' needs one of: ' + need[j].join(', ');
    }
  }
  return null;
}

/**
 * @param opts { key, fetchImpl, budget, sleep, cacheMs, now }
 */
function createClient(opts) {
  var o = opts || {};
  var key = o.key === undefined ? process.env.FWP_API_KEY : o.key;
  var doFetch = o.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  var budget = o.budget || memoryBudget(PER_MINUTE);
  var sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var cacheMs = o.cacheMs == null ? 60000 : o.cacheMs;
  var cache = {};
  var lastGood = {};

  function redact(s) { return key ? String(s).split(key).join('[redacted]') : String(s); }

  async function get(endpoint, params) {
    var bad = validate(endpoint, params);
    if (bad) return { ok: false, error: bad };
    if (!key) {
      return { ok: false, degraded: true, source: 'registry',
        error: 'FWP_API_KEY is not set — using the club football registry' };
    }
    var qs = Object.keys(params || {}).sort().map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var url = BASE + endpoint + '.json' + (qs ? '?' + qs : '');
    var now = o.now ? o.now() : Date.now();
    var hit = cache[url];
    if (hit && now - hit.at < cacheMs) return { ok: true, data: hit.data, cached: true, fetchedAt: hit.fetchedAt };

    var attempt = 0, lastErr = null;
    while (attempt < 3) {
      attempt++;
      var slot = await budget.take(now);
      if (!slot.ok) {
        return { ok: false, rateLimited: true, retryAfterMs: slot.waitMs,
          error: 'provider budget of ' + PER_MINUTE + ' requests/minute reached',
          lastKnown: lastGood[url] || null };
      }
      try {
        var res = await doFetch(url, { headers: { 'FWP-API-Key': key, Accept: 'application/json' },
          signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined });
        await budget.record(endpoint, res.status, res.ok);
        if (res.status === 429 || res.status >= 500) {
          lastErr = 'HTTP ' + res.status;
          if (attempt < 3) { await sleep(500 * Math.pow(2, attempt)); continue; }
          break;
        }
        if (!res.ok) {
          // 401/403/404 are not transient — retrying would only spend budget.
          return { ok: false, status: res.status, error: 'HTTP ' + res.status, lastKnown: lastGood[url] || null };
        }
        var data = await res.json();
        var fetchedAt = new Date(o.now ? o.now() : Date.now()).toISOString();
        cache[url] = { at: now, data: data, fetchedAt: fetchedAt };
        lastGood[url] = { data: data, fetchedAt: fetchedAt };
        return { ok: true, data: data, fetchedAt: fetchedAt };
      } catch (e) {
        lastErr = redact(e && e.message || e);
        await budget.record(endpoint, 0, false);
        if (attempt < 3) { await sleep(500 * Math.pow(2, attempt)); continue; }
      }
    }
    // Preserve the last known valid data rather than blanking the programme.
    return { ok: false, error: redact(lastErr || 'unavailable'), transient: true, lastKnown: lastGood[url] || null };
  }

  return {
    configured: function () { return !!key; },
    get: get,
    fixturesResults: function (p) { return get('fixtures-results', p); },
    match: function (id) { return get('match', { match: id }); },
    leagueTable: function (p) { return get('league-table', p); },
    formGuide: function (p) { return get('form-guide', p); },
    teams: function (comp) { return get('teams', { comp: comp }); },
    competitions: function (include) { return get('competitions', include ? { include: include } : {}); },
    /**
     * Find Rayners Lane's FWP team id from a competition's team list. Never
     * guessed from a URL slug. Returns candidates for a person to confirm.
     */
    discoverTeamId: async function (comp) {
      var r = await get('teams', { comp: comp });
      if (!r.ok) return r;
      var list = JSON.stringify(r.data);
      return { ok: true, raw: r.data, mentionsRaynersLane: /rayners\s*lane/i.test(list),
        note: 'Confirm the id by eye against the raw response; the schema is not documented.' };
    },
  };
}

/**
 * The programme's football-data source: the official API when configured,
 * otherwise (and on any failure) the club registry. Callers learn which one
 * answered, so the programme can say where its data came from.
 */
function source(opts) {
  var api = opts.api || createClient({});
  var registry = opts.registry;   // async () => registry value
  return {
    usingApi: api.configured(),
    fetch: async function (endpoint, params) {
      if (api.configured()) {
        var r = await api.get(endpoint, params);
        if (r.ok) return { ok: true, source: 'fwp_api', data: r.data, fetchedAt: r.fetchedAt };
        var fallback = registry ? await registry() : null;
        return { ok: !!fallback, source: 'registry', data: fallback, apiError: r.error, degraded: true };
      }
      var d = registry ? await registry() : null;
      return { ok: !!d, source: 'registry', data: d, degraded: true, apiError: 'FWP_API_KEY is not set' };
    },
  };
}

module.exports = { BASE: BASE, ENDPOINTS: ENDPOINTS, validate: validate, createClient: createClient,
  memoryBudget: memoryBudget, dbBudget: dbBudget, source: source, PER_MINUTE: PER_MINUTE };
