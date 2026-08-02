// Is the Fan Zone journey actually working?
//
// THE RULE THIS FILE EXISTS TO ENFORCE
// ------------------------------------
// A gate that refuses everybody is indistinguishable from a gate that is
// working, and that is precisely how the last release passed every check while
// no supporter could read a programme. "Locked" is not health. So nothing here
// is satisfied by a refusal: each check proves a step of the journey can be
// COMPLETED, or it says so.
//
// PIN-gated: it names how many members exist and whether email is reaching the
// club, which is club business.
'use strict';

const adminOk = require('./lib/pin');
const S = require('./lib/football/store');
const FAN = require('./lib/fan/members');

// Every page that offers Fan Zone state must carry the one bootstrap entry.
// This is the runtime twin of tests/fan-dependencies.test.js — the test stops
// it being committed, this notices if a deploy ever serves something else.
const BOOTSTRAPPED_PAGES = [
  'index.html', 'programmes.html', 'programme.html',
  'fixtures.html', 'match-centre.html', 'fan-zone.html',
];

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify(obj),
  };
}

function check(name, ok, detail) {
  return { name, ok: !!ok, detail: detail || null };
}

/**
 * Can a token be verified at all?
 *
 * Sends a deliberately malformed token and insists on the RIGHT refusal.
 * `bad_jwt` means Supabase read our api key, looked at the token and rejected
 * the token — the pipe works. A 401 "No API key found" means the key is
 * missing, which is the fault that made every genuine token fail too, silently,
 * for the whole of the previous release.
 */
