// ════════════════════════════════════════════════════════════════════════
//  STARTING RECORDS for the Back the Lane / Run the Lane workspaces.
//  Proposals are PROPOSALS — private records for the chairman to decide on,
//  never launched, priced or published by the software. Research notes carry
//  their official source and the date checked; nothing is summarised that
//  was not read. Volunteer roles are DRAFT templates with no coordinator or
//  date until the club fills them in and approves them.
//  Loading twice creates nothing new (idempotency keys).
// ════════════════════════════════════════════════════════════════════════
'use strict';
const CHECKED = '2026-10-09';

const PROPOSALS = [
  { key: 'lane-business-club', title: 'Proposal — The Lane Business Club',
    summary: 'Connect the local businesses that genuinely support the club, using the club as a community connector.',
    benefits: 'Subject to agreement: an approved local business directory; recognition as a club partner; matchday introductions; relevant networking occasions; partner spotlights; supporter offers from partners; business referrals between members.',
    conditions: 'Not launched. No fee-paying network without approved pricing and benefits. No promised leads, advertising reach or commercial returns. Must fit the people and facilities the club actually has. Directory listings only with each business’s consent.',
    decision_needed: 'Chairman: whether to pursue, who would run it, what (if anything) it costs members, and which benefits the club can genuinely deliver.' },
  { key: 'seasonal-tiers', title: 'Proposal — seasonal local business packages (£250 / £500 / £1,000, indicative)',
    summary: 'Three seasonal packages above the existing £50 match-ball and £100 matchday entry points.',
    benefits: 'Indicative only. Rights to be defined from what the club controls: programme presence, club digital channels, matchday acknowledgements, community initiatives. Never pitch-side boards, ground naming, venue advertising or hospitality — the ground is shared and not owned by the club.',
    conditions: 'INDICATIVE prices for chairman approval. Not shown publicly. Before approval: list the exact rights, the delivery cost of each, and how many can be sold without overselling.',
    decision_needed: 'Chairman: approve, change or reject each tier with its rights and delivery cost.' },
];

const RESEARCH = [
  { key: 'fa-stadium-accreditation', topic: 'ground_grading', title: 'FA stadium accreditation (ground grading) — 2026-27 criteria',
    source_url: 'https://www.thefa.com/get-involved/player/ground-grading',
    finding: 'The FA manages stadium accreditation for the National League System in partnership with the Football Foundation. The criteria for each step are in the "Stadium Accreditation Criteria 2026-27" document and its 2026-27 amendments, linked from this page. The page itself states no thresholds or dates.',
    next: 'Read the Step 5 section of the 2026-27 criteria and record each requirement with its page reference before any facility scenario is costed.' },
  { key: 'tenure', topic: 'tenure', title: 'Current tenure at Tithe Farm',
    source_url: '', finding: 'The club does not own Tithe Farm and shares the ground with Broadfields United. No rights to develop, rename, advertise at or control the site may be offered without confirmed contractual authority.',
    next: 'Record the actual agreement (who it is with, term, what it permits) from the club’s documents.' },
  { key: 'football-foundation', topic: 'facility_funding', title: 'Facility funding routes (Football Foundation)',
    source_url: 'https://footballfoundation.org.uk/looking-for-funding',
    finding: 'Facility funding routes and their eligibility are tracked as funding records in Grants & funding, with each one’s eligibility assessed against the club’s legal form and tenure.',
    next: 'Use the Grants & funding records; do not duplicate them here.' },
];

module.exports = { CHECKED, PROPOSALS, RESEARCH };
