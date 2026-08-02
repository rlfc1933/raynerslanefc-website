// GATE 6 — the supporter-facing surfaces.
//
// Structural tests against the shipped files. They protect the promises that
// are easy to break silently: no draft ever reachable, no fake editions, the
// archive rendered from its snapshot rather than from current club data.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the public read endpoint serves published and archived editions only', () => {
  const s = R('netlify/functions/programme-data.js');
  assert.match(s, /published_matchday','published_late','full_time_current','archived'/,
    'the public state list must be explicit');
  // A draft must not be reachable by guessing a URL.
  assert.ok(!/draft_hidden|waiting_for_lineups|withheld/.test(
    s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
    'no hidden state may appear in a public query');
});

test('RLS restricts the tables as well as the endpoint', () => {
  const sql = R('supabase/migrations/20260802060000_programme_editions.sql');
  assert.match(sql, /create policy programme_editions_public_read[\s\S]*?state in \('published_matchday','published_late','full_time_current','archived'\)/);
  assert.match(sql, /create policy programme_versions_public_read[\s\S]*?published_at is not null/);
});

test('the reader renders from the stored version, never from live club data', () => {
  const s = R('js/programme-reader.js');
  // Everything comes from one fetch of the immutable version.
  const fetches = s.match(/fetch\(/g) || [];
  assert.strictEqual(fetches.length, 1, 'exactly one request — the edition itself');
  assert.match(s, /programme-data\?id=/);
  // It must not reach for anything current.
  for (const live of ['football-data', 'crests.json', 'sponsors.json', 'committee.json', 'match_state']) {
    assert.ok(s.indexOf(live) === -1, 'reader must not read live source: ' + live);
  }
});

test('the reader refuses a non-public edition without hinting one exists', () => {
  const s = R('js/programme-reader.js');
  assert.match(s, /This programme is not available/);
  // No wording that would confirm a draft is sitting there.
  assert.ok(!/draft|preview available|not yet published/i.test(
    s.match(/function unavailable[\s\S]*?\}/)[0]), 'must not disclose a draft');
});

test('the library never invents an edition to look populated', () => {
  const s = R('js/programme-library.js');
  assert.match(s, /The collection starts soon/, 'a real empty state exists');
  assert.ok(!/lorem|placeholder|sample|dummy|example edition/i.test(s), 'no fake content');
  // And no commerce anywhere: every edition is free. Comments are stripped
  // first — the file's own comment says "no prices, no locks, no carts", and
  // matching that was the test catching its own explanation.
  const code = s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/price|£|checkout|cart|buy now|subscribe/i.test(code), 'programmes are free');
});

test('library cards carry a text label independent of the cover art', () => {
  const s = R('js/programme-library.js');
  assert.match(s, /aria-label="' \+ esc\(label\)/, 'each card is labelled');
  assert.match(s, /pl-card__t/, 'the fixture is also rendered as real text');
  // Nothing may be available only inside the cover image.
  const cover = R('js/programme-cover.js');
  assert.match(cover, /aria-hidden="true"/, 'crests are decorative');
  assert.match(cover, /aria-label="' \+ esc\(label\)/, 'the cover carries one accessible name');
});

test('the cover falls back to a designed mark, never a stretched crest', () => {
  const s = R('js/programme-cover.js');
  assert.match(s, /pc__crest--ini/);
  assert.match(s, /initials\(/);
  const css = R('css/programme-lib.css');
  assert.match(css, /\.pc__crest \{[^}]*object-fit: contain/, 'crests must never be distorted');
  assert.match(css, /aspect-ratio: 1/, 'crest box stays square');
});

test('covers stay legible as thumbnails and as heroes', () => {
  const css = R('css/programme-lib.css');
  assert.match(css, /container-type: inline-size/, 'sized by container, not viewport');
  assert.match(css, /clamp\(/, 'type scales with the cover');
});

test('the Match Centre does not say "today" before matchday', () => {
  const s = R('js/match-centre.js');
  assert.match(s, /A digital matchday programme will be available here/);
  assert.match(s, /today’s official teams are confirmed/);
  assert.match(s, /Europe\/London/, 'matchday is decided in club time');
});

test('an away fixture never shows a programme promise', () => {
  const s = R('js/match-centre.js');
  assert.match(s, /if \(!f\.isHome \|\| !f\.programmeEligible\) return ''/,
    'the programme block exits immediately for away fixtures');
});

test('the reader and library are cache-versioned', () => {
  // Gate 5 lost an hour to a stale stylesheet served stale-while-revalidate.
  for (const page of ['programme.html', 'programmes.html']) {
    const s = R(page);
    assert.match(s, /programme-lib\.css\?v=\d+/, page + ' stylesheet is versioned');
    assert.match(s, /programme-cover\.js\?v=\d+/, page + ' script is versioned');
  }
  const sw = R('sw.js');
  assert.match(sw, /CACHE = 'rlfc-v10'/, 'service-worker cache name bumped');
});

test('the reader page has one h1 and semantic sections', () => {
  const s = R('js/programme-reader.js');
  assert.match(s, /<h2 class="pr-sec__h"/, 'sections use h2 under the page h1');
  assert.match(s, /aria-labelledby="pr-h-/, 'each section is labelled');
  assert.match(s, /<nav class="pr-toc" aria-label="Programme contents">/);
});

test('the league table in a programme is a real table with headers', () => {
  const s = R('js/programme-reader.js');
  assert.match(s, /<th scope="col">/, 'column headers are scoped');
  assert.match(s, /<caption class="sr-only">/, 'the table is named');
  assert.match(s, /The table as it stood on matchday/, 'freshness is stated honestly');
});

test('published editions are indexable; the reader itself is not a draft leak', () => {
  const s = R('programme.html');
  assert.ok(!/noindex/.test(s), 'a published programme may be indexed');
  assert.match(s, /id="programme-reader"/);
});
