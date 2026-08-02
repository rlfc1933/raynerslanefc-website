// The programme's legal footer. Verified, versioned, and honest about its gaps.
//
// ── SOURCE ─────────────────────────────────────────────────────────────────
// The Football Association, "27 — STANDARDISED RULES" (FA Handbook 2025-26),
// thefa.com/-/media/files/thefaportal/governance-docs/rules-of-the-association/
//   2025-26/27---standardised-rules.ashx
// Checked 2 August 2026. The document states it is "compiled by The Football
// Association for the mandatory use of all sanctioned Competitions at Steps 1
// to 6 inclusive of the National League System." Rayners Lane play at Step 5,
// so it applies.
//
// The Combined Counties League publishes forms, policies and an administration
// guide, but no competition rules of its own — checked at
// combinedcountiesleague.co.uk/information/downloads/ on 2 August 2026 — so the
// FA Standardised Rules are the operative source.
//
// ── WHAT IS ACTUALLY REQUIRED ──────────────────────────────────────────────
// RULE 2.15 — the only rule that mandates programme CONTENT of this kind:
//
//   "Each Club shall publish its legal name, form (e.g. unincorporated
//    association, company limited by shares or guarantee etc) and any
//    identifier (e.g. company number). … Such information shall as a minimum
//    be published on the Club's official website on a page accessible directly
//    from the home page of that official club website and within the Club's
//    official matchday programme."
//
// RULE 8.14 — the programme must exist and carry the visiting club's details:
//
//   "The home Club is responsible for publishing a full match programme
//    acceptable to the Board for each of its Competition matches. … A Team
//    Sheet will not be considered sufficient…"
//
// The bracketed electronic-only clause in the Standardised Rules is OPTIONAL —
// square brackets mean a Competition may adopt it. The club has confirmed no
// separate electronic-only approval is required for its Step 5 operation, so
// nothing here treats that as outstanding and nothing blocks on it.
//
//   "Clubs will be responsible for all comments in their match day programme in
//    respect of the Competition, the Company or other member Clubs,
//    NOTWITHSTANDING ANY DISCLAIMERS TO THE CONTRARY."
//
// That last clause is why this footer carries NO disclaimer of responsibility.
// The rules say in terms that such a disclaimer does not work, so printing one
// would be decoration that misleads the reader about the club's position.
//
// ── THE CLUB'S CONFIRMED IDENTITY ──────────────────────────────────────────
// Supplied by the club, so Rule 2.15 is now satisfied in full:
//
//   Brand   Rayners Lane Football Club
//   Entity  Rayners Lane Football Club Limited
//   Number  17110511
//
// The brand and the company are kept visibly separate. "Community business" is
// a description the club may use publicly; it is not the registered form, and
// it does not appear here where a legal form is what is being stated.
'use strict';

const VERSION = 'v3';

/**
 * The footer for an edition.
 *
 * @param {Object} club  { legalName, legalForm, identifier, website, contact }
 * @returns {Object} the block a programme version stores, plus its compliance state
 */
const CLUB = {
  brand: 'Rayners Lane Football Club',
  entity: 'Rayners Lane Football Club Limited',
  identifier: 'Company No. 17110511',
};

function build(club) {
  const c = club || {};
  const brand = c.legalName || CLUB.brand;
  const entity = c.legalForm || CLUB.entity;
  const identifier = (c.identifier || CLUB.identifier).trim();

  // Rule 2.15 wants name, form and identifier. All three are now known.
  const missing = [];
  if (!entity) missing.push('legal entity');
  if (!identifier) missing.push('company number');

  const lines = [];
  lines.push(brand);
  lines.push('A community football club serving Harrow since 1933.');
  lines.push('Operated by ' + entity + ' · ' + identifier);
  lines.push('Tithe Farm Sports & Social Club, 151 Rayners Lane, Harrow, Middlesex HA2 0XH');
  lines.push('Affiliated to Middlesex County FA and The Football Association.');
  lines.push('Official website: raynerslanefc.co.uk · info@raynerslanefc.co.uk');
  lines.push('Match information was correct at the time of publication.');
  lines.push('Fixtures, results, line-ups and match events are supplied by Football Web Pages.');
  lines.push('© ' + new Date().getUTCFullYear() + ' ' + entity);

  return {
    version: VERSION,
    lines: lines,
    // Named so a reader can link them without this file inventing URLs.
    links: [
      { label: 'Safeguarding', href: 'policies.html' },
      { label: 'Equality', href: 'policies.html' },
      { label: 'Privacy', href: 'policies.html' },
    ],
    compliance: {
      rule: 'FA Standardised Rules 2.15',
      source: 'FA Handbook 2025-26, section 27 — Standardised Rules',
      checked: '2026-08-02',
      complete: missing.length === 0,
      missing: missing,
      // Said plainly for the portal, not in rule-speak.
      note: missing.length
        ? 'The programme must also state the club\'s ' + missing.join(' and ') + '.'
        : null,
    },
  };
}

/** What the committee must be told, and what they must do about it. */
function outstanding(club) {
  return build(club).compliance;
}

module.exports = { VERSION, build, outstanding };
