// FAN ZONE ACCESS, CONSENT AND CRM.
//
// The programme is free. It is also the reason to join, so the complete
// edition goes only to a signed-in member — and that has to be decided by the
// server, every time, because a client-side boolean is not access control.
//
// The cookie banner is the other half of this release. Before it, Google
// Analytics loaded at parse time on every page and Decline set a flag and
// removed the banner. A supporter who declined was measured exactly as much as
// one who accepted. That is worse than having no button: it recorded a choice
// and honoured nothing.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const { loadBrowserScript } = require('./helpers/browser');

/* ── the gate is on the server ────────────────────────────────────────────── */

test('THE COMPLETE PROGRAMME IS NEVER SENT TO A LOGGED-OUT VISITOR', () => {
  const s = strip(R('netlify/functions/programme-data.js'));
  // The gate must be evaluated BEFORE the payload is assembled, so there is
  // nothing in the response to find.
  const gateAt = s.indexOf('FAN.context(event)');
  const payloadAt = s.indexOf('programme: v.payload');
  assert.ok(gateAt > 0, 'the endpoint does not check membership at all');
  assert.ok(gateAt < payloadAt, 'the payload is built before the gate is checked');
  assert.match(s, /if \(!gate\.entitled\)/);
  // The locked branch returns cover and score only.
  const locked = s.slice(s.indexOf('locked: true'), s.indexOf('FAN.record'));
  assert.ok(!/programme: v\.payload/.test(locked), 'the locked response carries the payload');
  assert.ok(!/lineups: v\.lineup_snapshot/.test(locked), 'the locked response carries the line-ups');
  assert.ok(!/sponsor_snapshot|staff_snapshot|table_snapshot/.test(locked),
    'the locked response carries sponsor, staff or table sections');
});

test('A MEMBER RESPONSE IS NEVER CACHED BY A CDN', () => {
  // `public, max-age` on a response that varies by Authorization is how one
  // supporter's entitled copy gets served to the next logged-out visitor.
  const s = strip(R('netlify/functions/programme-data.js'));
  assert.match(s, /private, no-store, max-age=0/);
  assert.match(s, /headers\.Vary = 'Authorization'/);
  // Both the locked and the entitled responses must be personal.
  const personal = (s.match(/\}, 0, true\)/g) || []).length;
  assert.ok(personal >= 2, 'expected both member-dependent responses to be personal');
});

