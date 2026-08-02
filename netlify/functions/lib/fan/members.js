// Fan Zone membership — one supporter, one record.
//
// The deduplication rule is the whole point of this file. Before it, a
// supporter could exist three times over: a `fans` profile, a HubSpot lead
// fired at signup, and a footer newsletter entry. Nothing joined them, so the
// same person joining twice became two people and their loyalty history split.
//
// Everything here keys on the NORMALISED email. "A@B.com", "a@b.com " and
// "a@b.com" are one supporter, and treating them as three is how a CRM quietly
// stops being able to answer "how many members do we have".
'use strict';

const S = require('../football/store');

const TERMS_VERSION = 'fanzone-terms-2026-08';
const PRIVACY_VERSION = 'privacy-2026-08';
const MARKETING_WORDING = 'marketing-2026-08';

/** The one true form of an email address for matching purposes. */
function normalise(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Verify a Supabase access token and return the auth user.
 *
 * Server-side, against Supabase, every time. A token is not trusted because it
 * looks like a token — the whole point of gating the programme is that the
 * check cannot be a client-side boolean.
 */
async function userFromToken(token) {
  if (!token) return null;
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    || 'https://rewkixywfgsyqinfbggv.supabase.co';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const r = await fetch(base + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + token, apikey: anon || '' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) { return null; }
}

/** The bearer token from a request, if there is one. */
function tokenFrom(event) {
  const h = (event && event.headers) || {};
  const auth = h.authorization || h.Authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** The member record for an auth user, or null. */
async function byAuthUser(authUserId) {
  if (!authUserId) return null;
  return await S.findOne('fan_members', 'auth_user_id=eq.' + encodeURIComponent(authUserId) + '&select=*');
}

async function byEmail(email) {
  const e = normalise(email);
  if (!e) return null;
  return await S.findOne('fan_members', 'email_normalised=eq.' + encodeURIComponent(e) + '&select=*');
}

/**
 * Find or create the member for a verified auth user.
 *
 * RECONCILIATION, not creation: if a record already exists for this email —
 * because they joined through the footer, or signed up before, or their auth
 * user was recreated — it is claimed rather than duplicated, and their joined
 * date, membership number and history come with it.
 */
async function ensure(authUser, opts) {
  const o = opts || {};
  const email = normalise(authUser.email);

  let member = await byAuthUser(authUser.id);
  if (!member && email) {
    // Same person, different auth row. Claim it; never make a second.
    const byMail = await byEmail(email);
    if (byMail) {
      const patched = await S.rest('fan_members?id=eq.' + byMail.id, {
        method: 'PATCH',
        body: { auth_user_id: authUser.id, last_active_at: new Date().toISOString() },
        headers: { Prefer: 'return=representation' },
      });
      member = (patched && patched[0]) || byMail;
    }
  }

  if (!member) {
    // Carry the Lane Card number across if they already have one, so nobody's
    // membership number changes underneath them.
    let laneNo = null;
    try {
      const f = await S.findOne('fans', 'id=eq.' + encodeURIComponent(authUser.id) + '&select=lane_no,name');
      if (f && f.lane_no) laneNo = String(f.lane_no);
    } catch (e) { /* no Lane Card yet */ }

    const created = await S.rest('fan_members', {
      method: 'POST',
      body: [{
        auth_user_id: authUser.id,
        email_normalised: email,
        first_name: o.firstName || null,
        last_name: o.lastName || null,
        display_name: [o.firstName, o.lastName].filter(Boolean).join(' ') || null,
        membership_number: laneNo || membershipNumber(),
        membership_status: 'active',
        signup_source: o.source || null,
        signup_fixture_id: o.fixtureId || null,
        signup_programme_id: o.programmeId || null,
        last_active_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
      }],
      headers: { Prefer: 'return=representation' },
    });
    member = (created && created[0]) || null;
    if (member) {
      await record(member.id, 'account_created', { source: o.source || null, fixtureId: o.fixtureId || null });
      // A newsletter contact who has now joined is the same supporter.
      if (email) {
        await S.rest('fan_newsletter_contacts?email_normalised=eq.' + encodeURIComponent(email), {
          method: 'PATCH', body: { converted_member_id: member.id },
          headers: { Prefer: 'return=minimal' },
        }).catch(() => null);
      }
    }
  } else {
    await S.rest('fan_members?id=eq.' + member.id, {
      method: 'PATCH', body: { last_active_at: new Date().toISOString() },
      headers: { Prefer: 'return=minimal' },
    }).catch(() => null);
  }
  return member;
}

/** A Lane membership number for somebody who has no Lane Card yet. */
function membershipNumber() {
  // Four digits, matching the Lane Card format supporters already recognise.
  return String(1000 + Math.floor(Math.random() * 9000));
}

/** Is this member entitled to read programmes? */
function canReadProgrammes(member) {
  return !!(member && member.membership_status === 'active');
}

/**
 * Record a supporter action.
 *
 * Deliberately narrow. A programme opened, a match checked into, an account
 * created — things the supporter can see the value of. Not a click log.
 */
async function record(memberId, type, extra) {
  if (!memberId || !type) return null;
  const e = extra || {};
  try {
    return await S.rest('fan_activity', {
      method: 'POST',
      body: [{
        member_id: memberId, activity_type: type,
        fixture_id: e.fixtureId || null, programme_id: e.programmeId || null,
        source: e.source || null, metadata: e.metadata || null,
      }],
      headers: { Prefer: 'return=minimal' },
    });
  } catch (err) {
    // A duplicate programme_opened on the same day hits the unique index and
    // is correct behaviour, not an error worth failing a page load over.
    return null;
  }
}

/** Set marketing consent. Separate from membership, always. */
async function setMarketing(memberId, wanted, source) {
  const now = new Date().toISOString();
  const row = {
    member_id: memberId,
    email_marketing: !!wanted,
    consent_wording_version: MARKETING_WORDING,
    consent_source: source || null,
    updated_at: now,
  };
  if (wanted) row.email_marketing_consented_at = now;
  else row.email_marketing_withdrawn_at = now;
  return await S.rest('fan_marketing_preferences?on_conflict=member_id', {
    method: 'POST', body: [row],
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  });
}

/**
 * The whole picture for a request: token → user → member → entitlement.
 * Returns { user, member, entitled }.
 */
async function context(event) {
  const token = tokenFrom(event);
  const user = await userFromToken(token);
  if (!user) return { user: null, member: null, entitled: false };
  const member = await byAuthUser(user.id);
  return { user, member, entitled: canReadProgrammes(member) };
}

module.exports = {
  TERMS_VERSION, PRIVACY_VERSION, MARKETING_WORDING,
  normalise, userFromToken, tokenFrom, byAuthUser, byEmail,
  ensure, canReadProgrammes, record, setMarketing, context, membershipNumber,
};
