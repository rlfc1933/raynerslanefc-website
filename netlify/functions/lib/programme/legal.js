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
//    acceptable to the Board for each of its Competition matches. [A full match
//    programme available electronically only shall be acceptable providing that
//    each Club has approval from the Board before the commencement of the
//    Playing Season…] A Team Sheet will not be considered sufficient…"
//
//   "Clubs will be responsible for all comments in their match day programme in
//    respect of the Competition, the Company or other member Clubs,
//    NOTWITHSTANDING ANY DISCLAIMERS TO THE CONTRARY."
//
// That last clause is why this footer carries NO disclaimer of responsibility.
// The rules say in terms that such a disclaimer does not work, so printing one
// would be decoration that misleads the reader about the club's position.
//
// ── WHAT IS DELIBERATELY MISSING ───────────────────────────────────────────
// Rule 2.15 also requires the club's legal FORM and any identifier. The club
// publishes its legal name ("Rayners Lane Football Club") but has never
// published its form or a company number anywhere this system can read.
//
// That is not something to guess. "Unincorporated association" is the common
// case for a club of this size and it would very likely be right — and a very
// likely guess printed as a legal statement is exactly the kind of thing this
// project does not do. The field stays empty and the portal asks for it.
'use strict';

const VERSION = 'v2';

/**
 * The footer for an edition.
 *
 * @param {Object} club  { legalName, legalForm, identifier, website, contact }
 * @returns {Object} the block a programme version stores, plus its compliance state
 */
function build(club) {
  const c = club || {};
  const legalName = c.legalName || 'Rayners Lane Football Club';
  const legalForm = (c.legalForm || '').trim();
  const identifier = (c.identifier || '').trim();

  // Rule 2.15 is satisfied only when the form is stated too.
  const missing = [];
  if (!legalForm) missing.push('legal form');
  // An identifier is required only where one exists — an unincorporated
  // association has none, so it cannot be demanded before the form is known.
  if (legalForm && /limited|plc|cic|company|incorporat/i.test(legalForm) && !identifier) {
    missing.push('company number');
  }

  const lines = [];
  // The identity line, in the order the rule lists it.
  lines.push([legalName, legalForm, identifier].filter(Boolean).join(' · '));
  lines.push('Official website: raynerslanefc.co.uk');
  lines.push('Contact: info@raynerslanefc.co.uk');
  lines.push('Match information was correct at the time of publication.');
  lines.push('Fixtures, results, line-ups and match events are supplied by Football Web Pages.');
  lines.push('© ' + new Date().getUTCFullYear() + ' ' + legalName);

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
        ? 'The programme must also state the club\'s ' + missing.join(' and ') +
          '. Nobody has supplied it, and it is not something to guess at.'
        : null,
    },
  };
}

/** What the committee must be told, and what they must do about it. */
function outstanding(club) {
  return build(club).compliance;
}

module.exports = { VERSION, build, outstanding };
