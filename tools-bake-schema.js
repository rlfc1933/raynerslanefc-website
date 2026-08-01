// Bake the club entity into every public page's HTML as a STATIC JSON-LD block.
//
// Why: components.js injects it at runtime, which is invisible to the crawlers
// this whole exercise is for. Googlebot renders JS; GPTBot, ClaudeBot,
// PerplexityBot and CCBot largely do not. So the club entity existed for Google
// and for nobody else — on every page but the homepage.
//
// injectJSONLD() already bails if an element with the same id exists, so a
// static <script id="lane-org"> makes the runtime copy stand down by itself.
// No duplication, no second entity, no edge-function cost on every page load.
//
// Run this again if the facts change: node scratchpad/bake-schema.js
const fs = require('fs');

const ORIGIN = 'https://raynerslanefc.co.uk';
const CLUB_ID = ORIGIN + '/#team';

// ⛔ Every value traces to the club's own pages. Sources are in the comment
// block in js/components.js. Do not add a fact that isn't verified.
const ORG = {
  '@context': 'https://schema.org',
  '@type': ['SportsTeam', 'SportsOrganization', 'LocalBusiness'],
  '@id': CLUB_ID,
  name: 'Rayners Lane FC',
  legalName: 'Rayners Lane Football Club',
  alternateName: ['The Lane', 'Rayners Lane', 'Rayners Lane Football Club'],
  sport: 'Soccer',
  foundingDate: '1933',
  foundingLocation: { '@type': 'Place', name: 'Harrow, Middlesex, England' },
  // Honours come from data/honours.json — the single source. They used to be a
  // constant here, which meant the club's proudest facts were owned by a build
  // script and hand-copied into llms.txt and history.html as well. 23 consumers,
  // no owner. Edit the JSON; re-run this; everything follows.
  award: require('./data/honours.json').timeline
           .filter(function (e) { return e.honour && e.award; })
           .map(function (e) { return e.award; }),
  url: ORIGIN + '/',
  logo: ORIGIN + '/img/badge.png',
  image: ORIGIN + '/img/og-card.jpg',
  email: 'info@raynerslanefc.co.uk',
  description: "Rayners Lane FC ('The Lane') — a community football club founded in 1933, playing non-league football at Tithe Farm, Harrow, in the Combined Counties Premier Division North at Step 5 of the English football pyramid.",
  memberOf: { '@type': 'SportsOrganization', name: 'Combined Counties Football League', url: 'https://www.combinedcountiesleague.co.uk' },
  address: { '@type': 'PostalAddress', streetAddress: '151 Rayners Lane', addressLocality: 'Harrow', addressRegion: 'Middlesex', postalCode: 'HA2 0XH', addressCountry: 'GB' },
  geo: { '@type': 'GeoCoordinates', latitude: 51.570435, longitude: -0.365073 },
  areaServed: ['Harrow', 'Rayners Lane', 'Pinner', 'South Harrow', 'Ruislip', 'Northwood', 'Wembley']
    .map(n => ({ '@type': 'Place', name: n }))
    .concat([{ '@type': 'AdministrativeArea', name: 'London Borough of Harrow' }]),
  openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '14:00', closes: '17:00', description: 'Matchday' }],
  // A public, non-operational signal that the club is serious about technology.
  // Deliberately says WHAT the club values, never HOW it does any of it — the
  // how is the investor deck (innovation.html, noindexed and unlinked), shown
  // to people in a room rather than left out for rivals to read.
  knowsAbout: ['Community football', 'Non-league football', 'Football in Harrow',
               'Digital and technology in grassroots football'],
  sameAs: [
    'https://twitter.com/RaynersLaneFC',
    'https://instagram.com/raynerslanefc',
    'https://www.youtube.com/channel/UCN6SkwSIRK86x9Wk0AFoydA'
  ]
};
const SITE = {
  '@context': 'https://schema.org', '@type': 'WebSite',
  '@id': ORIGIN + '/#website',
  url: ORIGIN + '/', name: 'Rayners Lane FC',
  publisher: { '@id': CLUB_ID }, inLanguage: 'en-GB'
};

const SKIP = ['admin.html', 'staff-guide.html', 'playermanager1933.html', '_icontest.html',
  'The-Lane-Portal-Guide.html', 'lane-app-prototype.html', 'programme-print.html',
  '404.html', 'scan.html'];

