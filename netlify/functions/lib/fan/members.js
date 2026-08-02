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
//
// WHAT CHANGED IN THE COMPLETION RELEASE
// --------------------------------------
// Creation used to be four sequential writes issued from here. Any one could
// fail and leave a supporter half-made. It is now a single database function,
// `fan_ensure_membership`, so there is no longer a sequence in which to fail
// halfway. This file verifies the token and passes on what the server proved.
'use strict';

const S = require('../football/store');

const TERMS_VERSION = 'fanzone-terms-2026-08';
const PRIVACY_VERSION = 'privacy-2026-08';
const MARKETING_WORDING = 'marketing-2026-08';
// The exact WhatsApp wording a supporter agreed to, versioned so it can be
// shown back to them and so a change of wording is a change of record.
const WHATSAPP_WORDING = 'whatsapp-2026-08';
const CLUB_INBOX = process.env.FAN_NOTIFY_TO || 'info@raynerslanefc.co.uk';

const AUTH_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://rewkixywfgsyqinfbggv.supabase.co';

// The publishable/anon key. It is NOT a secret — it ships in every page of the
// site inside js/supabase-config.js, and Supabase publishes it as such.
//
// This fallback is load-bearing, not tidiness. SUPABASE_ANON_KEY was never set
// in Netlify, so `apikey: ''` went out on every verification call and GoTrue
// answered "No API key found in request" — a 401. userFromToken() therefore
// returned null for EVERY token, valid ones included. Fixing the browser
// client alone would not have opened a single programme.
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || 'sb_publishable_7Iwtr1OlGo-VeysFkLcwcw_JjDU6DWE';

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
  try {
    const r = await fetch(AUTH_BASE + '/auth/v1/user', {
      headers: { Authorization: 'Bearer ' + token, apikey: ANON_KEY },
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
 * Where a supporter may be sent after signing in.
 *
 * Shared by the browser and the server so one cannot be laxer than the other.
 * Decoded twice before judging, because "%252f%252fevil.com" survives a single
 * decode looking like a harmless path and arrives as "//evil.com".
 */
function safePath(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.length > 512) return null;
  let s = raw;
  for (let i = 0; i < 2; i++) {
    let d;
    try { d = decodeURIComponent(s); } catch (e) { return null; }
    if (d === s) break;
    s = d;
  }
  if (/[\n\r\t\0]/.test(s)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  if (s.charAt(0) !== '/') return null;
  if (s.charAt(1) === '/' || s.charAt(1) === '\\') return null;
  if (s.includes('\\')) return null;
  return raw;
}

/**
 * Find or create the member for a verified auth user.
 *
 * One call, one transaction. Identity, Lane Card linkage, membership number,
 * marketing, attribution, activity and the club notification either all happen
 * or none of them do.
 *
 * The auth user is passed as a VERIFIED object — callers must have been
 * through userFromToken() first. The database function takes the id as an
 * argument, so a caller who had not verified would be naming somebody else.
 */
async function ensure(authUser, opts) {
  const o = opts || {};
  const email = normalise(authUser.email);

  const out = await S.rest('rpc/fan_ensure_membership', {
    method: 'POST',
    body: {
      p_auth_user_id: authUser.id,
      p_email: email,
      p_first_name: o.firstName || null,
      p_last_name: o.lastName || null,
      p_source: o.source || null,
      p_fixture_id: o.fixtureId || null,
      p_programme_id: o.programmeId || null,
      p_marketing: (typeof o.marketing === 'boolean') ? o.marketing : null,
      p_terms_version: o.termsVersion || TERMS_VERSION,
      p_privacy_version: o.privacyVersion || PRIVACY_VERSION,
      p_marketing_wording: MARKETING_WORDING,
      p_destination: CLUB_INBOX,
    },
  });

  if (!out || !out.member) return null;
  const member = out.member;
  member._created = !!out.created;
  member._linkedExisting = !!out.linkedExisting;
  return member;
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

// ── SIGNUP INTENT ───────────────────────────────────────────────────────────
// What the supporter told us before they proved the email is theirs.

function nonce() {
  return require('crypto').randomBytes(24).toString('base64url');
}

async function storeIntent(details) {
  const d = details || {};
  const email = normalise(d.email);
  if (!email) return null;
  const row = {
    nonce: nonce(),
    email_normalised: email,
    first_name: (d.firstName || '').trim().slice(0, 60) || null,
    last_name: (d.lastName || '').trim().slice(0, 60) || null,
    return_path: safePath(d.returnPath) || null,
    signup_source: (d.source || '').slice(0, 80) || null,
    fixture_id: (d.fixtureId || '').slice(0, 80) || null,
    programme_id: d.programmeId || null,
    marketing: (typeof d.marketing === 'boolean') ? d.marketing : null,
    terms_version: d.termsVersion || TERMS_VERSION,
    privacy_version: d.privacyVersion || PRIVACY_VERSION,
  };
  const out = await S.rest('fan_signup_intents', {
    method: 'POST', body: [row], headers: { Prefer: 'return=representation' },
  });
  return (out && out[0]) || null;
}

/**
 * Take the intent belonging to a VERIFIED email.
 *
 * Bound to the email at creation and matched against the verified email here,
 * so a nonce cannot be redeemed by whoever happens to hold it. Single-use:
 * consumed_at is stamped, and only unconsumed rows are ever returned.
 */
async function claimIntent(verifiedEmail) {
  const email = normalise(verifiedEmail);
  if (!email) return null;
  let row = null;
  try {
    row = await S.findOne('fan_signup_intents',
      'email_normalised=eq.' + encodeURIComponent(email) +
      '&consumed_at=is.null&expires_at=gt.' + encodeURIComponent(new Date().toISOString()) +
      '&select=*&order=created_at.desc');
  } catch (e) { return null; }
  if (!row) return null;
  try {
    await S.rest('fan_signup_intents?id=eq.' + row.id + '&consumed_at=is.null', {
      method: 'PATCH', body: { consumed_at: new Date().toISOString() },
      headers: { Prefer: 'return=minimal' },
    });
  } catch (e) { /* another callback beat us; ensure() is idempotent anyway */ }
  return row;
}

/**
 * The whole picture for a request: token → user → member → entitlement.
 *
 * This only LOOKS UP. It never creates, because a read of a programme is not
 * the moment to decide somebody has joined the club.
 */
async function context(event) {
  const token = tokenFrom(event);
  const user = await userFromToken(token);
  if (!user) return { user: null, member: null, entitled: false };
  const member = await byAuthUser(user.id);
  return { user, member, entitled: canReadProgrammes(member) };
}

/** The safe, supporter-facing shape of a member. No internal ids. */
function publicMember(member) {
  if (!member) return null;
  return {
    membershipNumber: member.membership_number,
    displayName: member.display_name,
    firstName: member.first_name,
    lastName: member.last_name,
    status: member.membership_status,
    joinedAt: member.joined_at,
    entitled: canReadProgrammes(member),
  };
}

module.exports = {
  TERMS_VERSION, PRIVACY_VERSION, MARKETING_WORDING, WHATSAPP_WORDING, CLUB_INBOX, ANON_KEY,
  normalise, userFromToken, tokenFrom, byAuthUser, byEmail, safePath,
  ensure, canReadProgrammes, record, setMarketing, context, publicMember,
  storeIntent, claimIntent,
};
