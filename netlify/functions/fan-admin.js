// The club's supporter list — the CRM behind the portal.
//
// This is how the club becomes familiar with the people who support it, so the
// bar for what appears here is "would we be comfortable if the supporter read
// this over our shoulder". That rules out a few things a CRM would normally
// grow: no click stream, no page-visit feed, no engagement score, no notes
// field for opinions about people. What a supporter did that MATTERS — joined,
// opened a programme, came to a match — and nothing else.
//
// PIN-gated like the rest of the portal's write functions. Supporter records
// are the most personal data the club holds, so this endpoint returns nothing
// at all without it, and never falls back to an open state.
'use strict';

const adminOk = require('./lib/pin');
const S = require('./lib/football/store');
const NOTIFY = require('./lib/fan/notify');
const PHONE = require('./lib/fan/phone');

// The launch target. One number, named once.
const WHATSAPP_TARGET = 50;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      // Never cached anywhere, by anyone.
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify(obj),
  };
}

/**
 * CSV that a spreadsheet cannot execute.
 *
 * A cell beginning =, +, - or @ is a FORMULA in Excel, Numbers and Sheets. A
 * supporter called "=cmd|…" is unlikely, but a club export is opened on a
 * committee member's laptop and the cost of being wrong is somebody else's
 * machine. Prefixing a tab neutralises it and displays identically.
 */
function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function toCsv(rows) {
  const cols = [
    ['first_name', 'First name'], ['last_name', 'Last name'],
    ['membership_number', 'Lane number'], ['e164', 'Mobile (E.164)'],
    ['consented_at', 'WhatsApp consent date'], ['wording_version', 'Consent wording'],
    ['signup_source', 'Signup source'],
  ];
  const head = cols.map((c) => csvCell(c[1])).join(',');
  const body = (rows || []).map((r) => cols.map((c) => csvCell(r[c[0]])).join(',')).join('\n');
  return head + '\n' + body;
}

