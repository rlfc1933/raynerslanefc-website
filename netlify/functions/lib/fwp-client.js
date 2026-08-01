// Talking to Football Web Pages — the only file in the repo that makes a
// network call to them.
//
// Uses the provider's OWN refresh protocol rather than re-fetching whole pages.
// Their client (www.footballwebpages.co.uk/js/refresh.min.js) polls the same
// URL with a `loaded` cursor every CHECKFORREFRESHEVERYSECS = 30 seconds; an
// unchanged poll comes back 204 with no body, and a changed one returns JSON
// carrying an HTML fragment plus a new cursor in the `fwp-last-loaded` header.
//
// We poll at their cadence, through the /embed/ path that is published for club
// websites and which our own import-fixtures.js has used in production since
// July. That is a deliberate choice: no heavier than a supporter with the page
// open, and no Cloudflare challenge on that path.
//
// PERMISSION: continuous production polling is gated behind FWP_SYNC_ENABLED,
// which is OFF unless Football Web Pages have confirmed this is acceptable.
// See isEnabled() and the release notes.

'use strict';

const EMBED_ORIGIN = 'https://www.footballwebpages.co.uk';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://raynerslanefc.co.uk';
const TEAM_SLUG = process.env.FWP_TEAM_SLUG || 'rayners-lane';
// A DOM handle in the provider's own embed loader, not a credential — their
// embed.js generates it client-side per widget. Fixed here so our requests are
// consistent and identifiable.
const EMBED_ID = '00000000-0000-4000-8000-000000000000';
const UA = 'RaynersLaneFC/1.0 (+https://raynerslanefc.co.uk; club website live scoreboard)';
const TIMEOUT_MS = 12000;

/** The permission gate. Off unless explicitly switched on. */
function isEnabled() {
  return String(process.env.FWP_SYNC_ENABLED || '').toLowerCase() === 'true';
}

function embedUrl(path, params) {
  const q = Object.assign({
    id: EMBED_ID,
    origin: SITE_ORIGIN,
    width: '0',
  }, params || {});
  const qs = Object.keys(q)
    .filter((k) => q[k] !== null && q[k] !== undefined && q[k] !== '')
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(q[k]))
    .join('&');
  return EMBED_ORIGIN + '/embed/' + String(path).replace(/^\/+/, '') + '?' + qs;
}

function headers() {
  return {
    // The provider's embed is designed to be rendered from a club site; sending
    // our real Referer and a self-identifying UA is the honest thing to do and
    // makes the traffic attributable if they ever ask who is calling.
    Referer: SITE_ORIGIN + '/',
    'User-Agent': UA,
    Accept: 'application/json, text/html;q=0.9',
  };
}

async function request(url) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    return { ok: false, status: 0, outcome: 'error', error: String(e && e.message || e), durationMs: Date.now() - started };
  }
  const durationMs = Date.now() - started;
  // 204 is the provider saying "nothing has changed". It is a SUCCESS, and
  // treating it as a failure would flip a perfectly healthy sync to 'failing'
  // during every quiet spell in a match.
  if (res.status === 204) {
    return { ok: true, status: 204, outcome: 'no_change', durationMs, cursor: cursorOf(res) };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, outcome: 'error', error: 'HTTP ' + res.status, durationMs };
  }
  const ctype = res.headers.get('content-type') || '';
  const body = await res.text();
  // A Cloudflare interstitial returns 200 with an HTML challenge page. It must
  // never be handed to the parser as if it were a match.
  if (/Just a moment|challenge-platform|cf_chl/i.test(body.slice(0, 2000))) {
    return { ok: false, status: res.status, outcome: 'blocked', error: 'provider returned a bot challenge', durationMs };
  }
  return {
    ok: true, status: res.status, outcome: 'changed', durationMs,
    contentType: ctype, body, cursor: cursorOf(res),
  };
}

function cursorOf(res) {
  return res.headers.get('fwp-last-loaded') || null;
}

/**
 * Poll one match. `cursor` is whatever the last successful call returned.
 * Returns { outcome: 'no_change' } far more often than anything else — that is
 * the design working, not a problem.
 */
async function fetchMatch(matchPath, cursor) {
  const params = { from: 'embed', time: String(Date.now()) };
  if (cursor) params.loaded = cursor;
  const r = await request(embedUrl(matchPath, params));
  if (!r.ok || r.outcome === 'no_change') return r;

  // With a cursor the provider answers JSON {type:'refresh', match:'<html>'};
  // without one it answers the whole embed page. Accept both so a first poll
  // and a delta poll go down the same path.
  let html = r.body;
  if (/json/i.test(r.contentType || '') || /^\s*\{/.test(r.body)) {
    try {
      const j = JSON.parse(r.body);
      html = j.match || j.fixturesResults || '';
      if (!html) return { ok: true, status: r.status, outcome: 'no_change', durationMs: r.durationMs, cursor: r.cursor };
    } catch (e) {
      return { ok: false, status: r.status, outcome: 'error', error: 'unreadable JSON from provider', durationMs: r.durationMs };
    }
  }
  return { ok: true, status: r.status, outcome: 'changed', html, cursor: r.cursor, durationMs: r.durationMs };
}

/** The club's fixture list — used to discover and confirm FWP fixture IDs. */
async function fetchFixtureList() {
  return request(embedUrl(TEAM_SLUG + '/fixtures-results', {}));
}

/**
 * Build the provider's match path from the pieces our fixtures already hold.
 * Our fixture ids are literally 'fwp-578225', so the external id is in hand;
 * the rest of the path is descriptive and the provider resolves on the id.
 */
function matchPath(parts) {
  return [
    'match', parts.season, parts.competitionSlug,
    parts.homeSlug, parts.awaySlug, parts.externalFixtureId,
  ].join('/');
}

function slug(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

module.exports = {
  isEnabled, embedUrl, request, fetchMatch, fetchFixtureList, matchPath, slug,
  EMBED_ORIGIN, TEAM_SLUG, TIMEOUT_MS,
};
