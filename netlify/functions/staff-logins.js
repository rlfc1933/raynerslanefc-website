// Rayners Lane FC — recent staff sign-ins for the chairman (PIN-gated).
//   GET ?pin=...  →  { ok:true, logins:[{username, role, at}] }   (latest 50)

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  const pin = (event.queryStringParameters && event.queryStringParameters.pin) || '';
  if (String(pin) !== String(process.env.ADMIN_PIN || '19332026')) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase', logins: [] });

  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };
  try {
    const r = await fetch(URL + '/rest/v1/staff_logins?select=username,role,at&order=at.desc&limit=50', { headers, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'list ' + r.status, logins: [] });
    return resp(200, { ok: true, logins: await r.json() });
  } catch (e) { return resp(200, { ok: false, error: e.message, logins: [] }); }
};