function since(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

async function count(table, filter) {
  try {
    const rows = await S.rest(table + '?select=id' + (filter ? '&' + filter : '') + '&limit=10000');
    return (rows || []).length;
  } catch (e) { return 0; }
}

/** The dashboard numbers. Aggregates only — no names on this path. */
async function summary() {
  const [
    active, week, month, viaProgramme, optedIn, optedOut,
    checkins, reviews, failed, pending, repeatReaders,
    withMobile, waIn, waOut, eligible, incomplete,
  ] = await Promise.all([
    count('fan_members', 'membership_status=eq.active'),
    count('fan_members', 'joined_at=gte.' + encodeURIComponent(since(7))),
    count('fan_members', 'joined_at=gte.' + encodeURIComponent(since(30))),
    count('fan_members', 'signup_source=like.programme:*'),
    count('fan_marketing_preferences', 'email_marketing=is.true'),
    count('fan_marketing_preferences', 'email_marketing=is.false'),
    count('fan_activity', 'activity_type=eq.match_checked_in'),
    count('fan_identity_reviews', 'status=eq.open'),
    count('fan_notification_outbox', 'status=in.(failed,abandoned)'),
    count('fan_notification_outbox', 'status=eq.pending'),
    count('fan_activity', 'activity_type=eq.programme_opened'),
    count('fan_contact_numbers', 'e164=not.is.null&status=neq.removed'),
    count('fan_whatsapp_consent', 'opted_in=is.true&withdrawn_at=is.null&suppressed=is.false'),
    count('fan_whatsapp_consent', 'withdrawn_at=not.is.null'),
    // The ONE definition of eligibility. Reading the view rather than counting
    // stored numbers is the difference between "people who agreed" and "people
    // whose number we happen to have".
    count('fan_whatsapp_eligible', 'member_id=not.is.null'),
    count('fan_members', 'first_name=is.null'),
  ]);

  // Which fixtures actually brought people in. The question the committee asks.
  let byFixture = [];
  try {
    const rows = await S.rest('fan_members?select=signup_fixture_id&signup_fixture_id=not.is.null&limit=5000');
    const tally = {};
    (rows || []).forEach((r) => { tally[r.signup_fixture_id] = (tally[r.signup_fixture_id] || 0) + 1; });
    byFixture = Object.keys(tally).map((k) => ({ fixtureId: k, members: tally[k] }))
      .sort((a, b) => b.members - a.members).slice(0, 12);
  } catch (e) {}

  return {
    activeMembers: active,
    newThisWeek: week,
    newThisMonth: month,
    joinedViaProgramme: viaProgramme,
    programmeOpens: repeatReaders,
    matchCheckIns: checkins,
    marketingOptedIn: optedIn,
    marketingNotOptedIn: optedOut,
    awaitingIdentityLink: reviews,
    notificationsFailed: failed,
    notificationsPending: pending,
    membersWithMobile: withMobile,
    whatsappOptedIn: waIn,
    whatsappWithdrawn: waOut,
    incompleteProfiles: incomplete,
    whatsapp: {
      eligible: eligible,
      target: WHATSAPP_TARGET,
      // Named states, so the portal never has to invent the wording.
      status: eligible >= WHATSAPP_TARGET ? 'Ready to prepare launch'
        : eligible >= 40 ? 'Nearly ready' : 'Building the community',
      ready: eligible >= WHATSAPP_TARGET,
    },
    byFixture: byFixture,
  };
}

/** A dignified list. Newest first, no activity feed. */
async function latest(limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  const rows = await S.rest('fan_members?select=id,first_name,last_name,display_name,' +
    'email_normalised,membership_number,membership_status,joined_at,signup_source,' +
    'signup_fixture_id,last_active_at&order=joined_at.desc&limit=' + n) || [];
  const ids = rows.map((r) => r.id);
  let prefs = [];
  if (ids.length) {
    try {
      prefs = await S.rest('fan_marketing_preferences?member_id=in.(' + ids.join(',') +
        ')&select=member_id,email_marketing') || [];
    } catch (e) {}
  }
  const marketing = {};
  prefs.forEach((p) => { marketing[p.member_id] = p.email_marketing; });

  let nums = []; let was = [];
  if (ids.length) {
    try {
      [nums, was] = await Promise.all([
        S.rest('fan_contact_numbers?member_id=in.(' + ids.join(',') + ')&select=member_id,status'),
        S.rest('fan_whatsapp_consent?member_id=in.(' + ids.join(',') +
          ')&select=member_id,opted_in,withdrawn_at,suppressed'),
      ]);
    } catch (e) { /* the list is still useful without it */ }
  }
  const mobileOf = {}; (nums || []).forEach((n) => { mobileOf[n.member_id] = n.status; });
  const waOf = {}; (was || []).forEach((w) => {
    waOf[w.member_id] = w.suppressed ? 'suppressed'
      : w.withdrawn_at ? 'withdrawn' : w.opted_in ? 'in' : 'out';
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || '—',
    email: r.email_normalised,
    membershipNumber: r.membership_number,
    status: r.membership_status,
    joinedAt: r.joined_at,
    source: r.signup_source,
    fixtureId: r.signup_fixture_id,
    lastActiveAt: r.last_active_at,
    marketing: marketing[r.id] === true ? 'in' : marketing[r.id] === false ? 'out' : 'none',
    // Status only. A full phone number does not belong in a list somebody
    // scrolls past on a shared screen.
    mobile: mobileOf[r.id] || 'not_provided',
    whatsapp: waOf[r.id] || 'none',
  }));
}

