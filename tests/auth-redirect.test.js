// ════════════════════════════════════════════════════════════════════════════
// THE LOCALHOST INCIDENT — 2 August 2026.
//
// A real supporter completed the Fan Zone form. The site said "check your
// email". Supabase sent the email. They pressed Sign in, and Chrome opened:
//
//     localhost:3000/#access_token=…      ERR_CONNECTION_REFUSED
//
// There was no `localhost:3000` in this repository. The application sent the
// correct production URL. Supabase discarded it — the redirect allow-list was
// EMPTY, and GoTrue falls back to the Site URL, which was still the project
// default `http://localhost:3000`.
//
// The configuration is fixed. These tests exist because configuration can be
// wrong again — projects get restored, someone adds a staging URL, a setting
// gets edited. The rule is now enforced in code as well, and this file is what
// stops the code from drifting back.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const R = require('../js/fan-redirect.js');

/** A fake `location`, so every host can be tested without a browser. */
function loc(href) {
  const u = new URL(href);
  return { hostname: u.hostname, protocol: u.protocol, origin: u.origin,
           href: u.href, pathname: u.pathname, search: u.search, hash: u.hash };
}

test('PRODUCTION CAN NEVER SEND A SUPPORTER TO LOCALHOST', async (t) => {
  await t.test('the canonical origin is used on every production host', () => {
    ['https://raynerslanefc.co.uk/fan-zone.html?join=1',
     'https://www.raynerslanefc.co.uk/programme.html?id=fwp-578225',
     'https://raynerslanefc.co.uk/'].forEach((href) => {
      const out = R.authRedirect(loc(href));
      assert.strictEqual(out, 'https://raynerslanefc.co.uk/fan-zone.html',
        href + ' must redirect to the canonical origin');
    });
  });

  await t.test('www is normalised, so there is ONE session origin', () => {
    // www resolves and does NOT redirect to the apex. Without this, a
    // supporter who started on www would hold a session on a different origin
    // (localStorage is per-origin) and appear logged out on the apex.
    const out = R.authRedirect(loc('https://www.raynerslanefc.co.uk/fan-zone.html'));
    assert.ok(out.startsWith('https://raynerslanefc.co.uk/'), 'got ' + out);
    assert.ok(!out.includes('www.'), 'www must not survive into the redirect');
  });

  await t.test('THE INCIDENT: a production redirect containing localhost is refused', () => {
    const production = loc('https://raynerslanefc.co.uk/fan-zone.html');
    [
      'http://localhost:3000',
      'http://localhost:3000/fan-zone.html',
      'http://127.0.0.1:3000/fan-zone.html',
      'http://0.0.0.0:8080/fan-zone.html',
      'https://raynerslanefc.co.uk:3000/fan-zone.html',
    ].forEach((bad) => {
      const v = R.checkRedirect(bad, production);
      assert.strictEqual(v.ok, false, 'production must refuse ' + bad);
      assert.match(v.reason, /development|canonical|HTTPS/i);
    });
  });

  await t.test('a production redirect to another site is refused', () => {
    const production = loc('https://raynerslanefc.co.uk/fan-zone.html');
    ['https://evil.example/fan-zone.html',
     'https://raynerslanefc.co.uk.evil.example/fan-zone.html',
     'http://raynerslanefc.co.uk/fan-zone.html'].forEach((bad) => {
      assert.strictEqual(R.checkRedirect(bad, production).ok, false, 'must refuse ' + bad);
    });
  });

  await t.test('the good redirect passes its own guard', () => {
    const production = loc('https://raynerslanefc.co.uk/fan-zone.html');
    const v = R.checkRedirect(R.authRedirect(production), production);
    assert.strictEqual(v.ok, true, v.reason);
    assert.strictEqual(v.url, 'https://raynerslanefc.co.uk/fan-zone.html');
  });

  await t.test('development may use localhost — and only development', () => {
    const dev = loc('http://localhost:8899/fan-zone.html');
    assert.strictEqual(R.authRedirect(dev), 'http://localhost:8899/fan-zone.html');
    assert.strictEqual(R.checkRedirect(R.authRedirect(dev), dev).ok, true);
    assert.strictEqual(R.isProduction('localhost'), false);
    assert.strictEqual(R.isDevelopment('raynerslanefc.co.uk'), false);
  });

  await t.test('an unknown host refuses rather than guesses', () => {
    // Deploy previews, staging, anything unrecognised. A guessed origin in an
    // auth email is how a link ends up somewhere nobody meant it to go.
    ['https://deploy-preview-12--raynerslanefc.netlify.app/fan-zone.html',
     'https://something-else.example/fan-zone.html'].forEach((href) => {
      assert.strictEqual(R.authRedirect(loc(href)), null, href + ' must refuse');
      assert.strictEqual(R.checkRedirect(null, loc(href)).ok, false);
    });
  });

  await t.test('the callback is ONE stable path, not one per programme', () => {
    assert.strictEqual(R.CALLBACK_PATH, '/fan-zone.html');
    assert.ok(!R.CALLBACK_PATH.includes('?'),
      'a query string in the allow-listed redirect is fragile — the destination ' +
      'is decided by the signup intent the server stored');
  });
});

