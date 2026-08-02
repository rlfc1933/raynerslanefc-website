// GATE 8 — one system, one writer, one reader.
//
// The site once offered the match it had just played as the next fixture,
// because three pages each worked "next" out for themselves from three
// different sources. These tests are how that stays fixed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── one reader ──────────────────────────────────────────────────────────────
test('the fixtures page asks the registry BEFORE the legacy file', () => {
  const s = strip(R('fixtures.html'));
  const registry = s.indexOf('RLFCFootball.fixtures()');
  const legacy = s.indexOf("fetch('data/fixtures.json");
  assert.ok(registry > 0, 'the fixtures page must read the registry');
  assert.ok(legacy === -1 || registry < legacy,
    'data/fixtures.json is a fallback, not a second source of truth');
});

test('the legacy provider is only ever a fallback', () => {
  // fetch-fixtures / fetch-table predate the registry. They may still catch a
  // cold start; they must never be reached first.
  ['fixtures.html'].forEach((f) => {
    const s = strip(R(f));
    const reg = s.indexOf('RLFCFootball');
    ['fetch-fixtures', 'fetch-table'].forEach((legacy) => {
      const i = s.indexOf(legacy);
      if (i === -1) return;
      assert.ok(reg > -1 && reg < i, f + ' reaches ' + legacy + ' before the registry');
    });
  });
});

test('no browser code calls Football Web Pages', () => {
  // The provider is a server-side relationship. A supporter's browser has never
  // called them and must not start.
  const files = ['fixtures.html', 'index.html', 'match-centre.html', 'programme.html',
    'squad.html', 'player.html', 'admin.html']
    .concat(fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f));
  // A visible attribution link is fine and required — the club credits its
  // source. What must never appear is a REQUEST.
  const FETCHES = /(fetch|XMLHttpRequest|\.open|src\s*=|EventSource)\s*\(?\s*['"`][^'"`]*footballwebpages/i;
  files.filter((f) => fs.existsSync(path.join(ROOT, f))).forEach((f) => {
    const s = R(f);
    assert.ok(!FETCHES.test(s), f + ' requests from the provider in the browser');
    // And where the name appears at all, it is inside a link a person clicks.
    (s.match(/[^\n]*footballwebpages[^\n]*/gi) || []).forEach((line) => {
      assert.match(line, /<a\s|href=|\/\/|\*|#|Football Web Pages/,
        f + ' mentions the provider outside an attribution: ' + line.trim().slice(0, 90));
    });
  });
});

test('there is exactly one client reader for football facts', () => {
  const src = R('js/football-data.js');
  assert.match(src, /global\.RLFCFootball = \{/);
  // And it talks to one endpoint.
  const endpoints = (src.match(/\/\.netlify\/functions\/[a-z-]+/g) || [])
    .filter((v, i, a) => a.indexOf(v) === i);
  assert.deepStrictEqual(endpoints, ['/.netlify/functions/football-data']);
});

// ── one writer ──────────────────────────────────────────────────────────────
test('only the sync writes the live score', () => {
  // match_state is the scoreboard. Two writers on a Saturday is the failure the
  // whole architecture exists to prevent, so the list of files that may write
  // it is short and deliberate.
  const fnDir = path.join(ROOT, 'netlify/functions');
  const allowed = ['fwp-sync.js', 'live-score.js', 'match-override.js', 'lib/match-store.js'];
  const offenders = [];
  const walk = (dir, prefix) => {
    fs.readdirSync(dir).forEach((f) => {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) return walk(full, prefix + f + '/');
      if (!f.endsWith('.js')) return;
      const rel = prefix + f;
      const src = fs.readFileSync(full, 'utf8');
      // A write is a PATCH or POST aimed at match_state.
      if (/match_state[^']*'\s*,\s*\{\s*\n?\s*method:\s*'(POST|PATCH)/.test(src)
        || /updateState|ensureState/.test(src)) {
        if (allowed.indexOf(rel) === -1) offenders.push(rel);
      }
    });
  };
  walk(fnDir, '');
  assert.deepStrictEqual(offenders, [], 'unexpected writers of the live score');
});

test('the sync never confirms a player identity', () => {
  const fnDir = path.join(ROOT, 'netlify/functions');
  fs.readdirSync(fnDir).filter((f) => /sync/.test(f) && f.endsWith('.js')).forEach((f) => {
    const src = strip(fs.readFileSync(path.join(fnDir, f), 'utf8'));
    assert.ok(!/identity_status:\s*'confirmed'/.test(src),
      f + ' confirms an identity. Only a human may.');
  });
});

// ── the manual scoreboard is the exception, not the habit ───────────────────
test('the hand-entered scoreboard is folded away as an emergency', () => {
  const s = R('admin.html');
  const i = s.indexOf('Emergency: enter the score by hand');
  assert.ok(i > 0, 'the manual controls must be labelled as emergency use');
  const open = s.lastIndexOf('<details class="emerg">', i);
  const close = s.indexOf('</details>', i);
  const inside = s.slice(open, close);
  ['bumpScore(', 'pushLiveScore()', "setStatus('Full Time')"].forEach((ctrl) => {
    assert.ok(inside.includes(ctrl), ctrl + ' is outside the emergency fold');
  });
  // And it tells the operator the one thing that makes it work.
  assert.match(inside, /Take manual control/);
});

test('the emergency fold is not open by default', () => {
  const s = R('admin.html');
  assert.ok(!/<details class="emerg"\s+open/.test(s),
    'an open pair of + buttons is an invitation to a second writer');
});

// ── the registry's own timer ────────────────────────────────────────────────
test('the registry sync writes the players nobody else does', () => {
  const src = strip(R('netlify/functions/football-registry-sync.js'));
  assert.match(src, /STATS\.recompute/);
  const others = fs.readdirSync(path.join(ROOT, 'netlify/functions'))
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /STATS\.recompute|player-stats/.test(fs.readFileSync(path.join(ROOT, 'netlify/functions', f), 'utf8')));
  // Exactly two: the timer, and the portal button a human presses.
  assert.deepStrictEqual(others.sort(), ['football-players.js', 'football-registry-sync.js']);
});
