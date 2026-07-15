// Generates css/icons.css — the club's icon set.
// Lucide (ISC) paths inlined as CSS mask data-URIs so an icon is just
// <i class="ico ico-map-pin"></i>, inherits currentColor, needs no network,
// and drops into a JS string as easily as into HTML (no quote escaping).
const fs = require('fs');
const path = require('path');
// Icon sources are a vendored npm download, not repo content. Point ICON_SRC
// at them when regenerating: ICON_SRC=/path/to/lucide node tools-build-icons.js
const SRC = process.env.ICON_SRC || path.join(__dirname, 'lucide');
// Brand marks are Simple Icons (CC0). They're SOLID glyphs, so they need
// fill and no stroke — the opposite of every Lucide icon. Kept in their own
// folder because both packs ship an "x.svg" and Simple Icons' X logo would
// otherwise silently replace the close button on every dialog in the site.
const BRAND_DIR = path.join(__dirname, 'brands');
const isBrand = (n) => n.startsWith('brand-');

// emoji (or HTML entity codepoint) → icon name.
// Names are the Lucide name where one exists; CUSTOM below covers what Lucide
// has no icon for — which for a football club is, inevitably, the football.
const MAP = {
  '✓': 'check', '✔': 'check', '✅': 'circle-check',
  '✕': 'x', '✖': 'x', '❌': 'x',
  '💛': 'heart', '❤': 'heart',
  '⚽': 'football', '🏟': 'stadium', '🥅': 'goal',
  '📣': 'megaphone', '📢': 'megaphone',
  '🤝': 'handshake', '🔔': 'bell', '📴': 'bell-off',
  '📲': 'smartphone', '📱': 'smartphone',
  '📍': 'map-pin', '📌': 'pin',
  '📅': 'calendar', '🗓': 'calendar-days',
  '⭐': 'star', '★': 'star', '✨': 'sparkles',
  '🔒': 'lock', '🔑': 'key',
  '📷': 'camera', '📸': 'camera', '🖼': 'image',
  '📋': 'clipboard-list', '📜': 'scroll-text',
  '🏠': 'house', '🏆': 'trophy', '🥇': 'medal', '🏅': 'award',
  '🚌': 'bus', '🚗': 'car', '🛣': 'route', '🚇': 'train-front', '🚦': 'traffic-cone',
  '🚀': 'rocket', '🔥': 'flame', '⚡': 'zap', '🌩': 'cloud-lightning',
  '📬': 'inbox', '📭': 'mail-open', '✉': 'mail', '📥': 'download',
  '📝': 'square-pen', '✍': 'pen-line', '✂': 'scissors',
  '👤': 'user', '👥': 'users', '👑': 'crown',
  '🎟': 'ticket', '⚠': 'triangle-alert', '🛡': 'shield',
  '📚': 'library', '📘': 'book-open',
  '📊': 'chart-column', '📈': 'trending-up',
  '🏦': 'landmark', '💰': 'banknote', '💼': 'briefcase',
  '🧮': 'calculator', '⚖': 'scale',
  '🗄': 'archive', '🗂': 'folders', '📦': 'package',
  '🖨': 'printer', '🔎': 'search', '📰': 'newspaper', '💾': 'save',
  '💬': 'message-circle', '💡': 'lightbulb',
  '👍': 'thumbs-up', '👇': 'arrow-down', '⬆': 'arrow-up', '➕': 'plus',
  '👏': 'hand', '👋': 'hand', '👊': 'hand',
  '🎲': 'dice-5', '🎯': 'target', '🎨': 'palette', '🎉': 'party-popper',
  '🩺': 'stethoscope', '🛠': 'wrench', '🔌': 'plug', '🔄': 'refresh-cw',
  '👕': 'shirt', '👔': 'shirt', '💪': 'dumbbell', '🏃': 'footprints',
  '🏗': 'hard-hat', '🎵': 'music', '⚙': 'settings',
  '🚉': 'train-front', '🍺': 'beer', '🏛': 'landmark', '💚': 'heart',
  '🐦': 'brand-x', '✈': 'plane', '🦺': 'hard-hat', '⚒': 'hammer', '🍪': 'cookie', '🎁': 'gift', '🧣': 'shirt', '💙': 'heart', '🔍': 'search', '📧': 'mail', '💻': 'laptop', '🤖': 'bot',
  '▶': 'play', '⏸': 'pause', '⏹': 'circle-stop', '⏳': 'hourglass', '↻': 'rotate-cw',
  '🟢': 'dot-live', '🟡': 'dot-warn', '🔴': 'dot-off',
};

