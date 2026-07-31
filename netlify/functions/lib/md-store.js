// MATCH DAY OPERATIONS — data access.
//
// Everything here runs SERVER-SIDE with the Supabase service key, which
// bypasses RLS. The md_* tables have RLS on and NO policies, so this module is
// the only way in. The service key must never reach the browser.
//
// Fixtures come from data/fixtures.json — the canonical spine. This module
// READS it and never writes it: a match-day record attaches to a fixture, it
// never creates one. That is what stops this becoming a second fixture store.

const MDC = require('./matchday-core');

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function configured() { return !!(URL && KEY); }

function headers(extra) {
  return Object.assign({
    apikey: KEY,
    Authorization: 'Bearer ' + KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function sb(path, opts) {
  const o = opts || {};
  const r = await fetch(URL + '/rest/v1/' + path, {
    method: o.method || 'GET',
    headers: headers(o.headers),
    body: o.body ? JSON.stringify(o.body) : undefined,
    signal: AbortSignal.timeout(o.timeout || 9000),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
  if (!r.ok) {
    const err = new Error((json && (json.message || json.hint)) || ('supabase ' + r.status));
    err.status = r.status;
    err.body = json;
    throw err;
  }
  return json;
}

// ── FIXTURES (read-only) ───────────────────────────────────────────────────
// Read from the deploy's own origin first (always the current committed file),
// then GitHub raw as a fallback for local/preview contexts.
let _fixtureCache = null;
let _fixtureCacheAt = 0;
const FIXTURE_TTL = 30 * 1000;   // a match day changes fast; 30s is plenty

async function fetchFixtures(force) {
  const now = Date.now();
  if (!force && _fixtureCache && (now - _fixtureCacheAt) < FIXTURE_TTL) return _fixtureCache;

  const origins = [];
  if (process.env.URL) origins.push(process.env.URL.replace(/\/$/, '') + '/data/fixtures.json');
  if (process.env.DEPLOY_URL) origins.push(process.env.DEPLOY_URL.replace(/\/$/, '') + '/data/fixtures.json');
  origins.push('https://raw.githubusercontent.com/rlfc1933/raynerslanefc-website/main/data/fixtures.json');

  let lastErr = null;
  for (const url of origins) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!r.ok) { lastErr = new Error(url + ' → ' + r.status); continue; }
      const d = await r.json();
      const list = (d && d.fixtures) || [];
      if (!Array.isArray(list) || !list.length) { lastErr = new Error(url + ' → empty'); continue; }
      _fixtureCache = list;
      _fixtureCacheAt = now;
      return list;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('fixtures unavailable');
}

/** One fixture by id, or null. */
async function fixtureById(id) {
  const list = await fetchFixtures();
  return list.filter(f => f && f.id === id)[0] || null;
}

/** Every HOME fixture for a season, sorted by kick-off. */
async function homeFixtures(season) {
  const list = await fetchFixtures();
  return list
    .filter(f => f && f.isHome !== false)
    .filter(f => !season || (f.season || MDC.seasonOf(f.date)) === season)
    .sort((a, b) => (a.date + (a.kickoff || '')).localeCompare(b.date + (b.kickoff || '')));
}

/**
 * The immutable facts a record freezes about its fixture, so renaming an
 * opponent or correcting a competition years later cannot rewrite history.
 */
function snapshotFixture(f) {
  return {
    id: f.id,
    date: f.date,
    kickoff: f.kickoff || '15:00',
    opponent: f.opponent,
    isHome: f.isHome !== false,
    venue: f.venue || '',
    competition: f.competition || '',
    competitionId: f.competitionId || '',
    season: f.season || MDC.seasonOf(f.date),
    snapshotAt: new Date().toISOString(),
  };
}

// ── PRICING ────────────────────────────────────────────────────────────────
//
// ONE SOURCE: data/config.json → `admission`. That is the block the public site
// already renders at the gate, so the price on the volunteer's phone is by
// construction the price on the website. There is no second season price list
// and no price-management screen, because two sources drift and then the club
// charges one price and reconciles against another.
//
// The ONLY exception is a rare, audited, single-fixture override — a cup
// instruction, a charity match, a promotion. It never touches the season
// config, and it is stored against ONE fixture.

let _admissionCache = null;
let _admissionCacheAt = 0;
const ADMISSION_TTL = 60 * 1000;

/** Read `admission` from the canonical main-site config. */
async function fetchAdmission(force) {
  const now = Date.now();
  if (!force && _admissionCache && (now - _admissionCacheAt) < ADMISSION_TTL) return _admissionCache;

  const origins = [];
  if (process.env.URL) origins.push(process.env.URL.replace(/\/$/, '') + '/data/config.json');
  if (process.env.DEPLOY_URL) origins.push(process.env.DEPLOY_URL.replace(/\/$/, '') + '/data/config.json');
  origins.push('https://raw.githubusercontent.com/rlfc1933/raynerslanefc-website/main/data/config.json');

  for (const url of origins) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d && d.admission && Array.isArray(d.admission.prices) && d.admission.prices.length) {
        _admissionCache = d.admission;
        _admissionCacheAt = now;
        return d.admission;
      }
    } catch (e) { /* try the next origin */ }
  }
  // Never block a match day on a config fetch. Fall back, and SAY so — the
  // source string travels with the snapshot so a record is never ambiguous
  // about where its prices came from.
  return null;
}

/**
 * The categories and prices that apply to one fixture.
 *   normal   → derived live from the main-site admission config
 *   override → a rare, audited, single-fixture exception
 */
async function pricingFor(fixtureId) {
  let override = null;
  if (configured() && fixtureId) {
    try {
      const rows = await sb('md_price_lists?fixture_id=eq.' + encodeURIComponent(fixtureId) + '&select=*');
      override = (Array.isArray(rows) && rows[0]) || null;
    } catch (e) { /* an override lookup must never block preparing a match */ }
  }
  if (override && Array.isArray(override.categories) && override.categories.length) {
    return {
      categories: override.categories,
      source: 'Fixture-specific override — ' + (override.reason || 'no reason recorded'),
      isOverride: true,
      overrideId: override.id,
      overrideBy: override.created_by,
      overrideAt: override.created_at,
    };
  }
  const admission = await fetchAdmission();
  if (admission) {
    return {
      categories: MDC.categoriesFromAdmission(admission),
      source: 'Season admission prices (data/config.json — the same prices shown on the website)',
      isOverride: false,
    };
  }
  return {
    categories: MDC.categoriesFromAdmission(MDC.FALLBACK_ADMISSION),
    source: 'Built-in fallback — the site admission config could not be read',
    isOverride: false,
    degraded: true,
  };
}

/** Store a single-fixture override. Chairman / V Chairman only, reason required. */
async function saveOverride(row) {
  const existing = await sb('md_price_lists?fixture_id=eq.' + encodeURIComponent(row.fixture_id) + '&select=id');
  if (Array.isArray(existing) && existing.length) {
    const out = await sb('md_price_lists?id=eq.' + existing[0].id, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: { categories: row.categories, reason: row.reason, label: row.label, created_by: row.created_by },
    });
    return Array.isArray(out) ? out[0] : out;
  }
  const out = await sb('md_price_lists', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: row,
  });
  return Array.isArray(out) ? out[0] : out;
}

