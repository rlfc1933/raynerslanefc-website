// ════════════════════════════════════════════════════════════════════════════
// RETIRED — the second staff-account creation route. Closed 5 August 2026.
//
// WHAT IT USED TO DO
// ------------------
// Created or updated a row in la_app_users — username, hashed code, role —
// behind nothing but the shared club PIN:
//
//     if (!adminOk(b.pin)) return L.resp(401, …);
//     …
//     if (['chairman','manager','coach','staff'].indexOf(role) < 0) …
//     L.ins('la_app_users', { username, pin_hash, role, team_id, status:'active' })
//
// So one request carrying the club PIN could create a **chairman** account:
//
//     POST /.netlify/functions/la-seed-staff
//     { "pin":"…", "username":"me", "code":"1234", "role":"chairman" }
//
// The PIN is a short number typed into a phone at a turnstile and known to a
// great many people. lib/pin.js names this exact route in its own header as
// the thing that made the published PIN dangerous.
//
// Phase 0 closed the equivalent hole in staff-users.js. Leaving this one open
// would have made that work decorative: two doors, one of them still unlocked.
//
// WHY IT IS DISABLED RATHER THAN SECURED
// --------------------------------------
// It has NO CALLER. A repository-wide search finds exactly one mention — the
// warning comment in lib/pin.js. No portal screen, no script, no scheduled
// job and no test invokes it. It is a one-time bootstrap utility from before
// the Lane App had its own account management, and it has been superseded by
// la-staff-admin, which already uses the la_permissions capability check.
//
// Securing it would mean maintaining two account-creation systems that must
// agree with each other forever. Disabling it leaves ONE supported path. That
// is the whole point of the exercise.
//
// WHAT STILL WORKS
// ----------------
// Nothing is lost. Existing la_app_users accounts are untouched — this file
// never read them except to overwrite. Account management continues through
// la-staff-admin (capability-checked) and staff-users.js (Phase 0 hardened).
//
// If a genuine bootstrap is ever needed again, it must not come back as a
// PIN-gated endpoint. The safe shapes are written up in
// docs/audits/permission-migration-register-2026-08-05.md.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const L = require('./lib/lane');

/**
 * Is this a real deployment?
 *
 * Absent NODE_ENV is treated as PRODUCTION — the same fail-closed rule
 * lib/md-auth.js uses, and for the same reason: an unset variable must never
 * be the thing that re-opens an account-creation route.
 */
function isProduction() {
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  return env !== 'development' && env !== 'test';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});

  // Closed in production, on every method, before anything is parsed or read.
  // No PIN, no token and no body shape can reach past this line.
  if (isProduction()) {
    console.warn('[la-seed-staff] retired route called and refused — ' +
      'staff accounts are managed through staff-users.js.');
    return L.resp(410, {
      ok: false,
      error: 'This route has been retired. Staff accounts are managed in the ' +
             'portal under Staff Logins, which requires an individual signed-in ' +
             'account — not the shared club PIN.',
      retired: true,
    });
  }

  // ── Below here is unreachable in production. ──────────────────────────────
  // Kept only so a developer running locally can bootstrap a test account, and
  // even then it needs an explicit opt-in that does not exist on Netlify. It
  // is deliberately NOT the shared PIN.
  if (!process.env.LA_ALLOW_DEV_SEED) {
    return L.resp(410, {
      ok: false,
      error: 'Retired. Set LA_ALLOW_DEV_SEED=1 for local development only.',
      retired: true,
    });
  }

  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  if (!L.KEY) return L.resp(500, { ok: false, error: 'Server not configured' });

  const b = L.parseBody(event);
  const username = String(b.username || '').trim().toLowerCase();
  const code = String(b.code || '').trim();
  const role = String(b.role || 'manager').trim();
  if (!username || !/^\d{4,10}$/.test(code)) {
    return L.resp(400, { ok: false, error: 'Need a username and a 4-10 digit code.' });
  }
  // Even in development this cannot mint a chairman. The role that can grant
  // every other role is not something a bootstrap utility should hand out.
  if (['manager', 'coach', 'staff'].indexOf(role) < 0) {
    return L.resp(400, { ok: false, error: 'Bad role. Chairman cannot be seeded.' });
  }

  const teams = await L.sel('la_teams?select=id&order=id&limit=1');
  const team_id = (teams[0] || {}).id || null;
  const pin_hash = L.hashCode(code);

  const existing = await L.sel('la_app_users?select=id&username=eq.' + encodeURIComponent(username));
  let row;
  if (existing.length) {
    const up = await L.upd('la_app_users', 'id=eq.' + existing[0].id, { pin_hash, role, status: 'active' });
    row = (up.data || [])[0];
  } else {
    const inr = await L.ins('la_app_users', { username, pin_hash, role, team_id, status: 'active' });
    if (!inr.ok) return L.resp(500, { ok: false, error: 'Could not create staff login.' });
    row = (inr.data || [])[0];
  }
  return L.resp(200, { ok: true, dev: true, staff: { id: row && row.id, username, role } });
};

exports._internal = { isProduction };
