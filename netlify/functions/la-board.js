// Staff board for an event: the squad with each player's availability,
// selection and check-in, plus pending sign-ups and the tallies. Staff-only.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess || !L.isStaffRole(sess.role)) return L.resp(403, { ok: false, error: 'Staff only.' });

  const events = await L.sel('la_events?select=*,la_venues(club_name,ground,address,lat,lng)&order=starts_at');
  const eventId = parseInt(b.event_id, 10) || (events[0] && events[0].id);

  const players = await L.sel('la_players?select=id,name,position,squad_no,status,sponsor_name&status=in.(active,injured)&order=squad_no');
  const pending = await L.sel('la_players?select=id,name,position,phone,email&status=eq.pending&order=created_at');

  let avail = {}, sel = {}, ci = {};
  if (eventId) {
    (await L.sel('la_availability?select=player_id,status&event_id=eq.' + eventId)).forEach(function (r) { avail[r.player_id] = r.status; });
    (await L.sel('la_selections?select=player_id,role&event_id=eq.' + eventId)).forEach(function (r) { sel[r.player_id] = r.role; });
    (await L.sel('la_checkins?select=player_id&event_id=eq.' + eventId)).forEach(function (r) { ci[r.player_id] = true; });
  }
  const squad = players.map(function (p) {
    return Object.assign({}, p, { availability: avail[p.id] || null, selection: sel[p.id] || null, checkedIn: !!ci[p.id] });
  });

  const perms = {
    can_select_squad: await L.can(sess, 'can_select_squad'),
    can_approve: await L.can(sess, 'can_approve'),
    can_broadcast: await L.can(sess, 'can_broadcast'),
    can_release: await L.can(sess, 'can_release'),
  };
  return L.resp(200, { ok: true, role: sess.role, perms: perms, activeEvent: eventId, events: events, squad: squad, pending: pending });
};
