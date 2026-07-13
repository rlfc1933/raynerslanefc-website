// One-way feedback. Staff SEND it to a player; the player may ACKNOWLEDGE their
// own (never reply — there is no chat). Two modes on one endpoint.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess) return L.resp(403, { ok: false, error: 'Sign in first.' });

  // Player acknowledges their OWN feedback.
  if (b.ack) {
    if (!sess.player_id) return L.resp(403, { ok: false, error: 'Players only.' });
    const up = await L.upd('la_feedback', 'id=eq.' + parseInt(b.ack, 10) + '&player_id=eq.' + sess.player_id, { acknowledged_at: new Date().toISOString() });
    return L.resp(up.ok ? 200 : 500, up.ok ? { ok: true } : { ok: false, error: 'Could not acknowledge.' });
  }

  // Staff send feedback to a player.
  if (!L.isStaffRole(sess.role)) return L.resp(403, { ok: false, error: 'Staff only.' });
  const playerId = parseInt(b.player_id, 10), body = String(b.body || '').trim();
  if (!playerId || !body) return L.resp(400, { ok: false, error: 'Pick a player and write feedback.' });
  const inr = await L.ins('la_feedback', { player_id: playerId, author_id: sess.user_id, body: body, event_id: b.event_id ? parseInt(b.event_id, 10) : null });
  if (!inr.ok) return L.resp(500, { ok: false, error: 'Could not send.' });
  await L.audit(sess.user_id, 'feedback', 'feedback', playerId, null, { body: body.slice(0, 80) });
  return L.resp(200, { ok: true });
};
