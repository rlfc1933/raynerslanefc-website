// MATCH DAY OPERATIONS — identity and capability, resolved SERVER-SIDE.
//
// ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
// The old ledger's only gate was ANALYTICS_PIN: one shared password, checked
// server-side, with no notion of WHO. Every match's takings could be logged,
// edited or deleted by anyone holding it, and nothing recorded who did it.
//
// The portal does have an identity layer (role + staff password), but it lives
// entirely in the browser: sessionStorage holds { username, role, isChairman }
// and the client asserts it. A client could simply claim to be the Chairman.
//
// ── WHAT THIS DOES ─────────────────────────────────────────────────────────
// 1. The actor is carried in a SERVER-SIGNED, time-limited token minted by
//    md-session.js after a password check. The browser cannot mint one, so it
//    cannot invent an actor name out of nothing.
// 2. Capabilities are derived HERE from the role in that token. They are never
//    read from the request body. A client claiming role "Committee" cannot
//    obtain approval rights by asking for them.
// 3. ELEVATED capabilities (approve, reopen, prices, finance) additionally
//    require that the login used a CUSTOM per-person password, not the shared
//    committee default.
//
// ── THE HONEST LIMIT ───────────────────────────────────────────────────────
// The shared default staff password is present in admin.html and is therefore
// public. Anyone holding the club PIN can log in as any role that still uses
// it. So for a default-password login the actor name is ATTRIBUTION, not proof
// — and it is recorded as auth:'shared' in the audit trail so it can never be
// mistaken for a verified identity.
//
// That is exactly why the money-critical actions require a custom password.
// The route to full accountability is for the chairman to set a per-person
// password for each committee member in Manage Users; until then those actions
// are refused rather than silently weakly-authenticated.

const crypto = require('crypto');

// ── SIGNING KEY ────────────────────────────────────────────────────────────
// MD_TOKEN_SECRET and nothing else, in production.
//
// This used to fall back to ADMIN_PIN. That was wrong twice over: the PIN is a
// short shared number typed into a phone at a turnstile, which is far too weak
// to sign an authorisation token with, and it is a value that a great many
// people already know. Anyone holding the PIN could have minted a token
// claiming to be the chairman.
//
// So production now FAILS CLOSED: no MD_TOKEN_SECRET means no tokens are
// minted, no tokens verify, and Match Day Ops refuses to write anything. That
// is the safe direction — the alternative is a system that silently accepts
// forged identities.
//
// A development fallback exists ONLY when NODE_ENV is explicitly a non-production
// value AND MD_ALLOW_DEV_SECRET is set. It is loud, it is never reachable by
// accident, and it cannot activate on Netlify, where NODE_ENV is 'production'.
const DEV_SECRET = 'dev-only-insecure-matchday-secret';
let _devWarned = false;

function isProduction() {
  // Absent NODE_ENV is treated as PRODUCTION. Failing closed on an unset
  // variable is the only safe default for a money system.
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  return env !== 'development' && env !== 'test';
}

function signingKey() {
  const secret = process.env.MD_TOKEN_SECRET;
  if (secret && String(secret).length >= 16) return secret;

  if (secret && String(secret).length < 16) {
    console.error('[matchday] MD_TOKEN_SECRET is set but shorter than 16 characters — refusing to use it.');
    return '';
  }
  if (isProduction()) {
    console.error('[matchday] MD_TOKEN_SECRET is not set. Match Day Ops is disabled — no tokens will be minted or accepted.');
    return '';
  }
  if (!process.env.MD_ALLOW_DEV_SECRET) {
    console.error('[matchday] MD_TOKEN_SECRET is not set. Set MD_ALLOW_DEV_SECRET=1 for local development only.');
    return '';
  }
  if (!_devWarned) {
    _devWarned = true;
    console.warn('[matchday] ★ USING THE INSECURE DEVELOPMENT SIGNING KEY ★ — NODE_ENV=' +
      process.env.NODE_ENV + '. This must never appear in production logs.');
  }
  return DEV_SECRET;
}

/** Why Match Day Ops is unavailable, for an honest error rather than a 500. */
function configError() {
  if (signingKey()) return null;
  return isProduction()
    ? 'Match Day Ops is not configured on this site: MD_TOKEN_SECRET is missing. Set it in Netlify → Site configuration → Environment variables.'
    : 'MD_TOKEN_SECRET is not set. For local development set MD_ALLOW_DEV_SECRET=1 with NODE_ENV=development.';
}

const TTL_MS = 12 * 60 * 60 * 1000;   // 12h — one match day, not a standing key

