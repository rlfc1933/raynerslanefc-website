// Release 3 — Search, Entity & AI Foundation.
//
// These lock the things that quietly rot: a new page shipped without a
// canonical, a second club entity appearing on a page, a revenue page dropping
// out of the sitemap, a founding year drifting. Every one of these is invisible
// in the browser and only shows up as lost search visibility months later.
//
// The rule the whole file follows: a page that is deliberately noindex is NOT
// held to indexable-page standards, and the two ?id= pages get their <head>
// from netlify/edge-functions/meta.js at request time, so their static file is
// legitimately bare.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Not public pages: the portal, the prototypes, the print/scan utilities.
const NOT_PUBLIC = ['admin.html', 'playermanager1933.html', 'lane-app-prototype.html',
  'The-Lane-Portal-Guide.html', 'scan.html', 'programme-print.html',
  'lane-social-cards.html', '_icontest.html'];

// The edge function writes the real <head> for these at request time.
const EDGE_HEAD = ['news-article.html', 'player.html'];

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const htmlFiles = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && !NOT_PUBLIC.includes(f));

const isNoindex = (s) => /name="robots"[^>]*noindex/i.test(s);
const publicPages = htmlFiles.map((f) => ({ f, s: read(f) }));
const indexable = publicPages.filter((p) => !isNoindex(p.s));
// Pages that must carry their own metadata in the static file.
const selfDescribing = indexable.filter((p) => !EDGE_HEAD.includes(p.f));

