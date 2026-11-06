// ════════════════════════════════════════════════════════════════════════════
// PROGRAMME GATE — who may edit and publish the matchday programme.
//
// Every programme function used to accept the shared committee password
// ('1933', hard-coded in lib/pin.js and therefore public on GitHub). That told
// the server WHETHER somebody knew the password, never WHO they were.
//
// From here the programme follows lib/authz.js, the club's canonical path:
//   · identity  — a signed md-auth token (Authorization: Bearer …)
//   · authority — la_permissions, falling back to DEFAULT_CAPS by role
//   · strength  — the token must come from a PERSONAL password (auth:'custom').
//     A token minted from the shared password carries a role the caller simply
//     typed, so it can never edit or publish a programme.
//
// Server-to-server callers (scheduled jobs) keep working through
// process.env.ADMIN_PIN, a value that never reaches a browser.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const AZ = require('../authz');

const CAP = {
  EDIT: AZ.CAP.EDIT_PROGRAMME,        // drafts, sections, team-sheet corrections, history
  PUBLISH: AZ.CAP.PUBLISH_PROGRAMME,  // approve, publish, unpublish, rollback, run the engine
};

/** True only for the server-only internal key, never the committee password. */
function internalKey(value) {
  const k = process.env.ADMIN_PIN;
  if (!k || k.length < 12 || value == null) return false;
  const a = Buffer.from(String(value)), b = Buffer.from(String(k));
  return a.length === b.length && require('crypto').timingSafeEqual(a, b);
}

/**
 * @returns {Promise<{ok:true, who:string, session:object}|{ok:false, response:object}>}
 */
async function gate(event, cap) {
  const g = await AZ.requireCap(event, cap, { elevated: true });
  if (!g.ok) return g;
  return { ok: true, who: g.session.username, session: g.session };
}

module.exports = { CAP, gate, internalKey };