// ── CAPABILITY MATRIX ──────────────────────────────────────────────────────
// Mirrors the la_permissions rows the migration seeds. Kept here too so the
// functions work even when the Lane App tables are absent, and so a capability
// check never depends on a database round-trip during a match.
const CAP = {
  RECORD:  'can_matchday_record',    // prepare, tally, save, submit
  APPROVE: 'can_matchday_approve',   // review, complete, lock
  REOPEN:  'can_matchday_reopen',    // reopen a locked record
  PRICES:  'can_matchday_prices',    // edit the season price list / overrides
  FINANCE: 'can_matchday_finance',   // see full money figures and reports
};

// Capabilities that must NOT be granted on the shared committee password.
const ELEVATED = [CAP.APPROVE, CAP.REOPEN, CAP.PRICES, CAP.FINANCE];

// Role → capabilities. Keys are the portal's STAFF_ROLES (admin.html).
// "Match Day Secretary" existed as a role and granted nothing; it is the
// natural owner of this module and now carries the rights the name implies.
const ROLE_CAPS = {
  'Chairman':            [CAP.RECORD, CAP.APPROVE, CAP.REOPEN, CAP.PRICES, CAP.FINANCE],
  'V Chairman':          [CAP.RECORD, CAP.APPROVE, CAP.REOPEN, CAP.PRICES, CAP.FINANCE],
  'Match Day Secretary': [CAP.RECORD, CAP.APPROVE, CAP.FINANCE],
  'Club Secretary':      [CAP.RECORD, CAP.APPROVE, CAP.FINANCE],
  'Club Management':     [CAP.RECORD, CAP.FINANCE],
  'Committee':           [CAP.RECORD],
  'Marketing/Media':     [],
};

// Anyone who gets through the club PIN and a role login can RECORD. That is
// the product decision: the committee member on the gate must not be blocked
// by a permission screen at 2:45 on a Saturday.
const BASE_CAPS = [CAP.RECORD];

/**
 * Capabilities for a session.
 * @param role      the role string from the signed token
 * @param isChairman  chairman flag from the signed token
 * @param auth      'custom' (per-person password) | 'shared' (committee default)
 */
function capabilitiesFor(role, isChairman, auth) {
  const named = ROLE_CAPS[role] || [];
  let caps = Array.from(new Set(BASE_CAPS.concat(named)));
  // A chairman flag set by the server-side user store grants the chairman set.
  if (isChairman) caps = Array.from(new Set(caps.concat(ROLE_CAPS['Chairman'])));
  // The shared password can never carry money-critical rights.
  if (auth !== 'custom') caps = caps.filter(c => ELEVATED.indexOf(c) === -1);
  return caps;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}
function sign(payloadB64, key) {
  return b64url(crypto.createHmac('sha256', key).update(payloadB64).digest());
}

/** Mint a signed identity token. Returns '' when no signing key is configured. */
function issue(session) {
  const key = signingKey();
  if (!key) return '';
  const payload = {
    u: String(session.username || '').slice(0, 60),
    r: String(session.role || '').slice(0, 40),
    c: !!session.isChairman,
    a: session.auth === 'custom' ? 'custom' : 'shared',
    iat: Date.now(),
    exp: Date.now() + TTL_MS,
  };
  const p = b64url(JSON.stringify(payload));
  return p + '.' + sign(p, key);
}

/**
 * Verify a token. Returns null on ANY problem — bad signature, expired,
 * malformed, or no signing key configured. Never throws, never half-trusts.
 */
function verify(token) {
  const key = signingKey();
  if (!key || !token || typeof token !== 'string') return null;
  const bits = token.split('.');
  if (bits.length !== 2) return null;
  const [p, sig] = bits;
  const expected = sign(p, key);
  // Constant-time compare, and only after a length check (timingSafeEqual
  // throws on a length mismatch).
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload;
  try { payload = JSON.parse(unb64url(p)); } catch (e) { return null; }
  if (!payload || typeof payload !== 'object') return null;
  if (!payload.exp || Date.now() > payload.exp) return null;
  if (!payload.u) return null;
  return {
    username: payload.u,
    role: payload.r || payload.u,
    isChairman: !!payload.c,
    auth: payload.a === 'custom' ? 'custom' : 'shared',
    capabilities: capabilitiesFor(payload.r || payload.u, !!payload.c, payload.a),
  };
}

function has(session, capability) {
  return !!(session && session.capabilities && session.capabilities.indexOf(capability) > -1);
}

/**
 * The actor string written into md_audit. Never "Chairman" alone when a more
 * specific identity exists, and always marked when the login used the shared
 * password so a reader can tell attribution from proof.
 */
function actorOf(session) {
  if (!session) return 'unknown';
  const name = session.username || session.role || 'unknown';
  const role = session.role && session.role !== session.username ? ` (${session.role})` : '';
  return session.auth === 'custom' ? `${name}${role}` : `${name}${role} [shared password]`;
}

module.exports = {
  CAP, ELEVATED, ROLE_CAPS, TTL_MS,
  capabilitiesFor, issue, verify, has, actorOf, signingKey, configError, isProduction,
};
