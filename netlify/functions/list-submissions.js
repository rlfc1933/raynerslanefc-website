// Admin-only READ of the Supabase `submissions` table for the Records tab.
// Same auth as list-members/list-sponsors: PIN via lib/pin (ADMIN_PIN env),
// service_role key, server-side only. Never exposed to anon. Mirrors the
// { ok, count, submissions } response shape of the other list-* functions.
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

  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase', submissions: [] });

  try {
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    const r = await fetch(URL + '/rest/v1/submissions?select=*&order=created_at.desc&limit=1000', { headers: headers, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'read-failed', submissions: [] });
    const rows = await r.json();
    const list = Array.isArray(rows) ? rows : [];
    return resp(200, { ok: true, count: list.length, submissions: list });
  } catch (e) {
    return resp(200, { ok: false, error: 'read-failed', submissions: [] });
  }
};
