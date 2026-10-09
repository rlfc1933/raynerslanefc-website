// ════════════════════════════════════════════════════════════════════════
//  CLUB OS — starting records, loaded once from Staff HQ ("Load starting
//  records"). Every fact here has a source URL and the date it was checked.
//  Nothing is invented: no deadlines we could not find, no amounts we could
//  not read, no eligibility we could not verify. Re-loading is a no-op
//  (each row has an idempotency key).
// ════════════════════════════════════════════════════════════════════════
'use strict';
const CHECKED = '2026-10-09';

// The single fact that decides most funding: the club's legal form.
const ENTITY_NOTE = 'Companies House 17110511 shows Rayners Lane Football Club Limited as a private company limited by shares ' +
  'with one person holding 75%+ of shares (checked ' + CHECKED + ', https://find-and-update.company-information.service.gov.uk/company/17110511). ' +
  'Many community funds exclude companies that can distribute profits. Confirm the articles before any application; a not-for-profit ' +
  'community arm (CLG/CIC/CASC) is a decision for the club with proper advice — never misrepresent the applicant.';

const GRANTS = [
  { key: 'fsif', title: 'Football Foundation — Football Stadia Improvement Fund (NLS)', stage: 'eligibility_review',
    url: 'https://www.footballfoundation.org.uk/grant/football-stadia-improvement-fund/national-league',
    amount: 'Up to £100k over five years for Step 5–6; covers 50–70% of a project (partnership funding needed)',
    note: 'The route for National League System clubs (Steps 1–6) for ground-grading work. No company-structure bar stated on the page. Only the Chair, Vice-Chair, Secretary or Treasurer may apply; a governing document is required. Floodlights go through the separate LED Floodlight Fund.' },
  { key: 'gpmf', title: 'Football Foundation — Grass Pitch Maintenance Fund', stage: 'uncertain',
    url: 'https://footballfoundation.org.uk/grant/grass-pitch-maintenance-fund',
    amount: '11v11: £3,200/yr (Enhance) or £960/yr (Sustain), six years, tapering',
    note: 'NLS Steps 1–6 eligible ONLY for non-stadia pitches used for community football. For-profit entities excluded — check against the club’s structure.' },
  { key: 'ff-facilities', title: 'Football Foundation — Pitch & Facilities Fund', stage: 'ineligible',
    url: 'https://youngcamdenfoundation.org.uk/funding/football-foundation-facilities-grants',
    amount: 'Generally up to £25k',
    note: 'Reported to exclude NLS Step 1–6 clubs and for-profit businesses (PARTLY VERIFIED — secondary source; the Foundation’s own page could not be read). Re-check before ruling out.' },
  { key: 'hap', title: 'Football Foundation — Home Advantage Programme', stage: 'uncertain',
    url: 'https://footballfoundation.org.uk/grant/home-advantage-programme',
    amount: 'Up to £250k (community pitches only)',
    note: 'For England Accredited NLS Steps 1–6 clubs, community pitches only, needs a 25-year local-authority lease. Year-2 expressions of interest were closed when checked.' },
  { key: 'movement-fund', title: 'Sport England — Movement Fund', stage: 'ineligible',
    url: 'https://www.sportengland.org/funding-and-campaigns/our-funding/movement-fund/apply-movement-fund/who-can-apply',
    amount: 'Up to £15,000 in any 12 months (often via Crowdfunder pledges)',
    note: 'Excludes “companies who can pay profits to directors, shareholders, or members, including companies limited by shares” and requires no one to have significant control. The club currently fails both tests.' },
  { key: 'harrow-community-fund', title: 'Harrow Community Fund (Harrow Giving / VAH)', stage: 'ineligible',
    url: 'https://youngharrowfoundation.org/images/downloads/harrow/Harrow-Community-Fund-Guidance.pdf',
    amount: 'Small grants up to £5k; large grant £40k (2025 round)',
    note: 'Open to charities, CLGs and CICs limited by guarantee with 2+ unrelated directors. Companies limited by shares are not listed. Possible route for a separately constituted community arm.' },
  { key: 'harrow-wins', title: 'Harrow Wins community lottery', stage: 'eligibility_review',
    url: 'https://www.harrow.gov.uk/council/harrow-wins',
    amount: '50p of every £1 ticket goes to the chosen good cause',
    note: 'Sports clubs can sign up as a good cause. Check the cause criteria against the club’s structure.' },
  { key: 'easyfundraising', title: 'easyfundraising (online shopping donations)', stage: 'uncertain',
    url: 'https://support.easyfundraising.org.uk/hc/en-gb/articles/26050234520210-Who-can-register-as-a-good-cause',
    amount: 'Commission on supporters’ online shopping',
    note: 'Sports clubs welcome, but causes must have a “genuine, selfless purpose” and not be for commercial gain (terms cl. 14.6). Unclear for a share-owned company — ask easyfundraising before registering.' },
  { key: 'middlesex-fa', title: 'Middlesex FA — club funding', stage: 'discovered',
    url: 'https://www.middlesexfa.com',
    amount: 'Unknown',
    note: 'No current club grant scheme found (only historic schemes, 2017–2020). The County FA is also the gateway for Football Foundation applications — ask them directly.' },
];

