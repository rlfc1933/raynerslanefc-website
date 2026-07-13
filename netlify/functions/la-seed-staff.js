// Bootstrap / manage a STAFF login (ADMIN_PIN-gated — an admin action, like
// creating an account in the portal). Creates a la_app_users row with the
// staffer's OWN username + hashed code + role. After this, that staffer signs
// in with their individual code (la-login) — the shared PIN is NEVER the gate
// to player data, only the one-time bootstrap of accounts.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  if (!L.KEY) return L.resp(500, { ok: false, error: 'Server not configured' });
  const b = L.parseBody(event);
  if (String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')) return L.resp(401, { ok: false, error: 'Unauthorized' });

  const username = String(b.username || '').trim().toLowerCase();
  const code = String(b.code || '').trim();
  const role = String(b.role || 'manager').trim();
  if (!username || !/^\d{6}$/.test(code)) return L.resp(400, { ok: false, error: 'Need a username and a 6-digit code.' });
  if (['chairman', 'manager', 'coach', 'staff'].indexOf(role) < 0) return L.resp(400, { ok: false, error: 'Bad role.' });

  const teams = await L.sel('la_teams?select=id&order=id&limit=1');
  const team_id = (teams[0] || {}).id || null;
  const pin_hash = L.hashCode(code);

  const existing = await L.sel('la_app_users?select=id&username=eq.' + encodeURIComponent(username));
  let row;
  if (existing.length) {
    const up = await L.upd('la_app_users', 'id=eq.' + existing[0].id, { pin_hash, role, status: 'active' });
    row = (up.data || [])[0];
  } else {
    const inr = await L.ins('la_app_users', { username, pin_hash, role, team_id, status: 'active' });
    if (!inr.ok) return L.resp(500, { ok: false, error: (inr.data && inr.data.message) || 'Could not create staff login.' });
    row = (inr.data || [])[0];
  }
  return L.resp(200, { ok: true, staff: { id: row && row.id, username, role } });
};
