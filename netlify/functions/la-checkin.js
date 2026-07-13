// Player match-day / training check-in. UPSERT on (event_id, player_id) with an
// idempotency_key → an offline tap that gets retried on reconnect can only ever
// produce ONE row. Safe to call any number of times.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess) return L.resp(403, { ok: false, error: 'Sign in first.' });

  // Staff can check a player in; a player checks themselves in.
  let playerId, source;
  if (b.player_id && L.isStaffRole(sess.role)) { playerId = parseInt(b.player_id, 10); source = 'staff'; }
  else if (sess.player_id) { playerId = sess.player_id; source = 'self'; }
  else return L.resp(403, { ok: false, error: 'Nothing to check in.' });

  const eventId = parseInt(b.event_id, 10);
  if (!eventId || !playerId) return L.resp(400, { ok: false, error: 'Event and player required.' });

  const up = await L.ins('la_checkins', {
    event_id: eventId, player_id: playerId, source,
    idempotency_key: b.idempotency_key || null, checked_in_at: new Date().toISOString(),
  }, { upsert: true, onConflict: 'event_id,player_id' });
  if (!up.ok) return L.resp(500, { ok: false, error: (up.data && up.data.message) || 'Could not check in — try again.' });
  return L.resp(200, { ok: true, checkin: (up.data || [])[0] });
};
