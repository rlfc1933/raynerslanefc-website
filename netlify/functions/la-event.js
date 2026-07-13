// Staff: create an event (match / friendly / charity / photoshoot / club event)
// or list events. Friendlies, charity games, photoshoots & club nights are
// added here — they never come from a feed. Times are stored as UTC timestamptz.
const L = require('./lib/lane');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  const b = L.parseBody(event);

  // GET/list is public-ish for the app; still require a valid session.
  const sess = await L.session(L.tokenFrom(event, b));
  if (!sess) return L.resp(403, { ok: false, error: 'Sign in first.' });

  if (b.action === 'list' || event.httpMethod === 'GET') {
    const rows = await L.sel('la_events?select=*,la_venues(club_name,ground,address,lat,lng)&order=starts_at');
    return L.resp(200, { ok: true, events: rows });
  }

  // create
  if (!L.isStaffRole(sess.role)) return L.resp(403, { ok: false, error: 'Staff only.' });
  const TYPES = ['league', 'cup', 'charity', 'friendly', 'training', 'photoshoot', 'club_event'];
  const type = String(b.type || '').trim();
  if (TYPES.indexOf(type) < 0) return L.resp(400, { ok: false, error: 'Unknown event type.' });
  const startsAt = b.starts_at ? new Date(b.starts_at) : null;
  if (!startsAt || isNaN(startsAt.getTime())) return L.resp(400, { ok: false, error: 'Need a valid start time (ISO/UTC).' });
  const isMatch = ['league', 'cup', 'charity', 'friendly'].indexOf(type) >= 0;
  if (isMatch && !b.opponent) return L.resp(400, { ok: false, error: 'Who are we playing?' });

  // Upsert the venue (lat/lng matter for the map deep-links).
  let venue_id = null;
  if (b.venue && b.venue.club_name) {
    const v = await L.ins('la_venues', {
      club_name: String(b.venue.club_name).trim(), ground: b.venue.ground || null,
      address: b.venue.address || null, lat: b.venue.lat != null ? Number(b.venue.lat) : null,
      lng: b.venue.lng != null ? Number(b.venue.lng) : null,
    }, { upsert: true, onConflict: 'club_name' });
    venue_id = ((v.data || [])[0] || {}).id || null;
  }

  const teams = await L.sel('la_teams?select=id&order=id&limit=1');
  const seasons = await L.sel('la_seasons?select=id&is_current=eq.true&limit=1');
  const row = {
    team_id: (teams[0] || {}).id || null, season: (seasons[0] || {}).id || '2026-27',
    type, opponent: b.opponent || null, is_home: b.is_home !== false,
    competition: b.competition || null, starts_at: startsAt.toISOString(),
    meet_at: b.meet_at ? new Date(b.meet_at).toISOString() : null, kit: b.kit || null,
    venue_id, source: b.source === 'fwp_import' ? 'fwp_import' : 'staff', published: false, created_by: sess.user_id,
  };
  const inr = await L.ins('la_events', row);
  if (!inr.ok) return L.resp(500, { ok: false, error: (inr.data && inr.data.message) || 'Could not create event.' });
  const ev = (inr.data || [])[0];
  await L.audit(sess.user_id, 'create_event', 'event', ev.id, null, row);
  return L.resp(200, { ok: true, event: ev });
};
