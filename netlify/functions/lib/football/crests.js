// The club's crest library, server side.
//
// The browser has js/crest.js. This is its twin, for the two jobs a browser
// cannot do: populating football_teams.crest_asset_path, and baking a crest
// into a programme snapshot at the moment it is published.
//
// That second one matters more than it looks. A programme version is immutable
// — it is what the club published, preserved. If the cover resolved its crests
// at READ time, an archived 2026 programme would silently start showing a club's
// 2031 badge. The artwork has to be captured with the edition.
//
// WHY THIS FILE EXISTS AT ALL: the registry declared crest_asset_path with the
// comment "OUR artwork, from data/crests.json" and then nothing ever wrote it.
// The column was null for all 22 clubs from the day it was created.
'use strict';

const N = require('../fwp/normalise');

const SITE = process.env.SITE_ORIGIN || 'https://raynerslanefc.co.uk';
const RAW = 'https://raw.githubusercontent.com/rlfc1933/raynerslanefc-website/main/data/crests.json';

let cache = null;
let cachedAt = 0;
const TTL = 10 * 60 * 1000;

/**
 * The library, as { clubKey: filePath }.
 *
 * Read from the club's own published data. Two sources, because the function
 * bundle does not include data/ and a single origin having a bad minute should
 * not blank every crest in the registry.
 */
async function library() {
  if (cache && (Date.now() - cachedAt) < TTL) return cache;
  const urls = [RAW, SITE + '/data/crests.json'];
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const j = await r.json();
      const list = (j && j.crests) || [];
      if (!list.length) continue;
      const map = {};
      list.forEach((c) => {
        if (c && c.name && c.file) map[N.clubKey(c.name)] = c.file;
      });
      cache = map;
      cachedAt = Date.now();
      return cache;
    } catch (e) { /* next source */ }
  }
  // Deliberately NOT cached: an empty library is a failure, not an answer, and
  // caching it would turn one bad minute into ten.
  return cache || {};
}

/** The approved local crest for a club, or null. Never a guess. */
function forName(map, name) {
  if (!name) return null;
  return map[N.clubKey(name)] || null;
}

/**
 * Decide what to WRITE for a team, given what the registry already holds.
 *
 * The rule that stops this incident recurring in the other direction: a value
 * we already have is never replaced by an absence. The previous release learnt
 * this the hard way about kick-off times; crests get the same protection, and
 * an empty string counts as an absence rather than as a value.
 */
function patchFor(existing, name) {
  // `existing && …` returns null for a null input, not false. A caller doing
  // `if (d.keep === false)` would then miss it. Booleans out, always.
  const has = !!(existing && typeof existing === 'string' && existing.trim() !== '');
  return {
    keep: has,
    reason: has ? 'the registry already holds approved artwork' : 'no artwork on record',
  };
}

/**
 * crest_asset_path for a batch of teams, honouring what is already stored.
 *
 * @param {Array} teams rows with { id, canonical_name, crest_asset_path }
 * @returns {Promise<Array>} [{ id, crest_asset_path }] — only rows that change
 */
async function backfill(teams) {
  const map = await library();
  if (!Object.keys(map).length) return [];
  const out = [];
  (teams || []).forEach((t) => {
    const decision = patchFor(t.crest_asset_path, t.canonical_name);
    if (decision.keep) return;                       // never overwrite artwork
    const file = forName(map, t.canonical_name);
    if (!file) return;                               // no guessing a filename
    out.push({ id: t.id, crest_asset_path: file });
  });
  return out;
}

/**
 * Which active teams have no visual identity at all.
 *
 * "Active" means used by a fixture or a league-table row — a club we hold no
 * artwork for and never show is not a problem; one on Saturday's fixture card is.
 */
function missing(teams, map) {
  return (teams || []).filter((t) => {
    const stored = t.crest_asset_path && String(t.crest_asset_path).trim();
    if (stored) return false;
    return !forName(map, t.canonical_name);
  });
}

module.exports = { library, forName, backfill, missing, patchFor };
