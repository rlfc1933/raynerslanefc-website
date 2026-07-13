// Login for players AND staff (both are la_app_users with a hashed code).
// Locks out after 5 failed attempts in 15 minutes with backoff. Returns a
// session token + who you are. Individual logins → real audit trail.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  if (!L.KEY) return L.resp(500, { ok: false, error: 'Server not configured' });
  const b = L.parseBody(event);
  const username = String(b.username || '').trim().toLowerCase();
  const code = String(b.code || '').trim();
  if (!username || !code) return L.resp(400, { ok: false, error: 'Enter your username and code.' });

  // Lockout: >=5 failures in the last 15 min.
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const fails = await L.sel('la_login_attempts?select=id&username=eq.' + encodeURIComponent(username) + '&ok=eq.false&at=gt.' + since);
  if (fails.length >= 5) return L.resp(429, { ok: false, error: 'Too many wrong tries — locked for 15 minutes.' });

  // Staff carry credentials on la_app_users; players on la_players. Try staff first.
  let user = null, p = null;
  const staff = await L.sel('la_app_users?select=id,role,status,pin_hash,player_id&username=eq.' + encodeURIComponent(username));
  if (staff[0] && staff[0].pin_hash && L.verifyCode(code, staff[0].pin_hash)) {
    user = staff[0];
  } else {
    const players = await L.sel('la_players?select=id,name,position,status,pin_hash,squad_no&username=eq.' + encodeURIComponent(username));
    p = players[0];
    if (p && p.pin_hash && L.verifyCode(code, p.pin_hash)) {
      const au = await L.sel('la_app_users?select=id,role,status&player_id=eq.' + p.id);
      user = au[0];
    }
  }
  await L.ins('la_login_attempts', { username, ok: !!user });
  if (!user) return L.resp(401, { ok: false, error: 'Wrong username or code.' });
  if (user.status !== 'active') return L.resp(403, { ok: false, error: 'Your account is not active — ask the club.' });

  const token = L.newToken();
  await L.ins('la_sessions', { token, user_id: user.id, expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });
  return L.resp(200, { ok: true, token, role: user.role, player: p ? { id: p.id, name: p.name, position: p.position, status: p.status, squad_no: p.squad_no } : null });
};
