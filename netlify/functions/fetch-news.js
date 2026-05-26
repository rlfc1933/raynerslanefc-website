// Netlify serverless function — fetches RSS feeds server-side, no CORS issues
// Deployed automatically by Netlify at /.netlify/functions/fetch-news

const FEEDS = [
  { key: 'nonleague', url: 'https://www.thenonleaguefootballpaper.com/feed', label: 'Non-League Paper' },
  { key: 'fa',        url: 'https://www.thefa.com/news/rss.xml',              label: 'The FA' },
  { key: 'pitchero',  url: 'https://www.pitchero.com/clubs/raynerslanefc/rss.xml', label: 'Rayners Lane FC' },
];

function parseItems(xml, key, label) {
  const items = [];
  const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const m of matches) {
    const block = m[1];
    const get = (tag) => {
      const r = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
      return r ? r[1].trim() : '';
    };
    const title   = get('title');
    const link    = get('link') || get('guid');
    const desc    = get('description').replace(/<[^>]+>/g,'').trim().slice(0,200);
    const pubDate = get('pubDate');
    const date    = pubDate ? new Date(pubDate).toISOString().split('T')[0] : '';
    const encUrl  = block.match(/enclosure[^>]+url=["']([^"']+)["']/i)?.[1] || '';
    if (title) items.push({ key, label, title, link, excerpt: desc, date, image: encUrl || '' });
  }
  return items;
}

exports.handler = async function(event) {
  const results = [];

  await Promise.allSettled(FEEDS.map(async (feed) => {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'RaynersLaneFC/1.0 (raynerslanefc.co.uk)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const xml = await res.text();
      const items = parseItems(xml, feed.key, feed.label);
      results.push(...items);
    } catch(e) { /* skip failed feed */ }
  }));

  // Sort newest first
  results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300', // cache 5 mins
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ articles: results, fetchedAt: new Date().toISOString() }),
  };
};
