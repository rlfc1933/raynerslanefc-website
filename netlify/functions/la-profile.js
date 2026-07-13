// A player edits their OWN profile (bio for now; photo upload is a later slice).
// Session-scoped — a player can only ever change their own row.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess || !sess.player_id) return L.resp(403, { ok: false, error: 'Players only.' });
  const patch = {};
  if (typeof b.bio === 'string') patch.bio = b.bio.slice(0, 800);
  if (!Object.keys(patch).length) return L.resp(400, { ok: false, error: 'Nothing to save.' });
  const up = await L.upd('la_players', 'id=eq.' + sess.player_id, patch);
  return L.resp(up.ok ? 200 : 500, up.ok ? { ok: true, player: (up.data || [])[0] } : { ok: false, error: 'Could not save.' });
};
