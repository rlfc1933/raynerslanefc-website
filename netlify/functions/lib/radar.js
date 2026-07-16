// Rayners Lane FC — Sponsor Radar shared helpers.
//
// Distance, category weighting, the transparent fit score, and a Netlify-Blobs
// cache so we hit the free public APIs (Overpass / Nominatim / Companies House)
// RARELY, not per page load. Everything here works on real, sourced data only —
// nothing is invented.
//
// ⛔ The cache store 'rlfc-radar' is SERVER-SIDE and PRIVATE. It holds business
//    contact data and prospecting notes and is only ever read/written by the
//    PIN-gated radar-* functions. It is never public and never committed.

const TITHE = { lat: 51.5704, lng: -0.3651 };   // Tithe Farm, Rayners Lane HA2 0XH

function haversineMiles(aLat, aLng, bLat, bLng) {
  const R = 3958.8, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Map an OSM tag set to one of our buckets + a grassroots-sponsorship weight.
// The weight is a TRANSPARENT heuristic about which trades tend to back local
// clubs — it is NOT a claim about the individual business. Shown as reasoning.
const AMENITY_HOSPITALITY = ['restaurant', 'cafe', 'pub', 'bar', 'fast_food', 'biergarten', 'food_court', 'ice_cream'];
const AMENITY_AUTO = ['car_repair', 'fuel', 'car_wash', 'car_rental', 'driving_school', 'tyres', 'vehicle_inspection'];
const AMENITY_HEALTH = ['pharmacy', 'dentist', 'doctors', 'veterinary', 'clinic', 'optician'];
const AMENITY_PRO = ['bank', 'lawyer', 'accountant', 'insurance', 'estate_agent', 'coworking_space'];

function categoryOf(tags) {
  tags = tags || {};
  const shop = tags.shop, amenity = tags.amenity, office = tags.office, craft = tags.craft, leisure = tags.leisure;
  // trades & crafts — historically strong grassroots sponsors
  if (craft) return { cat: 'trades', label: 'Trades & crafts', weight: 30 };
  if (amenity && AMENITY_HOSPITALITY.indexOf(amenity) > -1) return { cat: 'hospitality', label: 'Hospitality', weight: 30 };
  if (shop === 'car' || shop === 'car_repair' || (amenity && AMENITY_AUTO.indexOf(amenity) > -1) || shop === 'tyres') return { cat: 'automotive', label: 'Motor trade', weight: 26 };
  if (office === 'estate_agent' || shop === 'estate_agent') return { cat: 'professional', label: 'Estate agent', weight: 24 };
  if (amenity && AMENITY_PRO.indexOf(amenity) > -1) return { cat: 'professional', label: 'Professional services', weight: 22 };
  if (office) return { cat: 'professional', label: 'Office / professional', weight: 20 };
  if (leisure === 'fitness_centre' || leisure === 'sports_centre' || amenity === 'gym') return { cat: 'fitness', label: 'Gym / fitness', weight: 22 };
  if (amenity && AMENITY_HEALTH.indexOf(amenity) > -1) return { cat: 'health', label: 'Health', weight: 16 };
  if (shop === 'convenience' || shop === 'supermarket' || shop === 'butcher' || shop === 'bakery' || shop === 'greengrocer' || shop === 'hairdresser' || shop === 'beauty' || shop === 'florist') return { cat: 'retail', label: 'Local retail', weight: 22 };
  if (shop) return { cat: 'retail', label: 'Retail', weight: 18 };
  if (amenity) return { cat: 'other', label: 'Amenity', weight: 12 };
  return { cat: 'other', label: 'Other', weight: 10 };
}

// The fit score — computed from REAL local signals only, 0-100, returned WITH
// its reasons so staff can see exactly why. Three components: proximity (40),
// business type (30), reachable (30). No third-party registration data.
function osmFitScore(biz, radiusMiles) {
  const reasons = [];
  let score = 0;

  // proximity (max 40) — closer is better
  const prox = Math.max(0, 1 - (biz.distance_miles / Math.max(radiusMiles, 0.5)));
  const proxPts = Math.round(prox * 40);
  score += proxPts;
  reasons.push({ label: 'Proximity', pts: proxPts, note: biz.distance_miles.toFixed(1) + ' mi from Tithe Farm' });

  // category weight (max 30)
  const c = categoryOf(biz.tags);
  score += c.weight;
  reasons.push({ label: 'Business type', pts: c.weight, note: c.label + ' — local trades of this kind often back grassroots clubs' });

  // reachable (max 30) — do they publish a way to contact them?
  let reach = 0; const has = [];
  if (biz.email) { reach += 12; has.push('email'); }
  if (biz.phone) { reach += 12; has.push('phone'); }
  if (biz.website) { reach += 6; has.push('website'); }
  score += reach;
  reasons.push({ label: 'Reachable', pts: reach, note: has.length ? 'Published ' + has.join(' + ') : 'No published contact details yet' });

  return { score: Math.min(100, score), reasons: reasons };
}

// ── Overpass query + processing (shared by the function AND the bake script) ──
// A BOUNDING-BOX query is far faster than `around` (which measures distance for
// every element), so it fits inside Netlify's 10s function limit. We then filter
// the square back down to the circle in code.
const AMENITY_RE = 'restaurant|cafe|pub|bar|fast_food|food_court|ice_cream|bank|pharmacy|dentist|doctors|veterinary|clinic|optician|car_repair|fuel|car_wash|car_rental|driving_school|vehicle_inspection|marketplace|bureau_de_change|cinema|nightclub|gym';
function normName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function bboxQuery(radiusMiles) {
  const dLat = radiusMiles / 69, dLng = radiusMiles / (69 * Math.cos(TITHE.lat * Math.PI / 180));
  const bb = '(' + (TITHE.lat - dLat).toFixed(5) + ',' + (TITHE.lng - dLng).toFixed(5) + ',' + (TITHE.lat + dLat).toFixed(5) + ',' + (TITHE.lng + dLng).toFixed(5) + ')';
  return '[out:json][timeout:25];(' +
    'nwr' + bb + '[shop][name];' +
    'nwr' + bb + '[amenity~"^(' + AMENITY_RE + ')$"][name];' +
    'nwr' + bb + '[office][name];' +
    'nwr' + bb + '[craft][name];' +
    'nwr' + bb + '[leisure~"^(fitness_centre|sports_centre)$"][name];' +
    ');out center tags 1500;';
}
function addressFrom(t) {
  return [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:city'], t['addr:postcode']].filter(Boolean).join(', ');
}
// Turn raw Overpass elements into scored, de-duped business records within the
// circle. Identical logic wherever it runs, so baked data == live data.
function processElements(elements, radiusMiles) {
  const seen = {}, out = [];
  (elements || []).forEach(function (el) {
    const t = el.tags || {}; if (!t.name) return;
    const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
    const lng = el.lon != null ? el.lon : (el.center && el.center.lon);
    if (lat == null || lng == null) return;
    const dist = haversineMiles(TITHE.lat, TITHE.lng, lat, lng);
    if (dist > radiusMiles) return;                 // bbox is a square — keep the circle
    const k = normName(t.name) + '@' + lat.toFixed(3) + ',' + lng.toFixed(3);
    if (seen[k]) return; seen[k] = 1;
    const cat = categoryOf(t);
    const biz = {
      id: el.type[0] + el.id, osm_type: el.type, osm_id: el.id,
      name: t.name, category: cat.cat, category_label: cat.label,
      lat: lat, lng: lng, address: addressFrom(t), postcode: t['addr:postcode'] || '',
      phone: t.phone || t['contact:phone'] || '', website: t.website || t['contact:website'] || t.url || '',
      email: t.email || t['contact:email'] || '', opening_hours: t.opening_hours || '',
      distance_miles: +dist.toFixed(2), tags: t, source: 'OpenStreetMap',
      osm_url: 'https://www.openstreetmap.org/' + el.type + '/' + el.id,
    };
    const fit = osmFitScore(biz, radiusMiles);
    biz.fit_score = fit.score; biz.fit_reasons = fit.reasons;
    out.push(biz);
  });
  out.sort(function (a, b) { return b.fit_score - a.fit_score || a.distance_miles - b.distance_miles; });
  return out;
}

// ── Netlify Blobs cache (private, server-side) ────────────────────────────
async function store() {
  const { getStore } = await import('@netlify/blobs');
  return getStore('rlfc-radar');
}
async function cacheGet(key, maxAgeMs) {
  try {
    const s = await store();
    const v = await s.get(key, { type: 'json' });
    if (!v || !v.at) return null;
    if (maxAgeMs && (Date.now() - new Date(v.at).getTime()) > maxAgeMs) return null;
    return v;
  } catch (e) { return null; }
}
async function cacheSet(key, data) {
  try { const s = await store(); await s.setJSON(key, { at: new Date().toISOString(), data: data }); } catch (e) { /* cache is best-effort */ }
}

// A polite fetch — always identifies the club, per Nominatim/Overpass policy.
function politeHeaders(extra) {
  const email = process.env.NOMINATIM_EMAIL || 'info@raynerslanefc.co.uk';
  return Object.assign({ 'User-Agent': 'RaynersLaneFC-SponsorRadar/1.0 (+https://raynerslanefc.co.uk; ' + email + ')' }, extra || {});
}

function resp(code, obj, cacheSeconds) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (cacheSeconds) headers['Cache-Control'] = 'private, max-age=' + cacheSeconds;
  return { statusCode: code, headers: headers, body: JSON.stringify(obj) };
}

module.exports = { TITHE, haversineMiles, categoryOf, osmFitScore, bboxQuery, processElements, cacheGet, cacheSet, politeHeaders, resp };
