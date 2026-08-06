// ════════════════════════════════════════════════════════════════════════════
// THE FIRST CHAIRMAN — one account, once, and then never again.
//
// THE CHICKEN AND EGG
// -------------------
// Accounts are created by an authorised administrator. There is no first
// administrator. The previous answer minted an invitation TOKEN, which somebody
// then had to copy out of a terminal and carry to Pete — a live credential in
// transit, and one that whoever ran the command inevitably saw.
//
// This does the same job without ever producing a token. Pete opens a page,
// proves he is at the club by entering the club PIN, and types his own password
// straight into the browser. Nothing to copy, nothing to hand over, nothing for
// anybody else to see.
//
// EVERY GATE, AND WHY EACH ONE IS THERE
// -------------------------------------
//   1. STAFF_BOOTSTRAP_ENABLED must be set        — off by default; an absent
//                                                   flag is a closed door
//   2. ...and set less than 30 minutes ago        — so a flag left on by
//                                                   accident still closes
//   3. The club PIN must be correct               — not just anyone with the URL
//   4. The username must be exactly 'pete'        — not read as "whoever asked"
//   5. That account must already exist, pending   — this cannot CREATE a person
//   6. No administrative account may be active    — the real self-closing rule
//   7. The bootstrap must not already be consumed — recorded in the database,
//                                                   so it survives a redeploy
//
// Gates 6 and 7 are the ones that matter: even if the flag were left on for a
// year, the moment Pete finishes, this route can never do anything again.
//
// The role is NOT read from the request. This makes a Chairman or nothing.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const adminOk = require('./lib/pin');
const STORE = require('./lib/staff-store');
const AUTHZ = require('./lib/authz');
const ROLES = require('./lib/roles');

const WHO = 'pete';
const WINDOW_MINUTES = 30;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify(obj),
  };
}

const CLOSED = {
  ok: false, closed: true,
  error: 'Chairman setup is closed. Accounts are created in the portal under Staff Access.',
};

/**
 * Is the 30-minute window still open?
 *
 * The flag's VALUE is an ISO timestamp when the owner wants a bounded window.
 * Anything else (like "1") is treated as "opened now", which is the safe
 * reading: a flag with no timestamp gets the shortest possible life, not an
 * unlimited one.
 *
 * Netlify functions re-read the environment on each cold start, so a flag set
 * and left is bounded by this check rather than by anybody remembering.
 */
function windowOpen(now) {
  const raw = String(process.env.STAFF_BOOTSTRAP_ENABLED || '').trim();
  if (!raw) return { open: false, reason: 'flag_absent' };
  const stamp = Date.parse(raw);
  if (!isNaN(stamp)) {
    const age = (now - stamp) / 60000;
    if (age > WINDOW_MINUTES) return { open: false, reason: 'window_expired' };
    if (age < -5) return { open: false, reason: 'window_future' };
    return { open: true, expiresInMs: (WINDOW_MINUTES - age) * 60000 };
  }
  // No timestamp — the deploy that read this flag is itself the clock. The
  // page shows the full window; the hard stops are gates 6 and 7.
  return { open: true, expiresInMs: WINDOW_MINUTES * 60000, untimed: true };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  const now = Date.now();
  const win = windowOpen(now);
  if (!win.open) return resp(410, CLOSED);

  // ── STATUS (GET) — lets the page say whether it is usable, without acting.
  // It reveals nothing: whether setup is open is not a secret, and the page is
  // useless without both the club PIN and Pete's own chosen password.
  if (event.httpMethod === 'GET') {
    try {
      if (await STORE.bootstrapConsumed()) return resp(410, CLOSED);
      if (await STORE.adminExists(ROLES.ADMIN_ROLES)) return resp(410, CLOSED);
      const u = await STORE.getUser(WHO);
      if (!u) return resp(410, Object.assign({}, CLOSED, { error: 'That account does not exist yet.' }));
      if (u.status !== 'setup_required') return resp(410, CLOSED);
      return resp(200, {
        ok: true, open: true, username: WHO,
        name: u.name, title: u.title, expiresInMs: win.expiresInMs,
      });
    } catch (e) {
      console.error('[chairman-setup] store unavailable:', (e && e.message) || e);
      return resp(200, { ok: false, error: 'The staff store could not be reached. Try again shortly.' });
    }
  }

  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'That club access code is not right.' });

  if (STORE.norm(b.username) !== WHO) return resp(403, CLOSED);

  const password = String(b.password || '');
  const confirm = String(b.confirm || '');
  if (password.length < 10) {
    return resp(400, { ok: false, error: 'Please choose a password of at least 10 characters.' });
  }
  if (password !== confirm) {
    return resp(400, { ok: false, error: 'Those two passwords do not match.' });
  }

  try {
    if (await STORE.bootstrapConsumed()) return resp(410, CLOSED);
    if (await STORE.adminExists(ROLES.ADMIN_ROLES)) return resp(410, CLOSED);

    const u = await STORE.getUser(WHO);
    if (!u) return resp(410, Object.assign({}, CLOSED, { error: 'That account does not exist yet.' }));
    if (u.status !== 'setup_required') return resp(410, CLOSED);

    // The password never leaves the browser except as this one request, and is
    // stored only as a hash. Nothing anywhere logs it.
    await STORE.setPassword(WHO, password);
    await STORE.consumeBootstrap(WHO, 'chairman-setup page');

    await AUTHZ.audit({
      action: 'staff.chairman_setup', targetUser: WHO,
      actorUsername: WHO, actorRole: 'Chairman',
      capability: 'bootstrap', result: 'success',
      after: { status: 'active' },      // never the password, never a hash
    });

    return resp(200, {
      ok: true,
      username: WHO,
      message: 'Your account is ready. Sign in with your own password from now on.',
    });
  } catch (e) {
    console.error('[chairman-setup] failed:', (e && e.message) || e);
    return resp(200, { ok: false, error: 'That could not be saved. Please try again.' });
  }
};

exports._internal = { windowOpen, WHO, WINDOW_MINUTES };
