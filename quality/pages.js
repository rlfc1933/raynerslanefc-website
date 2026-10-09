// The pages the gates audit, and which device classes each gate runs on.
// Add a page here when it ships; nothing else needs to change.
'use strict';

// Public, indexable pages. `tier: 1` = the pages most supporters see; the
// visual-regression and Lighthouse gates run on these to keep runs short.
const PUBLIC_PAGES = [
  { path: '/',                    name: 'home',           tier: 1 },
  { path: '/fixtures.html',       name: 'fixtures',       tier: 1 },
  { path: '/news.html',           name: 'news',           tier: 1 },
  { path: '/squad.html',          name: 'squad',          tier: 1 },
  { path: '/match-centre.html',   name: 'match-centre',   tier: 1 },
  { path: '/season-tickets.html', name: 'season-tickets', tier: 1 },
  { path: '/fan-zone.html',       name: 'fan-zone',       tier: 1 },
  { path: '/programmes.html',     name: 'programmes',     tier: 1 },
  { path: '/about.html',          name: 'about',          tier: 2 },
  { path: '/history.html',        name: 'history',        tier: 2 },
  { path: '/contact.html',        name: 'contact',        tier: 2 },
  { path: '/membership.html',     name: 'membership',     tier: 2 },
  { path: '/shop.html',           name: 'shop',           tier: 2 },
  { path: '/trials.html',         name: 'trials',         tier: 2 },
  { path: '/volunteer.html',      name: 'volunteer',      tier: 2 },
  { path: '/investment.html',     name: 'investment',     tier: 2 },
  { path: '/innovation.html',     name: 'innovation',     tier: 2 },
  { path: '/acerbis.html',        name: 'acerbis',        tier: 2 },
  { path: '/gallery.html',        name: 'gallery',        tier: 2 },
  { path: '/media.html',          name: 'media',          tier: 2 },
  { path: '/policies.html',       name: 'policies',       tier: 2 },
  { path: '/programme.html',      name: 'programme',      tier: 2 },
  { path: '/news-article.html',   name: 'news-article',   tier: 2 },
  { path: '/player.html',         name: 'player',         tier: 2 },
  { path: '/404.html',            name: '404',            tier: 2 },
];

// Staff tools: audited for responsiveness, accessibility and journeys, but
// never screenshot-diffed (they change weekly by design) or Lighthouse-scored.
const STAFF_PAGES = [
  { path: '/admin.html', name: 'admin' },
];

// Elements whose content legitimately changes between runs (live scores,
// countdowns, "x minutes ago", rotating sponsors, the WebGL hero). Masked in
// screenshots so a diff means the DESIGN moved, not the data.
const VOLATILE = [
  '[data-countdown]', '.countdown', '[class*="countdown"]', '[class*="live"]',
  '[class*="ticker"]', '.sponsor-rail', '[class*="sponsor-rail"]', 'canvas',
  'time', '[data-relative-time]', 'video', 'iframe',
];

// Device classes. Names are referenced by the specs to choose where they run.
const VISUAL_PROJECTS = ['desktop-1440', 'tablet-portrait', 'phone'];
const A11Y_PROJECTS = ['desktop-1440', 'phone'];
const TOUCH_PROJECTS = ['tablet-portrait', 'tablet-landscape', 'phone', 'phone-small', 'fold-folded', 'fold-open', 'webkit-iphone'];

module.exports = { PUBLIC_PAGES, STAFF_PAGES, VOLATILE, VISUAL_PROJECTS, A11Y_PROJECTS, TOUCH_PROJECTS };
