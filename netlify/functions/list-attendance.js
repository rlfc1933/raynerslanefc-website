// Admin-only READ of the Supabase `attendance` table for the Records tab
// (read-only sub-tab). Same auth as the other list-* functions: PIN via
// lib/pin (ADMIN_PIN env), service_role key, server-side only. Returns the
// most recent scans grouped-friendly for the admin. Mirrors the
// { ok, count, rows } response shape used elsewhere.
const adminOk = require('./lib/pin');

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  let pin = '';
  try { pin = JSON.parse(event.body || '{}').pin; } catch (e) {}
  if (!pin && event.queryStringParameters) pin = event.queryStringParameters.pin;
  if (!adminOk(pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase', rows: [] });

  try {
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    const r = await fetch(URL + '/rest/v1/attendance?select=*&order=match_date.desc&limit=2000', { headers: headers, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'read-failed', rows: [] });
    const rows = await r.json();
    const list = Array.isArray(rows) ? rows : [];
    return resp(200, { ok: true, count: list.length, rows: list });
  } catch (e) {
    return resp(200, { ok: false, error: 'read-failed', rows: [] });
  }
};
