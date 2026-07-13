// A player's own dashboard: their profile, every event with THEIR availability /
// selection / check-in, the club announcements, and their one-way feedback.
// Session-scoped — a player only ever sees their own private rows.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess) return L.resp(403, { ok: false, error: 'Sign in first.' });

  const pid = sess.player_id;
  const players = pid ? await L.sel('la_players?select=id,name,position,squad_no,status,bio,sponsor_name,photo_url&id=eq.' + pid) : [];
  const player = players[0] || null;

  const events = await L.sel('la_events?select=*,la_venues(club_name,ground,address,lat,lng)&order=starts_at');
  let myAvail = {}, mySel = {}, myCi = {};
  if (pid) {
    (await L.sel('la_availability?select=event_id,status&player_id=eq.' + pid)).forEach(function (r) { myAvail[r.event_id] = r.status; });
    (await L.sel('la_selections?select=event_id,role&player_id=eq.' + pid)).forEach(function (r) { mySel[r.event_id] = r.role; });
    (await L.sel('la_checkins?select=event_id&player_id=eq.' + pid)).forEach(function (r) { myCi[r.event_id] = true; });
  }
  const evOut = events.map(function (e) {
    return Object.assign({}, e, { myAvailability: myAvail[e.id] || null, mySelection: mySel[e.id] || null, myCheckin: !!myCi[e.id] });
  });

  const anns = await L.sel('la_announcements?select=*&order=created_at.desc&limit=20');
  const feedback = pid ? await L.sel('la_feedback?select=id,body,acknowledged_at,created_at&player_id=eq.' + pid + '&order=created_at.desc') : [];

  return L.resp(200, { ok: true, role: sess.role, player: player, events: evOut, announcements: anns, feedback: feedback });
};
