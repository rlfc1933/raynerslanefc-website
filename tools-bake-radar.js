// Bake the Sponsor Radar business snapshots so the tool loads instantly (no live
// Overpass query when staff open it). Run:  node tools-bake-radar.js
//
// Fetches every radius from OpenStreetMap (Overpass), scores + de-dupes with the
// SAME code the live function uses, and writes netlify/functions/radar-data/
// discover-{1,3,5,10}.json — bundled with the function, never publicly served.
// Re-run whenever you want to refresh the built-in list.
const fs = require('fs');
const path = require('path');
const { bboxQuery, processElements, politeHeaders } = require('./netlify/functions/lib/radar');

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const OUT = path.join(__dirname, 'netlify/functions/radar-data');

async function fetchRadius(mi) {
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: politeHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: 'data=' + encodeURIComponent(bboxQuery(mi)),
    signal: AbortSignal.timeout(60000),      // no Netlify limit here — take the time
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const raw = (j.elements || []).length;
  const list = processElements(j.elements, mi);
  return { list: list, capped: raw >= 1500, bakedAt: new Date().toISOString() };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const mi of [1, 3, 5, 10]) {
    const t = Date.now();
    try {
      const data = await fetchRadius(mi);
      fs.writeFileSync(path.join(OUT, 'discover-' + mi + '.json'), JSON.stringify(data));
      const reach = data.list.filter(function (b) { return b.phone || b.email || b.website; }).length;
      console.log('  ' + mi + 'mi: ' + data.list.length + ' businesses (' + reach + ' reachable)' + (data.capped ? ' [capped]' : '') + '  — ' + ((Date.now() - t) / 1000).toFixed(1) + 's');
    } catch (e) {
      console.log('  ' + mi + 'mi: FAILED — ' + e.message);
    }
    await new Promise(function (r) { setTimeout(r, 2000); });   // be gentle between queries
  }
  console.log('  done → netlify/functions/radar-data/');
})();
