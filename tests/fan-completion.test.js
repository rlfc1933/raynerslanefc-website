// The Fan Zone completion release, tested against what actually broke.
//
// Every group below exists because something in the verification was wrong,
// not because the area seemed worth covering.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const FAN = require('../netlify/functions/lib/fan/members.js');
const NOTIFY = require('../netlify/functions/lib/fan/notify.js');
const MIGRATION = read('supabase/migrations/20260804060000_fan_completion.sql');
const SQL = strip(MIGRATION.replace(/^--.*$/gm, ' '));

/* ══════════════════════════════════════════════════════════════════════════
   1. THE BLOCKER NOBODY HAD FOUND
   ══════════════════════════════════════════════════════════════════════════ */
test('A TOKEN CAN ACTUALLY BE VERIFIED', async (t) => {
  await t.test('the api key is never empty', () => {
    // SUPABASE_ANON_KEY was never set in Netlify. userFromToken sent
    // `apikey: ''`, Supabase answered 401 "No API key found in request", and
    // EVERY token was rejected — valid ones included. Fixing the browser
    // client alone would not have opened a single programme.
    assert.ok(FAN.ANON_KEY, 'there must always be an api key to send');
    assert.ok(FAN.ANON_KEY.length > 20, 'and it must be a real one');
  });

  await t.test('the fallback is the published key, not a secret', () => {
    const config = read('js/supabase-config.js');
    assert.ok(config.includes(FAN.ANON_KEY),
      'the server fallback must be the SAME key the site already publishes in ' +
      'every page — if it is not in supabase-config.js it is not public, and ' +
      'it does not belong hard-coded in a tracked file');
  });

  await t.test('an env var still wins', () => {
    const src = strip(read('netlify/functions/lib/fan/members.js'));
    assert.match(src, /process\.env\.SUPABASE_ANON_KEY\s*\|\|/,
      'the environment must take precedence over the fallback');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. RETURN PATHS — the same rule on both sides
   ══════════════════════════════════════════════════════════════════════════ */

/** Load the browser's safePath out of js/fan-boot.js with a minimal shim. */
function clientSafePath() {
  const sandbox = {
    document: {
      querySelector: () => null, createElement: () => ({ dataset: {}, addEventListener() {} }),
      head: { appendChild() {} }, addEventListener() {}, dispatchEvent() {},
      documentElement: { classList: { toggle() {} } }, querySelectorAll: () => [],
    },
    window: {}, location: { origin: 'https://raynerslanefc.co.uk', pathname: '/', search: '' },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ json: async () => ({}) }),
    CustomEvent: function () {}, setTimeout, Promise, console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('js/fan-boot.js'), sandbox);
  return sandbox.LaneFan.safePath;
}

test('A MAGIC LINK CAN NEVER LEAVE THIS SITE', async (t) => {
  const client = clientSafePath();
  const server = (v) => FAN.safePath(v) !== null;

  const ALLOWED = [
    '/programme.html?id=fwp-578225',
    '/programmes.html',
    '/',
    '/fan-zone.html#lane-card',
  ];
  const REFUSED = [
    'https://evil.example/steal',
    '//evil.example/steal',
    '\\\\evil.example',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    '/\\evil.example',
    '%2f%2fevil.example',            // single-encoded protocol-relative
    '%252f%252fevil.example',        // double-encoded — survives one decode
    'https%3A%2F%2Fevil.example',
    'programme.html',                // relative: no leading slash
    '/path\nLocation: https://evil.example',
    '',
    null,
  ];

  await t.test('the browser and the server agree, in both directions', () => {
    ALLOWED.forEach((v) => {
      assert.strictEqual(client(v), true, 'browser should allow ' + v);
      assert.strictEqual(server(v), true, 'server should allow ' + v);
    });
    REFUSED.forEach((v) => {
      assert.strictEqual(client(v), false, 'browser should REFUSE ' + JSON.stringify(v));
      assert.strictEqual(server(v), false, 'server should REFUSE ' + JSON.stringify(v));
    });
  });

  await t.test('a double-encoded external host is refused', () => {
    // One decode turns this into "%2f%2fevil.example", which looks harmless.
    // Two turns it into "//evil.example", which is not.
    assert.strictEqual(server('%252f%252fevil.example'), false);
  });

  await t.test('nothing personal travels in the return URL', () => {
    const src = strip(read('js/fan-zone-member.js')) + strip(read('js/fan-boot.js'));
    // The details are parked server-side against a nonce instead.
    assert.doesNotMatch(src, /returnPath[^\n]*\+[^\n]*email/i,
      'an email address must never be appended to a return path');
    assert.match(strip(read('js/fan-boot.js')), /fan-intent/,
      'signup details must go to the server, not into the link');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. THE PARAMETERS THE LAST RELEASE THREW AWAY
   ══════════════════════════════════════════════════════════════════════════ */
test('THE JOIN LINK ARRIVES SOMEWHERE THAT READS IT', async (t) => {
  const member = strip(read('js/fan-zone-member.js'));

  await t.test('every parameter the gate sends is handled', () => {
    ['join', 'signin', 'return', 'welcome', 'source', 'programme'].forEach((p) => {
      assert.ok(new RegExp("['\"]" + p + "['\"]").test(member),
        'fan-zone-member.js must read ?' + p + ' — the gate has been sending it ' +
        'since the last release and nothing read it');
    });
  });

  await t.test('the gate still sends them', () => {
    const reader = strip(read('js/programme-reader.js'));
    assert.match(reader, /fan-zone\.html\?join=1/, 'the gate must link to the join panel');
    assert.match(reader, /return=/, 'and carry where to come back to');
    assert.match(reader, /source=/, 'and how they got there, for attribution');
  });

  await t.test('the supporter is returned without another click', () => {
    assert.match(member, /location\.replace\(/,
      'after joining, the programme should open — not a page inviting them to open it');
    assert.match(member, /joined=1/, 'and say so, once');
  });

  await t.test('the return target is preferred from the SERVER', () => {
    // sessionStorage is empty when the link opens on another device.
    assert.match(member, /out\.returnTo\s*\)?\s*\|\|/,
      'the server-stored return path must win over the local one');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. ONE MEMBERSHIP, ONE TRANSACTION
   ══════════════════════════════════════════════════════════════════════════ */
test('MEMBERSHIP CANNOT BE HALF-CREATED', async (t) => {
  await t.test('creation is a single database function', () => {
    assert.match(SQL, /create or replace function public\.fan_ensure_membership/);
    const lib = strip(read('netlify/functions/lib/fan/members.js'));
    assert.match(lib, /rpc\/fan_ensure_membership/,
      'the server must call the function, not re-implement the steps');
    assert.doesNotMatch(lib, /rest\('fan_members',\s*\{\s*method:\s*'POST'/,
      'nothing outside the transaction may insert a member');
  });

  await t.test('everything that must happen together is inside it', () => {
    const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];
    ['insert into public.fan_members', 'fan_activity', 'fan_marketing_preferences',
      'fan_notification_outbox', 'fan_newsletter_contacts'].forEach((piece) => {
      assert.ok(fn.includes(piece), fn ? piece + ' must be inside the transaction' : '');
    });
  });

  await t.test('only the service role may call it', () => {
    assert.match(SQL, /revoke all on function public\.fan_ensure_membership from public, anon, authenticated/,
      'it takes an auth user id as an argument — a browser calling it could name somebody else');
  });

  await t.test('a notification failure cannot roll back a membership', () => {
    const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.doesNotMatch(fn, /api\.resend\.com|http_post|pg_net/,
      'the transaction must QUEUE the email, never send it');
    assert.match(fn, /insert into public\.fan_notification_outbox/);
  });

  await t.test('an existing email is claimed, never duplicated', () => {
    const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.match(fn, /where email_normalised = v_email for update/,
      'FOR UPDATE, or two concurrent callbacks both claim the same row');
    assert.match(fn, /update public\.fan_members\s*\n\s*set auth_user_id/);
  });

  await t.test('reading a programme does not silently enrol anybody', () => {
    const lib = strip(read('netlify/functions/lib/fan/members.js'));
    const ctx = /async function context\(event\)[\s\S]*?\n}/.exec(lib)[0];
    assert.doesNotMatch(ctx, /ensure\(/,
      'context() must only look up — creating a member is a decision, not a side effect of a GET');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. LANE NUMBERS
   ══════════════════════════════════════════════════════════════════════════ */
test('TWO SUPPORTERS CANNOT SHARE A NUMBER', async (t) => {
  await t.test('the random allocator is gone', () => {
    const lib = read('netlify/functions/lib/fan/members.js');
    assert.doesNotMatch(lib, /Math\.random\(\)\s*\*\s*9000/,
      '1000 + random()*9000 with no unique index is a collision at a few dozen members');
    assert.doesNotMatch(lib, /function membershipNumber/,
      'the JavaScript allocator must not exist at all');
  });

  await t.test('numbers come from a sequence', () => {
    assert.match(SQL, /create sequence if not exists public\.fan_membership_number_seq/);
    assert.match(SQL, /nextval\('public\.fan_membership_number_seq'\)/);
  });

  await t.test('the allocator skips numbers already issued', () => {
    const fn = /create or replace function public\.fan_next_membership_number[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.match(fn, /not exists \(select 1 from public\.fan_members where membership_number/,
      'must not reuse a membership number');
    assert.match(fn, /not exists \(select 1 from public\.fans where lane_no::text/,
      'must not collide with a Lane Card number already in the wild (they run to 4500)');
    assert.match(fn, /v_guard/, 'and must not loop forever if the space is exhausted');
  });

  await t.test('the database refuses a duplicate', () => {
    assert.match(SQL, /create unique index if not exists fan_members_number_unique_idx/,
      'the constraint the previous release was missing');
  });

  await t.test('an existing Lane Card number is carried across, never regenerated', () => {
    const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.match(fn, /v_number := btrim\(v_fan\.lane_no::text\)/,
      'a returning supporter keeps their number');
  });

  await t.test('a supporter cannot change their own number', () => {
    const src = strip(read('netlify/functions/fan-member.js'));
    const profile = /if \(action === 'profile'\)[\s\S]*?return resp\(200, \{ ok: true, member[\s\S]*?\);/.exec(src)[0];
    assert.doesNotMatch(profile, /membership_number/,
      'the profile action must not be able to write a membership number');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. IDENTITY — proven, or a human looks at it
   ══════════════════════════════════════════════════════════════════════════ */
test('A LANE CARD IS LINKED ONLY BY PROVEN IDENTITY', async (t) => {
  const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];

  await t.test('by auth user id or verified email — nothing else', () => {
    assert.match(fn, /from public\.fans where id = p_auth_user_id/);
    assert.match(fn, /from public\.fans where email_normalised = v_email/);
  });

  await t.test('never by anything guessable', () => {
    ['v_fan.name', 'town', 'photo', 'username', 'similar'].forEach((weak) => {
      assert.ok(!new RegExp('where[^;]*' + weak).test(fn),
        'a Lane Card must never be matched on ' + weak + ' — a wrongly merged ' +
        'supporter is far worse than an unmerged one');
    });
  });

  await t.test('fans gained the email column that made this possible', () => {
    assert.match(SQL, /alter table public\.fans add column if not exists email_normalised text/);
    assert.match(SQL, /create unique index if not exists fans_email_normalised_idx/);
  });

  await t.test('the backfill uses the proven relationship only', () => {
    const backfill = /update public\.fans f[\s\S]*?;/.exec(SQL)[0];
    assert.match(backfill, /from auth\.users u\s*\n\s*where u\.id = f\.id/,
      'fans.id IS the auth user id — that is the proof, and the only one used');
  });

  await t.test('there is somewhere for an unprovable match to wait', () => {
    assert.match(SQL, /create table if not exists public\.fan_identity_reviews/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. THE CLUB NOTIFICATION
   ══════════════════════════════════════════════════════════════════════════ */
test('THE CLUB IS TOLD, ONCE', async (t) => {
  await t.test('one durable event per membership, deduped', () => {
    assert.match(SQL, /dedupe_key\s+text not null unique/);
    const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.match(fn, /on conflict \(dedupe_key\) do nothing/,
      'ensure() runs on every page load — the second call must queue nothing');
    assert.match(fn, /if v_created then/,
      'and only a NEW membership is an event at all');
  });

  await t.test('new and linked supporters are distinguished', () => {
    const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.match(fn, /case when v_linked then 'member_linked' else 'member_new' end/,
      'presenting a long-standing supporter as brand new is a small lie the ' +
      'committee would spot on the first email');
    assert.strictEqual(
      NOTIFY._internal.subjectFor('member_new', { firstName: 'Sam', lastName: 'Reid' }),
      'New Fan Zone member — Sam Reid');
    assert.strictEqual(
      NOTIFY._internal.subjectFor('member_linked', { firstName: 'Sam', lastName: 'Reid' }),
      'Lane member linked online — Sam Reid');
  });

  await t.test('the email carries only what the committee needs', () => {
    const html = NOTIFY._internal.bodyFor('member_new', {
      firstName: 'Sam', lastName: 'Reid', email: 'sam@example.com',
      membershipNumber: '1042', joinedAt: '2026-08-02T14:00:00Z',
      source: 'programme:fwp-578225', fixtureId: 'fwp-578225', marketing: false,
    }, 'https://raynerslanefc.co.uk/admin.html#supporters');

    ['Sam Reid', 'sam@example.com', '1042', 'Not opted in'].forEach((wanted) => {
      assert.ok(html.includes(wanted), 'the email should state ' + wanted);
    });
    [/token/i, /Bearer/, /password/i, /auth_user_id/, /"id":/].forEach((banned) => {
      assert.doesNotMatch(html, banned, 'the email must not carry ' + banned);
    });
    assert.ok(html.includes('View supporter'), 'and one link into the portal');
  });

  await t.test('no marketing claim is invented when none was made', () => {
    const html = NOTIFY._internal.bodyFor('member_new', { firstName: 'Sam', marketing: null }, '');
    assert.ok(html.includes('No choice made'),
      'a supporter who was never asked must not be recorded either way');
  });

  await t.test('the sender is never spoofed', () => {
    const src = strip(read('netlify/functions/lib/fan/notify.js'));
    assert.doesNotMatch(src, /from:\s*'[^']*info@raynerslanefc\.co\.uk/,
      'putting the club address in From on an unverified domain fails SPF/DKIM ' +
      'and teaches mail providers to distrust the real one');
    assert.match(src, /reply_to: 'info@raynerslanefc\.co\.uk'/,
      'Reply-To carries the club address instead, which is honest and works');
  });

  await t.test('delivery is bounded, and failure is visible not silent', () => {
    const src = read('netlify/functions/lib/fan/notify.js');
    assert.match(src, /MAX_ATTEMPTS = 6/);
    assert.match(src, /Math\.pow\(2, attempts\)/, 'bounded backoff');
    assert.match(src, /status: 'abandoned'|patch\.status = 'abandoned'/,
      'a queue that grinds forever is worse than one that says it gave up');
    assert.match(src, /last_error/, 'and the reason must be kept');
  });

  await t.test('joining never waits on an email provider', () => {
    const src = strip(read('netlify/functions/fan-member.js'));
    assert.match(src, /NOTIFY\.drain\([^)]*\)\.catch\(\(\) => null\)/,
      'the send must be a nudge, not an await — a slow provider must never ' +
      'become the supporter\'s problem');
    assert.doesNotMatch(src, /await NOTIFY\.drain/);
  });

  await t.test('it is scheduled, not publicly callable', () => {
    assert.match(read('netlify.toml'), /\[functions\."fan-notify"\]\s*\n\s*schedule =/,
      'Netlify returns 403 to direct HTTP for a scheduled function — nothing on ' +
      'the public internet should be able to make the club send email on demand');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. MARKETING STAYS SEPARATE
   ══════════════════════════════════════════════════════════════════════════ */
test('MARKETING IS NEVER A SIDE EFFECT OF JOINING', async (t) => {
  await t.test('a preference is written only when a choice was made', () => {
    const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.match(fn, /if p_marketing is not null then/,
      'null means no answer — not "no", and certainly not "yes"');
  });

  await t.test('signing in makes no marketing claim', () => {
    const src = strip(read('js/fan-zone-member.js'));
    assert.match(src, /panelMode === 'join' && mk\) \? !!mk\.checked : null/,
      'the sign-in panel has no marketing question, so it must send null');
  });

  await t.test('entitlement never consults it', () => {
    const lib = strip(read('netlify/functions/lib/fan/members.js'));
    const can = /function canReadProgrammes\(member\)[\s\S]*?\n}/.exec(lib)[0];
    assert.doesNotMatch(can, /marketing/i);
    assert.match(can, /membership_status === 'active'/);
  });

  await t.test('the box is unticked and says so', () => {
    const src = read('js/fan-zone-member.js');
    assert.doesNotMatch(src, /id="fzj-marketing"[^>]*checked/, 'never pre-ticked');
    assert.match(src, /Optional/, 'and the supporter is told it is optional');
    assert.match(src, /does not depend on it/, 'and that access does not depend on it');
  });

  await t.test('the wording consented to is versioned and stored', () => {
    assert.strictEqual(FAN.MARKETING_WORDING, 'marketing-2026-08');
    const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.match(fn, /consent_wording_version/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   9. THE NEWSLETTER, JOINED UP
   ══════════════════════════════════════════════════════════════════════════ */
test('THE MAILING LIST IS NOT A BACK DOOR INTO MEMBERSHIP', async (t) => {
  const src = strip(read('netlify/functions/fan-newsletter.js'));

  await t.test('a signed-in member gets a preference, not a second record', () => {
    assert.match(src, /FAN\.setMarketing\(member\.id, true, 'newsletter-footer'\)/);
    assert.match(src, /mode: 'member'/);
  });

  await t.test('a logged-out email is a contact, never a member', () => {
    assert.doesNotMatch(src, /fan_ensure_membership|FAN\.ensure/,
      'signing up to a mailing list must not silently create a Lane Card');
    assert.match(src, /fan_newsletter_contacts/);
    assert.match(src, /invite:/, 'they are invited to join, not enrolled');
  });

  await t.test('the footer says which one it is, before they submit', () => {
    const comp = read('js/components.js');
    assert.match(comp, /it does not create a\s*\n?\s*Fan Zone account/,
      'the difference must be stated on the form itself');
  });

  await t.test('a later join reconciles the contact and keeps its consent', () => {
    const fn = /create or replace function public\.fan_ensure_membership[\s\S]*?\n\$\$;/.exec(SQL)[0];
    assert.match(fn, /update public\.fan_newsletter_contacts\s*\n\s*set converted_member_id/);
    assert.doesNotMatch(fn, /update public\.fan_newsletter_contacts[\s\S]{0,200}consented_at =/,
      'their original consent timestamp and wording must travel unchanged');
  });

  await t.test('the form still works with JavaScript off', () => {
    const comp = read('js/components.js');
    assert.match(comp, /<form name="newsletter" method="POST" data-netlify="true" data-lane-newsletter/,
      'progressive enhancement — nobody loses the ability to sign up');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   10. THE CRM
   ══════════════════════════════════════════════════════════════════════════ */
test('SUPPORTER DATA IS RESTRICTED AND RESTRAINED', async (t) => {
  const admin = require('../netlify/functions/fan-admin.js');
  const src = strip(read('netlify/functions/fan-admin.js'));

  await t.test('nothing without the portal gate', async () => {
    const out = await admin.handler({ httpMethod: 'GET', queryStringParameters: {} });
    assert.strictEqual(out.statusCode, 401);
    const body = JSON.parse(out.body);
    assert.strictEqual(body.ok, false);
    assert.ok(!body.summary && !body.latest, 'and no data alongside the refusal');
  });

  await t.test('a wrong pin is refused too', async () => {
    const out = await admin.handler({ httpMethod: 'GET', queryStringParameters: { pin: 'nope' } });
    assert.strictEqual(out.statusCode, 401);
  });

  await t.test('never cached, anywhere', () => {
    assert.match(src, /'Cache-Control': 'private, no-store, max-age=0'/);
  });

  await t.test('search is exact, not browsable', () => {
    assert.match(src, /email_normalised\.eq\.|membership_number\.eq\./,
      'exact matching only — a prefix search over supporter names is a ' +
      'browsing tool, and a browsable CRM is one screenshot from a leak');
    assert.doesNotMatch(src, /ilike\.\*|ilike\.%/, 'no wildcard prefix search');
    assert.match(src, /term\.length < 3/, 'and a minimum length');
  });

  await t.test('it shows meaning, not surveillance', () => {
    assert.doesNotMatch(src, /page_view|click|session_duration|engagement_score/,
      'a CRM that grows a click stream stops being something a supporter would ' +
      'be comfortable reading over our shoulder');
    ['programme_opened', 'match_checked_in'].forEach((k) =>
      assert.ok(src.includes(k), 'it should show ' + k));
  });

  await t.test('the aggregate view answers the committee\'s actual question', () => {
    ['activeMembers', 'newThisWeek', 'joinedViaProgramme', 'byFixture',
      'notificationsFailed', 'awaitingIdentityLink'].forEach((k) =>
      assert.ok(src.includes(k), 'summary should report ' + k));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   11. HEALTH THAT CANNOT LIE
   ══════════════════════════════════════════════════════════════════════════ */
test('A CLOSED GATE IS NOT HEALTH', async (t) => {
  const src = strip(read('netlify/functions/fan-health.js'));

  await t.test('it insists somebody could actually complete the journey', () => {
    assert.match(src, /NOBODY is an active member/,
      'the previous release was "working" precisely because it refused everyone — ' +
      'health must refuse to call that healthy');
  });

  await t.test('it catches the missing api key specifically', () => {
    assert.match(src, /No API key/,
      'the fault that silently rejected every token must have its own check');
  });

  await t.test('it checks the served pages, not just the repo', () => {
    assert.match(src, /fan-boot\\?\.js/);
    assert.match(src, /BOOTSTRAPPED_PAGES/);
  });

  await t.test('it is gated', async () => {
    const health = require('../netlify/functions/fan-health.js');
    const out = await health.handler({ headers: {}, queryStringParameters: {} });
    assert.strictEqual(out.statusCode, 401);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   12. CACHING AND EXPOSURE
   ══════════════════════════════════════════════════════════════════════════ */
test('NOTHING PERSONAL LEAKS THROUGH A CACHE', async (t) => {
  await t.test('every member endpoint is private and varies on Authorization', () => {
    ['fan-member.js', 'fan-newsletter.js', 'fan-admin.js', 'fan-health.js', 'fan-intent.js']
      .forEach((f) => {
        const src = read('netlify/functions/' + f);
        assert.match(src, /private, no-store, max-age=0/, f + ' must never be cached');
      });
    ['fan-member.js', 'fan-newsletter.js'].forEach((f) => {
      assert.match(read('netlify/functions/' + f), /Vary: 'Authorization'/,
        f + ' answers differently per supporter, so it must say so');
    });
  });

  await t.test('the programme gate keeps its private headers', () => {
    const src = read('netlify/functions/programme-data.js');
    assert.match(src, /'private, no-store, max-age=0'/);
    assert.match(src, /headers\.Vary = 'Authorization'/);
  });

  await t.test('the intent endpoint gives the same answer whatever happens', () => {
    const src = strip(read('netlify/functions/fan-intent.js'));
    const returns = src.match(/return resp\([^;]*\);/g) || [];
    const informative = returns.filter((r) =>
      /already|exists|member|not found|unknown/i.test(r));
    assert.strictEqual(informative.length, 0,
      'telling a caller "that address is already a member" turns this into a ' +
      'way to test which of the club\'s supporters exist');
  });

  await t.test('an intent is bound to the verified email and used once', () => {
    const lib = strip(read('netlify/functions/lib/fan/members.js'));
    const claim = /async function claimIntent\(verifiedEmail\)[\s\S]*?\n}/.exec(lib)[0];
    assert.match(claim, /email_normalised=eq\./, 'matched against the VERIFIED email');
    assert.match(claim, /consumed_at=is\.null/, 'single use');
    assert.match(claim, /expires_at=gt\./, 'and it expires');
  });

  await t.test('intents and the outbox are closed to everyone but the service key', () => {
    ['fan_signup_intents', 'fan_notification_outbox', 'fan_identity_reviews'].forEach((t2) => {
      assert.ok(SQL.includes('alter table public.' + t2 + ' enable row level security'),
        t2 + ' must have RLS on');
      assert.ok(!new RegExp('create policy[^;]*on public\\.' + t2).test(SQL),
        t2 + ' must have NO policy — RLS on with no policy is a closed door');
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   13. THE PROTECTED SYSTEM IS STILL PROTECTED
   ══════════════════════════════════════════════════════════════════════════ */
test('THE ACCESS MODEL IS UNCHANGED', async (t) => {
  const src = read('netlify/functions/programme-data.js');

  await t.test('the four conditions still all apply', () => {
    const lib = strip(read('netlify/functions/lib/fan/members.js'));
    assert.match(lib, /\/auth\/v1\/user/, 'the token is verified against Supabase');
    assert.match(lib, /auth_user_id=eq\./, 'the member is found by auth user');
    assert.match(lib, /membership_status === 'active'/, 'and must be active');
    assert.match(src, /state=in\.' \+ PUBLIC_STATES/, 'and the edition must be public');
  });

  await t.test('drafts stay 404 for members too', () => {
    // Comments are not code. This file's own prose explains what a draft is,
    // and matching that instead of the source is a mistake this project has
    // now made three times — so strip first, every time.
    const code = strip(src);
    const order = code.indexOf('PUBLIC_STATES');
    const gate = code.indexOf('FAN.context');
    assert.ok(order > -1 && order < gate,
      'the state filter must run BEFORE the membership gate, or membership ' +
      'becomes a way into a draft');
    assert.doesNotMatch(code, /PUBLIC_STATE_LIST\.concat/,
      'nothing may widen the public state list at runtime');
    assert.doesNotMatch(code, /['"]draft['"]/,
      "'draft' must never appear as a value in this endpoint");
  });

  await t.test('the auto-complete path cannot invent entitlement', () => {
    const block = /if \(gate\.user && !gate\.member\)[\s\S]*?\n      \}/.exec(src)[0];
    assert.match(block, /FAN\.canReadProgrammes\(made\)/,
      'entitlement must still be derived from the stored record, not granted ' +
      'because somebody arrived holding a token');
    assert.match(block, /gate\.user &&/, 'and only for a VERIFIED user');
  });

  await t.test('the football system was not touched', () => {
    // The release must not have reached into protected territory.
    const changed = [
      'netlify/functions/lib/football/store.js',
      'netlify/functions/lib/programme/legal.js',
    ];
    changed.forEach((f) => assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' must still exist'));
    assert.match(read('netlify/functions/lib/football/store.js'),
      /SUPABASE_SERVICE_KEY|SUPABASE_SECRET_KEY/,
      'the football store must be unchanged in how it authenticates');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   14. COOKIES ARE STILL A SEPARATE DECISION
   ══════════════════════════════════════════════════════════════════════════ */
test('DECLINING ANALYTICS DOES NOT BREAK BEING RECOGNISED', async (t) => {
  await t.test('the session is not a cookie', () => {
    const boot = strip(read('js/fan-boot.js'));
    assert.match(boot, /persistSession: true/,
      'Supabase persists to localStorage — nothing the cookie banner clears');
    assert.doesNotMatch(boot, /document\.cookie/,
      'Fan Zone must not depend on cookies at all');
  });

  await t.test('consent only ever clears analytics cookies', () => {
    const consent = read('js/consent.js');
    const clear = /function clearAnalyticsCookies\(\)[\s\S]*?\n  }/.exec(consent)[0];
    assert.match(clear, /\^_ga\(\$\|_\)\|\^_gid\$\|\^_gat/,
      'the filter must be analytics cookies and nothing else');
  });

  await t.test('recognition does not run through analytics', () => {
    const account = strip(read('js/fan-account.js'));
    assert.doesNotMatch(account, /gtag|dataLayer|LaneConsent/,
      'who a supporter is must never be routed through a measurement tool');
  });

  await t.test('the member home offers a route back to cookie settings', () => {
    assert.match(read('js/fan-zone-member.js'), /Cookie settings/);
  });
});
