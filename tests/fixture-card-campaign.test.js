// ════════════════════════════════════════════════════════════════════════════
// THE OPPONENT'S COLOUR HAS TO LAND ON THE OPPONENT.
//
// The fixture lockup is always home-then-away. So the opponent stands on the
// RIGHT when Rayners Lane are at home, and on the LEFT when we are away. The
// first version of the campaign treatment pinned the colour wash and the
// ghosted crest to the right edge unconditionally — which is correct for home
// fixtures and wrong for every away one.
//
// Nothing caught it. The class was applied, the custom property was set, the
// count of tinted cards was right, and the tests passed. It took a screenshot
// to see that "BURNHAM" sat on the left of the card while Burnham's navy and
// Burnham's crest washed in from the right, behind OUR name. The card was
// lighting the wrong club.
//
// That is the failure this file exists to prevent: a treatment that is present
// and measurable but pointed at the wrong team.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'fixtures.html'), 'utf8');

/**
 * The page with every @media block cut out, so a base rule can only be
 * satisfied by a base declaration.
 *
 * THIS IS NOT INCIDENTAL. The first version of this file searched the whole
 * page, and when the desktop `.fxc--away .fxc__ghost` rule was deleted the
 * tests still passed — the lookup silently answered with the *mobile* override
 * inside `@media (max-width:600px)`. A test that accepts a phone-only rule as
 * proof of a desktop rule is not a regression test, so the two are now read
 * from different strings.
 */
