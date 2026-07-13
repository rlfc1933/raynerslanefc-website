// Staff approve (or reject) a pending player. One tap → they're in the squad.
const L = require('./lib/lane');
let P = null; try { P = require('./la-publish-players'); } catch (e) {}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess || !L.isStaffRole(sess.role)) return L.resp(403, { ok: false, error: 'Staff only.' });
  if (!(await L.can(sess, 'can_approve'))) return L.resp(403, { ok: false, error: 'You do not have approval rights.' });

  const playerId = parseInt(b.player_id, 10);
  if (!playerId) return L.resp(400, { ok: false, error: 'Which player?' });
  const cur = await L.sel('la_players?select=id,name,status,squad_no&id=eq.' + playerId);
  if (!cur.length) return L.resp(404, { ok: false, error: 'Player not found.' });

  if (b.reject) {
    await L.upd('la_players', 'id=eq.' + playerId, { status: 'left' });
    await L.audit(sess.user_id, 'reject', 'player', playerId, cur[0], { status: 'left' });
    return L.resp(200, { ok: true, status: 'left' });
  }
  const patch = { status: 'active' };
  if (b.squad_no != null && b.squad_no !== '') patch.squad_no = parseInt(b.squad_no, 10);
  const up = await L.upd('la_players', 'id=eq.' + playerId, patch);
  if (!up.ok) return L.resp(409, { ok: false, error: (up.data && up.data.message) || 'Could not approve (squad number may be taken).' });
  await L.audit(sess.user_id, 'approve', 'player', playerId, cur[0], patch);
  // an approved player is now active → refresh the public website squad
  if (P && P.publish) { try { await P.publish(false); } catch (e) {} }
  return L.resp(200, { ok: true, status: 'active', player: (up.data || [])[0] });
};
