// ════════════════════════════════════════════════════════════════════════════
// THE ANNOUNCEMENT THAT EXPLAINS THE EMPTY TUESDAY.
//
// The fixture work removed Rayners Lane v Hilltop from every "next match"
// surface, which is correct — but from a supporter's side of the screen a game
// simply vanished from the front page. This is the article that says why, and
// points at the game that IS being played.
//
// The tests are about the FACTS, not the prose. An announcement that leaves out
// the reason, the TBC, or the fixture supporters should turn up to instead is
// worse than no announcement, because it looks like the club is hiding
// something. Whoever rewrites the copy later can rewrite it freely; these
// assertions only insist the six things a reader needs survive the edit.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const NEWS = JSON.parse(read('data/news.json'));
const ARTICLES = NEWS.articles || [];
const ID = 'article-hilltop-postponed-fa-vase-2026';
const A = ARTICLES.filter((x) => x.id === ID)[0];
const TEXT = A ? [A.title, A.excerpt, A.body].join(' ') : '';

// ── 1 · IT EXISTS, THROUGH THE EXISTING SYSTEM ──────────────────────────────

test('the article is in the club newsroom, not bolted onto a page', () => {
  assert.ok(A, 'the announcement must live in data/news.json like every other story');
  // Same shape as its neighbours — no bespoke fields invented for this one.
  const others = ARTICLES.filter((x) => x.id !== ID);
  const shape = ['id', 'title', 'category', 'date', 'author', 'image', 'excerpt', 'body'];
  shape.forEach((k) => assert.ok(A[k], 'missing ' + k));
  Object.keys(A).forEach((k) => assert.ok(
    others.some((o) => Object.prototype.hasOwnProperty.call(o, k)),
    'field "' + k + '" is not used by any other article'));
});

test('it is the newest story, so it leads', () => {
  const newest = ARTICLES.slice().sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')))[0];
  assert.strictEqual(newest.id, ID);
});

test('exactly one story is featured', () => {
  const featured = ARTICLES.filter((x) => x.featured);
  assert.strictEqual(featured.length, 1, 'two lead stories is no lead story');
  assert.strictEqual(featured[0].id, ID);
});

test('the file wins the freshness race', () => {
  // The lesson from the fixture fix: js/components.js races jsDelivr@main
  // against the deployed file and a TIE goes to the stale CDN copy.
  assert.ok(Date.parse(NEWS.updatedAt) >= Date.parse(A.date + 'T00:00:00Z'),
    'updatedAt must be bumped or supporters keep the cached newsroom');
});

// ── 2 · THE FACTS A SUPPORTER NEEDS ─────────────────────────────────────────

test('it says the Hilltop game is postponed, and when it was', () => {
  assert.match(TEXT, /Hilltop/);
  assert.match(TEXT, /postponed/i);
  assert.match(TEXT, /Tuesday 11 August/);
});

test('it gives the reason', () => {
  assert.match(TEXT, /Broadfields[’']? FA Cup replay/);
});

test('it says the new date is not yet known — and does not invent one', () => {
  assert.match(TEXT, /confirmed in due course/i);
  // No second date may appear that could be mistaken for a rearranged fixture.
  const dates = TEXT.match(/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)\b/g) || [];
  const unique = [...new Set(dates)];
  assert.deepStrictEqual(unique.sort(), ['11 August', '15 August'],
    'only the postponed date and the next fixture may be stated');
});

test('it points at the fixture that IS being played', () => {
  assert.match(TEXT, /New Bradwell St Peter/);
  assert.match(TEXT, /FA Vase First Qualifying Round/);
  assert.match(TEXT, /Saturday 15 August 2026/);
  assert.match(TEXT, /Tithe Farm/);
});

test('it makes clear the next game is at home', () => {
  assert.match(TEXT, /return to Tithe Farm/i);
});

// ── 3 · THE ARTWORK IS REAL ─────────────────────────────────────────────────

test('the image is an approved asset that exists on disk', () => {
  assert.ok(fs.existsSync(path.join(ROOT, A.image)), A.image + ' is missing');
});

test('it uses the opponent crest, as fixture stories already do', () => {
  assert.match(A.image, /new-bradwell-st-peter/);
  // Existing convention: the Met Police and Wallingford stories do the same.
  const crestLed = ARTICLES.filter((x) => /img\/crests\//.test(x.image || ''));
  assert.ok(crestLed.length >= 2, 'this follows an established pattern, not a new one');
});

test('the Hilltop postponement graphic is not passed off as FA Vase artwork', () => {
  assert.ok(!/hilltop/i.test(A.image), 'a different announcement, a different image');
});

// ── 4 · IT REACHES THE READER ───────────────────────────────────────────────

test('the homepage news grid will carry it', () => {
  const idx = read('index.html');
  assert.match(idx, /arts\.sort\(function \(a, b\) \{ return String\(b\.date \|\| ''\)\.localeCompare\(String\(a\.date \|\| ''\)\); \}\)/,
    'the grid sorts newest first, so a dated story surfaces by itself');
  assert.match(idx, /news-article\.html\?id=' \+ encodeURIComponent\(a\.id\)/);
  assert.match(idx, /arts\.slice\(0, 4\)/, 'and the newest four are shown');
});

test('it is announced once, not pasted across the site', () => {
  ['index.html', 'fixtures.html', 'news.html'].forEach((f) => {
    assert.ok(!read(f).includes(A.title), f + ' must not hard-code the headline');
  });
});

test('the article page gives it a description and NewsArticle schema', () => {
  const s = read('news-article.html');
  assert.match(s, /'@type': 'NewsArticle'/);
  assert.match(s, /description: \(art\.excerpt \|\|/,
    'the excerpt becomes the meta description');
});

// ── 5 · IT DOES NOT CONTRADICT THE FIXTURE DATA ─────────────────────────────

test('the fixture data still says exactly what the article says', () => {
  const fx = JSON.parse(read('data/fixtures.json')).fixtures || [];
  const hill = fx.filter((f) => f.id === 'fwp-578241')[0];
  assert.strictEqual(hill.status, 'postponed');
  assert.strictEqual(hill.rearrangedDate, null, 'the article promises TBC; the data must agree');
  assert.match(hill.postponedReason, /Broadfields/);

  const nb = fx.filter((f) => /New Bradwell/i.test(f.opponent || ''))[0];
  assert.strictEqual(nb.date, '2026-08-15');
  assert.strictEqual(nb.isHome, true, 'the article says we are at home');
  assert.match(nb.competition, /FA Vase/);
});
