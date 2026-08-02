// The Fan Zone sign-in email.
//
// It is committed here rather than living only in a dashboard textarea, so it
// can be reviewed and diffed — and so these tests can hold it to the rules
// that mail clients actually enforce.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EMAIL = fs.readFileSync(path.join(ROOT, 'email/magic-link.html'), 'utf8');
const body = EMAIL.replace(/<!--[\s\S]*?-->/g, ' ');   // comments are not content
// HTML wraps where it likes. Phrase checks must not depend on where the
// line break landed, or they fail on formatting rather than on content.
const flat = body.replace(/\s+/g, ' ');

test('THE EMAIL IS UNMISTAKABLY RAYNERS LANE', async (t) => {
  await t.test('it says who it is from, in live text', () => {
    ['Rayners Lane FC', 'Welcome to Fan Zone', 'Rayners Lane Football Club Limited',
     'Company No. 17110511', 'Harrow'].forEach((s) => {
      assert.ok(body.includes(s), 'missing: ' + s);
    });
  });

  await t.test('the crest is an absolute HTTPS static asset', () => {
    const m = /<img[^>]+src="([^"]+)"/.exec(body);
    assert.ok(m, 'the email must carry the crest');
    assert.match(m[1], /^https:\/\/raynerslanefc\.co\.uk\//, 'absolute HTTPS only');
    assert.ok(!m[1].includes('?'),
      'no query string — some clients mangle CDN parameters');
    assert.ok(fs.existsSync(path.join(ROOT, 'img/email-crest.png')),
      'the asset must exist in the repository');
  });

  await t.test('the crest has alt text, because images get blocked', () => {
    assert.match(body, /<img[^>]+alt="Rayners Lane Football Club crest"/);
  });

  await t.test('every important word is text, not baked into a picture', () => {
    const imgs = body.match(/<img/g) || [];
    assert.strictEqual(imgs.length, 1,
      'one image, the crest. Text in an image is invisible to a supporter who ' +
      'blocks images and to a screen reader');
  });
});

test('IT RENDERS IN MAIL CLIENTS, NOT JUST BROWSERS', async (t) => {
  await t.test('tables, not modern layout', () => {
    assert.match(body, /<table role="presentation"/);
    assert.ok(!/display:\s*(flex|grid)/.test(body), 'Outlook renders with Word');
    assert.ok(!/<style[\s>]/.test(body), 'Gmail strips <style> in some contexts');
  });

  await t.test('nothing is loaded from outside', () => {
    assert.ok(!/<script/i.test(body), 'no JavaScript in email');
    assert.ok(!/<link[^>]+stylesheet/i.test(body), 'no external CSS');
    assert.ok(!/fonts\.googleapis|@font-face/.test(body), 'no web fonts');
  });

  await t.test('the button survives Outlook', () => {
    assert.match(body, /<td[^>]+bgcolor="#FFD100"/,
      'a bulletproof button needs the colour on the cell, not just the link');
  });

  await t.test('it fits a phone', () => {
    assert.match(body, /width="600"/);
    assert.match(body, /max-width:100%/);
  });

  await t.test('there is a preheader', () => {
    assert.match(body, /Your free Fan Zone membership, Lane Card and digital programmes are waiting/);
    assert.match(EMAIL, /mso-hide:all/, 'and it is hidden from the body itself');
  });
});

test('IT ONLY USES VARIABLES SUPABASE ACTUALLY PROVIDES', async (t) => {
  await t.test('no invented variables', () => {
    const used = [...body.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)].map((m) => m[1]);
    const supported = ['ConfirmationURL', 'Token', 'TokenHash', 'SiteURL', 'Email',
      'NewEmail', 'RedirectTo', 'Data'];
    used.forEach((v) => assert.ok(supported.includes(v),
      '{{ .' + v + ' }} is not a Supabase variable — it would render as ' +
      'literal text in a supporter\'s inbox'));
    assert.ok(used.includes('ConfirmationURL'), 'the link must be present');
  });

  await t.test('the button and the fallback go to the SAME place', () => {
    const hrefs = [...body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const auth = hrefs.filter((h) => h.includes('ConfirmationURL'));
    assert.strictEqual(auth.length, 1, 'exactly one auth link, in the button');
    assert.match(body, /copy and paste this link/i, 'and a visible fallback');
    // A button that points somewhere different to the link beneath it is how a
    // phishing email behaves, and mail providers score it accordingly.
    const fallbackShown = /<p[^>]*>\s*\{\{ \.ConfirmationURL \}\}\s*<\/p>/.test(body);
    assert.ok(fallbackShown, 'the fallback must show the same URL');
  });

  await t.test('no token or destination is hard-coded', () => {
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(body), 'no token in the template');
    assert.ok(!/localhost|127\.0\.0\.1/.test(body), 'no development destination');
  });
});

test('IT PROMISES ONLY WHAT IS TRUE', async (t) => {
  await t.test('it does not say they are already a member', () => {
    assert.match(body, /one step away/i);
    assert.ok(!/you are now a member|registration complete|your account is ready/i.test(body),
      'nothing is created until the link is followed');
  });

  await t.test('it carries the security wording', () => {
    assert.match(flat, /used once and expires shortly/i);
    assert.match(flat, /did not request it/i);
  });

  await t.test('it is an authentication email, not a marketing one', () => {
    assert.ok(!/unsubscribe|opt.?in|newsletter|marketing/i.test(body),
      'consent belongs on the form, not in the email that proves an address');
  });

  await t.test('it contains no private data', () => {
    // NAMING the benefits is the point of the email — "your Lane Card", "your
    // programme history". What must never appear is a VALUE: a real Lane
    // number, a fixture the supporter opened, an attendance count. This email
    // goes to an address that has not been proven yet.
    assert.ok(!/Lane No\.\s*\d|membership number[:\s]*\d|fwp-\d+/i.test(flat),
      'no real Lane number or fixture id may appear');
    assert.ok(!/you have (opened|attended|read)\s+\d/i.test(flat),
      'no engagement counts');
    assert.ok(!/\bhearts?\b|\bpoints?\b\s*:/i.test(flat), 'no loyalty values');
  });

  await t.test('it explains why they received it', () => {
    assert.match(body, /because a Fan Zone sign-in link was/i);
  });
});
