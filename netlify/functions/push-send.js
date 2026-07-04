// Rayners Lane FC — send a match-alert push to every subscribed fan.
// PIN-gated (same shared admin PIN as save-data). Loads subscriptions from
// Supabase, sends via web-push with the club's VAPID keys, and prunes dead
// endpoints (404/410) so the list stays clean.
//
// Requires env vars:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (generate once — see PUSH-SETUP.md)
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   ADMIN_PIN (optional, defaults 19332026)
//
// Body: { pin, title, body, url? }  →  { ok, sent, failed }

const webpush = require('web-push');

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;  // accept classic, new, or Netlify-integration name
const PUB = process.env.VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;

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

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (e) {}
  if (String(payload.pin) !== String(process.env.ADMIN_PIN || '19332026')) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!PUB || !PRIV) return resp(200, { ok: false, error: 'no-vapid' });
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase' });
  if (!payload.title) return resp(400, { ok: false, error: 'No title' });

  webpush.setVapidDetails('mailto:info@raynerslanefc.co.uk', PUB, PRIV);
  const note = JSON.stringify({
    title: String(payload.title).slice(0, 80),
    body: String(payload.body || '').slice(0, 180),
    url: payload.url || '/',
  });

  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY };
  let subs = [];
  try {
    const r = await fetch(URL + '/rest/v1/push_subscriptions?select=endpoint,subscription', { headers, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'load ' + r.status });
    subs = await r.json();
  } catch (e) { return resp(200, { ok: false, error: e.message }); }

  let sent = 0, failed = 0;
  const dead = [];
  await Promise.all((subs || []).map(function (row) {
    return webpush.sendNotification(row.subscription, note)
      .then(function () { sent++; })
      .catch(function (err) {
        failed++;
        if (err && (err.statusCode === 404 || err.statusCode === 410)) dead.push(row.endpoint);
      });
  }));

  // Prune dead endpoints.
  if (dead.length) {
    try {
      const list = dead.map(function (e) { return '"' + encodeURIComponent(e) + '"'; }).join(',');
      await fetch(URL + '/rest/v1/push_subscriptions?endpoint=in.(' + list + ')', { method: 'DELETE', headers, signal: AbortSignal.timeout(9000) });
    } catch (e) {}
  }

  return resp(200, { ok: true, sent: sent, failed: failed, pruned: dead.length });
};