// Compliance register. Due dates are left EMPTY on purpose: the secretary
// enters the real date from the real document. An empty date shows as "date
// needed", never as a guessed deadline.
const COMPLIANCE = [
  { key: 'fa-affiliation', title: 'FA club affiliation 2026/27 (safeguarding declaration, insurance, named officials)', authority: 'The FA / Middlesex FA', url: 'https://grassrootstechnology.thefa.com', role: 'Club Secretary' },
  { key: 'league-ground-grading', title: 'Ground grading — Step 5 requirements (Combined Counties League)', authority: 'Combined Counties League / The FA', url: 'https://www.thefa.com', role: 'Club Secretary' },
  { key: 'public-liability', title: 'Public liability insurance renewal', authority: 'Insurer', url: '', role: 'Treasurer' },
  { key: 'personal-accident', title: 'Personal accident insurance (players) renewal', authority: 'Insurer', url: '', role: 'Treasurer' },
  { key: 'welfare-officer', title: 'Club Welfare Officer appointed and trained', authority: 'The FA', url: 'https://learn.englandfootball.com', role: 'Chairman' },
  { key: 'dbs-renewals', title: 'DBS checks current for roles that need them (records held by the Welfare Officer — not here)', authority: 'The FA', url: 'https://www.thefa.com', role: 'Welfare Officer' },
  { key: 'first-aid', title: 'Matchday first aid cover and trained personnel', authority: 'Combined Counties League', url: '', role: 'Match Day Secretary' },
  { key: 'player-registrations', title: 'Player registration deadlines for the season', authority: 'Combined Counties League / Whole Game System', url: 'https://wholegame.thefa.com', role: 'Club Secretary' },
  { key: 'ch-confirmation', title: 'Companies House confirmation statement', authority: 'Companies House', url: 'https://find-and-update.company-information.service.gov.uk/company/17110511', role: 'Chairman' },
  { key: 'ch-accounts', title: 'Companies House annual accounts', authority: 'Companies House', url: 'https://find-and-update.company-information.service.gov.uk/company/17110511', role: 'Treasurer' },
  { key: 'privacy-policy', title: 'Privacy notice reviewed (Fan Zone, enquiries, outreach)', authority: 'ICO (UK GDPR)', url: 'https://ico.org.uk', role: 'Chairman' },
];

// Real, published partners (from data/sponsors.json and the homepage). Loaded
// as organisations with relationship "sponsor" and NO values — the club enters
// actual contract values; we never guess them.
function sponsorOrgs(sponsorsJson) {
  const list = (sponsorsJson && (sponsorsJson.sponsors || sponsorsJson.partners || sponsorsJson)) || [];
  return (Array.isArray(list) ? list : []).filter((s) => s && s.name && !/your brand/i.test(s.name)).map((s) => ({
    name: s.name, relationship: 'sponsor', kind: 'business', website: s.url || s.website || null,
    notes: [s.tier || s.role || s.category, 'Imported from the public sponsors list on ' + CHECKED + '. Contract value, term and renewal date not recorded yet.'].filter(Boolean).join(' — '),
    public_listing: true, permission: 'existing_relationship',
  }));
}

module.exports = { CHECKED, ENTITY_NOTE, GRANTS, COMPLIANCE, sponsorOrgs };
