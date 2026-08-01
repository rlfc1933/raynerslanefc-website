// Supabase access for the football registry.
//
// Separate from match-store.js on purpose: that one serves the live scoreboard
// and is protected production code. This one owns the registry tables added in
// Gate 1 and can change freely while the new system is still in shadow.
'use strict';

const URL_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://rewkixywfgsyqinfbggv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY;

function configured() { return !!(URL_BASE && KEY); }

async function rest(path, opts) {
  const o = opts || {};
  const res = await fetch(URL_BASE + '/rest/v1/' + path, {
    method: o.method || 'GET',
    headers: Object.assign({
      apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json',
    }, o.headers || {}),
    body: o.body ? JSON.stringify(o.body) : undefined,
    signal: AbortSignal.timeout(o.timeout || 12000),
  });
  const text = await res.text();
  let json = null;
  if (text) { try { json = JSON.parse(text); } catch (e) { /* error body */ } }
  if (!res.ok) {
    const err = new Error('supabase ' + res.status + ': ' + String(text).slice(0, 240));
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Insert or update on a unique key, returning the row. */
async function upsert(table, row, onConflict) {
  const q = table + (onConflict ? '?on_conflict=' + onConflict : '');
  const out = await rest(q, {
    method: 'POST', body: [row],
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  });
  return (out && out[0]) || null;
}

async function findOne(table, query) {
  const rows = await rest(table + '?' + query + '&limit=1');
  return (rows && rows[0]) || null;
}

// ── sync runs ───────────────────────────────────────────────────────────────
async function startRun(syncType, shadow, ref) {
  return await upsert('football_sync_runs', {
    provider: 'fwp', sync_type: syncType, fixture_ref: ref || null,
    status: 'running', shadow: shadow !== false,
  });
}
async function finishRun(id, patch) {
  if (!id) return null;
  const out = await rest('football_sync_runs?id=eq.' + id, {
    method: 'PATCH',
    body: Object.assign({ completed_at: new Date().toISOString() }, patch),
    headers: { Prefer: 'return=representation' },
  });
  return (out && out[0]) || null;
}

// ── conflicts ───────────────────────────────────────────────────────────────
async function recordConflict(c) {
  // Don't stack an identical open conflict on every run.
  const existing = await findOne('football_source_conflicts',
    'entity_type=eq.' + encodeURIComponent(c.entity_type) +
    '&entity_ref=eq.' + encodeURIComponent(c.entity_ref) +
    '&field_name=eq.' + encodeURIComponent(c.field_name) +
    '&resolution_status=eq.open');
  if (existing) return existing;
  return await upsert('football_source_conflicts', c);
}

async function openConflicts(limit) {
  return (await rest('football_source_conflicts?resolution_status=eq.open&select=*&order=detected_at.desc&limit=' + (limit || 50))) || [];
}

module.exports = { configured, rest, upsert, findOne, startRun, finishRun, recordConflict, openConflicts };
