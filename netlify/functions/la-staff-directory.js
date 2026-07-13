// Public list of active STAFF logins (username + role only — no codes, no
// player data) so the Management sign-in screen can show a "who are you?"
// dropdown. Usernames are login identifiers, not secrets; the code is the gate.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  const rows = await L.sel('la_app_users?select=username,role&status=eq.active&username=not.is.null&order=role');
  return L.resp(200, { ok: true, staff: rows });
};
