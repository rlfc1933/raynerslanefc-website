// Change your OWN 6-digit code (players and staff). Session-authed — you can
// only ever change your own. Verifies the current code first.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess) return L.resp(403, { ok: false, error: 'Sign in first.' });
  const cur = String(b.current_code || '').trim();
  const next = String(b.new_code || '').trim();
  if (!/^\d{4,10}$/.test(next)) return L.resp(400, { ok: false, error: 'New code must be 4–10 numbers.' });

  // Staff creds live on la_app_users; players on la_players.
  if (sess.player_id) {
    const rows = await L.sel('la_players?select=pin_hash&id=eq.' + sess.player_id);
    if (!rows[0] || !L.verifyCode(cur, rows[0].pin_hash)) return L.resp(401, { ok: false, error: 'Your current code is wrong.' });
    const up = await L.upd('la_players', 'id=eq.' + sess.player_id, { pin_hash: L.hashCode(next) });
    return L.resp(up.ok ? 200 : 500, up.ok ? { ok: true } : { ok: false, error: 'Could not update.' });
  }
  const rows = await L.sel('la_app_users?select=pin_hash&id=eq.' + sess.user_id);
  if (!rows[0] || !L.verifyCode(cur, rows[0].pin_hash)) return L.resp(401, { ok: false, error: 'Your current code is wrong.' });
  const up = await L.upd('la_app_users', 'id=eq.' + sess.user_id, { pin_hash: L.hashCode(next) });
  return L.resp(up.ok ? 200 : 500, up.ok ? { ok: true } : { ok: false, error: 'Could not update.' });
};