// ── Breadcrumbs ──────────────────────────────────────────────────────────────
// The trail Google prints in place of a raw URL, and a cheap structural hint for
// answer engines working out how the site fits together.
//
// This site is FLAT: every public page sits at the root and the nav has no
// sections, so the honest trail is Home › Page. Inventing "Home › Commercial ›
// Sponsors" to look deeper would describe a hierarchy that doesn't exist and
// that no link on the site backs up.
//
// The two exceptions are real containment, not decoration: news.html lists the
// articles and squad.html lists the players, so an article/profile genuinely
// sits under its listing page.
//
// Names come from each page's own <title>. A page missing here gets no
// breadcrumb rather than a guessed one.
//
// The id is deliberately 'lane-breadcrumb' — the SAME id components.js uses for
// the copy it injects at runtime. injectJSONLD() bails when the id is already
// present, so baking this makes the runtime copy stand down and the page keeps
// exactly ONE BreadcrumbList. Rename it and you get two, which is worse than
// having none.
const CRUMB_PARENT = {
  'news-article.html': ['Newsroom', 'news.html'],
  'player.html': ['The Squad', 'squad.html']
};
const CRUMB_NAME = {
  'about.html': 'The Club',
  'acerbis.html': 'Acerbis — Official Kit Partner',
  'contact.html': 'Contact',
  'fan-zone.html': 'Fan Zone',
  'fixtures.html': 'Fixtures & Results',
  'gallery.html': 'Gallery',
  'history.html': 'Club History',
  'innovation.html': 'Technology & The Lane',
  'investment.html': 'Investment & Sponsorship',
  'match-centre.html': 'Match Centre',
  'media.html': 'Media',
  'membership.html': 'Membership',
  'news-article.html': 'News Article',
  'news.html': 'Newsroom',
  'player.html': 'Player Profile',
  'policies.html': 'Policies & Legal',
  'programme.html': 'Match Day Programme',
  'programmes.html': 'Match Programmes — Archive',
  'season-tickets.html': '2026/27 Season Tickets',
  'shop.html': 'Club Shop',
  'squad.html': 'The Squad',
  'trials.html': 'First-Team Trials & Registration',
  'volunteer.html': 'Get Involved'
};

function crumbFor(file) {
  if (file === 'index.html' || !CRUMB_NAME[file]) return null;
  const items = [{ name: 'Home', url: ORIGIN + '/' }];
  const parent = CRUMB_PARENT[file];
  if (parent) items.push({ name: parent[0], url: ORIGIN + '/' + parent[1] });
  items.push({ name: CRUMB_NAME[file], url: ORIGIN + '/' + file });
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    '@id': ORIGIN + '/' + file + '#breadcrumb',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: it.url
    }))
  };
}

const MARK_START = '<!-- lane-schema:start -->';
const MARK_END = '<!-- lane-schema:end -->';

const blockFor = (file) => MARK_START + `
  <!-- The club entity, baked in rather than injected by JS.
       js/components.js also builds this, but at runtime — which Googlebot sees
       (it renders JS) and the AI crawlers mostly do not. Since being cited by
       those is the entire point, it ships in the HTML. injectJSONLD() skips any
       id that already exists, so the runtime copy stands down and there is
       still exactly ONE club entity per page.
       ⛔ Regenerate with scratchpad/bake-schema.js — don't hand-edit, and never
       add a fact that isn't on the club's own pages. -->
  <script type="application/ld+json" id="lane-org">${JSON.stringify(ORG)}</script>
  <script type="application/ld+json" id="lane-site">${JSON.stringify(SITE)}</script>` +
  (crumbFor(file)
    ? `\n  <script type="application/ld+json" id="lane-breadcrumb">${JSON.stringify(crumbFor(file))}</script>`
    : '') + `
  ` + MARK_END;

let done = 0, replaced = 0, missed = [], crumbed = 0;
fs.readdirSync('.').filter(f => /\.html$/.test(f) && !SKIP.includes(f)).forEach(f => {
  let s = fs.readFileSync(f, 'utf8');
  const block = blockFor(f);
  if (crumbFor(f)) crumbed++;
  if (s.includes(MARK_START)) {
    s = s.replace(new RegExp(MARK_START + '[\\s\\S]*?' + MARK_END), () => block);
    replaced++;
  } else if (s.includes('</head>')) {
    s = s.replace('</head>', () => '  ' + block + '\n</head>');
    done++;
  } else { missed.push(f); return; }
  fs.writeFileSync(f, s);
});
console.log(`baked into ${done} pages, refreshed ${replaced}, breadcrumbs on ${crumbed}` +
  (missed.length ? `, NO </head>: ${missed}` : ''));
console.log(`block size: ~${(blockFor('about.html').length / 1024).toFixed(1)} KB per page`);
