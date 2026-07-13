// Player self-signup → lands as PENDING (staff approve before they're in the
// squad). Hashes the 6-digit code (never stores it), rate-limits per IP,
// enforces unique username, and REACTIVATES a former player by email instead
// of duplicating. Issues a session so they can log in and watch the queue.
const L = require('./lib/lane');
let webpush = null;
try { webpush = require('web-push'); } catch (e) {}

function ip(event) { const h = event.headers || {}; return (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'; }

// Best-effort push to management the instant a player signs up. Returns the
// number of management devices targeted (0 if push/subscriptions aren't set up).
async function notifyManagement(name) {
  try {
    const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    if (!webpush || !pub || !priv) return 0;
    webpush.setVapidDetails('mailto:info@raynerslanefc.co.uk', pub, priv);
    const subs = await L.sel('push_subscriptions?select=subscription&role=in.(chairman,manager,coach,staff)');
    const msg = JSON.stringify({ title: 'New player sign-up ⚽', body: name + ' wants to join the squad — tap to approve.', url: '/playermanager1933.html' });
    await Promise.all(subs.map(function (s) {
      try { return webpush.sendNotification(s.subscription, msg).catch(function () {}); }
      catch (e) { return Promise.resolve(); }   // a bad/expired subscription can't break the rest
    }));
    return subs.length;
  } catch (e) { return 0; }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  if (!L.KEY) return L.resp(500, { ok: false, error: 'Server not configured (SUPABASE_SERVICE_KEY)' });
  const b = L.parseBody(event);

  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').trim();
  const position = String(b.position || '').trim();
  const username = String(b.username || '').trim().toLowerCase();
  const code = String(b.code || '').trim();
  if (!name || !email || !phone || !username || !code) return L.resp(400, { ok: false, error: 'Fill in every field.' });
  if (!/^\d{6}$/.test(code)) return L.resp(400, { ok: false, error: 'Your code must be exactly 6 numbers.' });
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) return L.resp(400, { ok: false, error: 'Username: 3–24 letters/numbers.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return L.resp(400, { ok: false, error: 'Enter a valid email.' });

  // Rate-limit: max 5 signups per IP per hour.
  const since = new Date(Date.now() - 3600000).toISOString();
  const recent = await L.sel('la_login_attempts?select=id&username=eq.__signup__&ip=eq.' + encodeURIComponent(ip(event)) + '&at=gt.' + since);
  if (recent.length >= 5) return L.resp(429, { ok: false, error: 'Too many signups from here — try again later.' });
  await L.ins('la_login_attempts', { username: '__signup__', ip: ip(event), ok: true });

  // Username taken?
  const uClash = await L.sel('la_players?select=id&username=eq.' + encodeURIComponent(username));
  if (uClash.length) return L.resp(409, { ok: false, error: 'That username is taken — pick another.' });

  // Default team + current season.
  const seasons = await L.sel('la_seasons?select=id&is_current=eq.true&limit=1');
  const teams = await L.sel('la_teams?select=id&order=id&limit=1');
  const season = (seasons[0] || {}).id || '2026-27';
  const team_id = (teams[0] || {}).id || null;
  const pin_hash = L.hashCode(code);

  // Dedupe on email — reactivate a former player, never duplicate.
  const existing = await L.sel('la_players?select=id,status&email=eq.' + encodeURIComponent(email));
  let player;
  if (existing.length) {
    const ex = existing[0];
    if (ex.status === 'active' || ex.status === 'injured' || ex.status === 'pending') {
      return L.resp(409, { ok: false, error: 'You already have an account — please sign in instead.' });
    }
    const up = await L.upd('la_players', 'id=eq.' + ex.id, { name, phone, position, username, pin_hash, status: 'pending', photo_consent: !!b.photo_consent });
    player = (up.data || [])[0];
  } else {
    const inr = await L.ins('la_players', { team_id, season, name, email, phone, position, username, pin_hash, status: 'pending', photo_consent: !!b.photo_consent });
    if (!inr.ok) return L.resp(500, { ok: false, error: (inr.data && inr.data.message) || 'Could not create your account.' });
    player = (inr.data || [])[0];
  }
  if (!player) return L.resp(500, { ok: false, error: 'Could not create your account.' });

  // App-user account (active account, pending player) + session.
  let au = await L.sel('la_app_users?select=id&player_id=eq.' + player.id);
  let userId;
  if (au.length) { userId = au[0].id; }
  else {
    const air = await L.ins('la_app_users', { player_id: player.id, role: 'player', team_id, status: 'active' });
    userId = ((air.data || [])[0] || {}).id;
  }
  const token = L.newToken();
  await L.ins('la_sessions', { token, user_id: userId, expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });
  await L.audit(userId, 'signup', 'player', player.id, null, { name, status: 'pending' });
  const managementAlerted = await notifyManagement(name);

  return L.resp(200, { ok: true, token, status: 'pending', managementAlerted: managementAlerted, player: { id: player.id, name, position } });
};
