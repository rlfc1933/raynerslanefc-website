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

// The fit score — computed from REAL signals only, and returned WITH its reasons
// so staff can see exactly why. 0-100. The Companies-House component (up to 20)
// is added later, only once radar-enrich confirms an active, established company;
// until then it's shown as "pending", never guessed.
function osmFitScore(biz, radiusMiles) {
  const reasons = [];
  let score = 0;

  // proximity (max 32) — closer is better
  const prox = Math.max(0, 1 - (biz.distance_miles / Math.max(radiusMiles, 0.5)));
  const proxPts = Math.round(prox * 32);
  score += proxPts;
  reasons.push({ label: 'Proximity', pts: proxPts, note: biz.distance_miles.toFixed(1) + ' mi from Tithe Farm' });

  // category weight (max 30)
  const c = categoryOf(biz.tags);
  score += c.weight;
  reasons.push({ label: 'Business type', pts: c.weight, note: c.label + ' — local trades of this kind often back grassroots clubs' });

  // reachable (max 18) — do they publish a way to contact them?
  let reach = 0; const has = [];
  if (biz.email) { reach += 7; has.push('email'); }
  if (biz.phone) { reach += 7; has.push('phone'); }
  if (biz.website) { reach += 4; has.push('website'); }
  score += reach;
  reasons.push({ label: 'Reachable', pts: reach, note: has.length ? 'Published ' + has.join(' + ') : 'No published contact details yet' });

  return { score: Math.min(100, score), reasons: reasons, categoryPending: 20 };
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

module.exports = { TITHE, haversineMiles, categoryOf, osmFitScore, cacheGet, cacheSet, politeHeaders, resp };
