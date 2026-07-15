/* Server-side <head> for the ?id= pages.
 *
 * THE PROBLEM
 * news-article.html?id=… and player.html?id=… are one HTML shell that fills
 * itself in from JSON in the browser. Googlebot renders JavaScript, so it
 * mostly copes. The AI crawlers — GPTBot, ClaudeBot, PerplexityBot, CCBot —
 * largely DO NOT. They fetch the HTML and read what's in it. So every article
 * and every player looked to them like the same page: "News | Rayners Lane FC",
 * no description, no canonical, no structured data, no content.
 *
 * That's the whole audience this work is aimed at, so a client-side fix isn't
 * a fix. This runs at the edge, before the response reaches the crawler: it
 * reads the id, looks the item up in the same JSON the page uses, and rewrites
 * the <head> — real title, description, canonical, OG/Twitter, and JSON-LD
 * (NewsArticle / Person) — plus a <noscript> copy of the actual text so a
 * non-rendering bot gets the content, not a shell.
 *
 * Rules it follows:
 *  - Only ever states what's in the club's own JSON. An unknown id gets the
 *    page untouched rather than an invented title.
 *  - If anything throws, return the original response. A broken <head> is worse
 *    than a generic one, and this sits in front of real supporters' page loads.
 *  - The browser JS still runs and does its own thing; this only fills the head.
 */

const ORIGIN = 'https://raynerslanefc.co.uk';
const CLUB_ID = ORIGIN + '/#team';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function abs(u) {
  if (!u) return ORIGIN + '/img/og-card.jpg';
  if (/^https?:\/\//i.test(u)) return u;
  return ORIGIN + '/' + String(u).replace(/^\//, '');
}
// Strip HTML and clamp — article bodies carry markup we don't want in a
// meta description.
function plain(s, n) {
  const t = String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return n && t.length > n ? t.slice(0, n - 1).replace(/[\s,.;:]+\S*$/, '') + '…' : t;
}

async function loadJSON(url) {
  const r = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!r.ok) throw new Error('fetch ' + r.status);
  return r.json();
}

function headFor(page, item) {
  if (page === 'news') {
    const title = item.title + ' | Rayners Lane FC';
    const desc = plain(item.excerpt || item.body, 155) ||
      'News from Rayners Lane FC, Harrow.';
    const url = ORIGIN + '/news-article.html?id=' + encodeURIComponent(item.id);
    // og:image must be a RASTER at a sensible size. WhatsApp, Facebook and
    // iMessage will not render an SVG preview — and several articles carry an
    // SVG crest as their image, so the link preview silently showed nothing.
    // Fall back to the club's own OG card, which is a real 1200x630 JPEG.
    const raw = abs(item.image);
    const img = (!raw || /\.svg(\?|$)/i.test(raw)) ? ORIGIN + '/img/og-card.jpg' : raw;
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: plain(item.title, 110),
      description: desc,
      datePublished: item.date,
      dateModified: item.dateModified || item.date,
      image: { '@type': 'ImageObject', url: img },
      author: { '@type': 'Organization', name: item.author || 'Rayners Lane FC', url: ORIGIN + '/' },
      publisher: { '@id': CLUB_ID },
      about: { '@id': CLUB_ID },
      isPartOf: { '@id': ORIGIN + '/#website' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      articleSection: item.category || 'Club News',
      inLanguage: 'en-GB'
    };
    return { title, desc, url, img, ld, type: 'article',
             body: plain(item.body, 1800), heading: item.title };
  }
  // player
  // role ("Centre Midfield") is the specific one; position ("Midfielder") is
  // the bucket. Joining both gives "plays Centre Midfield, Midfielder", which
  // reads like a machine wrote it — and this is the sentence an answer engine
  // quotes. Prefer the specific, fall back to the bucket.
  const pos = item.role || item.position || '';
  const title = item.name + (item.position ? ' — ' + item.position : '') + ' | Rayners Lane FC';
  const desc = plain(item.bio, 155) ||
    (item.name + (pos ? ' plays ' + pos : ' plays') +
     ' for Rayners Lane FC in the Combined Counties Premier Division North, at Step 5 of the English football pyramid.');
  const url = ORIGIN + '/player.html?id=' + encodeURIComponent(item.id);
  const img = abs(item.photo);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: item.name,
    url: url,
    memberOf: { '@id': CLUB_ID },
    affiliation: { '@id': CLUB_ID },
    inLanguage: 'en-GB'
  };
  // Only add what the club actually recorded — no invented stats or nationality.
  if (item.photo) ld.image = img;
  if (item.position) ld.jobTitle = item.position;
  if (item.nationality) ld.nationality = { '@type': 'Country', name: item.nationality };
  if (item.bio) ld.description = plain(item.bio, 400);
  if (item.nickname) ld.alternateName = item.nickname;
  return { title, desc, url, img, ld, type: 'profile',
           body: plain(item.bio, 1200) || desc, heading: item.name +
             (pos ? ' — ' + pos : '') };
}