test('every indexable page carries the metadata a crawler needs', () => {
  const need = [
    ['description', /name="description"\s+content="[^"]{20,}"/i],
    ['canonical', /rel="canonical"\s+href="https:\/\/raynerslanefc\.co\.uk\//i],
    ['og:title', /property="og:title"\s+content="[^"]{5,}"/i],
    ['og:image', /property="og:image"\s+content="https:\/\//i],
    ['twitter:card', /name="twitter:card"/i]
  ];
  const bad = [];
  for (const { f, s } of selfDescribing) {
    for (const [label, re] of need) if (!re.test(s)) bad.push(`${f} → ${label}`);
  }
  assert.deepStrictEqual(bad, [], 'metadata missing:\n  ' + bad.join('\n  '));
});

test('one h1 per page, and no skipped heading levels', () => {
  const bad = [];
  for (const { f, s } of publicPages) {
    // staff-guide.html is a noindex internal document behind robots Disallow.
    // Its heading structure is a portal concern, tracked separately.
    if (f === 'staff-guide.html') continue;
    const h1s = (s.match(/<h1\b/g) || []).length;
    if (h1s !== 1) bad.push(`${f} has ${h1s} <h1>`);
    const levels = [...s.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        bad.push(`${f} jumps h${levels[i - 1]} → h${levels[i]}`);
        break;
      }
    }
  }
  assert.deepStrictEqual(bad, [], 'heading problems:\n  ' + bad.join('\n  '));
});

test('titles and descriptions are unique — no two pages compete for the same result', () => {
  const titles = new Map();
  const descs = new Map();
  for (const { f, s } of selfDescribing) {
    const t = (s.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
    const d = (s.match(/name="description"\s+content="([^"]*)"/i) || [, ''])[1].trim();
    if (t) (titles.get(t) || titles.set(t, []).get(t)).push(f);
    if (d) (descs.get(d) || descs.set(d, []).get(d)).push(f);
  }
  const dupT = [...titles].filter(([, v]) => v.length > 1);
  const dupD = [...descs].filter(([, v]) => v.length > 1);
  assert.deepStrictEqual(dupT, [], 'duplicate titles: ' + JSON.stringify(dupT));
  assert.deepStrictEqual(dupD, [], 'duplicate descriptions: ' + JSON.stringify(dupD));
});

test('exactly one club entity per page', () => {
  // Two #team nodes on a page is how a knowledge graph ends up with two clubs.
  for (const { f, s } of publicPages) {
    const hits = (s.match(/"@id":"https:\/\/raynerslanefc\.co\.uk\/#team"/g) || []).length;
    if (!hits) continue;
    const declarations = (s.match(/"@id":"https:\/\/raynerslanefc\.co\.uk\/#team","name":"Rayners Lane FC"/g) || []).length;
    assert.ok(declarations <= 1, `${f} declares the club entity ${declarations} times`);
  }
});

test('every JSON-LD block is valid JSON', () => {
  const bad = [];
  for (const { f, s } of publicPages) {
    for (const m of s.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try { JSON.parse(m[1]); } catch (e) { bad.push(`${f}: ${e.message.slice(0, 60)}`); }
    }
  }
  assert.deepStrictEqual(bad, [], 'invalid JSON-LD:\n  ' + bad.join('\n  '));
});

test('breadcrumbs are well formed and never invent a hierarchy', () => {
  const seen = [];
  for (const { f, s } of publicPages) {
    const m = s.match(/id="lane-breadcrumb">([\s\S]*?)<\/script>/);
    if (!m) continue;
    const d = JSON.parse(m[1]);
    seen.push(f);
    assert.strictEqual(d['@type'], 'BreadcrumbList', `${f} wrong type`);
    const items = d.itemListElement;
    assert.ok(items.length >= 2 && items.length <= 3, `${f} trail depth ${items.length}`);
    assert.strictEqual(items[0].name, 'Home', `${f} does not start at Home`);
    items.forEach((it, i) => {
      assert.strictEqual(it.position, i + 1, `${f} position out of order`);
      assert.ok(/^https:\/\/raynerslanefc\.co\.uk\//.test(it.item), `${f} bad url`);
    });
    // The last crumb must be the page itself.
    assert.ok(items[items.length - 1].item.endsWith('/' + f), `${f} last crumb is not this page`);
  }
  assert.ok(seen.length >= 20, `only ${seen.length} pages have breadcrumbs`);
  // The homepage is the root of the trail — it must not have one.
  assert.ok(!read('index.html').includes('id="lane-breadcrumb"'), 'index.html should not carry a breadcrumb');
});

test('the baked breadcrumb suppresses the runtime one instead of duplicating it', () => {
  // components.js injects its own BreadcrumbList at runtime. injectJSONLD()
  // bails when the id already exists, so the two MUST share an id — otherwise
  // every page ships two competing breadcrumb trails to Google. This was a real
  // near-miss during Release 3; the test exists so it can't come back.
  const components = read('js/components.js');
  const runtimeId = (components.match(/injectJSONLD\('([^']+)',\s*\{\s*'@context':[^}]*'@type':\s*'BreadcrumbList'/) ||
                     components.match(/injectJSONLD\('([^']*breadcrumb[^']*)'/i) || [])[1];
  assert.ok(runtimeId, 'could not find the runtime breadcrumb id in components.js');
  const baked = read('tools-bake-schema.js');
  assert.ok(baked.includes(`id="${runtimeId}"`),
    `bake tool writes a different id than components.js ('${runtimeId}') — pages would get two breadcrumbs`);
  for (const { f, s } of publicPages) {
    const n = (s.match(/"@type":"BreadcrumbList"/g) || []).length;
    assert.ok(n <= 1, `${f} has ${n} BreadcrumbList blocks`);
  }
});

test('the sitemap lists every indexable page — including the ones that take money', () => {
  const sitemap = read('netlify/functions/sitemap.js');
  const missing = [];
  for (const { f } of indexable) {
    if (EDGE_HEAD.includes(f)) continue;   // added dynamically from news/players JSON
    const listed = f === 'index.html'
      ? /\['\/',/.test(sitemap)
      : sitemap.includes(`'/${f}'`);
    if (!listed) missing.push(f);
  }
  assert.deepStrictEqual(missing, [], 'indexable but absent from sitemap: ' + missing.join(', '));
});

test('the sitemap does not advertise pages we asked crawlers to skip', () => {
  const sitemap = read('netlify/functions/sitemap.js');
  for (const { f, s } of publicPages) {
    if (!isNoindex(s)) continue;
    assert.ok(!sitemap.includes(`'/${f}'`), `${f} is noindex but listed in the sitemap`);
  }
});

test('robots.txt lets the answer engines in and keeps the staff tools out', () => {
  const robots = read('robots.txt');
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended',
    'OAI-SearchBot', 'CCBot', 'bingbot', 'Applebot']) {
    assert.ok(new RegExp(`User-agent:\\s*${bot}\\b`, 'i').test(robots), `${bot} not addressed`);
  }
  for (const priv of ['/admin.html', '/staff-guide.html', '/playermanager1933.html', '/scan.html']) {
    assert.ok(robots.includes('Disallow: ' + priv), `${priv} is not disallowed`);
  }
  assert.ok(/Sitemap:\s*https:\/\/raynerslanefc\.co\.uk\/sitemap\.xml/.test(robots), 'no sitemap line');
});

test('the club facts never contradict each other', () => {
  // 1933 is the club. 1973 is Acerbis, the kit partner — a different entity,
  // and legitimate. This guards the club's own founding year only.
  const org = read('tools-bake-schema.js');
  assert.ok(/foundingDate:\s*'1933'/.test(org), 'bake tool no longer says 1933');
  for (const { f, s } of publicPages) {
    const claims = [...s.matchAll(/Rayners Lane[^.<]{0,40}?(?:founded|established|est\.?)\s+(?:in\s+)?(\d{4})/gi)]
      .map((m) => m[1]);
    for (const y of claims) {
      assert.strictEqual(y, '1933', `${f} claims the club was founded in ${y}`);
    }
  }
  // One ground, one postcode — for the CLUB. Other organisations' addresses are
  // legitimate content (policies.html carries The FA's Wembley address for
  // safeguarding referrals), so this checks the club's own address only.
  const clubCodes = new Set();
  for (const { s } of publicPages) {
    for (const m of s.matchAll(/"postalCode":"([^"]+)"/g)) clubCodes.add(m[1]);
    // Prose that names the ground and a postcode in the same breath.
    for (const m of s.matchAll(/Tithe Farm[^<]{0,120}?([A-Z]{2}\d\s+\d[A-Z]{2})/g)) clubCodes.add(m[1]);
  }
  assert.deepStrictEqual([...clubCodes].sort(), ['HA2 0XH'],
    'the club appears at more than one postcode: ' + [...clubCodes]);
});

test('every image can be described to someone who cannot see it', () => {
  const bad = [];
  for (const { f, s } of publicPages) {
    // Comments stripped first. A note that mentions an <img> tag in prose is
    // documentation, not an image on the page, and counting it reports a
    // missing alt attribute on markup that does not exist.
    const markup = s.replace(/<!--[\s\S]*?-->/g, ' ');
    for (const img of markup.match(/<img\b[^>]*>/g) || []) {
      if (!/\salt\s*=/.test(img)) bad.push(`${f}: ${img.slice(0, 70)}`);
    }
  }
  assert.deepStrictEqual(bad, [], 'images with no alt attribute:\n  ' + bad.join('\n  '));
});
