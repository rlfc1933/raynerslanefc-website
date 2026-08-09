// ════════════════════════════════════════════════════════════════════════════
// THE CLUB WAS ADVERTISING ITS OPPONENT ON WHATSAPP.
//
// The postponement story carried `image: img/crests/new-bradwell-st-peter.png`
// — an opponent crest, which is what the club had to hand. Two places consume
// that field, and each had half a rule:
//
//   news.html already refused to put a crest in the LEAD PHOTO slot.
//   netlify/edge-functions/meta.js refused only SVGs for og:image.
//
// A crest as a PNG walked straight through the second gap, so every share of a
// Rayners Lane article previewed New Bradwell St Peter's badge, cropped square,
// with their name the largest thing in the card. Verified live before the fix.
//
// AND A CREST IS NOT A PHOTOGRAPH ON THE PAGE EITHER.
// Swapping it for the generated news-default.svg only moved the problem: a
// faint watermark stretched across a 500px lead slot reads as a broken image.
// The club does not always have a picture and inventing one is not an option,
// so the lead story stops pretending — hasPhoto() drives a typographic lead,
// which is what a programme or a local paper does with a story it has no
// picture for. It reads as a decision instead of a gap.
//
// These tests hold the RULE, not the artwork: articles come and go, and the
// next one with only a crest must behave the same way.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const EDGE = read('netlify/edge-functions/meta.js');
const NEWS = read('news.html');

// ── 1 · THE SHARE IMAGE ─────────────────────────────────────────────────────

test('a crest is never the share image', () => {
  // The guard is a regex LITERAL in the source, so the crest path appears
  // backslash-escaped. Match what is actually written.
  const line = EDGE.match(/const unusable = [^;]+;/);
  assert.ok(line, 'the og:image guard must exist');
  assert.match(line[0], /\.svg/, 'still rejects SVG — no preview renders one');
  assert.match(line[0], /img\\\/crests/,
    'and now rejects an opponent badge: ' + line[0]);
});

test('the fallback is a real raster card, not another placeholder', () => {
  assert.match(EDGE, /const img = unusable \? ORIGIN \+ '\/img\/og-card\.jpg' : raw;/);
});

test('the structured-data image is the same decision', () => {
  // A crest leaking into NewsArticle.image would put it back in every rich
  // result even with og:image fixed.
  const ld = EDGE.match(/image: \{ '@type': 'ImageObject', url: ([a-z]+) \}/);
  assert.ok(ld, 'NewsArticle.image must be set');
  assert.strictEqual(ld[1], 'img', 'it must reuse the guarded value, not item.image');
});

test('the live article that exposed this still carries only a crest', () => {
  // Recorded so the next reader knows the guard is load-bearing, not theoretical.
  const news = JSON.parse(read('data/news.json'));
  const a = (news.articles || []).filter((x) => /Hilltop Fixture Postponed/.test(x.title || ''))[0];
  assert.ok(a, 'the postponement article should still exist');
  assert.match(a.image, /img\/crests\//,
    'if this ever becomes a real photograph the guard is simply unused, not wrong');
});

// ── 2 · THE LEAD STORY ──────────────────────────────────────────────────────

test('the newsroom can tell a photograph from a stand-in', () => {
  const fn = NEWS.match(/function hasPhoto\(a\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /img\\\/crests\\\//, 'a crest is not a photograph');
  assert.match(fn, /news-\[a-z-\]\+\\\.svg/, 'nor is a generated stand-in');
  assert.match(fn, /if \(!src\) return false;/, 'and neither is nothing at all');
});

test('a lead with no photograph gets no picture frame', () => {
  assert.match(NEWS, /if \(featured && !photo\) card\.className = 'featured-card featured-card--type';/);
  assert.match(NEWS, /if \(!\(featured && !photo\)\) imgWrap\.appendChild\(img\);/,
    'the empty image element must not be appended at all');
});

test('the typographic lead is designed, not just an absence', () => {
  const css = NEWS.match(/\.featured-card--type \{[^}]*\}/)[0];
  assert.match(css, /border-top: 4px solid var\(--yellow\)/,
    'it should read as a masthead, not as a card that failed to load');
  assert.match(NEWS, /\.featured-card--type \.featured-title \{ font-size: clamp\(/,
    'the headline becomes the artwork, so it has to be sized like it');
});

test('secondary cards keep their thumbnail', () => {
  // The stand-in works fine at that size; only the lead slot was the problem.
  const fn = NEWS.match(/function makeCard\(a, featured\) \{[\s\S]*?\n\}/)[0];
  assert.ok(!/if \(!photo\) return/.test(fn),
    'non-featured cards must still render an image');
});

// ── 3 · THE LIVE PILL THAT MEANT NOTHING ────────────────────────────────────

test('LIVE is not spent on "this page refreshes itself"', () => {
  // Test for USAGE, not mention: comments and a retired style rule may name it.
  const markup = NEWS
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ');
  assert.ok(!/class="live-badge/.test(markup),
    'a pulsing red badge must mean a match is being played, not "page auto-refreshes"');
  assert.ok(!/Auto-Updating/i.test(markup));
  assert.match(NEWS, /id="last-updated"/,
    'the honest version of the claim — a timestamp — stays');
});
