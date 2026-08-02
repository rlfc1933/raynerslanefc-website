// Optional mobile numbers, and a WhatsApp permission that is a separate thing.
//
// The rule these tests hold: HOLDING a number is not PERMISSION to use it.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const SQL = read('supabase/migrations/20260804180000_fan_contact_whatsapp.sql')
  .replace(/^--.*$/gm, ' ');
const PHONE = require('../netlify/functions/lib/fan/phone.js');

test('ONE PERSON, ONE NUMBER', async (t) => {
  await t.test('every UK format collapses to the same E.164 value', () => {
    const forms = ['07400 123456', '07400123456', '+447400123456',
      '+44 7400 123 456', '0044 7400 123456', ' 07400-123456 '];
    const out = new Set(forms.map((f) => PHONE.normalise(f).e164));
    assert.strictEqual(out.size, 1, 'these are one phone: ' + [...out].join(', '));
    assert.strictEqual([...out][0], '+447400123456');
  });

  await t.test('rubbish is refused', () => {
    ['', '   ', '12345', 'not a number', '07400', 'x'.repeat(40)]
      .forEach((bad) => assert.strictEqual(PHONE.normalise(bad).ok, false,
        'accepted ' + JSON.stringify(bad)));
  });

  await t.test("Ofcom's fiction range is not a real phone", () => {
    // 07700 900xxx is reserved for drama. Storing one would give the club a
    // number nobody can answer, and it would look completely valid.
    assert.strictEqual(PHONE.normalise('07700900123').ok, false);
  });

  await t.test('international numbers still work', () => {
    const ie = PHONE.normalise('+353 85 123 4567');
    assert.strictEqual(ie.ok, true);
    assert.strictEqual(ie.country, 'IE');
  });

  await t.test('a landline is kept, but cannot receive WhatsApp', () => {
    const land = PHONE.normalise('020 8866 1234');
    assert.strictEqual(land.ok, true, 'a landline is a real number, not an error');
    assert.strictEqual(PHONE.couldReceiveWhatsApp(land), false);
    assert.strictEqual(PHONE.couldReceiveWhatsApp(PHONE.normalise('07400 123456')), true);
  });

  await t.test('numbers are masked for staff eyes', () => {
    const m = PHONE.mask('+447400123456');
    assert.ok(!m.includes('7400123'), 'the middle must not be readable: ' + m);
    assert.ok(m.endsWith('3456'), 'enough to recognise: ' + m);
  });

  await t.test('nothing is sent to an external service', () => {
    const src = strip(read('netlify/functions/lib/fan/phone.js'));
    assert.ok(!/fetch\(|https?:\/\//.test(src),
      'a supporter\'s phone number must never leave this system to be checked');
  });

  await t.test('the dependency is pinned and MIT', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.match(pkg.dependencies['libphonenumber-js'], /^\d+\.\d+\.\d+$/,
      'pin the version — phone metadata changes behaviour');
    assert.strictEqual(
      JSON.parse(read('node_modules/libphonenumber-js/package.json')).license, 'MIT');
  });
});