test('the token is verified against Supabase, not merely decoded', () => {
  const s = strip(R('netlify/functions/lib/fan/members.js'));
  assert.match(s, /\/auth\/v1\/user/, 'a token must be checked with the issuer');
  assert.match(s, /Authorization: 'Bearer ' \+ token/);
  // No local JWT decode standing in for verification.
  assert.ok(!/atob\(|jwt\.decode|split\('\.'\)\[1\]/.test(s),
    'a decoded token is not a verified token');
});

test('only an ACTIVE membership can read programmes', () => {
  const M = require('../netlify/functions/lib/fan/members');
  assert.strictEqual(M.canReadProgrammes({ membership_status: 'active' }), true);
  ['pending_verification', 'suspended', 'deleted'].forEach((st) => {
    assert.strictEqual(M.canReadProgrammes({ membership_status: st }), false, st + ' should be refused');
  });
  assert.strictEqual(M.canReadProgrammes(null), false);
});

test('drafts stay hidden even from members', () => {
  const s = strip(R('netlify/functions/programme-data.js'));
  // The public-state filter runs on the edition lookup, before any membership
  // question. Membership unlocks published editions, not unpublished ones.
  const lookup = s.slice(s.indexOf('const rows = await S.rest'), s.indexOf('FAN.context'));
  assert.match(lookup, /state=in\.' \+ PUBLIC_STATES/);
  const list = s.match(/const PUBLIC_STATE_LIST = \[([\s\S]*?)\]/)[1];
  ['draft_hidden', 'withheld', 'retrospective_candidate', 'waiting_for_matchday']
    .forEach((st) => assert.ok(!list.includes(st), 'membership would expose ' + st));
});

/* ── one supporter, one record ────────────────────────────────────────────── */

test('EMAIL IS NORMALISED, SO ONE PERSON IS ONE MEMBER', () => {
  const M = require('../netlify/functions/lib/fan/members');
  const forms = [' A@B.com ', 'a@b.COM', 'A@b.com', 'a@b.com'];
  const keys = new Set(forms.map(M.normalise));
  assert.strictEqual(keys.size, 1, 'these are one supporter: ' + [...keys].join(', '));
  assert.strictEqual(M.normalise(' A@B.com '), 'a@b.com');
});

test('an existing email is claimed, never duplicated', () => {
  const s = strip(R('netlify/functions/lib/fan/members.js'));
  // Reconciliation before creation.
  const ensure = s.slice(s.indexOf('async function ensure'), s.indexOf('function membershipNumber'));
  assert.match(ensure, /byEmail\(email\)/, 'it must look for an existing record by email');
  assert.ok(ensure.indexOf('byEmail(email)') < ensure.indexOf("S.rest('fan_members'"),
    'it must look before it creates');
  assert.match(ensure, /auth_user_id: authUser\.id/, 'the existing record is claimed');
  // And a newsletter contact becomes the same supporter.
  assert.match(ensure, /converted_member_id/);
});

test('a returning member keeps their Lane Card number', () => {
  const s = strip(R('netlify/functions/lib/fan/members.js'));
  assert.match(s, /fans'.*lane_no|lane_no/, 'the existing Lane Card number must carry across');
  assert.match(s, /membership_number: laneNo \|\| membershipNumber\(\)/);
});

test('the database refuses a duplicate on either key', () => {
  const sql = R('supabase/migrations/20260803210000_fan_membership.sql');
  assert.match(sql, /unique \(auth_user_id\)/);
  assert.match(sql, /unique \(email_normalised\)/);
});

/* ── marketing is a separate decision ─────────────────────────────────────── */

test('MARKETING IS NEVER A SIDE EFFECT OF JOINING', () => {
  const s = strip(R('netlify/functions/fan-member.js'));
  // Only set when the form actually carried a boolean — never inferred.
  assert.match(s, /typeof body\.marketing === 'boolean'/,
    'consent must be explicit, not assumed from having joined');
  const sql = R('supabase/migrations/20260803210000_fan_membership.sql');
  assert.match(sql, /email_marketing\s+bool not null default false/,
    'the default must be off');
});

test('the exact wording consented to is stored', () => {
  const sql = R('supabase/migrations/20260803210000_fan_membership.sql');
  assert.match(sql, /consent_wording_version/);
  assert.match(sql, /email_marketing_consented_at/);
  assert.match(sql, /email_marketing_withdrawn_at/,
    'withdrawal must be recorded, not just the flag flipped');
});

test('declining marketing does not affect programme access', () => {
  const M = require('../netlify/functions/lib/fan/members');
  // Entitlement depends on membership status alone.
  assert.strictEqual(M.canReadProgrammes({ membership_status: 'active', marketing: false }), true);
  const s = strip(R('netlify/functions/lib/fan/members.js'));
  const fn = s.slice(s.indexOf('function canReadProgrammes'), s.indexOf('async function record'));
  assert.ok(!/marketing/i.test(fn), 'entitlement must not consider marketing at all');
});

/* ── activity is a service, not surveillance ──────────────────────────────── */

test('only meaningful supporter actions are recorded', () => {
  const sql = R('supabase/migrations/20260803210000_fan_membership.sql');
  const types = sql.match(/activity_type in \(([\s\S]*?)\)\)/)[1];
  ['account_created', 'programme_opened', 'match_checked_in'].forEach((t) => {
    assert.ok(types.includes(t), 'missing activity type ' + t);
  });
  // Nothing resembling a click log.
  ['page_view', 'click', 'scroll', 'mouse', 'session_ping']
    .forEach((t) => assert.ok(!types.includes(t), 'surveillance-style event: ' + t));
});

test('reading a programme four times is one event, not four', () => {
  const sql = R('supabase/migrations/20260803210000_fan_membership.sql');
  assert.match(sql, /create unique index if not exists fan_activity_programme_daily_idx/);
  assert.match(sql, /\(member_id, programme_id, \(\(activity_at at time zone 'UTC'\)::date\)\)/);
  assert.match(sql, /where activity_type = 'programme_opened'/);
});

test('a supporter can read their own record and nobody else can', () => {
  const sql = R('supabase/migrations/20260803210000_fan_membership.sql');
  ['fan_members', 'fan_marketing_preferences', 'fan_activity', 'fan_newsletter_contacts']
    .forEach((t) => {
      assert.ok(new RegExp('alter table public\\.' + t + ' enable row level security').test(sql),
        t + ' has no row level security');
    });
  // Self-access only — no using(true) anywhere.
  const policies = sql.split('create policy').slice(1);
  policies.forEach((p) => {
    assert.ok(!/using \(true\)/.test(p.slice(0, p.indexOf(';'))),
      'a supporter list readable with the anon key is the membership handed to anyone');
  });
  // The newsletter table has no read policy at all.
  assert.ok(!/create policy[^;]*fan_newsletter_contacts[^;]*for select/.test(sql));
});

/* ── attribution ──────────────────────────────────────────────────────────── */

test('how a supporter joined is recorded', () => {
  const sql = R('supabase/migrations/20260803210000_fan_membership.sql');
  ['signup_source', 'signup_fixture_id', 'signup_programme_id'].forEach((c) => {
    assert.ok(sql.includes(c), 'missing attribution column ' + c);
  });
  const s = strip(R('netlify/functions/fan-member.js'));
  assert.match(s, /source: \(body\.source/);
  assert.match(s, /fixtureId: \(body\.fixtureId/);
});

/* ── return URLs ──────────────────────────────────────────────────────────── */

test('A MAGIC LINK CAN NEVER RETURN TO ANOTHER SITE', () => {
  // An open redirect in a login return is a phishing tool wearing the club's
  // badge: the supporter checks the domain in the email, not after the hop.
  const { safeReturn } = require('../netlify/functions/fan-member')._internal;
  ['https://evil.example/x', '//evil.example', 'http://evil.example',
   'javascript:alert(1)', '\\\\evil.example', 'evil.example/x',
   '/programme.html\nSet-Cookie: x=1', ''].forEach((bad) => {
    assert.strictEqual(safeReturn(bad), null, 'accepted an unsafe return: ' + JSON.stringify(bad));
  });
  assert.strictEqual(safeReturn('/programme.html?id=fwp-578225'), '/programme.html?id=fwp-578225');
  assert.strictEqual(safeReturn('/fan-zone.html'), '/fan-zone.html');
});

test('the browser applies the same rule before it stores one', () => {
  const win = loadBrowserScript('js/fan-session.js');
  const F = win.LaneFan;
  ['https://evil.example', '//evil.example', 'javascript:alert(1)', 'evil.example', '']
    .forEach((bad) => assert.strictEqual(F.safePath(bad), false, 'accepted ' + bad));
  assert.strictEqual(F.safePath('/programme.html?id=x'), true);
});

/* ── cookies ──────────────────────────────────────────────────────────────── */

test('NOTHING LOADS GOOGLE ANALYTICS AT PARSE TIME ANY MORE', () => {
  const comp = R('js/components.js');
  // The old unconditional block is gone.
  assert.ok(!/googletagmanager\.com\/gtag\/js/.test(strip(comp)),
    'components.js still loads gtag unconditionally');
  // And no page embeds it directly either.
  fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).forEach((f) => {
    const s = strip(R(f));
    assert.ok(!/googletagmanager\.com\/gtag\/js/.test(s), f + ' loads analytics directly');
  });
});

test('consent defaults to DENIED before anything Google could run', () => {
  const s = R('js/consent.js');
  assert.match(s, /'consent', 'default'/);
  assert.match(s, /analytics_storage: 'denied'/);
  assert.match(s, /ad_storage: 'denied'/);
  // The default must be set at module scope, not inside a click handler.
  const defaultAt = s.indexOf("'consent', 'default'");
  const setAt = s.indexOf('function set(');
  assert.ok(defaultAt < setAt, 'the default is set too late to matter');
});

test('analytics loads ONLY after an explicit yes, and only once', () => {
  const s = strip(R('js/consent.js'));
  const load = s.slice(s.indexOf('function loadAnalytics'), s.indexOf('function clearAnalyticsCookies'));
  assert.match(load, /if \(loaded \|\| !analyticsAllowed\(\)\) return/,
    'it must refuse to load twice, and refuse without consent');
  assert.match(load, /googletagmanager\.com\/gtag\/js/);
});

test('declining stops analytics and clears what it can', () => {
  const s = strip(R('js/consent.js'));
  assert.match(s, /analytics_storage: allowAnalytics \? 'granted' : 'denied'/);
  assert.match(s, /else if \(was\) clearAnalyticsCookies\(\)/,
    'withdrawal must tidy up, not just stop');
  assert.match(s, /\^_ga\(\$\|_\)\|\^_gid\$\|\^_gat/, 'it must target the GA cookies by name');
});

test('the banner buttons make the real decision', () => {
  const s = R('js/components.js');
  assert.match(s, /function acceptCookies\(\)[\s\S]{0,200}LaneConsent\.set\(true/);
  assert.match(s, /function declineCookies\(\)[\s\S]{0,200}LaneConsent\.set\(false/);
});

test('a supporter can change their mind later', () => {
  const s = R('js/components.js');
  assert.match(s, /function openCookieSettings/);
  assert.match(s, /window\.openCookieSettings = openCookieSettings/);
  // And it is reachable from the footer on every page.
  assert.match(s, /onclick="openCookieSettings\(\)"/);
});

test('consent.js loads before components.js on every page', () => {
  fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).forEach((f) => {
    const s = R(f);
    // The TAG, not a comment mentioning the file — fan-zone-guide.html talks
    // about components.js in prose without loading it.
    const compTag = s.indexOf('<script src="js/components.js');
    if (compTag === -1) return;
    const c = s.indexOf('<script src="js/consent.js');
    assert.ok(c > -1, f + ' does not load consent.js');
    assert.ok(c < compTag, f + ' loads components before consent');
  });
});

test('declining does not break Fan Zone or programmes', () => {
  // Nothing in the membership or programme path consults analytics consent.
  ['netlify/functions/fan-member.js', 'netlify/functions/lib/fan/members.js',
   'netlify/functions/programme-data.js', 'js/fan-session.js'].forEach((f) => {
    const s = strip(R(f));
    assert.ok(!/LaneConsent|analytics_storage|gtag/.test(s),
      f + ' ties a service to analytics consent');
  });
});

/* ── the club's identity ──────────────────────────────────────────────────── */

test('ONE LEGAL IDENTITY ACROSS THE WHOLE SITE', () => {
  // The site previously said the club was a members section of Tithe Farm
  // Sports & Social Club Limited. That is not the operating entity.
  const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))
    .concat(['js/components.js']);
  files.forEach((f) => {
    assert.ok(!/fully integrated members.{0,10}section/i.test(R(f)),
      f + ' still carries the old legal claim');
  });
  // And the confirmed identity is present where it matters.
  assert.match(R('js/components.js'), /Rayners Lane Football Club Limited/);
  assert.match(R('js/components.js'), /17110511/);
});

test('the programme footer states the confirmed identity', () => {
  const L = require('../netlify/functions/lib/programme/legal');
  const f = L.build({});
  const text = f.lines.join(' | ');
  assert.match(text, /Rayners Lane Football Club/);
  assert.match(text, /Rayners Lane Football Club Limited/);
  assert.match(text, /17110511/);
  assert.strictEqual(f.compliance.complete, true, 'Rule 2.15 should now be satisfied');
  assert.deepStrictEqual(f.compliance.missing, []);
});

test('NO CLAIM THAT PROGRAMME APPROVAL IS OUTSTANDING', () => {
  // The club has confirmed no separate electronic-only approval is needed.
  const L = require('../netlify/functions/lib/programme/legal');
  const s = R('netlify/functions/lib/programme/legal.js');
  assert.ok(!/approval is outstanding|awaiting Board approval|cannot proceed without/i.test(s));
  assert.strictEqual(L.build({}).compliance.complete, true);
  // And nothing blocks publication on it.
  const rules = strip(R('netlify/functions/lib/programme/publish-rules.js'));
  // "Needs your approval to publish" is the RETROSPECTIVE control and is
  // correct — a human authorising an edition for a match already played. What
  // must not exist is a gate on Competition Board approval.
  assert.ok(!/board_approval|electronic_approval|boardApproved|awaiting_approval/i.test(rules),
    'publication must not gate on an approval the club does not need');
  assert.ok(!/Board approval/i.test(rules));
});

test('the site does not promise a printed programme it does not print', () => {
  const shop = R('shop.html');
  assert.ok(!/Available at every home game/.test(shop));
  assert.ok(!/Available at Tithe Farm on match day/.test(shop));
  assert.match(shop, /Free for Fan Zone members/);
  // And the gate price no longer says a programme is included.
  assert.ok(!/Programme included/.test(R('about.html')));
});

/* ── the library stays public ─────────────────────────────────────────────── */

test('THE LIBRARY REMAINS PUBLIC — IT IS THE FRONT DOOR', () => {
  const s = strip(R('js/programme-library.js'));
  // No auth requirement on the listing itself.
  assert.match(s, /fetch\('\/\.netlify\/functions\/programme-data'\)/);
  assert.ok(!/authedFetch\('\/\.netlify\/functions\/programme-data'\)/.test(s),
    'the listing must not require a token');
  // The CTA changes, the shelf does not.
  assert.match(s, /Unlock free in Fan Zone/);
  assert.match(s, /function isMember/);
});

test('the wording is invitation, never commerce', () => {
  ['js/programme-library.js', 'js/programme-reader.js', 'js/match-centre.js'].forEach((f) => {
    const s = strip(R(f));
    [/\bBuy\b/, /\bSubscribe\b/, /\bPaywall\b/, /\bCheckout\b/, /\bPurchase\b/, /premium subscription/i]
      .forEach((bad) => assert.ok(!bad.test(s), f + ' uses commerce language: ' + bad));
  });
  assert.match(R('js/programme-reader.js'), /The programme is free/);
});
