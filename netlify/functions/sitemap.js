// Rayners Lane FC — dynamic sitemap.xml (served at /sitemap.xml via a forced
// redirect in netlify.toml). Lists every static page PLUS every news article
// (news-article.html?id=…) with an accurate lastmod pulled live from
// data/news.json, so it stays correct as staff publish. Fixtures live on one
// page (fixtures.html) so there's no per-fixture URL to add — that page is
// included with a daily changefreq. Falls back to just the static pages if the
// news read ever fails, so the sitemap is never empty.

var BASE = 'https://raynerslanefc.co.uk';

// [path, changefreq, priority]
var PAGES = [
  ['/', 'weekly', '1.0'],
  ['/innovation.html', 'yearly', '0.7'],
  ['/fixtures.html', 'daily', '0.9'],
  ['/news.html', 'daily', '0.9'],
  ['/squad.html', 'weekly', '0.8'],
  ['/trials.html', 'monthly', '0.8'],
  ['/membership.html', 'monthly', '0.7'],
  ['/about.html', 'monthly', '0.7'],
  ['/contact.html', 'monthly', '0.7'],
  ['/history.html', 'monthly', '0.6'],
  ['/gallery.html', 'weekly', '0.6'],
  ['/fan-zone.html', 'monthly', '0.6'],
  ['/volunteer.html', 'monthly', '0.6'],
  ['/investment.html', 'monthly', '0.6'],
  ['/programme.html', 'weekly', '0.5'],
  ['/programmes.html', 'weekly', '0.5'],
  ['/shop.html', 'monthly', '0.5'],
  ['/media.html', 'monthly', '0.5'],
  ['/policies.html', 'yearly', '0.3'],
];

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function urlXml(loc, lastmod, changefreq, priority) {
  return '  <url><loc>' + esc(loc) + '</loc>' +
    (lastmod ? '<lastmod>' + esc(lastmod) + '</lastmod>' : '') +
    '<changefreq>' + changefreq + '</changefreq><priority>' + priority + '</priority></url>';
}

exports.handler = async function () {
  var urls = PAGES.map(function (p) { return urlXml(BASE + p[0], null, p[1], p[2]); });

  try {
    var r = await fetch(BASE + '/data/news.json', { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      var d = await r.json();
      (d.articles || []).forEach(function (a) {
        if (a && a.id) urls.push(urlXml(BASE + '/news-article.html?id=' + encodeURIComponent(a.id), a.date || null, 'monthly', '0.7'));
      });
    }
  } catch (e) { /* keep the static-page sitemap */ }

  // Player profiles. Worth indexing now that the edge function (meta.js) gives
  // each one a real title, description and Person schema instead of the same
  // empty shell — 24 pages about real people, each tied back to the club
  // entity, is exactly the kind of thing that builds an entity out.
  // lastmod comes from players.json's updatedAt: per-player dates don't exist,
  // and inventing one would be lying to a crawler about freshness.
  try {
    var pr = await fetch(BASE + '/data/players.json', { signal: AbortSignal.timeout(6000) });
    if (pr.ok) {
      var pd = await pr.json();
      var mod = (pd.updatedAt || '').slice(0, 10) || null;
      (pd.players || []).forEach(function (p) {
        if (p && p.id) urls.push(urlXml(BASE + '/player.html?id=' + encodeURIComponent(p.id), mod, 'monthly', '0.5'));
      });
    }
  } catch (e) { /* players are a bonus — never fail the sitemap over them */ }

  var body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    body: body,
  };
};
