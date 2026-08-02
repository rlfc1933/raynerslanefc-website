// GATE 8 — scheduled functions are not endpoints.
//
// Netlify returns 403 to any direct HTTP request for a scheduled function.
// This project has now shipped that mistake twice — a portal button wired to
// fwp-sync, and again to programme-sync — and both times it looked like it had
// worked. The button responded, the toast appeared, and nothing ran.
//
// These tests make the rule structural instead of remembered.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** Function names declared with a schedule in netlify.toml. */
function scheduled() {
  const toml = R('netlify.toml');
  const out = [];
  const re = /\[functions\."([^"]+)"\]([\s\S]*?)(?=\n\[|\s*$)/g;
  let m;
  while ((m = re.exec(toml))) {
    if (/^\s*schedule\s*=/m.test(m[2])) out.push(m[1]);
  }
  return out;
}

const CLIENT_FILES = ['admin.html', 'index.html', 'match-centre.html', 'programme.html',
  'programmes.html', 'fixtures.html', 'squad.html', 'player.html']
  .concat(fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f));

test('there is at least one scheduled function to check', () => {
  assert.ok(scheduled().length >= 2, 'expected the sync timers to be declared');
});

test('EVERY scheduled function has a companion a button can call', () => {
  scheduled().forEach((name) => {
    const companion = path.join(ROOT, 'netlify/functions', name + '-now.js');
    assert.ok(fs.existsSync(companion),
      name + ' is scheduled but has no ' + name + '-now.js. A button wired to ' +
      name + ' would get a 403 and look like it worked.');
  });
});

test('NO browser code calls a scheduled function', () => {
  const names = scheduled();
  CLIENT_FILES.filter((f) => fs.existsSync(path.join(ROOT, f))).forEach((f) => {
    const src = R(f);
    names.forEach((name) => {
      // The companion's name contains the scheduled one, so match the exact path.
      const bad = new RegExp('/\\.netlify/functions/' + name + '(?![-\\w])');
      assert.ok(!bad.test(src),
        f + ' calls the scheduled function ' + name + ' directly. Use ' + name + '-now.');
    });
  });
});

test('a companion is PIN-gated and its scheduled twin is not reachable by one', () => {
  scheduled().forEach((name) => {
    const now = R('netlify/functions/' + name + '-now.js');
    assert.match(now, /adminOk\(/, name + '-now must be signed in: a person presses it');
    assert.match(now, /httpMethod !== 'POST'/, name + '-now should be POST only');
  });
});

test('WITH THE FLAG OFF, a scheduled sync makes no request at all', async () => {
  // Not a source-order check — those are guesses about runtime. This runs the
  // timers with the switch off and fails if anything reaches the network.
  const realFetch = global.fetch;
  const realFlag = process.env.FWP_SYNC_ENABLED;
  let calls = 0;
  global.fetch = function (u) { calls++; throw new Error('reached the network: ' + u); };
  process.env.FWP_SYNC_ENABLED = 'false';
  try {
    for (const name of ['fwp-sync', 'football-registry-sync']) {
      delete require.cache[require.resolve('../netlify/functions/' + name)];
      const mod = require('../netlify/functions/' + name);
      const out = await mod.handler({ httpMethod: 'POST', body: '{}' });
      const j = JSON.parse(out.body || '{}');
      assert.strictEqual(j.enabled, false, name + ' should report that it is switched off');
      assert.strictEqual(calls, 0, name + ' called out despite the flag being off');
    }
  } finally {
    global.fetch = realFetch;
    if (realFlag === undefined) delete process.env.FWP_SYNC_ENABLED;
    else process.env.FWP_SYNC_ENABLED = realFlag;
    ['fwp-sync', 'football-registry-sync'].forEach((n) => {
      delete require.cache[require.resolve('../netlify/functions/' + n)];
    });
  }
});

test('no scheduled function is also declared as a redirect target', () => {
  const toml = R('netlify.toml');
  scheduled().forEach((name) => {
    const re = new RegExp('to\\s*=\\s*"/\\.netlify/functions/' + name + '(?![-\\w])');
    assert.ok(!re.test(toml), name + ' is rewritten to from a URL and will 403');
  });
});

test('the registry sync survives one step failing', () => {
  const src = R('netlify/functions/football-registry-sync.js');
  // Four independent steps. If a provider hiccup during the league table took
  // the player recompute down with it, a whole afternoon's records would wait
  // for the next run for no reason.
  assert.match(src, /async function step\(name, fn\)/);
  const stepCalls = src.match(/steps\.push\(await step\(/g) || [];
  assert.ok(stepCalls.length >= 4, 'expected season, table, lineups and players');
  assert.match(src, /catch \(e\) \{\s*return \{ step: name, ok: false/);
});

test('the registry sync stays inside its time budget', () => {
  const src = R('netlify/functions/football-registry-sync.js');
  assert.match(src, /Date\.now\(\) - startedAt > \d+/,
    'a run that overruns is killed mid-write; it must stop itself first');
});

test('a step that failed is reported as failed, not as green', () => {
  // The underlying handlers answer 200 with {ok:false} rather than throwing.
  // That is right for an HTTP caller and wrong for this one: left alone, a run
  // where nothing worked would report four green steps — the precise false
  // reassurance the health view exists to remove.
  const src = R('netlify/functions/football-registry-sync.js');
  assert.match(src, /if \(!parsed \|\| parsed\.ok === false\) \{\s*\n?\s*throw new Error/);
  // And one fixture failing must not abandon the rest of them.
  assert.match(src, /catch \(e\) \{ err = String/);
});

test('the timer does not ask the provider more often than it needs to', () => {
  // It fires every twenty minutes because line-ups and player records need it.
  // The fixture list and the league table do not — seventy-two requests a day
  // for a list that changes weekly is neither necessary nor courteous, and
  // this club errs on the lighter side by policy.
  const src = R('netlify/functions/football-registry-sync.js');
  assert.match(src, /async function minutesSinceOk\(syncType\)/);
  assert.match(src, /const EVERY = matchday \? 55 : 355/,
    'hourly on a matchday, six-hourly otherwise');
  ['season', 'table'].forEach((s) => {
    const re = new RegExp("step\\('" + s + "'[\\s\\S]{0,400}?if \\(age < EVERY\\) return \\{ skipped: true");
    assert.match(src, re, s + ' does not check its own freshness first');
  });
  // The player recompute is NOT gated: it makes no provider request at all.
  const players = src.slice(src.indexOf("step('players'"));
  assert.ok(!/age < EVERY/.test(players.slice(0, 400)),
    'recomputing costs the provider nothing and should run every time');
});

test('matchday is decided at the ground, not in the visitor\'s timezone', () => {
  const src = R('netlify/functions/football-registry-sync.js');
  assert.match(src, /timeZone: 'Europe\/London'/);
  assert.match(src, /isMatchday\(\)\.catch\(\(\) => true\)/,
    'if we cannot tell what day it is, assume the busier schedule');
});
