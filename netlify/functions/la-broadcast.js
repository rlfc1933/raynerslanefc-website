// Staff broadcast to the whole squad (announcement). Broadcast only — there is
// no private staff↔player messaging anywhere in this app.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess || !L.isStaffRole(sess.role)) return L.resp(403, { ok: false, error: 'Staff only.' });
  if (!(await L.can(sess, 'can_broadcast'))) return L.resp(403, { ok: false, error: 'Not permitted to broadcast.' });
  const title = String(b.title || '').trim(), body = String(b.body || '').trim();
  if (!title || !body) return L.resp(400, { ok: false, error: 'Add a title and a message.' });
  const teams = await L.sel('la_teams?select=id&order=id&limit=1');
  const inr = await L.ins('la_announcements', { team_id: (teams[0] || {}).id || null, author_id: sess.user_id, title: title, body: body });
  if (!inr.ok) return L.resp(500, { ok: false, error: 'Could not send.' });
  await L.audit(sess.user_id, 'broadcast', 'announcement', ((inr.data || [])[0] || {}).id, null, { title });
  return L.resp(200, { ok: true });
};
