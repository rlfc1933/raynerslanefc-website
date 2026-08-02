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
  }));
}

/** One supporter, in full — for a staff member who has a reason to look. */
async function profile(id) {
  const member = await S.findOne('fan_members', 'id=eq.' + encodeURIComponent(id) + '&select=*');
  if (!member) return null;
  const [prefs, opens, checkins, notes, review] = await Promise.all([
    S.findOne('fan_marketing_preferences', 'member_id=eq.' + member.id + '&select=*').catch(() => null),
    S.rest('fan_activity?member_id=eq.' + member.id + '&activity_type=eq.programme_opened' +
      '&select=fixture_id,activity_at&order=activity_at.desc&limit=50').catch(() => []),
    S.rest('fan_activity?member_id=eq.' + member.id + '&activity_type=eq.match_checked_in' +
      '&select=fixture_id,activity_at&order=activity_at.desc&limit=50').catch(() => []),
    S.rest('fan_notification_outbox?member_id=eq.' + member.id +
      '&select=event_type,status,attempts,sent_at,last_error,created_at&order=created_at.desc').catch(() => []),
    S.findOne('fan_identity_reviews', 'member_id=eq.' + member.id + '&status=eq.open&select=*').catch(() => null),
  ]);

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
    if (view === 'retry' && event.httpMethod === 'POST') {
      const out = await NOTIFY.retry(b.id);
      return resp(200, { ok: true, result: out });
    }
    return resp(400, { ok: false, error: 'unknown view' });
  } catch (e) {
    return resp(200, { ok: false, error: String((e && e.message) || e) });
  }
};

exports._internal = { summary, latest, profile, search };
