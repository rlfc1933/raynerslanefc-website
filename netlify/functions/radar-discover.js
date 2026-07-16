// Sponsor Radar — DISCOVER. Real local businesses near Tithe Farm from
// OpenStreetMap (Overpass API, free, no key). PIN-gated (staff only) and cached
// in Netlify Blobs for 24h so we query Overpass rarely, not per page load.
//
// ⛔ Only businesses the mapper chose to publish, and only the tags they chose to
//    publish (name, address, phone, website, email, hours). Nothing invented.
//    Attribution: © OpenStreetMap contributors (shown in the UI).

const adminOk = require('./lib/pin');
const { TITHE, haversineMiles, categoryOf, osmFitScore, cacheGet, cacheSet, politeHeaders, resp } = require('./lib/radar');

const OVERPASS = 'https://overpass-api.de/api/interpreter';
// business-relevant amenities only (skip schools, benches, places of worship…)
const AMENITY_RE = 'restaurant|cafe|pub|bar|fast_food|food_court|ice_cream|bank|pharmacy|dentist|doctors|veterinary|clinic|optician|car_repair|fuel|car_wash|car_rental|driving_school|vehicle_inspection|marketplace|bureau_de_change|cinema|nightclub|gym';
const CACHE_MS = 24 * 3600 * 1000;

function buildQuery(metres) {
  const c = TITHE.lat + ',' + TITHE.lng;
  return '[out:json][timeout:25];(' +
    'nwr(around:' + metres + ',' + c + ')[shop][name];' +
    'nwr(around:' + metres + ',' + c + ')[amenity~"^(' + AMENITY_RE + ')$"][name];' +
    'nwr(around:' + metres + ',' + c + ')[office][name];' +
    'nwr(around:' + metres + ',' + c + ')[craft][name];' +
    'nwr(around:' + metres + ',' + c + ')[leisure~"^(fitness_centre|sports_centre)$"][name];' +
    // 10 miles of west London is thousands of businesses; cap the raw payload.
    // Proximity dominates the fit score, so the list still leads with the nearest.
    ');out center tags 1200;';
}
var RAW_LIMIT = 1200;

function addressFrom(t) {
  const p = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:city'], t['addr:postcode']].filter(Boolean);
  return p.join(', ');
}
function normName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

async function overpass(radiusMiles) {
  const metres = Math.round(radiusMiles * 1609.34);
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: politeHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: 'data=' + encodeURIComponent(buildQuery(metres)),
    signal: AbortSignal.timeout(28000),
  });
  if (!r.ok) throw new Error('overpass ' + r.status);
  const j = await r.json();
  const rawCount = (j.elements || []).length;
  const seen = {}, out = [];
  (j.elements || []).forEach(function (el) {
    const t = el.tags || {}; if (!t.name) return;
    const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
    const lng = el.lon != null ? el.lon : (el.center && el.center.lon);
    if (lat == null || lng == null) return;
    // dedupe: OSM often has a node AND a way for the same place
    const k = normName(t.name) + '@' + lat.toFixed(3) + ',' + lng.toFixed(3);
    if (seen[k]) return; seen[k] = 1;
    const cat = categoryOf(t);
    const dist = haversineMiles(TITHE.lat, TITHE.lng, lat, lng);
    const biz = {
      id: el.type[0] + el.id,
      osm_type: el.type, osm_id: el.id,
      name: t.name,
      category: cat.cat, category_label: cat.label,
      lat: lat, lng: lng,
      address: addressFrom(t),
      postcode: t['addr:postcode'] || '',
      phone: t.phone || t['contact:phone'] || '',
      website: t.website || t['contact:website'] || t.url || '',
      email: t.email || t['contact:email'] || '',
      opening_hours: t.opening_hours || '',
      distance_miles: +dist.toFixed(2),
      tags: t,
      source: 'OpenStreetMap',
      osm_url: 'https://www.openstreetmap.org/' + el.type + '/' + el.id,
    };
    const fit = osmFitScore(biz, radiusMiles);
    biz.fit_score = fit.score; biz.fit_reasons = fit.reasons; biz.fit_category_pending = fit.categoryPending;
    out.push(biz);
  });
  out.sort(function (a, b) { return b.fit_score - a.fit_score || a.distance_miles - b.distance_miles; });
  return { list: out, capped: rawCount >= RAW_LIMIT };   // capped = hit payload cap, more exist
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const radius = [1, 3, 5, 10].indexOf(+b.radius) > -1 ? +b.radius : 3;
  const key = 'discover:' + radius;

  if (!b.refresh) {
    const cached = await cacheGet(key, CACHE_MS);
    if (cached) return resp(200, { ok: true, radius: radius, businesses: cached.data.list, capped: cached.data.capped, cachedAt: cached.at, source: 'cache' });
  }
  try {
    const res = await overpass(radius);
    await cacheSet(key, res);
    return resp(200, { ok: true, radius: radius, businesses: res.list, capped: res.capped, cachedAt: new Date().toISOString(), source: 'overpass' });
  } catch (e) {
    // On an Overpass hiccup, fall back to any cached copy (even if stale) so the
    // tool still works rather than going blank.
    const stale = await cacheGet(key, null);
    if (stale) return resp(200, { ok: true, radius: radius, businesses: stale.data.list, capped: stale.data.capped, cachedAt: stale.at, source: 'cache-stale', warn: 'Overpass unavailable — showing last cached results.' });
    return resp(200, { ok: false, error: (e && e.message) || 'overpass-failed' });
  }
};
