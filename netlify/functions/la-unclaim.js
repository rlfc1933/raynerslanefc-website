// ADMIN_PIN-gated: reset a player's LOGIN (clear username/code/email/phone and
// remove their app account + sessions), returning them to an unclaimed roster
// player who is still on the squad. Use if a login needs wiping or a wrong
// person claimed a profile. Does not remove the player from the squad.
const L = require('./lib/lane');
const adminOk = require('./lib/pin');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  if (!adminOk(b.pin)) return L.resp(401, { ok: false, error: 'Unauthorized' });

  let ids = [];
  if (b.player_id) ids = [parseInt(b.player_id, 10)];
  else if (b.name) {
    const rows = await L.sel('la_players?select=id,name');
    ids = rows.filter(function (p) { return String(p.name || '').trim().toLowerCase() === String(b.name).trim().toLowerCase(); }).map(function (p) { return p.id; });
  }
  if (!ids.length) return L.resp(404, { ok: false, error: 'Player not found.' });

  const inlist = '(' + ids.join(',') + ')';
  // remove app accounts + sessions tied to these players
  const aus = await L.sel('la_app_users?select=id&player_id=in.' + inlist);
  const auIds = aus.map(function (a) { return a.id; });
  if (auIds.length) {
    await L.del('la_sessions', 'user_id=in.(' + auIds.join(',') + ')');
    await L.del('la_app_users', 'player_id=in.' + inlist);
  }
  // clear the login fields on the player, keep them on the squad
  await L.upd('la_players', 'id=in.' + inlist, { username: null, pin_hash: null, email: null, phone: null, photo_consent: false, status: 'active' });
  return L.resp(200, { ok: true, reset: ids.length });
};