const BASE = (() => {
  let out = '', i = 0;
  for (;;) {
    const at = PAGE.indexOf('@media', i);
    if (at === -1) { out += PAGE.slice(i); break; }
    out += PAGE.slice(i, at);
    let depth = 0, j = PAGE.indexOf('{', at);
    for (; j < PAGE.length; j++) {
      if (PAGE[j] === '{') depth++;
      else if (PAGE[j] === '}' && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
})();

/**
 * Pull one CSS rule body out by exact selector.
 * Matching the selector with a boundary rather than a substring keeps
 * `.fxc--away .fxc__ghost` from being answered by `.fxc__ghost`, which is the
 * precise confusion this file is about.
 */
function rule(selector, source) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = (source || BASE).match(new RegExp('(?:^|[},;/*\\s])' + esc + '\\s*\\{([^}]*)\\}'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/**
 * EVERY block at a given max-width, concatenated.
 *
 * Not the first one. A page may legitimately carry several `@media
 * (max-width:600px)` blocks — the card rules declare one and the hero declares
 * its own — and the cascade does not care which block a declaration sits in.
 * Reading only the first made this file fail the moment a second was added,
 * which is a fault in the test, not in the page.
 */
function mediaBlock(maxWidth) {
  const needle = '@media (max-width:' + maxWidth + ')';
  let out = '', from = 0;
  for (;;) {
    const i = PAGE.indexOf(needle, from);
    if (i === -1) return out;
    let depth = 0, start = PAGE.indexOf('{', i), j = start;
    for (; j < PAGE.length; j++) {
      if (PAGE[j] === '{') depth++;
      else if (PAGE[j] === '}' && --depth === 0) break;
    }
    out += PAGE.slice(start, j) + '\n';
    from = j + 1;
  }
}

// ── 1 · THE TREATMENT IS STILL WIRED UP ─────────────────────────────────────

test('a tinted card reads its colour from the per-fixture custom property', () => {
  const r = rule('.fxc--tinted');
  assert.ok(r, '.fxc--tinted must exist');
  assert.match(r, /var\(--fxc-opp\)/,
    'the wash must come from the fixture, not a hardcoded colour');
});

test('the opponent colour is applied per card, inline, from the resolved palette', () => {
  assert.match(PAGE, /style="--fxc-opp:/,
    'each card carries its own opponent colour');
  assert.match(PAGE, /BrandPalette\.resolve/,
    'the colour must come through the palette resolver, not the raw registry');
});

// ── 2 · THE REGRESSION ITSELF ───────────────────────────────────────────────

test('away fixtures move the ghosted crest to the opponent\'s side', () => {
  const base = rule('.fxc__ghost');
  const away = rule('.fxc--away .fxc__ghost');

  assert.ok(base, 'the base ghost rule must exist');
  assert.match(base, /right:\s*-/, 'home fixtures bleed the crest off the right');

  assert.ok(away, 'THE REGRESSION: away fixtures must mirror the ghost crest. ' +
    'Without this, the opponent crest sits behind the Rayners Lane name.');
  assert.match(away, /left:\s*-/, 'away fixtures bleed the crest off the left');
  assert.match(away, /right:\s*auto/,
    'the inherited right offset must be cleared or the crest is pinned to both edges');
});

test('away fixtures reverse the direction of the colour wash', () => {
  const home = rule('.fxc--tinted');
  const away = rule('.fxc--away.fxc--tinted');

  assert.ok(away, 'THE REGRESSION: away fixtures need their own wash direction');

  const angle = (css) => {
    const m = css && css.match(/linear-gradient\(\s*(\d+)deg/);
    return m ? Number(m[1]) : null;
  };
  const a = angle(home), b = angle(away);
  assert.ok(a != null && b != null, 'both washes should be angled gradients');

  // Opposite sides of the card, not merely different numbers.
  const apart = Math.abs(((a - b) % 360 + 360) % 360);
  assert.ok(apart > 90 && apart < 270,
    'the away wash must enter from the opposing edge (home ' + a + 'deg vs away ' + b + 'deg)');
});

test('the mirror survives at phone width', () => {
  // The mobile block re-declares the ghost offset to pull it back in. If it
  // re-declares `right` without re-declaring the away override, the bug returns
  // below 600px only — the width most supporters actually use.
  const mob = mediaBlock('600px');
  assert.ok(/\.fxc__ghost\s*\{/.test(mob), 'mobile should still tune the ghost');
  assert.match(mob, /\.fxc--away\s+\.fxc__ghost\s*\{[^}]*left:\s*-/,
    'the away mirror must be restated wherever the base offset is restated');
});

// ── 3 · THE NEUTRAL FALLBACK STAYS DELIBERATE ───────────────────────────────

test('a club with no confirmed palette gets no tint at all', () => {
  // Not a grey approximation of a colour we are unsure about — nothing. An
  // unconfirmed club should look plain and intentional, never half-branded.
  assert.match(PAGE, /oppCol\s*\?\s*' fxc--tinted'\s*:\s*''/,
    'the tint class is conditional on a usable palette');
  assert.match(PAGE, /pal\s*&&\s*pal\.usable/,
    'usability, not mere presence, decides whether colour reaches the card');
});

// ── 4 · COMPETITIONS REMAIN TELLABLE APART ──────────────────────────────────

test('a cup tie does not look like a league game', () => {
  assert.ok(rule('.fxc--cup'), 'cup ties carry their own treatment');
  assert.ok(rule('.fxc--league:before'), 'league games carry their own edge');
});

test('the Vase is not the Cup', () => {
  // These were bucketed into one treatment, so the New Bradwell Vase tie —
  // the fixture the whole creative system was designed around — rendered
  // identically to the London Lions Cup tie, despite the club holding
  // separate official artwork for each.
  assert.match(PAGE, /id === 'fa-vase'\) return 'vase'/,
    'fa-vase must resolve to its own treatment');
  assert.match(PAGE, /id === 'fa-cup'\) return 'cup'/,
    'fa-cup keeps its own');
  assert.ok(rule('.fxc--vase'), 'the Vase needs a treatment to resolve to');
  assert.notStrictEqual(rule('.fxc--vase'), rule('.fxc--cup'),
    'and it must not be identical to the Cup');
});

// ── 5 · THE FOOTBALL LEADS THE CARD ─────────────────────────────────────────

test('the collapsed card does not carry a wall of utility buttons', () => {
  // Six equally-weighted grey buttons — Drive, Waze, Transport, Calendar,
  // Share, Match Card — took roughly forty per cent of the card and were the
  // loudest thing on it. They all still exist, one tap further in.
  const card = PAGE.slice(PAGE.indexOf('function fxCard'), PAGE.indexOf('function fxHero'));
  assert.ok(!/fxActs\(/.test(card),
    'the collapsed card must not render the full action stack inline');
  assert.match(card, /fxPanel\(f, state\)/,
    'utilities belong to the expanded panel');
});

test('nothing was deleted — every utility still exists in the panel', () => {
  const panel = PAGE.slice(PAGE.indexOf('function fxPanel'), PAGE.indexOf('function fxCard'));
  ['Drive', 'Waze', 'Transport', 'Calendar', 'Share', 'Match Card'].forEach((label) => {
    assert.ok(panel.includes('>' + label) || panel.includes(' ' + label + '<') ||
              panel.includes(label), 're-prioritised, not removed: ' + label);
  });
});

test('the expanded fixture is operable without a mouse or JavaScript', () => {
  // A div with a click handler is neither. <details> is announced, keyboard
  // operable and open-able with scripting off.
  assert.match(PAGE, /<details class="fxx">/, 'built on native disclosure');
  assert.ok(rule('.fxx__s'), 'the summary needs its own styling');
  assert.match(rule('.fxx__s'), /min-height:var\(--ctl-min-h\)/,
    'the tap target must meet the shared control minimum');
});

test('directions are not offered for a match that has already been played', () => {
  const panel = PAGE.slice(PAGE.indexOf('function fxPanel'), PAGE.indexOf('function fxCard'));
  assert.match(panel, /travel = \(state === 'upcoming' \|\| state === 'live'\)/,
    'routing someone to a game that finished last month is clutter');
});

test('live is only ever claimed by an authority, never derived from the clock', () => {
  const fn = PAGE.slice(PAGE.indexOf('function fxState'), PAGE.indexOf('function fxPanel'));
  assert.match(fn, /__rlfcLive/, 'live state comes from the live source');
  assert.ok(!/Date\.now\(\)\s*[<>]/.test(fn),
    'a passed kick-off time must never by itself mean the match is live');
  assert.match(fn, /return 'awaiting'/,
    'a gone fixture with no result says so honestly');
});

// ── 6 · THE MOST PROMINENT FIXTURE IS NOT THE PLAINEST ──────────────────────

test('the next-match hero carries the campaign like every card below it', () => {
  // It carried none of it: no opponent colour, no ghosted crest, no
  // competition mark. The Isuzu FA Vase tie rendered as a grey box above
  // thirty-eight cards that were all more expressive than it.
  const hero = PAGE.slice(PAGE.indexOf('function fxHero'), PAGE.indexOf('function fxCountdown'));
  assert.match(hero, /BrandPalette\.resolve/, 'the hero resolves the opponent palette');
  assert.match(hero, /fxCompTreatment\(f\)/, 'and its competition treatment');
  assert.match(hero, /fxh__ghost/, 'and shows the opponent crest');
  assert.match(hero, /fxCompMark\(ident\)/, 'and the official competition mark');
  assert.ok(rule('.fxh--tinted'), 'with a treatment to land in');
  assert.ok(rule('.fxh--away .fxh__ghost'), 'mirrored for away, same as the cards');
});
