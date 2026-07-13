// Staff pick the squad. Single-row UPSERT on (event_id, player_id) → two staff
// editing the same event can't lose each other's picks (each writes its own
// player rows; a clash on the SAME player is a last-write-wins upsert, never a
// dropped collection). Guarded by the can_select_squad capability (a coach can
// be granted it with a permissions row — no code change).
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess || !L.isStaffRole(sess.role)) return L.resp(403, { ok: false, error: 'Staff only.' });
  if (!(await L.can(sess, 'can_select_squad'))) return L.resp(403, { ok: false, error: 'Squad selection isn’t granted to you.' });

  const eventId = parseInt(b.event_id, 10);
  const playerId = parseInt(b.player_id, 10);
  const role = String(b.role || '').trim();
  if (!eventId || !playerId) return L.resp(400, { ok: false, error: 'Event and player required.' });
  if (['starting', 'sub', 'not_selected'].indexOf(role) < 0) return L.resp(400, { ok: false, error: 'Role must be starting/sub/not_selected.' });

  const up = await L.ins('la_selections', {
    event_id: eventId, player_id: playerId, role, selected_by: sess.user_id, selected_at: new Date().toISOString(),
  }, { upsert: true, onConflict: 'event_id,player_id' });
  if (!up.ok) return L.resp(500, { ok: false, error: (up.data && up.data.message) || 'Could not save selection.' });
  await L.audit(sess.user_id, 'select', 'selection', eventId + ':' + playerId, null, { role });
  return L.resp(200, { ok: true, selection: (up.data || [])[0] });
};
