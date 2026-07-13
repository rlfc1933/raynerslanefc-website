// Register THIS device for Lane App push, tagged with the signed-in user's role
// (so a player sign-up can notify management specifically, not fans). Upserts on
// the subscription endpoint, so re-subscribing just refreshes the row.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess) return L.resp(403, { ok: false, error: 'Sign in first.' });
  const sub = b.subscription;
  if (!sub || !sub.endpoint) return L.resp(400, { ok: false, error: 'No subscription.' });

  const up = await L.ins('push_subscriptions', {
    endpoint: sub.endpoint, subscription: sub, role: sess.role, user_id: sess.user_id, player_id: sess.player_id || null,
  }, { upsert: true, onConflict: 'endpoint' });
  if (up.ok) return L.resp(200, { ok: true, tagged: true });

  // The role/user_id columns may not be added yet — still save the base
  // subscription so alerts work; management-targeting turns on once the two
  // ALTER lines are run and the device re-subscribes.
  const base = await L.ins('push_subscriptions', { endpoint: sub.endpoint, subscription: sub }, { upsert: true, onConflict: 'endpoint' });
  return L.resp(base.ok ? 200 : 500, base.ok ? { ok: true, tagged: false } : { ok: false, error: 'Could not save subscription.' });
};
