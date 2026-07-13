// Player marks availability. Single-row UPSERT on (event_id, player_id) — the
// unique constraint means tapping 5× rapidly can only ever be ONE row with the
// final value. Player_id comes from the session, so nobody can set another's.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess || !sess.player_id) return L.resp(403, { ok: false, error: 'Players only.' });

  const eventId = parseInt(b.event_id, 10);
  const status = String(b.status || '').trim();
  if (!eventId) return L.resp(400, { ok: false, error: 'Which event?' });
  if (['available', 'unavailable'].indexOf(status) < 0) return L.resp(400, { ok: false, error: 'Status must be available/unavailable.' });

  const up = await L.ins('la_availability', {
    event_id: eventId, player_id: sess.player_id, status, note: b.note || null, responded_at: new Date().toISOString(),
  }, { upsert: true, onConflict: 'event_id,player_id' });
  if (!up.ok) return L.resp(500, { ok: false, error: (up.data && up.data.message) || 'Could not save — try again.' });
  return L.resp(200, { ok: true, availability: (up.data || [])[0] });
};
