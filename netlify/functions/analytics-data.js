// Rayners Lane FC — PRIVATE match finances (Supabase, service-key only).
//
// Match takings + attendance never touch the public repo. They live in a
// Supabase `match_finances` row that has NO public RLS policy — so ONLY this
// PIN-gated function (using the service/secret key, which bypasses RLS) can
// read or write them. This replaces the old public data/analytics.json +
// data/config.json hash gate. (Originally used Netlify Blobs, but Blobs isn't
// enabled on this site, so it's unified onto Supabase where the rest lives.)
//
//   GET  ?pin=...                → { ok, matches:[...] }
//   POST { pin, matches:[...] }  → overwrite the finances
//
// Gate: ANALYTICS_PIN if set (a distinct chairman-only PIN), else ADMIN_PIN.
// Needs SUPABASE_URL + a service/secret key, and the match_finances table
// (supabase-schema.sql / supabase/migrations).

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co'; // public project URL (also in js/supabase-config.js) — safe fallback so only the SECRET key must be set
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }, body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  let pin = (event.queryStringParameters && event.queryStringParameters.pin) || '';
  let b = {};
  if (event.httpMethod === 'POST') { try { b = JSON.parse(event.body || '{}'); pin = b.pin || pin; } catch (e) {} }
  const gate = process.env.ANALYTICS_PIN || process.env.ADMIN_PIN;
  if (!gate || pin == null || pin === '' || String(pin) !== String(gate)) return resp(401, { ok: false, error: 'Unauthorized', matches: [] });
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase', matches: [] });

  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  try {
    if (event.httpMethod === 'POST') {
      // ── RETIRED (Stage 9) ────────────────────────────────────────────────
      // This used to overwrite the ENTIRE match history with whatever array the
      // browser sent, so two staff saving in the same window silently destroyed
      // each other's work — and nothing recorded who did it.
      //
      // Match-day money now has exactly ONE writer: matchday-ops.js, which
      // writes a normalised row per fixture, recalculates every figure
      // server-side, checks a version to refuse a stale write, and audits the
      // actor. Leaving this endpoint writable would let a stale browser tab
      // resurrect the old array and give the club two different answers to
      // "what did we take against Hilltop". There is no correct way to
      // reconcile that afterwards, so the write path is closed.
      //
      // READS below still work: the history stays visible until the club has
      // checked it against the migrated records. match_finances is NOT deleted.
      return resp(410, {
        ok: false,
        error: 'The Match Day Analytics ledger is retired and no longer accepts writes. Record match days in Match Day Ops.',
        retired: true,
        replacement: '/.netlify/functions/matchday-ops',
      });
    }
    const r = await fetch(URL + '/rest/v1/match_finances?id=eq.1&select=matches', { headers, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'read ' + r.status, matches: [] });
    const rows = await r.json();
    const matches = (Array.isArray(rows) && rows[0] && rows[0].matches) || [];
    return resp(200, { ok: true, matches: matches });
  } catch (e) {
    return resp(200, { ok: false, error: e.message, matches: [] });
  }
};
