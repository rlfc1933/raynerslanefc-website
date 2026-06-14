// Rayners Lane FC — live league table from Wikipedia (free, open API, CORS).
// Parses the Combined Counties Premier Division North standings table.
// Factual standings only; attributed to Wikipedia (CC BY-SA) on the page.
//
// To roll to a new season, update WIKI_PAGE + SECTION.

const WIKI_PAGE = process.env.WIKI_TABLE_PAGE || '2026–27_Combined_Counties_Football_League';
const SECTION = process.env.WIKI_TABLE_SECTION || '2'; // Premier Division North > League table
const RLFC = /rayners\s*lane/i;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(obj),
  };
}
function strip(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

exports.handler = async function () {
  try {
    const url = 'https://en.wikipedia.org/w/api.php?action=parse&page=' +
      encodeURIComponent(WIKI_PAGE) + '&section=' + encodeURIComponent(SECTION) + '&prop=text&format=json';
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'RaynersLaneFC/1.0 (raynerslanefc.co.uk)' } });
    if (!r.ok) return resp(200, { table: [], error: 'wiki ' + r.status });
    const data = await r.json();
    const html = (((data.parse || {}).text || {})['*']) || '';

    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
    const table = [];
    rows.forEach(function (row) {
      const cells = (row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(strip);
      if (cells.length < 10) return;
      const pos = parseInt(cells[0], 10);
      if (isNaN(pos)) return; // skip header / non-data rows
      const team = cells[1];
      if (!team) return;
      table.push({
        pos: pos, team: team,
        pld: +cells[2] || 0, w: +cells[3] || 0, d: +cells[4] || 0, l: +cells[5] || 0,
        gf: +cells[6] || 0, ga: +cells[7] || 0, gd: cells[8], pts: +cells[9] || 0,
        rlfc: RLFC.test(team),
      });
    });

    return resp(200, { table: table, source: 'Wikipedia', fetchedAt: new Date().toISOString() });
  } catch (e) {
    return resp(200, { table: [], error: e.message });
  }
};
