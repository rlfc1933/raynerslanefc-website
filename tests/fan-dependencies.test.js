// ════════════════════════════════════════════════════════════════════════════
// THE TEST THAT WOULD HAVE CAUGHT IT.
//
// The previous release shipped a correct server-side programme gate and a
// client that could never open it. Six pages carried js/fan-session.js; ONE of
// them also carried the Supabase library and the config that file needs. On
// the other five the client was silently null, no token was ever attached, and
// every member was treated as a stranger.
//
// 550 tests passed. Every one of them asserted that a fallback EXISTED —
// never that the real path was taken. That is the same failure shape as the
// crest incident and the loadJson('committee') 404 before it: silent, legible,
// and indistinguishable from working.
//
// So this file does not test behaviour. It tests that the arrangement which
// produced the failure cannot be committed again.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const js = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** Comments are not code. Both previous false passes came from matching prose. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}
function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, ' ');
}

const PAGES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

// Every page that offers Fan Zone state. Named here so adding a page to the
// site without adding it here is a decision, not an oversight.
const FAN_PAGES = [
  'index.html', 'programmes.html', 'programme.html',
  'fixtures.html', 'match-centre.html', 'fan-zone.html',
];

test('THE BOOTSTRAP IS THE ONLY WAY IN', async (t) => {
  await t.test('every Fan Zone page loads js/fan-boot.js', () => {
    FAN_PAGES.forEach((p) => {
      const src = stripHtmlComments(html(p));
      assert.match(src, /<script[^>]+src="js\/fan-boot\.js/,
        p + ' offers Fan Zone state but does not load the bootstrap');
    });
  });

  await t.test('nothing loads the old split entry point any more', () => {
    PAGES.forEach((p) => {
      const src = stripHtmlComments(html(p));
      assert.doesNotMatch(src, /src="js\/fan-session\.js/,
        p + ' still loads js/fan-session.js — the file that needed dependencies ' +
        'it did not carry. That is the exact production failure.');
    });
  });

  await t.test('the bootstrap fetches its own dependencies', () => {
    const src = stripComments(js('js/fan-boot.js'));
    // It must load BOTH, itself. This is what makes the failure unavailable:
    // a page cannot load fan-boot.js without also getting these.
    assert.match(src, /supabase-config\.js/,
      'fan-boot.js must load the config itself, not assume a page provided it');
    assert.match(src, /@supabase\/supabase-js/,
      'fan-boot.js must load the Supabase library itself');
    assert.match(src, /fan-redirect\.js/,
      'and the redirect rules — a page that can start a sign-in must not be ' +
      'able to do it without the rules about where a sign-in may land');
    assert.match(src, /function\s+loadScript|loadScript\s*=/,
      'fan-boot.js must actually inject them, not merely mention them');
    assert.match(src, /await\s+dependencies\(\)/,
      'the client must not be constructed before its dependencies have loaded');
  });

  await t.test('a page carrying the library statically still gets ONE client', () => {
    // fan-zone.html keeps its static tags because js/fan-zone.js needs
    // window.supabase at parse time. Two createClient calls on one page means
    // two GoTrue instances over one stored session.
    const boot = stripComments(js('js/fan-boot.js'));
    const zone = stripComments(js('js/fan-zone.js'));
    assert.match(boot, /__laneSupabaseClient/, 'fan-boot.js must share the one client');
    assert.match(zone, /__laneSupabaseClient/, 'fan-zone.js must reuse the one client');
  });

  await t.test('the account control cannot be loaded without the session', () => {
    const boot = stripComments(js('js/fan-boot.js'));
    assert.match(boot, /fan-account\.js/,
      'fan-account.js must come from the bootstrap, so it can never run without LaneFan');
    PAGES.forEach((p) => {
      assert.doesNotMatch(stripHtmlComments(html(p)), /src="js\/fan-account\.js/,
        p + ' loads fan-account.js directly — it must arrive via the bootstrap');
    });
  });

  await t.test('consumers wait for the session instead of racing it', () => {
    // The bug in one line: the fetch went out before the client existed.
    [
      ['js/programme-reader.js', 'programme-data'],
      ['js/programme-library.js', 'programme-data'],
      ['js/match-centre.js', 'football-data'],
    ].forEach(([file]) => {
      const src = stripComments(js(file));
      assert.match(src, /LaneFan\s*&&\s*window\.LaneFan\.ready|LaneFan\.ready/,
        file + ' must await LaneFan.ready before deciding what a member can see');
    });
  });

  await t.test('every Fan Zone page carries the stylesheet its markup needs', () => {
    FAN_PAGES.forEach((p) => {
      assert.match(stripHtmlComments(html(p)), /css\/fan-zone\.css/,
        p + ' renders the account control but has no styles for it');
    });
  });
});

test('THE RUNTIME CHECK MATCHES THE BUILD CHECK', async (t) => {
  await t.test('fan-health.js watches exactly the pages this test enforces', () => {
    const health = require('../netlify/functions/fan-health.js');
    const watched = health._internal.BOOTSTRAPPED_PAGES.slice().sort();
    assert.deepStrictEqual(watched, FAN_PAGES.slice().sort(),
      'the health check and the dependency test must agree, or one of them ' +
      'is quietly excusing a page');
  });
});

test('NO PERSONAL DATA IS BAKED INTO A STATIC PAGE', async (t) => {
  await t.test('the member home ships empty', () => {
    const src = html('fan-zone.html');
    const m = /<section class="fz-sec" id="fz-member"[^>]*>([\s\S]*?)<\/section>/.exec(src);
    assert.ok(m, 'fan-zone.html must have the member mount point');
    assert.strictEqual(m[1].trim(), '',
      'the member section must be empty in the served HTML — a static page is ' +
      'cached, and a cached page with a name in it is one supporter shown to another');
  });

  await t.test('the homepage strip has no name in the markup', () => {
    const src = html('index.html');
    const m = /<div class="fan-strip">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/.exec(src);
    assert.ok(m, 'index.html must have the member strip');
    assert.match(m[1], /data-fan-name/,
      'the name must be filled in by script, from a server-verified session');
  });
});
