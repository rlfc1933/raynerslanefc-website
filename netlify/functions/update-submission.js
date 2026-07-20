// Admin-only UPDATE/DELETE of a Supabase `submissions` row (Records tab).
// PIN-gated (lib/pin, ADMIN_PIN), service_role, server-side only. Handles:
//   { pin, id, patch:{ status?, staff_notes?, handled_by?, read_at? } }  → PATCH
//   { pin, id, action:'delete' }                                         → hard DELETE
// Only a fixed whitelist of columns can be patched — no arbitrary writes.
const adminOk = require('./lib/pin');

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const STATUS = ['new', 'contacted', 'in_progress', 'trialled', 'signed', 'declined', 'archived'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(200, { ok: false, error: 'bad-request' }); }
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase' });
  if (!b.id || !UUID.test(String(b.id))) return resp(200, { ok: false, error: 'bad-id' });

  const base = URL + '/rest/v1/submissions?id=eq.' + encodeURIComponent(b.id);
  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

  try {
    if (b.action === 'delete') {
      const r = await fetch(base, { method: 'DELETE', headers: headers, signal: AbortSignal.timeout(9000) });
      return resp(200, r.ok ? { ok: true } : { ok: false, error: 'delete-failed' });
    }
    const p = b.patch || {};
    const row = {};
    if (p.status != null) { if (STATUS.indexOf(String(p.status)) < 0) return resp(200, { ok: false, error: 'bad-status' }); row.status = p.status; }
    if (p.staff_notes != null) row.staff_notes = String(p.staff_notes).slice(0, 8000);
    if (p.handled_by != null) row.handled_by = String(p.handled_by).slice(0, 200);
    if (p.read_at !== undefined) row.read_at = p.read_at; // ISO string or null
    if (!Object.keys(row).length) return resp(200, { ok: false, error: 'nothing-to-update' });
    const r = await fetch(base, { method: 'PATCH', headers: headers, body: JSON.stringify(row), signal: AbortSignal.timeout(9000) });
    return resp(200, r.ok ? { ok: true } : { ok: false, error: 'update-failed' });
  } catch (e) {
    return resp(200, { ok: false, error: 'failed' });
  }
};
