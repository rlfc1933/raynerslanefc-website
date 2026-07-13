// Staff publish the squad → event goes live and every player is pushed their
// status (starting / sub / not selected) with the meet time. Push only fires if
// VAPID is configured; otherwise it marks published and reports that push is off
// (never a silent pretend-send).
const L = require('./lib/lane');
let webpush = null;
try { webpush = require('web-push'); } catch (e) {}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess || !L.isStaffRole(sess.role)) return L.resp(403, { ok: false, error: 'Staff only.' });
  if (!(await L.can(sess, 'can_select_squad'))) return L.resp(403, { ok: false, error: 'Not permitted.' });

  const eventId = parseInt(b.event_id, 10);
  if (!eventId) return L.resp(400, { ok: false, error: 'Which event?' });
  const evs = await L.sel('la_events?select=*,la_venues(ground)&id=eq.' + eventId);
  const ev = evs[0];
  if (!ev) return L.resp(404, { ok: false, error: 'Event not found.' });

  const up = await L.upd('la_events', 'id=eq.' + eventId, { published: true });
  if (!up.ok) return L.resp(500, { ok: false, error: 'Could not publish.' });
  await L.audit(sess.user_id, 'publish', 'event', eventId, { published: ev.published }, { published: true });

  const sel = await L.sel('la_selections?select=role&event_id=eq.' + eventId);
  const counts = { starting: 0, sub: 0 };
  sel.forEach(function (s) { if (s.role === 'starting') counts.starting++; else if (s.role === 'sub') counts.sub++; });

  // Push (best-effort) — only if VAPID is set. Otherwise say so honestly.
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  let notified = 0, pushConfigured = !!(webpush && pub && priv);
  if (pushConfigured) {
    webpush.setVapidDetails('mailto:info@raynerslanefc.co.uk', pub, priv);
    const rows = await L.sel('push_subscriptions?select=subscription');
    const meet = ev.meet_at ? new Date(ev.meet_at).toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : 'TBC';
    const body = 'Squad is up' + (ev.opponent ? ' vs ' + ev.opponent : '') + ' — check the app. Meet ' + meet + '.';
    await Promise.all(rows.map(function (r) {
      return webpush.sendNotification(r.subscription, JSON.stringify({ title: 'Rayners Lane FC', body: body, url: '/playermanager1933.html' })).then(function () { notified++; }).catch(function () {});
    }));
  }
  return L.resp(200, { ok: true, published: true, starting: counts.starting, subs: counts.sub, pushConfigured: pushConfigured, notified: notified });
};