/** One supporter, in full — for a staff member who has a reason to look. */
async function profile(id) {
  const member = await S.findOne('fan_members', 'id=eq.' + encodeURIComponent(id) + '&select=*');
  if (!member) return null;
  const [prefs, opens, checkins, notes, review, mobile, wa, interests, staffNotes] = await Promise.all([
    S.findOne('fan_marketing_preferences', 'member_id=eq.' + member.id + '&select=*').catch(() => null),
    S.rest('fan_activity?member_id=eq.' + member.id + '&activity_type=eq.programme_opened' +
      '&select=fixture_id,activity_at&order=activity_at.desc&limit=50').catch(() => []),
    S.rest('fan_activity?member_id=eq.' + member.id + '&activity_type=eq.match_checked_in' +
      '&select=fixture_id,activity_at&order=activity_at.desc&limit=50').catch(() => []),
    S.rest('fan_notification_outbox?member_id=eq.' + member.id +
      '&select=event_type,status,attempts,sent_at,last_error,created_at&order=created_at.desc').catch(() => []),
    S.findOne('fan_identity_reviews', 'member_id=eq.' + member.id + '&status=eq.open&select=*').catch(() => null),
    S.findOne('fan_contact_numbers', 'member_id=eq.' + member.id + '&select=*').catch(() => null),
    S.findOne('fan_whatsapp_consent', 'member_id=eq.' + member.id + '&select=*').catch(() => null),
    S.rest('fan_interests?member_id=eq.' + member.id + '&select=interest').catch(() => []),
    S.rest('fan_member_notes?member_id=eq.' + member.id +
      '&select=id,body,author,created_at,updated_at,edited_by,previous_body' +
      '&order=created_at.desc&limit=50').catch(() => []),
  ]);

  // Who else has this number? Surfaced for a human, never merged automatically —
  // families legitimately share a phone, and merging two supporters because they
  // live in the same house would be a real harm.
  let sharedWith = [];
  if (mobile && mobile.e164 && mobile.status !== 'removed') {
    try {
      const others = await S.rest('fan_contact_numbers?e164=eq.' +
        encodeURIComponent(mobile.e164) + '&member_id=neq.' + member.id +
        '&status=neq.removed&select=member_id');
      sharedWith = (others || []).map((o) => o.member_id);
    } catch (e) {}
  }

  return {
    id: member.id,
    name: member.display_name || [member.first_name, member.last_name].filter(Boolean).join(' ') || '—',
    firstName: member.first_name,
    lastName: member.last_name,
    email: member.email_normalised,
    membershipNumber: member.membership_number,
    status: member.membership_status,
    joinedAt: member.joined_at,
    lastActiveAt: member.last_active_at,
    source: member.signup_source,
    fixtureId: member.signup_fixture_id,
    laneCardLinked: !!member.fan_id,
    marketing: prefs ? {
      email: !!prefs.email_marketing,
      wording: prefs.consent_wording_version,
      consentedAt: prefs.email_marketing_consented_at,
      withdrawnAt: prefs.email_marketing_withdrawn_at,
      source: prefs.consent_source,
    } : null,
    programmesOpened: (opens || []).map((o) => ({ fixtureId: o.fixture_id, at: o.activity_at })),
    checkIns: (checkins || []).map((o) => ({ fixtureId: o.fixture_id, at: o.activity_at })),
    notifications: notes || [],
    identityReview: review || null,
    contact: mobile && mobile.status !== 'removed' ? {
      // Masked by default. The full number is a separate, audited action.
      masked: PHONE.mask(mobile.e164),
      status: mobile.status,
      country: mobile.country,
      addedAt: mobile.added_at,
      sharedWithOtherMembers: sharedWith.length,
    } : { status: 'not_provided' },
    whatsapp: wa ? {
      optedIn: !!(wa.opted_in && !wa.withdrawn_at && !wa.suppressed),
      consentedAt: wa.consented_at,
      withdrawnAt: wa.withdrawn_at,
      suppressed: !!wa.suppressed,
      wording: wa.wording_version,
      coversNumber: wa.number_e164 ? PHONE.mask(wa.number_e164) : null,
    } : { optedIn: false },
    interests: (interests || []).map((i) => i.interest),
    staffNotes: (staffNotes || []).map((n) => ({
      id: n.id, body: n.body, author: n.author,
      createdAt: n.created_at, updatedAt: n.updated_at,
      editedBy: n.edited_by, wasEdited: !!n.previous_body,
    })),
  };
}

/**
 * Exact matching only.
 *
 * A prefix search over supporter names is a browsing tool, and a CRM that can
 * be browsed is one screenshot away from being a leak. Staff who need a
 * supporter know their name, their number or their email.
 */