async function clearOverride(fixtureId) {
  return sb('md_price_lists?fixture_id=eq.' + encodeURIComponent(fixtureId), {
    method: 'DELETE', headers: { Prefer: 'return=minimal' },
  });
}

// ── RECORDS ────────────────────────────────────────────────────────────────
async function recordByFixture(fixtureId) {
  if (!configured()) return null;
  const rows = await sb('md_records?fixture_id=eq.' + encodeURIComponent(fixtureId) + '&select=*');
  return (Array.isArray(rows) && rows[0]) || null;
}

async function recordsForSeason(season) {
  if (!configured()) return [];
  const rows = await sb('md_records?season=eq.' + encodeURIComponent(season) + '&select=*&order=created_at.asc');
  return Array.isArray(rows) ? rows : [];
}

async function allRecords() {
  if (!configured()) return [];
  const rows = await sb('md_records?select=*&order=season.desc');
  return Array.isArray(rows) ? rows : [];
}

async function insertRecord(row) {
  const out = await sb('md_records', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: row,
  });
  return Array.isArray(out) ? out[0] : out;
}

/**
 * Optimistic-concurrency update: the PATCH only matches when the row still
 * carries the version the caller read. A stale write affects zero rows and is
 * reported as a conflict rather than silently overwriting another phone.
 */
async function updateRecord(id, expectedVersion, patch) {
  const body = Object.assign({}, patch, { version: expectedVersion + 1 });
  const out = await sb('md_records?id=eq.' + id + '&version=eq.' + expectedVersion, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body,
  });
  const rows = Array.isArray(out) ? out : (out ? [out] : []);
  return rows[0] || null;   // null = version conflict
}

async function findByIdempotencyKey(key) {
  if (!configured() || !key) return null;
  const rows = await sb('md_records?idempotency_key=eq.' + encodeURIComponent(key) + '&select=*');
  return (Array.isArray(rows) && rows[0]) || null;
}

// ── AUDIT ──────────────────────────────────────────────────────────────────
async function audit(entry) {
  if (!configured()) return null;
  try {
    return await sb('md_audit', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: entry });
  } catch (e) {
    // An audit write must never take down the operation it is describing, but
    // it must be visible when it fails.
    console.error('md_audit write failed:', e.message);
    return null;
  }
}

async function auditFor(recordId) {
  if (!configured()) return [];
  const rows = await sb('md_audit?record_id=eq.' + recordId + '&select=*&order=at.desc');
  return Array.isArray(rows) ? rows : [];
}

// ── LEGACY (Stage 9) ───────────────────────────────────────────────────────
async function legacyFinances() {
  if (!configured()) return [];
  const rows = await sb('match_finances?id=eq.1&select=matches');
  return (Array.isArray(rows) && rows[0] && rows[0].matches) || [];
}

module.exports = {
  configured, sb,
  fetchFixtures, fixtureById, homeFixtures, snapshotFixture,
  fetchAdmission, pricingFor, saveOverride, clearOverride,
  recordByFixture, recordsForSeason, allRecords,
  insertRecord, updateRecord, findByIdempotencyKey,
  audit, auditFor,
  legacyFinances,
};
