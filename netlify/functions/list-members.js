// Rayners Lane FC — fan members for the admin Fan Club.
//
// Reads the real fan accounts (created in the Fan Zone) from Supabase, server-
// side, using the SERVICE ROLE key so it can see every member + their email.
// PIN-gated. Falls back gracefully (ok:false, no-supabase) if not configured,
// so the admin can drop back to the Netlify-Forms sign-up list.
//
// Requires env vars:
//   SUPABASE_URL          – your project URL (https://xxxx.supabase.co)
//   SUPABASE_SERVICE_KEY  – the service_role secret key (Settings → API). SECRET.
//   ADMIN_PIN             – optional (defaults 19332026)

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co'; // public project URL (also in js/supabase-config.js) — safe fallback so only the SECRET key must be set
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;  // accept classic, new, or Netlify-integration name

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  let pin = '';
  try { pin = JSON.parse(event.body || '{}').pin; } catch (e) {}
  if (!pin && event.queryStringParameters) pin = event.queryStringParameters.pin;
  if (String(pin) !== String(process.env.ADMIN_PIN || '19332026')) return resp(401, { ok: false, error: 'Unauthorized' });

  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase', members: [] });

  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };
  try {
    const fr = await fetch(URL + '/rest/v1/fans?select=*&order=created_at.desc', { headers, signal: AbortSignal.timeout(9000) });
    if (!fr.ok) return resp(200, { ok: false, error: 'fans ' + fr.status, members: [] });
    const fans = await fr.json();

    // Pull emails from the auth admin API and map by id.
    const emailById = {};
    try {
      const ur = await fetch(URL + '/auth/v1/admin/users?per_page=500', { headers, signal: AbortSignal.timeout(9000) });
      if (ur.ok) { const ud = await ur.json(); (ud.users || []).forEach(function (u) { emailById[u.id] = u.email; }); }
    } catch (e) {}

    const members = (fans || []).map(function (f) {
      return {
        name: f.name || '', username: f.username || '', email: emailById[f.id] || '',
        town: f.town || '', since: f.since || '', lane_no: f.lane_no || '', created: f.created_at || '',
      };
    });
    return resp(200, { ok: true, count: members.length, members: members });
  } catch (e) {
    return resp(200, { ok: false, error: e.message, members: [] });
  }
};