// Lucide has no football, stadium or whistle. Drawn to match its grid exactly:
// 24×24, 2px stroke, round caps/joins, same optical weight.
const CUSTOM = {
  // A football: circle + the classic pentagon-and-seams panel layout.
  'football': '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 3.6 2.6-1.37 4.23H9.77L8.4 10.1z"/><path d="M12 3v4.5M20.5 9.7l-4.9 3.4M17.8 20.1l-3.5-5.7M6.2 20.1l3.5-5.7M3.5 9.7l4.9 3.4"/>',
  // A stand and a pitch — read as "ground" at 16px, which is where it lives.
  'stadium': '<path d="M3 8.5c0-2 4-3.5 9-3.5s9 1.5 9 3.5"/><path d="M3 8.5v3c0 2 4 3.5 9 3.5s9-1.5 9-3.5v-3"/><path d="M5.5 15.2 4 21h16l-1.5-5.8"/><path d="M9 21v-3.2M15 21v-3.2"/>',
  // Post Studio: a post card with a spark on it. A stock paint palette said
  // "art app"; this says "the thing that makes our graphics". Ours, drawn on
  // the same 24x24 / 2px grid so it sits with the rest.
  'post-studio': '<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><path d="M3 16.2l4.2-3.9 3.1 2.8"/><path d="M13.4 12.9L17 9.4l4 3.9"/><path d="M15.8 4.4l.75 1.75 1.75.75-1.75.75-.75 1.75-.75-1.75-1.75-.75 1.75-.75z"/>',
  // Match graphic / share card: a card with a football on it.
  'match-card': '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><circle cx="12" cy="12" r="3.4"/><path d="M12 8.6v-1M12 16.4v1M8.6 12h-1M16.4 12h1"/>',
  // Status dots — filled, not stroked; these are states, not objects.
  'dot-live': '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
  'dot-warn': '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
  'dot-off':  '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
};

function inner(name) {
  if (CUSTOM[name]) return CUSTOM[name];
  const f = isBrand(name)
    ? path.join(BRAND_DIR, name.replace(/^brand-/, '') + '.svg')
    : path.join(SRC, name + '.svg');
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<svg[\s\S]*?>/, '').replace(/<\/svg>/, '')
    .replace(/\s+/g, ' ').trim();
}

function esc(s) {
  // Only what actually breaks inside a CSS url("…"): % first, then " # < >
  return s.replace(/%/g, '%25').replace(/"/g, '%22')
          .replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E');
}

function dataUri(body, solid) {
  const open = solid
    ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="black">'
    : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  return esc(open + body + '</svg>');
}

// Every icon the MAP replaces, PLUS every CUSTOM one — our own club icons
// (post-studio, match-card) aren't emoji replacements, they're additions, so
// deriving the list from MAP alone silently dropped them from the stylesheet.
const names = [...new Set(Object.values(MAP).concat(Object.keys(CUSTOM)))].sort();
const missing = names.filter(n => !inner(n));
if (missing.length) { console.error('NO SUCH ICON: ' + missing.join(', ')); process.exit(1); }

let css = `/* Rayners Lane FC — icon set.
 *
 * Icons are Lucide (https://lucide.dev), ISC licensed:
 *   Copyright (c) 2026 Lucide Icons and Contributors
 *   Permission to use, copy, modify, and/or distribute this software for any
 *   purpose with or without fee is hereby granted, provided that the above
 *   copyright notice and this permission notice appear in all copies.
 * football / stadium / status dots are ours, drawn to Lucide's 24×24 grid.
 *
 * Inlined as CSS masks rather than pulled from a CDN on purpose: The Lane App
 * has to render a meet time in a car park with no signal, and jsDelivr has
 * already frozen this site once. No network, no key, no build step.
 *
 * Usage — identical in HTML and inside a JS string, no escaping either way:
 *   <i class="ico ico-map-pin"></i>
 * Colour and size are inherited (they're masks over currentColor), so an icon
 * in yellow text is yellow. Override with .ico-lg / .ico-sm or font-size.
 *
 * Generated by scratchpad/build-icons.js — edit the map there, not this file.
 */
.ico{display:inline-block;width:1em;height:1em;vertical-align:-.14em;flex:none;
  background-color:currentColor;
  -webkit-mask-position:center;mask-position:center;
  -webkit-mask-size:contain;mask-size:contain;
  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
.ico-lg{width:1.25em;height:1.25em;vertical-align:-.2em}
.ico-sm{width:.85em;height:.85em}
/* Status dots read better slightly tucked in. */
.ico-dot-live,.ico-dot-warn,.ico-dot-off{width:.62em;height:.62em;vertical-align:.02em}
.ico-dot-live{color:var(--su,#22C55E)}
.ico-dot-warn{color:var(--am,#F59E0B)}
.ico-dot-off{color:var(--re,#EF4444)}

`;
names.forEach(n => {
  const u = dataUri(inner(n), isBrand(n));
  css += `.ico-${n}{-webkit-mask-image:url("data:image/svg+xml,${u}");mask-image:url("data:image/svg+xml,${u}")}\n`;
});

const out = path.join('/Users/directoressence/Downloads/rayners-lane-website-FINAL/css/icons.css');
fs.writeFileSync(out, css);
fs.writeFileSync(path.join(__dirname, 'emoji-map.json'), JSON.stringify(MAP, null, 2));
console.log('icons: ' + names.length + '  (' + Object.keys(MAP).length + ' emoji mapped)');
console.log('css:   ' + (css.length / 1024).toFixed(1) + ' KB → css/icons.css');
