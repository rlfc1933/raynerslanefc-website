// Chairman manages staff logins IN-APP (no shared PIN). Create/assign a staffer
// with their own username + starter 6-digit code + role, list staff, or revoke.
// Gated by can_manage_users (chairman by default) → every change is audited.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess || !L.isStaffRole(sess.role)) return L.resp(403, { ok: false, error: 'Staff only.' });
  if (!(await L.can(sess, 'can_manage_users'))) return L.resp(403, { ok: false, error: 'Only the chairman can manage staff.' });

  if (b.action === 'list') {
    const rows = await L.sel('la_app_users?select=id,username,role,status&username=not.is.null&order=role');
    return L.resp(200, { ok: true, staff: rows });
  }
  if (b.action === 'revoke') {
    const id = parseInt(b.id, 10);
    if (!id || id === sess.user_id) return L.resp(400, { ok: false, error: 'Pick another staff member.' });
    const up = await L.upd('la_app_users', 'id=eq.' + id, { status: 'suspended' });
    await L.audit(sess.user_id, 'revoke_staff', 'app_user', id, null, { status: 'suspended' });
    return L.resp(up.ok ? 200 : 500, up.ok ? { ok: true } : { ok: false, error: 'Could not revoke.' });
  }

  // create / update a staff login
  const username = String(b.username || '').trim().toLowerCase();
  const code = String(b.code || '').trim();
  const role = String(b.role || 'coach').trim();
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) return L.resp(400, { ok: false, error: 'Username: 3–24 letters/numbers.' });
  if (!/^\d{6}$/.test(code)) return L.resp(400, { ok: false, error: 'Starter code must be 6 numbers.' });
  if (['chairman', 'manager', 'coach', 'staff'].indexOf(role) < 0) return L.resp(400, { ok: false, error: 'Bad role.' });

  const teams = await L.sel('la_teams?select=id&order=id&limit=1');
  const pin_hash = L.hashCode(code);
  const existing = await L.sel('la_app_users?select=id&username=eq.' + encodeURIComponent(username));
  let row;
  if (existing.length) {
    const up = await L.upd('la_app_users', 'id=eq.' + existing[0].id, { role: role, status: 'active', pin_hash: pin_hash });
    row = (up.data || [])[0];
  } else {
    const inr = await L.ins('la_app_users', { username: username, pin_hash: pin_hash, role: role, team_id: (teams[0] || {}).id || null, status: 'active' });
    if (!inr.ok) return L.resp(500, { ok: false, error: (inr.data && inr.data.message) || 'Could not create.' });
    row = (inr.data || [])[0];
  }
  await L.audit(sess.user_id, 'set_staff', 'app_user', row && row.id, null, { username, role });
  return L.resp(200, { ok: true, staff: { id: row && row.id, username, role } });
};
