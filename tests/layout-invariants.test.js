// LAYOUT INVARIANTS.
//
// The site scrolled sideways on every page and every screen, and had done for
// as long as the navigation had fourteen links. Nothing caught it because
// nothing measured it: CSS reads as correct right up until a flex or grid
// child refuses to shrink.
//
// Every failure found in this sweep was the SAME defect in four costumes:
// a child that cannot go below its content width.
//
//   .nav__links      flex child, min-width:auto  → 1384px row, page +533px
//   .bnav__item      flex child, min-width:auto  → 506px bar in a 375px phone
//   #cookie-banner   flex children that will not shrink
//   minmax(310px,1fr) a HARD grid track floor    → 310px track in 272px
//
// These are static assertions. The live proof is tools/viewport-probe.js,
// which drives real headless Chrome at ten viewports across seven pages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS_FILES = fs.readdirSync(path.join(ROOT, 'css'))
  .filter((f) => f.endsWith('.css')).map((f) => 'css/' + f);
const HTML_FILES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

test('NO HARD GRID TRACK FLOOR ANYWHERE', () => {
  // minmax(310px,1fr) is a hard minimum: it overflows any container narrower
  // than 310px instead of giving way. min(310px,100%) keeps the intended
  // column everywhere it fits and shrinks only when it genuinely cannot.
  const offenders = [];
  CSS_FILES.concat(HTML_FILES).concat(fs.readdirSync(path.join(ROOT, 'js'))
    .filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)).forEach((f) => {
    const s = R(f);
    const m = s.match(/minmax\(\s*\d+px\s*,/g);
    if (m) offenders.push(f + ': ' + m.join(' '));
  });
  assert.deepStrictEqual(offenders, [], 'hard pixel floors in grid tracks');
});

test('the navigation row can shrink', () => {
  const s = R('css/style.css');
  const rule = s.match(/\.nav__links\{[^}]*\}/)[0];
  assert.match(rule, /min-width:0/,
    'a flex child defaults to min-width:auto and will force the page wider than the screen');
});

test('the mobile bottom bar can shrink', () => {
  const s = R('css/style.css');
  const rule = s.match(/\.bnav__item\{[^}]*\}/)[0];
  assert.match(rule, /min-width:0/);
  assert.match(s, /\.bnav\{max-width:100vw;overflow:hidden\}/);
});

test('the cookie banner cannot widen the page', () => {
  const s = R('js/components.js');
  // There is more than one banner in this file; scope to the cookie one.
  const at = s.indexOf("banner.id = 'cookie-banner'");
  assert.ok(at > 0, 'the cookie banner could not be located');
  const decl = s.slice(at).match(/banner\.style\.cssText = '[^']+'/)[0];
  assert.match(decl, /box-sizing:border-box/);
  assert.match(decl, /max-width:100%/);
  // Its text block must be allowed to shrink.
  assert.ok(!/flex:1;min-width:200px/.test(s), 'the text block still has a hard minimum');
});

test('PRIORITY NAVIGATION: every hidden link is still reachable', () => {
  const comp = R('js/components.js');
  const css = R('css/style.css');

  // Links are tiered.
  const tiers = comp.match(/tier:\d/g) || [];
  assert.ok(tiers.length >= 14, 'every nav link needs a tier');

  // Tiers 2+ are hidden by default and revealed at measured widths.
  assert.match(css, /\.nav__link--t2,\.nav__link--t3,\.nav__link--t4,\.nav__link--t5\{display:none\}/);
  // The measured breakpoints. They moved once already, when the first set was
  // found to clip "Fan Zone" to "FA" — estimates, corrected by measurement.
  [1180, 1320, 1560].forEach((w) => {
    assert.ok(css.includes('@media(min-width:' + w + 'px)'), 'missing tier breakpoint ' + w);
  });

  // And the menu button is visible at EVERY width, which is what makes hiding
  // a link legitimate rather than a route disappearing.
  const burger = css.match(/\.nav__menu-btn\{[^}]*\}/)[0];
  assert.match(burger, /display:inline-flex/, 'the menu button must never be display:none');
});

