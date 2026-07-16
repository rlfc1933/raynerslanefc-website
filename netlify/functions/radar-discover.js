// Sponsor Radar — DISCOVER. Serves REAL local businesses near Tithe Farm from
// OpenStreetMap. PIN-gated (staff only).
//
// Speed: the businesses are BAKED into the deploy (tools-bake-radar.js) so the
// tool loads INSTANTLY — no live Overpass query when staff open it, no waiting.
// "Refresh from OpenStreetMap" does a live bounding-box query (fast enough for
// Netlify's 10s limit) and caches the fresh result in Blobs; the baked snapshot
// is always there as the floor. Nothing is invented; only published OSM tags.

const adminOk = require('./lib/pin');
const { bboxQuery, processElements, cacheGet, cacheSet, politeHeaders, resp } = require('./lib/radar');

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const CACHE_MS = 24 * 3600 * 1000;

// Baked snapshots, bundled with the function (private, not publicly served).
// require() so Netlify's bundler includes them.
const BAKED = {
  1: safeRequire('./radar-data/discover-1.json'),
  3: safeRequire('./radar-data/discover-3.json'),
  5: safeRequire('./radar-data/discover-5.json'),
  10: safeRequire('./radar-data/discover-10.json'),
};
function safeRequire(p) { try { return require(p); } catch (e) { return null; } }

async function live(radiusMiles) {
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: politeHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: 'data=' + encodeURIComponent(bboxQuery(radiusMiles)),
    signal: AbortSignal.timeout(9000),           // stay inside Netlify's 10s limit
  });
  if (!r.ok) throw new Error('overpass ' + r.status);
  const j = await r.json();
  const list = processElements(j.elements, radiusMiles);
  return { list: list, capped: (j.elements || []).length >= 1500 };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const radius = [1, 3, 5, 10].indexOf(+b.radius) > -1 ? +b.radius : 3;
  const key = 'discover:' + radius;

  if (!b.refresh) {
    // instant path: a recent live refresh if one exists, otherwise the baked snapshot
    const cached = await cacheGet(key, CACHE_MS);
    if (cached) return resp(200, { ok: true, radius: radius, businesses: cached.data.list, capped: cached.data.capped, cachedAt: cached.at, source: 'cache' });
    const baked = BAKED[radius];
    if (baked && baked.list) return resp(200, { ok: true, radius: radius, businesses: baked.list, capped: baked.capped, cachedAt: baked.bakedAt || null, source: 'baked' });
    // no baked snapshot for this radius yet — do a one-off live fetch
  }

  try {
    const res = await live(radius);
    await cacheSet(key, res);
    return resp(200, { ok: true, radius: radius, businesses: res.list, capped: res.capped, cachedAt: new Date().toISOString(), source: 'overpass' });
  } catch (e) {
    // live failed (Overpass slow/busy) — fall back to Blobs, then baked, so it's
    // NEVER blank.
    const stale = await cacheGet(key, null);
    if (stale) return resp(200, { ok: true, radius: radius, businesses: stale.data.list, capped: stale.data.capped, cachedAt: stale.at, source: 'cache-stale', warn: 'OpenStreetMap is busy — showing the last saved list.' });
    const baked = BAKED[radius];
    if (baked && baked.list) return resp(200, { ok: true, radius: radius, businesses: baked.list, capped: baked.capped, cachedAt: baked.bakedAt || null, source: 'baked', warn: 'OpenStreetMap is busy — showing the built-in list.' });
    return resp(200, { ok: false, error: (e && e.message) || 'overpass-failed' });
  }
};