test('A NUMBER IS NOT A PERMISSION', async (t) => {
  await t.test('they are separate tables, not two columns', () => {
    assert.match(SQL, /create table if not exists public\.fan_contact_numbers/);
    assert.match(SQL, /create table if not exists public\.fan_whatsapp_consent/);
  });

  await t.test('the box is unticked and says what it is', () => {
    const ui = read('js/fan-zone-member.js');
    // The box is checked ONLY from stored consent, never by default. Asserting
    // the ABSENCE of the word "checked" would match the ternary that implements
    // exactly that — the same source-vs-prose mistake this project keeps making.
    assert.ok(ui.includes("(w.optedIn ? ' checked' : '')"),
      'the checkbox must reflect stored consent, defaulting to unchecked');
    assert.match(ui, /Giving us your number is not the same as agreeing to WhatsApp/);
    assert.match(ui, /This is optional/);
  });

  await t.test('opting in without a number is impossible', () => {
    assert.match(SQL, /cannot opt in to WhatsApp without a mobile number/);
  });

  await t.test('changing the number withdraws consent for the old one', () => {
    const fn = /create or replace function public\.fan_set_contact[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.match(fn, /if v_old_e164 is distinct from v_number\.e164 then/);
    assert.match(fn, /set opted_in = false/,
      'a permission given for a number we no longer hold is not a permission');
  });

  await t.test('a new number is never called verified', () => {
    const fn = /create or replace function public\.fan_set_contact[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.ok(!/status\s*=\s*'verified'/.test(fn),
      'there is no verification provider — saying verified would be a lie the ' +
      'club would later act on');
    assert.match(fn, /'provided_unverified'/);
  });

  await t.test('numbers are NOT unique — families share a phone', () => {
    assert.ok(!/unique[^;]*fan_contact_numbers[^;]*e164/i.test(SQL),
      'refusing a second supporter on a shared family phone would be a bug ' +
      'that looks like a policy');
  });
});

test('THE 50 COUNTS ONLY PEOPLE WHO ACTUALLY AGREED', async (t) => {
  const view = /create or replace view public\.fan_whatsapp_eligible[\s\S]*?;/.exec(SQL)[0];

  await t.test('every condition is required', () => {
    ['membership_status = \'active\'', 'c.opted_in is true', 'c.withdrawn_at is null',
     'c.suppressed is false', 'n.e164 is not null'].forEach((cond) => {
      assert.ok(view.includes(cond), 'eligibility must require: ' + cond);
    });
  });

  await t.test('it is one definition, not a count repeated in three places', () => {
    assert.match(SQL, /create or replace view public\.fan_whatsapp_eligible/);
  });

  await t.test('the view is not exposed to the public API', () => {
    assert.match(SQL, /revoke all on public\.fan_whatsapp_eligible from anon, authenticated/);
  });
});

test('NOTHING MESSAGES ANYBODY', async (t) => {
  await t.test('no WhatsApp API, no contact upload, no group creation', () => {
    const files = ['supabase/migrations/20260804180000_fan_contact_whatsapp.sql',
      'netlify/functions/lib/fan/phone.js', 'netlify/functions/fan-member.js',
      'js/fan-zone-member.js'];
    files.forEach((f) => {
      const src = strip(read(f));
      assert.ok(!/graph\.facebook\.com|whatsapp.*api|wa\.me\/send|createGroup/i.test(src),
        f + ' must not contact WhatsApp — this release records a permission for a ' +
        'service that has not launched');
    });
  });
});

test('STAFF NOTES CARRY A NAME AND A HISTORY', async (t) => {
  await t.test('author and timestamp are required', () => {
    assert.match(SQL, /author\s+text not null/);
    assert.match(SQL, /created_at\s+timestamptz not null default now\(\)/);
  });
  await t.test('an edit cannot quietly rewrite what was said', () => {
    assert.match(SQL, /previous_body text/);
  });
  await t.test('notes are club records, readable only with the service key', () => {
    assert.match(SQL, /alter table public\.fan_member_notes\s+enable row level security/);
    assert.ok(!/create policy[^;]*on public\.fan_member_notes/.test(SQL),
      'RLS on with no policy is a closed door');
  });
  await t.test('an export leaves a row behind whether or not anyone looks', () => {
    assert.match(SQL, /create table if not exists public\.fan_export_audit/);
    assert.match(SQL, /reason\s+text not null check/, 'a reason is required');
  });
});

test('A SUPPORTER SEES THEIR OWN RECORD AND NOBODY ELSE\'S', async (t) => {
  await t.test('self-read policies on the supporter-facing tables', () => {
    ['fan_contact_numbers', 'fan_whatsapp_consent', 'fan_interests'].forEach((tbl) => {
      const re = new RegExp('create policy[^;]*on public\\.' + tbl +
        '[\\s\\S]*?auth\\.uid\\(\\)');
      assert.match(SQL, re, tbl + ' needs a self-only read policy');
    });
  });
  await t.test('interests come from the supporter, from a fixed list', () => {
    assert.match(SQL, /interest\s+text not null check \(interest in/);
    const src = strip(read('netlify/functions/fan-member.js'));
    assert.match(src, /ALLOWED\.includes\(i\)/,
      'anything not on the list is discarded, so this cannot become a free-text ' +
      'field about a supporter');
  });
});