export default async function handler(request, context) {
  let res;
  try {
    res = await context.next();
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return res;

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const isNews = url.pathname.includes('news-article');
    if (!id) return res;   // the bare page is fine as-is

    const data = await loadJSON(ORIGIN + (isNews ? '/data/news.json' : '/data/players.json'));
    const list = isNews ? (data.articles || []) : (data.players || []);
    const item = list.find(function (x) { return String(x.id) === String(id); });
    // Unknown id → hand back the original. Never invent a title for something
    // the club doesn't have.
    if (!item) return res;

    const h = headFor(isNews ? 'news' : 'player', item);
    let html = await res.text();

    const tags = [
      '<title>' + esc(h.title) + '</title>',
      '<meta name="description" content="' + esc(h.desc) + '">',
      '<link rel="canonical" href="' + esc(h.url) + '">',
      '<meta property="og:type" content="' + h.type + '">',
      '<meta property="og:site_name" content="Rayners Lane FC">',
      '<meta property="og:locale" content="en_GB">',
      '<meta property="og:url" content="' + esc(h.url) + '">',
      '<meta property="og:title" content="' + esc(h.title) + '">',
      '<meta property="og:description" content="' + esc(h.desc) + '">',
      '<meta property="og:image" content="' + esc(h.img) + '">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:title" content="' + esc(h.title) + '">',
      '<meta name="twitter:description" content="' + esc(h.desc) + '">',
      '<meta name="twitter:image" content="' + esc(h.img) + '">',
      '<link rel="alternate" hreflang="en-GB" href="' + esc(h.url) + '">',
      '<link rel="alternate" hreflang="x-default" href="' + esc(h.url) + '">',
      '<script type="application/ld+json">' + JSON.stringify(h.ld) + '</script>'
    ].join('\n  ');

    // Strip the shell's own head tags BEFORE injecting, or the page ends up
    // with two of each and the FIRST wins — which is the shell's generic one.
    // That silently made every article share one description.
    html = html
      .replace(/<title>[\s\S]*?<\/title>/i, '')
      .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
      .replace(/<meta\s+(?:property|name)=["'](?:og|twitter):[^"']*["'][^>]*>/gi, '')
      .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
      .replace(/<link\s+rel=["']alternate["'][^>]*hreflang[^>]*>/gi, '');
    html = html.replace(/<\/head>/i, '  ' + tags + '\n</head>');

    // A copy of the real content for crawlers that never run the page's JS.
    // <noscript> is ignored by browsers (the JS renders the pretty version) but
    // read by bots — so they get the actual words instead of an empty shell.
    if (h.body) {
      html = html.replace(/<body([^>]*)>/i, '<body$1>\n<noscript><article>' +
        '<h1>' + esc(h.heading) + '</h1>' +
        (h.type === 'article' ? '<p><time datetime="' + esc(item.date) + '">' + esc(item.date) + '</time></p>' : '') +
        '<p>' + esc(h.body) + '</p>' +
        '<p><a href="' + ORIGIN + '/">Rayners Lane FC</a></p>' +
        '</article></noscript>');
    }

    return new Response(html, { status: res.status, headers: res.headers });
  } catch (e) {
    // Never break the page for a real visitor over a meta tag.
    return res || context.next();
  }
}

export const config = { path: ['/news-article.html', '/player.html'] };
