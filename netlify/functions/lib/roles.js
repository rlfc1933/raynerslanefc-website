// ════════════════════════════════════════════════════════════════════════════
// THE ROLES THIS CLUB USES — one list, on the server.
//
// WHY A SEPARATE FILE
// -------------------
// Before this, the same list existed in four places that had drifted apart:
// staff-users.js could assign seven roles, staff-invite.js could invite six,
// the sign-in screen offered seven, and the portal's own layout map knew a
// different set again. The visible symptom was a Chairman inviting a "Team
// Manager", the server refusing it as "not a role this club uses", and nothing
// in the message explaining that the portal itself had offered the choice.
//
// The list lives here because the SERVER is the only place it can be enforced.
// The browser copy in js/portal-tools.js exists to draw the screen, and a test
// asserts the two are identical — a role the portal offers but the server will
// not accept is a bug the club would meet on somebody's first day.
//
// ROLES ARE JOBS, NOT PEOPLE
// --------------------------
// Thirteen jobs a non-league club actually has. When somebody steps down, the
// job is reassigned; nothing here is edited. That is deliberate: the person
// who would have to edit it is not on the committee.
//
// A ROLE IS NOT A PERMISSION
// --------------------------
// Nothing in this file grants anything. It decides what the portal puts in
// front of somebody and what a guide calls their job. Every actual permission
// is decided in lib/authz.js against la_permissions, and Chairman is the only
// role that carries administrative capability by default.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

/**
 * Roles whose assignment is privilege escalation.
 *
 * DEFINED FIRST, ON PURPOSE. ASSIGNABLE_ROLES below is derived by subtracting
 * this list, so a role added to ROLES without being added here would silently
 * become assignable by anyone holding MANAGE_USERS. Declaring the guard above
 * the thing it guards makes that mistake harder to make and obvious to read.
 *
 * Assigning any of these needs CAP.ASSIGN_ADMIN *and* the assigner's own
 * personal password, and none can ever be assigned to oneself — making
 * somebody more powerful always takes a second person.
 */
const ADMIN_ROLES = ['Chairman', 'System Maintainer'];

/** Every role that may be assigned to an account. Order is display order. */
const ROLES = [
  // The named person who maintains the site itself. Distinct from Chairman:
  // the Chairman runs the club, the System Maintainer keeps the machinery
  // working — including the case where what is broken is the permission
  // system. It is an individual account, not a shared "admin" login, and every
  // action it takes is attributed to that name like any other.
  'System Maintainer',
  'Chairman',
  'V Chairman',
  'Club Secretary',
  'Treasurer',
  'Team Manager',
  'Assistant Manager',
  'Coach',
  'Match Day Secretary',
  'Programme Editor',
  'Marketing/Media',
  'Sponsorship',
  'Committee',
  'Volunteer',
];

/** Roles anyone holding MANAGE_USERS may assign — everything except Chairman. */
const ASSIGNABLE_ROLES = ROLES.filter((r) => ADMIN_ROLES.indexOf(r) === -1);

/** Is this string one of the club's roles? Never trust a role from a request. */
function isRole(r) { return ROLES.indexOf(String(r || '').trim()) > -1; }

module.exports = { ROLES, ADMIN_ROLES, ASSIGNABLE_ROLES, isRole };