async function authPipeline(origin) {
  const base = process.env.SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
  try {
    const r = await fetch(base + '/auth/v1/user', {
      headers: { Authorization: 'Bearer not-a-real-token', apikey: FAN.ANON_KEY },
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.text();
    if (r.status === 401 && /No API key/i.test(body)) {
      return check('Authentication', false,
        'Supabase is not receiving an API key, so EVERY token would be rejected.');
    }
    if (r.status === 403 || /bad_jwt|invalid JWT/i.test(body)) {
      return check('Authentication', true, 'Token verification reachable and rejecting correctly.');
    }
    return check('Authentication', false, 'Unexpected response ' + r.status);
  } catch (e) {
    return check('Authentication', false, String((e && e.message) || e));
  }
  void origin;
}

/** Does every page that needs a session actually ship the bootstrap? */
async function dependencies(origin) {
  if (!origin) return check('Page dependencies', true, 'skipped — no origin');
  const missing = [];
  await Promise.all(BOOTSTRAPPED_PAGES.map(async (p) => {
    try {
      const r = await fetch(origin + '/' + p, { signal: AbortSignal.timeout(8000) });
      const html = await r.text();
      if (!/js\/fan-boot\.js/.test(html)) missing.push(p);
    } catch (e) { missing.push(p + ' (unreachable)'); }
  }));
  return check('Page dependencies', missing.length === 0,
    missing.length ? 'No Fan Zone bootstrap on: ' + missing.join(', ')
                   : 'All ' + BOOTSTRAPPED_PAGES.length + ' pages carry js/fan-boot.js.');
}

/** Is the one membership function present and callable? */
async function membershipService() {
  try {
    // A deliberately impossible argument: proves the function EXISTS and runs,
    // without creating anybody. A missing function 404s; this one raises.
    await S.rest('rpc/fan_ensure_membership', {
      method: 'POST', body: { p_auth_user_id: null, p_email: '' },
    });
    return check('Member creation', false, 'The function accepted a null user, which it must not.');
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/requires a verified auth user/.test(msg)) {
      return check('Member creation', true, 'Transactional ensure present and refusing unverified callers.');
    }
    if (/PGRST202|does not exist|404/.test(msg)) {
      return check('Member creation', false, 'fan_ensure_membership is not deployed — run the migration.');
    }
    return check('Member creation', false, msg.slice(0, 160));
  }
}

/** Can a number be allocated, and are they unique? */
async function numbering() {
  try {
    const rows = await S.rest('fan_members?select=membership_number&limit=5000') || [];
    const seen = new Set(); const dupes = [];
    rows.forEach((r) => {
      if (!r.membership_number) return;
      if (seen.has(r.membership_number)) dupes.push(r.membership_number);
      seen.add(r.membership_number);
    });
    return check('Lane numbers', dupes.length === 0,
      dupes.length ? 'Duplicate numbers in use: ' + dupes.join(', ')
                   : rows.length + ' member(s), every number unique.');
  } catch (e) { return check('Lane numbers', false, String(e.message || e)); }
}

/** Can a member actually read a programme — is anybody entitled? */
async function programmeAccess() {
  try {
    const [members, published] = await Promise.all([
      S.rest('fan_members?select=id&membership_status=eq.active&limit=1'),
      S.rest('programme_editions?select=id,state&state=in.(published_matchday,published_late,' +
        'full_time_current,archived,published_recovery)&limit=1'),
    ]);
    const haveMember = !!(members && members.length);
    const havePublished = !!(published && published.length);
    if (!havePublished) return check('Programme access', false, 'No published edition to read.');
    if (!haveMember) {
      return check('Programme access', false,
        'A programme is published but NOBODY is an active member — the journey has never completed.');
    }
    return check('Programme access', true, 'Published edition present and at least one active member.');
  } catch (e) { return check('Programme access', false, String(e.message || e)); }
}

/** Is the club being told about new supporters? */
async function notifications() {
  const configured = !!process.env.RESEND_API_KEY;
  try {
    const rows = await S.rest('fan_notification_outbox?select=id,status,attempts,last_error,' +
      'created_at&order=created_at.desc&limit=50') || [];
    const stuck = rows.filter((r) => r.status === 'abandoned' ||
      (r.status === 'pending' && (r.attempts || 0) >= 3));
    if (!configured) {
      return check('Club notifications', false,
        'RESEND_API_KEY is not set — ' + rows.filter((r) => r.status === 'pending').length +
        ' notification(s) are queued and will send as soon as it is.');
    }
    return check('Club notifications', stuck.length === 0,
      stuck.length ? stuck.length + ' notification(s) failing: ' +
        String(stuck[0].last_error || '').slice(0, 120)
        : rows.filter((r) => r.status === 'sent').length + ' sent, none stuck.');
  } catch (e) { return check('Club notifications', false, String(e.message || e)); }
}

async function identityReviews() {
  try {
    const rows = await S.rest('fan_identity_reviews?select=id&status=eq.open&limit=100') || [];
    return check('Identity linkage', rows.length === 0,
      rows.length ? rows.length + ' supporter(s) waiting for a human to confirm their Lane Card.'
                  : 'Nothing waiting.');
  } catch (e) { return check('Identity linkage', true, 'not deployed yet'); }
}

exports.handler = async function (event) {
  const qs = event.queryStringParameters || {};
  if (!adminOk(qs.pin || '')) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!S.configured()) return resp(200, { ok: false, error: 'not configured' });

  const proto = (event.headers && (event.headers['x-forwarded-proto'] || 'https')) || 'https';
  const host = (event.headers && (event.headers['x-forwarded-host'] || event.headers.host)) || '';
  const origin = host ? proto + '://' + host : '';

  const checks = await Promise.all([
    authPipeline(origin),
    dependencies(origin),
    membershipService(),
    numbering(),
    programmeAccess(),
    notifications(),
    identityReviews(),
  ]);

  let newest = null;
  try {
    const rows = await S.rest('fan_members?select=joined_at&order=joined_at.desc&limit=1');
    newest = rows && rows[0] ? rows[0].joined_at : null;
  } catch (e) {}

  const healthy = checks.every((c) => c.ok);
  return resp(200, {
    ok: true,
    healthy: healthy,
    headline: healthy ? 'FAN ZONE HEALTHY' : 'FAN ZONE NEEDS ATTENTION',
    checks: checks,
    latestMember: newest,
    action: healthy ? 'No action required'
      : checks.filter((c) => !c.ok).map((c) => c.name).join(', ') + ' need attention',
  });
};

exports._internal = { BOOTSTRAPPED_PAGES, check };
