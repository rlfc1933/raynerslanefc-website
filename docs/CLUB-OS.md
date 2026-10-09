# Club OS — what Staff HQ runs on, and how

Released 2026-10-09 alongside the 2026/27 "Floodlit" edition of the website.
This is the honest map: what exists, what it does, what it deliberately does
not do, and the decisions only the club can make.

## How it fits together

| Layer | Where | Notes |
|---|---|---|
| Records | Supabase `hq_orgs`, `hq_items`, `hq_suppression`, `hq_redemptions`, `hq_audit` | Migration `supabase/migrations/20261009120000_club_os.sql`. RLS on, no public access. Applied to production 2026-10-09. |
| Rules | `netlify/functions/lib/club-os.js` | Stage machines, outreach permission (PECR), scoring, fulfilment, payments, duplicates. Unit-tested: `tests/club-os.test.js`. |
| API | `netlify/functions/club-os.js` | Committee password + a named actor on every write; every write audited; optimistic locking on stage changes; idempotency keys on creates. |
| Screens | `js/club-os.js`, `css/club-os.css`, panels in `admin.html` | Club Office, Sponsorship CRM, Business Outreach, Grants & Funding, Compliance Register, Comms Approvals, Match Analysis, Club Tasks, Reward Redemption. |
| Website intake | `netlify/functions/submit-form.js` | A sponsorship enquiry is stored in `submissions` AND becomes an HQ enquiry with an organisation (deduplicated) and a 48-hour due date. |
| Journeys | `quality/tests/hq.spec.js` | The real functions, driven through the real UI, over an in-memory database. |

**Found and fixed while building:** the `submissions` table had never been
created in production — every website form (contact, sponsorship, trials,
volunteer, membership) was failing to save. It now exists. A database function
(`admin_members`) let anyone holding an old PIN — printed in the public repo —
download every Fan Zone member's name and email; public access to it is
revoked. Scheduled fixture syncs had stopped authenticating after the password
change; fixed.

## What each journey does now

- **Sponsor enquiry → deal → delivery → money.** Website form → organisation +
  enquiry (48h clock) → assign an owner (reply task created) → opportunity
  through Research … Proposal → Won (needs owner + agreed value or in-kind) →
  12-step fulfilment checklist, a draft invoice and a renewal task are created
  automatically → invoice draft → approved by a named person → issued
  (number RLFC-YYYY-NNNN) → payments recorded only with bank evidence →
  part-paid / paid. Exclusive rights (shirts, training kit) cannot be won twice
  in a season.
- **Local outreach.** Organisations carry legal form and a contact-permission
  state. "Sent" is refused unless: corporate subscriber with a recorded lawful
  basis, or express consent, or an existing relationship — and the address/domain
  is not suppressed. Unknown legal form = treated as an individual (protective
  default). The drafter cannot approve their own approach. Messages are sent by a
  person from the club mailbox ("Open in email" adds an opt-out line), then
  logged. No bulk sender exists.
- **Grants.** Each opportunity carries its official source, date checked and a
  written eligibility assessment. "Eligible" requires a written reason;
  "Submitted" requires the funder's reference. The starting records were checked
  on 2026-10-09 (see below).
- **Compliance.** Requirement, authority, source, role, owner, due date,
  evidence. "Complete" requires the evidence location. No due date is guessed —
  the secretary enters them from the documents. DBS and welfare records stay with
  the Welfare Officer, never in HQ.
- **Comms.** Draft → review → approved by someone other than the writer →
  scheduled (needs a time) → published (record the live link). Nothing is posted
  from HQ.
- **Rewards.** Eligibility counts VERIFIED home check-ins from the gate scanner
  (`attendance`, one per match). A reward is redeemable once per season — the
  database refuses a second redemption even from two phones at once.
- **Matchday.** "Create checklist for next home match" makes 12 owned tasks
  from the fixture list (idempotent). Reconciliation stays in Match Day Ops,
  which already works well.
- **Match analysis.** Coaches tag timestamped events (fixed categories) from
  authorised footage, or paste rows exported from Kinovea. No ratings or xG are
  invented.

## Funding: the decision that unlocks most of it

Companies House (checked 2026-10-09) lists Rayners Lane Football Club Limited
(17110511) as a private company **limited by shares** with one person holding
75%+ of shares. As it stands that rules the club out of Sport England's Movement
Fund, Football Foundation facilities grants and the Harrow Community Fund, and
may affect easyfundraising and the Grass Pitch Maintenance Fund. The Football
Stadia Improvement Fund (the NLS route, up to £100k over five years for Step
5–6) states no company-structure bar. Whether to create a not-for-profit
community arm (CLG / CIC / CASC) is a club decision that needs proper advice.
The system records ineligibility honestly and never misrepresents the applicant.

## Deliberately not done (and why)

| Item | Status | What would unlock it |
|---|---|---|
| Sending email from HQ | Not built | A verified club sending domain (Resend is configured in code but its sender is still the sandbox address) and a written outreach policy. Until then approved messages go from the club mailbox. |
| Companies House lookup | Built, switched off | Free API key from developer.company-information.service.gov.uk → Netlify env `COMPANIES_HOUSE_API_KEY`. |
| Per-person roles | Not enforced | The club chose one committee password. Every change is signed with the person's name and audited, but a shared password cannot prove who someone is. Personal staff accounts (already built: Staff Access) are the upgrade path. |
| Automated grant discovery ("Granted") | Not installed | GPL-3.0 and built for US nonprofits (EIN, 501c3). The grants pipeline here is UK-specific. |
| Anthropic document skills (docx/pdf/pptx/xlsx) | Not vendored | Source-available, not redistributable in a public repo. Install per machine: `/plugin marketplace add anthropics/skills` then `/plugin install document-skills@anthropic-agent-skills`. |
| Kinovea | Workflow only | Windows desktop software (GPL-2). Export key images/CSV and paste into Match Analysis. |
| Refero design references | Not connected | Paid account required (Pro/Team). MCP: `https://api.refero.design/mcp`. |
| Microsoft Clarity | Wired, off | Paste the project ID into `CLARITY_ID` in `js/consent.js` and add Clarity to the privacy policy in the same change. |
| Football scouting / opposition intelligence | Excluded by the brief | — |
| Payment checkout | Not built | Needs an approved provider, prices, refund policy and reconciliation. |

## Known pre-existing issues left for the club

- `data/meetings.json` (committee minutes) and `data/sponsor-crm.json` are
  committed to the public repository and publicly readable. New commercial
  records live in Club OS (private); meeting minutes should move too.
- Five unit tests were already failing on main before this release (listed in
  `quality/known-failures.json`).
- `FWP_SYNC_ENABLED` is off, so results are not auto-imported; 9 past fixtures
  have no score recorded.
- Supabase advisor warnings on older tables/functions (mutable search_path,
  a SECURITY DEFINER view `la_players_public`, `username_taken` callable by anon).