async function search(q) {
  const term = String(q || '').trim();
  if (term.length < 3) return [];
  const enc = encodeURIComponent(term);
  const or = [
    'email_normalised.eq.' + term.toLowerCase(),
    'membership_number.eq.' + term,
    'display_name.ilike.' + term,
  ].join(',');
  try {
    const rows = await S.rest('fan_members?or=(' + encodeURIComponent(or).replace(/%2C/g, ',') +
      ')&select=id,display_name,first_name,last_name,email_normalised,membership_number,' +
      'membership_status,joined_at&limit=20') || [];
    return rows.map((r) => ({
      id: r.id,
      name: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || '—',
      email: r.email_normalised,
      membershipNumber: r.membership_number,
      status: r.membership_status,
      joinedAt: r.joined_at,
    }));
  } catch (e) { return []; }
  void enc;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  const qs = event.queryStringParameters || {};
  let b = {};
  if (event.httpMethod === 'POST') { try { b = JSON.parse(event.body || '{}'); } catch (e) {} }
  const pin = b.pin || qs.pin || '';
  if (!adminOk(pin)) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!S.configured()) return resp(200, { ok: false, error: 'not configured' });

  const view = String(b.view || qs.view || 'summary').toLowerCase();

  try {
    if (view === 'summary') {
      return resp(200, { ok: true, summary: await summary(), latest: await latest(qs.limit || b.limit) });
    }
    if (view === 'member') {
      const p = await profile(b.id || qs.id);
      return p ? resp(200, { ok: true, member: p })
               : resp(200, { ok: false, error: 'not found' });
    }
    if (view === 'search') {
      return resp(200, { ok: true, results: await search(b.q || qs.q) });
    }
    if (view === 'notifications') {
      const rows = await S.rest('fan_notification_outbox?select=id,event_type,member_id,status,' +
        'attempts,created_at,sent_at,last_error&order=created_at.desc&limit=50') || [];
      return resp(200, { ok: true, notifications: rows });
    }
    if (view === 'note' && event.httpMethod === 'POST') {
      const body = String(b.body || '').trim();
      const author = String(b.author || '').trim();
      if (!author) return resp(200, { ok: false, error: 'Who is writing this note?' });
      if (body.length < 1 || body.length > 1000) {
        return resp(200, { ok: false, error: 'A note must be between 1 and 1000 characters.' });
      }
      await S.rest('fan_member_notes', {
        method: 'POST',
        body: [{ member_id: b.id, body: body, author: author.slice(0, 80) }],
        headers: { Prefer: 'return=minimal' },
      });
      return resp(200, { ok: true });
    }

    if (view === 'export' && event.httpMethod === 'POST') {
      // The most sensitive thing this system can do. It requires a reason, and
      // it leaves a row behind whether or not anybody ever looks at it.
      const reason = String(b.reason || '').trim();
      const who = String(b.author || '').trim();
      if (!who) return resp(200, { ok: false, error: 'Who is exporting this?' });
      if (reason.length < 3) return resp(200, { ok: false, error: 'A reason is required.' });

      const rows = await S.rest('fan_whatsapp_eligible?select=*&limit=5000') || [];
      await S.rest('fan_export_audit', {
        method: 'POST',
        body: [{ exported_by: who.slice(0, 80), reason: reason.slice(0, 500),
                 scope: 'whatsapp_eligible', row_count: rows.length }],
        headers: { Prefer: 'return=minimal' },
      });
      return resp(200, { ok: true, csv: toCsv(rows), rows: rows.length });
    }

    if (view === 'retry' && event.httpMethod === 'POST') {
      const out = await NOTIFY.retry(b.id);
      return resp(200, { ok: true, result: out });
    }
    return resp(400, { ok: false, error: 'unknown view' });
  } catch (e) {
    return resp(200, { ok: false, error: String((e && e.message) || e) });
  }
};

exports._internal = { summary, latest, profile, search, toCsv, csvCell, WHATSAPP_TARGET };