test('THE APPLICATION USES THE GUARD, AND REFUSES RATHER THAN SENDS', async (t) => {
  const boot = strip(read('js/fan-boot.js'));

  await t.test('the redirect is never built inline any more', () => {
    assert.doesNotMatch(boot, /emailRedirectTo:\s*location\.origin/,
      'location.origin was correct and still produced a broken link — the ' +
      'redirect must go through the guard');
    assert.match(boot, /emailRedirectTo:\s*verdict\.url/);
  });

  await t.test('a failed check sends NO email', () => {
    const send = /async function sendMagicLink[\s\S]*?\n  }/.exec(boot)[0];
    const guardAt = send.indexOf('checkRedirect');
    const sendAt = send.indexOf('signInWithOtp');
    assert.ok(guardAt > -1 && guardAt < sendAt,
      'the guard must run BEFORE the email is requested');
    assert.match(send, /if \(!verdict\.ok\)[\s\S]{0,200}return \{ error:/,
      'a bad redirect must return an error, not fall through to sending');
  });

  await t.test('the supporter-facing wording is the agreed sentence', () => {
    assert.match(read('js/fan-boot.js'),
      /We couldn\\u2019t prepare your secure sign-in link\. Please try again shortly\./);
  });

  await t.test('the rules travel with the bootstrap', () => {
    assert.match(boot, /fan-redirect\.js/,
      'a page that can start a sign-in must not be able to do it without the ' +
      'rules about where a sign-in may land');
    fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).forEach((p) => {
      assert.doesNotMatch(read(p).replace(/<!--[\s\S]*?-->/g, ' '),
        /src="js\/fan-redirect\.js/, p + ' must get it via the bootstrap');
    });
  });
});

test('CREDENTIALS DO NOT SURVIVE THE CALLBACK', async (t) => {
  await t.test('an auth response is recognised in fragment or query', () => {
    assert.ok(R.looksLikeAuthResponse('#access_token=abc&refresh_token=def', ''));
    assert.ok(R.looksLikeAuthResponse('', '?code=abc'));
    assert.ok(R.looksLikeAuthResponse('#error_description=expired', ''));
    assert.ok(!R.looksLikeAuthResponse('#lane-card', '?id=fwp-578225'));
  });

  await t.test('the whole auth fragment is removed', () => {
    const out = R.cleanUrl('https://raynerslanefc.co.uk/fan-zone.html#access_token=aaa.bbb.ccc&refresh_token=x&type=magiclink');
    assert.strictEqual(out, '/fan-zone.html');
    assert.ok(!out.includes('access_token'));
    assert.ok(!out.includes('refresh_token'));
  });

  await t.test('auth query parameters are removed and the rest is kept', () => {
    const out = R.cleanUrl('https://raynerslanefc.co.uk/programme.html?id=fwp-578225&code=abc&welcome=1');
    assert.strictEqual(out, '/programme.html?id=fwp-578225');
  });

  await t.test('a genuine fragment is not destroyed', () => {
    assert.strictEqual(R.cleanUrl('https://raynerslanefc.co.uk/fan-zone.html#lane-card'),
      '/fan-zone.html#lane-card');
  });

  await t.test('the bootstrap actually cleans the bar', () => {
    const boot = strip(read('js/fan-boot.js'));
    assert.match(boot, /arrivedWithAuth && global\.LaneRedirect/);
    assert.match(boot, /history\.replaceState\(\{\}, document\.title, clean\)/);
  });

  await t.test('the auth response is captured before the client can eat it', () => {
    const boot = read('js/fan-boot.js');
    const snapshot = boot.indexOf('var arrivedWithAuth');
    const createClient = boot.indexOf('createClient(');
    assert.ok(snapshot > -1 && snapshot < createClient,
      'detectSessionInUrl strips the fragment as soon as the client starts, so ' +
      'the evidence must be captured synchronously, first');
  });

  await t.test('a token can never reach a log', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.abcdefghijk';
    assert.ok(!R.redact('failed with ' + jwt).includes(jwt));
    assert.ok(!R.redact('?access_token=' + jwt).includes(jwt));
    assert.match(R.redact('failed with ' + jwt), /\[token redacted\]/);
    assert.match(R.redact('apikey=sb_secret_xyz'), /apikey=\[redacted\]/);
  });

  await t.test('errors from Supabase are redacted before display', () => {
    const boot = strip(read('js/fan-boot.js'));
    assert.match(boot, /R\.redact\(r\.error\.message\)/,
      'an auth error message can contain the token that caused it');
  });
});

test('NOTHING IN THE REPOSITORY POINTS A SUPPORTER AT A DEV MACHINE', async (t) => {
  await t.test('no shipped browser file contains a development origin', () => {
    const shipped = fs.readdirSync(path.join(ROOT, 'js')).map((f) => 'js/' + f)
      .concat(fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')));
    shipped.forEach((f) => {
      const code = strip(read(f));
      assert.ok(!/https?:\/\/(localhost|127\.0\.0\.1)/.test(code),
        f + ' contains a development origin in shipped code');
    });
  });

  await t.test('the development hosts are named in ONE place', () => {
    // So there is one list to audit, not a search across the repo.
    assert.deepStrictEqual(R.DEV_HOSTS, ['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
    assert.deepStrictEqual(R.PRODUCTION_HOSTS, ['raynerslanefc.co.uk', 'www.raynerslanefc.co.uk']);
  });
});
