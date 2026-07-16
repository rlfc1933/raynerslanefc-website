// Sponsor Radar — GEOCODE. Reverse-geocode ONE business's coordinates to a
// postal address when OSM didn't publish addr:* tags. PIN-gated, cached forever
// in Blobs (an address doesn't change), and polite: called one business at a
// time (as a drawer opens), never in bulk, with a valid User-Agent per
// Nominatim's usage policy. Set NOMINATIM_EMAIL for a proper contact.

const adminOk = require('./lib/pin');
const { cacheGet, cacheSet, politeHeaders, resp } = require('./lib/radar');

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });
  const lat = +b.lat, lng = +b.lng;
  if (isNaN(lat) || isNaN(lng)) return resp(400, { ok: false, error: 'no-coords' });

  const key = 'geo:' + lat.toFixed(5) + ',' + lng.toFixed(5);
  const cached = await cacheGet(key, null);          // addresses don't expire
  if (cached) return resp(200, Object.assign({ ok: true, source: 'cache' }, cached.data));

  try {
    const r = await fetch(NOMINATIM + '?format=jsonv2&zoom=18&addressdetails=1&lat=' + lat + '&lon=' + lng, { headers: politeHeaders(), signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'nominatim ' + r.status });
    const j = await r.json();
    const a = j.address || {};
    const parts = [
      [a.house_number, a.road].filter(Boolean).join(' '),
      a.suburb || a.neighbourhood || a.village || a.town || a.city,
      a.postcode,
    ].filter(Boolean);
    const out = { address: parts.join(', '), postcode: a.postcode || '', display_name: j.display_name || '', source: 'Nominatim / OpenStreetMap' };
    await cacheSet(key, out);
    return resp(200, Object.assign({ ok: true, source: 'nominatim' }, out));
  } catch (e) { return resp(200, { ok: false, error: (e && e.message) || 'geocode-failed' }); }
};
