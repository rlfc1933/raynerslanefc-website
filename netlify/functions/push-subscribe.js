// Rayners Lane FC — store a fan's Web Push subscription so we can send match
// alerts later. Saved in Supabase (same project as fan accounts), keyed by the
// subscription endpoint so re-subscribing just updates the row.
//
// Requires env vars (already used by list-members):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
// One-time: create the table (see PUSH-SETUP.md).
//
// Body: { subscription: <PushSubscription JSON> }   →  { ok:true }

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;  // accept either name

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase' });

  let sub;
  try { sub = JSON.parse(event.body || '{}').subscription; } catch (e) {}
  if (!sub || !sub.endpoint) return resp(400, { ok: false, error: 'No subscription' });

  const headers = {
    apikey: KEY, Authorization: 'Bearer ' + KEY,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };
  try {
    const r = await fetch(URL + '/rest/v1/push_subscriptions?on_conflict=endpoint', {
      method: 'POST', headers, signal: AbortSignal.timeout(9000),
      body: JSON.stringify({ endpoint: sub.endpoint, subscription: sub }),
    });
    if (!r.ok && r.status !== 201 && r.status !== 200) {
      const txt = await r.text().catch(function () { return ''; });
      return resp(200, { ok: false, error: 'store ' + r.status + ' ' + txt.slice(0, 120) });
    }
    return resp(200, { ok: true });
  } catch (e) {
    return resp(200, { ok: false, error: e.message });
  }
};
