// ════════════════════════════════════════════════════════════════════════
//  VOLUNTEERING — small, clear jobs; offers without friction; the club
//  approves every role before anyone is assigned. Pure functions.
//
//  A role says: what, when, where, roughly how long, who coordinates it, and
//  what checks or training it needs. Roles touching children, money,
//  restricted systems or welfare carry protections that must be confirmed by
//  a named person before the role is approved AND before a volunteer is
//  assigned. DBS and welfare records stay with the Welfare Officer — HQ only
//  records that the check was confirmed and by whom.
// ════════════════════════════════════════════════════════════════════════
'use strict';

const ROLE_FLOW = {
  draft: ['approved', 'closed'], approved: ['open', 'draft', 'closed'], open: ['filled', 'closed'],
  filled: ['open', 'closed'], closed: ['draft'],
};
const OFFER_FLOW = {
  new: ['contacted', 'approved', 'declined'], contacted: ['approved', 'declined', 'withdrawn'],
  approved: ['assigned', 'declined', 'withdrawn'], assigned: ['delivered', 'withdrawn'],
  delivered: ['recognised'], recognised: [], declined: ['new'], withdrawn: ['new'],
};

const FLAGS = {
  children: 'Involves children or young people — DBS-checked adult and Welfare Officer approval; never alone with under-18s.',
  money: 'Handles money — two people count and sign for cash; no personal card readers.',
  systems: 'Uses restricted club systems or personal data — access granted by the chairman, removed afterwards.',
  welfare: 'Welfare or first aid — only appropriately trained people.',
};
function flagsOf(role) { const d = (role && role.data) || {}; return Object.keys(FLAGS).filter((k) => d['sg_' + k] === true || d['sg_' + k] === 'true'); }
function protections(role) { return flagsOf(role).map((k) => FLAGS[k]); }

function roleGuard(role, to, ctx = {}) {
  const d = role.data || {};
  if (to === 'approved') {
    const missing = [['what', 'what is needed'], ['when', 'when'], ['where', 'where'], ['commitment', 'roughly how long'], ['coordinator', 'who coordinates it']]
      .filter(([k]) => !String(d[k] || '').trim()).map(([, l]) => l);
    if (missing.length) return 'Before approval, say ' + missing.join(', ') + '.';
    if (!ctx.actor) return 'Approval must be recorded against a named person.';
    if (flagsOf(role).length) {
      if (!String(d.checks || '').trim()) return 'This role needs protections — write the checks/training required before approving.';
      if (!String(d.protections_confirmed_by || ctx.protections_confirmed_by || '').trim())
        return 'Name who confirmed the protections (the Welfare Officer for anything involving children).';
    }
  }
  return null;
}
function offerGuard(offer, to, ctx = {}, role = null) {
  if (to === 'approved' && !ctx.actor) return 'Approval must be recorded against a named person.';
  if (to === 'assigned') {
    if (!role) return 'Link the offer to an approved role first.';
    if (!['approved', 'open'].includes(role.stage)) return 'That role has not been approved by the club yet.';
    if (flagsOf(role).length && !String(((offer.data || {}).checks_confirmed_by) || ctx.checks_confirmed_by || '').trim())
      return 'This role needs checks — name who confirmed this volunteer meets them (records stay with the Welfare Officer).';
  }
  if (to === 'delivered' && ctx.hours != null && ctx.hours !== '' && !(Number(ctx.hours) >= 0 && Number(ctx.hours) <= 24)) return 'Hours must be between 0 and 24.';
  if (to === 'recognised' && !String(ctx.reason || '').trim()) return 'Say how their help was recognised (thank-you message, programme mention …).';
  return null;
}

/** The instructions a volunteer receives once assigned — generated from the approved role. */
function instructionsFor(role, offer) {
  const d = (role && role.data) || {}; const o = (offer && offer.data) || {};
  const lines = [
    `Hi ${String(o.name || '').split(/\s+/)[0] || 'there'},`, '',
    `Thank you for offering to help Rayners Lane FC. You're down for: ${role.title}.`, '',
    `What: ${d.what || ''}`, `When: ${d.when || ''}`, `Where: ${d.where || 'Tithe Farm, 151 Rayners Lane, HA2 0XH'}`,
    `How long: ${d.commitment || ''}`, `Your contact on the day: ${d.coordinator || ''}`,
  ];
  if (String(d.checks || '').trim()) lines.push(`Before you start: ${d.checks}`);
  lines.push('', 'If anything changes, just reply and let us know — no problem at all.', '', 'Rayners Lane FC');
  return lines.join('\n');
}

// Draft role templates from the club's own list of ways to help. DRAFTS: no
// coordinator, no date — the club fills those in and approves before anything
// is offered to a volunteer.
const ROLE_TEMPLATES = [
  { key: 'matchday-help', title: 'Help on one home matchday', what: 'Welcome supporters, help at the gate or with the programme table.', commitment: 'About 3 hours (2pm–5pm)' },
  { key: 'photos', title: 'Take photographs at a home match', what: 'Photograph the match and supporters for the club’s channels (only people who are happy to be photographed).', commitment: 'One match' },
  { key: 'programmes', title: 'Help with the matchday programme', what: 'Help gather content or hand out programmes on the day.', commitment: 'A couple of hours before a home match' },
  { key: 'posters', title: 'Put up approved posters locally', what: 'Ask local shops if they will display an approved fixture poster.', commitment: 'An hour or two before a home match' },
  { key: 'merch', title: 'Help sell club merchandise', what: 'Help on the merchandise table on a matchday.', commitment: 'About 2 hours', sg_money: true, checks: 'Two people count and sign for cash. Briefing from the coordinator.' },
  { key: 'introduce', title: 'Introduce a local business to the club', what: 'Tell us about a business you know that might like to support the club; the chairman makes the approach.', commitment: 'One conversation' },
  { key: 'fulfilment', title: 'Help deliver sponsor commitments', what: 'Help make sure sponsors get what was agreed (programme credits, photos, thank-yous).', commitment: 'An hour a week, flexible' },
  { key: 'community', title: 'Support an approved community event', what: 'Help run a club-approved community event.', commitment: 'Depends on the event' },
];

module.exports = { ROLE_FLOW, OFFER_FLOW, FLAGS, flagsOf, protections, roleGuard, offerGuard, instructionsFor, ROLE_TEMPLATES };
