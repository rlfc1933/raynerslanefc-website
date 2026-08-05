// MATCH DAY OPERATIONS — mint a signed identity token.
//
//   POST { pin, username, password }
//     → { ok, token, username, role, isChairman, auth, capabilities }
//     → { ok:false, error:'wrong-password' | 'Unauthorized' | 'not-configured' }
//
// The club PIN gets you to the door; this establishes WHO is at it. The token
// it returns is what every Match Day Ops write must carry — the browser cannot
// mint one, so it cannot invent an actor name.
//
// Password check, in order:
//   1. A CUSTOM per-person password from the rlfc-staff blob store (the same
//      salted hash staff-login.js writes). → auth:'custom', full rights by role.
//   2. The shared committee default.        → auth:'shared', RECORD only.
//
// A custom password having been SET blocks the shared default for that user —
// identical to staff-login.js, so setting one is a real upgrade, not a
// second way in.
//
// Money-critical capabilities (approve, reopen, prices, finance) are refused on
// a shared-password login. See lib/md-auth.js for why that is the honest line.

const adminOk = require('./lib/pin');
const crypto = require('crypto');
const AUTH = require('./lib/md-auth');

// Same pepper as staff-login.js so custom passwords set there work here.
const PEPPER = 'rlfc:staff:v1';
function hash(pw) { return crypto.createHash('sha256').update(String(pw) + ':' + PEPPER).digest('hex'); }

// The shared committee password. Already present in admin.html and therefore
// already public — reading it from an env var lets the club move it out of the
// client without a code change here.
const SHARED_PW = process.env.STAFF_DEFAULT_PW || '20raynerslanefc26';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });
  const cfgErr = AUTH.configError();
  if (cfgErr) return resp(503, { ok: false, error: cfgErr, misconfigured: true });

  const username = String(b.username || '').trim().slice(0, 60);
  const password = String(b.password || '');
  if (!username || !password) return resp(400, { ok: false, error: 'missing' });

  let role = username, isChairman = username === 'Chairman', auth = null;

  // 1 · custom per-person password
  try {
    const { getStore } = await import('@netlify/blobs');
    const users = (await getStore('rlfc-staff').get('users', { type: 'json' })) || {};
    const u = users[username];
    if (u && u.disabled) {
      // No token for a disabled account, at any authentication strength. This
      // is the check that makes "disable" mean something everywhere else.
      return resp(200, { ok: false, error: 'account-disabled' });
    }
    if (u) {
      if (u.pass_hash === hash(password)) {
        auth = 'custom';
        role = u.role || username;
        isChairman = !!u.is_chairman;
      } else {
        // A custom password EXISTS and was missed. Do not fall through to the
        // shared default — that would make setting one pointless.
        return resp(200, { ok: false, error: 'wrong-password' });
      }
    }
  } catch (e) {
    // Blob store unavailable — fall through to the shared password so the
    // committee is never locked out of the gate on a match day.
  }

  // 2 · shared committee default
  if (!auth) {
    // Constant-time compare so the shared password cannot be probed a
    // character at a time.
    const a = Buffer.from(password), c = Buffer.from(SHARED_PW);
    const match = a.length === c.length && crypto.timingSafeEqual(a, c);
    if (!match) return resp(200, { ok: false, error: 'wrong-password' });
    auth = 'shared';
  }

  const session = { username, role, isChairman, auth };
  const token = AUTH.issue(session);
  if (!token) return resp(200, { ok: false, error: 'not-configured' });

  return resp(200, {
    ok: true,
    token,
    username,
    role,
    isChairman,
    auth,
    capabilities: AUTH.capabilitiesFor(role, isChairman, auth),
    expiresInMs: AUTH.TTL_MS,
  });
};