test('the full menu still contains every route', () => {
  const comp = R('js/components.js');
  // The tiered list and the menu are built from the same array, so a link
  // cannot exist in one and not the other.
  const listBlock = comp.slice(comp.indexOf('const links = ['), comp.indexOf('];', comp.indexOf('const links = [')));
  const hrefs = (listBlock.match(/href:'[^']+'/g) || []).map((h) => h.slice(6, -1));
  assert.ok(hrefs.length >= 14, 'expected the full route list');
  ['index.html', 'fixtures.html', 'squad.html', 'programme.html', 'match-centre.html',
   'news.html', 'about.html', 'contact.html'].forEach((h) => {
    assert.ok(hrefs.includes(h), 'route missing from the navigation: ' + h);
  });
  // The programme library must stay discoverable.
  assert.ok(hrefs.includes('programme.html'), 'the programme must remain in the navigation');
});

test('overflow is never hidden on the page itself', () => {
  // body{overflow-x:hidden} masks inaccessible content instead of fixing it.
  CSS_FILES.forEach((f) => {
    const s = R(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\b(body|html)\s*\{[^}]*overflow-x:\s*hidden/.test(s),
      f + ' hides page overflow rather than fixing it');
  });
});

test('the viewport probe exists and drives a real browser', () => {
  const s = R('tools/viewport-probe.js');
  assert.match(s, /Emulation\.setDeviceMetricsOverride/,
    'a real layout viewport, not a resized window');
  assert.match(s, /Page\.captureScreenshot/);
});

/* ── the menu, which now carries routes at EVERY width ────────────────────── */

test('THE MENU IS NOT HIDDEN ON DESKTOP', () => {
  // It used to be display:none above 900px, which was correct while it was
  // mobile-only. Nine of the fourteen routes now live only behind the ☰, so
  // that rule would have made them unreachable on a laptop — the button would
  // have opened nothing at all.
  // Comments first — this file's own explanation quotes the old rule, and an
  // earlier test in this project already failed on its own prose once.
  const css = R('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/@media\(min-width:901px\)\{\s*\.lane-menu\{display:none/.test(css),
    'the menu is hidden at the widths where it carries most of the routes');
  // And it is styled for desktop rather than left as a phone sheet.
  assert.match(css, /@media\(min-width:901px\)\{[\s\S]*?\.lane-menu__panel\{/);
});

test('focus lands inside the dialog when it opens', () => {
  // .focus() in the same tick did nothing: the panel was still display:none,
  // and a hidden element cannot take focus. A keyboard user opened the menu
  // and was left standing outside it.
  const s = R('js/components.js');
  const open = s.slice(s.indexOf('window.laneMenuOpen'), s.indexOf('window.laneMenuClose'));
  assert.match(open, /requestAnimationFrame/, 'focus must wait for the panel to be visible');
  assert.match(open, /\.focus\(\{ preventScroll: true \}\)/);
});

test('the menu meets the keyboard contract', () => {
  const s = R('js/components.js');
  assert.match(s, /aria-controls="lane-menu"/);
  assert.match(s, /aria-label="Open menu"/);
  assert.match(s, /aria-expanded/);
  // Escape closes.
  assert.match(s, /e\.key === 'Escape'/);
  // Focus returns to whatever opened it.
  assert.match(s, /_laneMenuOpener\.focus/);
  // And it traps Tab while open.
  assert.match(s, /e\.key === 'Tab'/);
  assert.match(s, /shiftKey && document\.activeElement === first/);
});

/* ── controls must be reachable, not merely present ───────────────────────── */

test('NO NAV LINK IS EVER CLIPPED MID-WORD', () => {
  // A link cut to "FA" reads as broken software. It is worse than the same
  // link simply living in the menu. The breakpoints were measured, not
  // estimated: at each one the row was checked for a clipped child.
  const css = R('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  [1180, 1320, 1560].forEach((w) => {
    assert.ok(css.includes('@media(min-width:' + w + 'px)'), 'missing measured breakpoint ' + w);
  });
  // Tier 5 needs 1190px of row and the row tops out at 996px, so it can never
  // appear in the bar at any width.
  assert.ok(!/\.nav__link--t5\{display:inline-block\}/.test(css),
    'tier 5 cannot fit on any screen and must stay in the menu');
  // The nav container must be allowed to use a large screen.
  assert.match(css, /\.nav__i\{max-width:min\(1600px,100%\)/);
});

test('the accessibility button does not cover the consent buttons', () => {
  // The launcher is fixed bottom-left at z-index 90000; the cookie banner sits
  // at 10000. The launcher was therefore ON TOP of Accept — a consent control
  // partly covered by another control, which is the one place on the site
  // where that must never happen.
  const css = R('css/a11y.css');
  assert.match(css, /body\.has-cookie-banner \.a11y-fab/,
    'the launcher must move clear while the banner is up');
  assert.match(css, /body\.has-cookie-banner \.a11y-panel/);
  const comp = R('js/components.js');
  assert.match(comp, /classList\.add\('has-cookie-banner'\)/);
  assert.match(comp, /classList\.remove\('has-cookie-banner'\)/,
    'and must move back when the banner goes');
});
