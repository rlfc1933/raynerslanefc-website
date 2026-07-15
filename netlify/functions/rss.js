// Rayners Lane FC — the club's own RSS feed, served at /rss.xml.
//
// The club used to have a feed because Pitchero gave it one. When the club
// deleted Pitchero, that went with it: fans, apps, aggregators and AI crawlers
// lost the ability to subscribe to us at all. This is the replacement, and it's
// better in the way that matters — we own it. It can't be switched off by a
// platform we don't control, and it points at our pages, not someone else's.
//
// Generated live from data/news.json, so it's correct the moment staff publish.
// No build step, no cache to bust, nothing to remember.
//
// ⛔ Never put anything in here that isn't already public on the site. A feed is
//    read by machines that copy it everywhere.

const BASE = 'https://raynerslanefc.co.uk';
const MAX = 25;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
// Strip tags for <description> — bodies carry markup and a feed reader
// shouldn't have to guess.
function plain(s, n) {
  const t = String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return n && t.length > n ? t.slice(0, n - 1).replace(/[\s,.;:]+\S*$/, '') + '…' : t;
}
function abs(u) {
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : BASE + '/' + String(u).replace(/^\//, '');
}
// RSS wants RFC-822. An invalid date makes a feed reader drop the item silently.
function rfc822(d) {
  const dt = new Date((d || '') + 'T12:00:00Z');
  return isNaN(dt) ? new Date().toUTCString() : dt.toUTCString();
}

exports.handler = async function () {
  let articles = [];
  try {
    const r = await fetch(BASE + '/data/news.json?t=' + Date.now(), { signal: AbortSignal.timeout(8000) });
    if (r.ok) articles = ((await r.json()).articles || []);
  } catch (e) { /* an empty feed is still valid XML — never 500 a feed */ }

  articles.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const items = articles.slice(0, MAX).map((a) => {
    // An article can point at one of our own pages (trials, sponsorship) rather
    // than a news-article URL. Follow whatever it actually links to.
    const link = a.link
      ? abs(a.link)
      : BASE + '/news-article.html?id=' + encodeURIComponent(a.id);
    const img = abs(a.image);
    return [
      '    <item>',
      '      <title>' + esc(a.title) + '</title>',
      '      <link>' + esc(link) + '</link>',
      // Not permanent for linked pages, so say so rather than lie to a reader.
      '      <guid isPermaLink="' + (a.link ? 'false' : 'true') + '">' + esc(a.link ? BASE + '/#' + a.id : link) + '</guid>',
      '      <pubDate>' + rfc822(a.date) + '</pubDate>',
      '      <description>' + esc(plain(a.excerpt || a.body, 400)) + '</description>',
      a.category ? '      <category>' + esc(a.category) + '</category>' : '',
      a.author ? '      <dc:creator>' + esc(a.author) + '</dc:creator>' : '',
      img ? '      <enclosure url="' + esc(img) + '" type="image/' + (/\.png$/i.test(img) ? 'png' : /\.svg$/i.test(img) ? 'svg+xml' : 'jpeg') + '" length="0"/>' : '',
      '    </item>'
    ].filter(Boolean).join('\n');
  }).join('\n');

  const now = new Date().toUTCString();
  const xml =
'<?xml version="1.0" encoding="UTF-8"?>\n' +
'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
'  <channel>\n' +
'    <title>Rayners Lane FC — Club News</title>\n' +
'    <link>' + BASE + '/news.html</link>\n' +
'    <description>News, match reports and announcements from Rayners Lane FC — a community football club in Harrow since 1933, playing in the Combined Counties Premier Division North.</description>\n' +
'    <language>en-GB</language>\n' +
'    <copyright>Rayners Lane FC</copyright>\n' +
'    <lastBuildDate>' + now + '</lastBuildDate>\n' +
'    <atom:link href="' + BASE + '/rss.xml" rel="self" type="application/rss+xml"/>\n' +
'    <image>\n' +
'      <url>' + BASE + '/img/badge.png</url>\n' +
'      <title>Rayners Lane FC — Club News</title>\n' +
'      <link>' + BASE + '/news.html</link>\n' +
'    </image>\n' +
(items ? items + '\n' : '') +
'  </channel>\n' +
'</rss>\n';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // Short cache: a feed that lags a publish is a feed people stop trusting.
      'Cache-Control': 'public, max-age=0, stale-while-revalidate=900',
      'Access-Control-Allow-Origin': '*'
    },
    body: xml
  };
};
