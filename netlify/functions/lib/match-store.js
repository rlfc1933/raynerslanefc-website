// Supabase access for the live match tables.
//
// Kept apart from both the provider adapter and the sync orchestration so that
// "how we talk to the database" and "how we read Football Web Pages" can each
// change without touching the other.
//
// Uses PostgREST directly over fetch, exactly as live-score.js and the Match
// Day Ops store already do — no new dependency for a site with no build step.

'use strict';

const URL_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://rewkixywfgsyqinfbggv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY;

function configured() { return !!(URL_BASE && KEY); }

function hdrs(extra) {
  return Object.assign({
    apikey: KEY,
    Authorization: 'Bearer ' + KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function rest(path, opts) {
  const o = opts || {};
  const res = await fetch(URL_BASE + '/rest/v1/' + path, {
    method: o.method || 'GET',
    headers: hdrs(o.headers),
    body: o.body ? JSON.stringify(o.body) : undefined,
    signal: AbortSignal.timeout(o.timeout || 9000),
  });
  const text = await res.text();
  let json = null;
  if (text) { try { json = JSON.parse(text); } catch (e) { /* non-JSON error body */ } }
  if (!res.ok) {
    const err = new Error('supabase ' + res.status + ': ' + String(text).slice(0, 200));
    err.status = res.status;
    throw err;
  }
  return json;
}

// ── match_state ────────────────────────────────────────────────────────────
async function getState(fixtureId) {
  const rows = await rest('match_state?fixture_id=eq.' + encodeURIComponent(fixtureId) + '&select=*');
  return (rows && rows[0]) || null;
}

async function listLive() {
  return (await rest('match_state?is_live=eq.true&select=*&order=scheduled_kickoff.asc')) || [];
}

/** Create the row if this fixture has never been synced. */
async function ensureState(fixtureId, seed) {
  const existing = await getState(fixtureId);
  if (existing) return existing;
  const row = Object.assign({ fixture_id: fixtureId }, seed || {});
  await rest('match_state', {
    method: 'POST', body: row, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
  return await getState(fixtureId);
}

/**
 * Optimistic update. The version the caller read must still be the version in
 * the table, otherwise somebody else wrote in between and we back off rather
 * than clobber. This is the concurrency control the old single-row live_match
 * never had — two staff devices could silently overwrite each other.
 */
async function updateState(fixtureId, patch, expectedVersion) {
  let q = 'match_state?fixture_id=eq.' + encodeURIComponent(fixtureId);
  if (expectedVersion != null) q += '&version=eq.' + encodeURIComponent(expectedVersion);
  const out = await rest(q, {
    method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' },
  });
  // Zero rows back means the version moved under us.
  if (!out || !out.length) return { ok: false, conflict: true };
  return { ok: true, row: out[0] };
}

// ── match_events ───────────────────────────────────────────────────────────
async function listEvents(fixtureId) {
  return (await rest('match_events?fixture_id=eq.' + encodeURIComponent(fixtureId) +
    '&select=*&order=minute.asc,stoppage_minute.asc')) || [];
}

/**
 * Insert only what is genuinely new. `dedupe_key` is unique per fixture, so
 * ignore-duplicates makes a re-poll of the same timeline a no-op — which is
 * exactly what happens every 30 seconds for the whole match.
 */
async function insertEvents(rows) {
  if (!rows || !rows.length) return 0;
  await rest('match_events', {
    method: 'POST', body: rows,
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  });
  return rows.length;
}

/** The provider withdrew an event. Never hard-deleted — history is evidence. */
async function retractEvents(fixtureId, keys) {
  if (!keys || !keys.length) return 0;
  const list = keys.map((k) => '"' + String(k).replace(/"/g, '') + '"').join(',');
  await rest('match_events?fixture_id=eq.' + encodeURIComponent(fixtureId) +
    '&dedupe_key=in.(' + encodeURIComponent(list) + ')&retracted_at=is.null', {
    method: 'PATCH', body: { retracted_at: new Date().toISOString() },
    headers: { Prefer: 'return=minimal' },
  });
  return keys.length;
}

// ── audit ──────────────────────────────────────────────────────────────────
async function log(entry) {
  try {
    await rest('match_sync_log', {
      method: 'POST', body: entry, headers: { Prefer: 'return=minimal' }, timeout: 5000,
    });
  } catch (e) { /* logging must never break a sync */ }
}

async function recentLog(limit) {
  return (await rest('match_sync_log?select=*&order=created_at.desc&limit=' + (limit || 20))) || [];
}

module.exports = {
  configured, rest,
  getState, listLive, ensureState, updateState,
  listEvents, insertEvents, retractEvents,
  log, recentLog,
};
