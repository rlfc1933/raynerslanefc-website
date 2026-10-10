// ════════════════════════════════════════════════════════════════════════
//  SPONSOR JOURNEY — enquiry → approved package → a real home fixture →
//  invoice → fulfilment → renewal. Pure functions; club-os.js does storage.
//
//  "A business offers £100": the enquiry reaches HQ (submit-form intake),
//  a named person approves the package, a slot on a REAL home fixture from
//  the registry is held (one match-ball and one matchday sponsor per game —
//  never oversold), the invoice is drafted from the approved price, the
//  fulfilment checklist matches what that package actually promises, and a
//  renewal conversation is dated from the match.
//
//  The ground is shared and not owned by the club: pitch-side boards, ground
//  naming, venue advertising and hospitality are never offered.
// ════════════════════════════════════════════════════════════════════════
'use strict';

// Per-fixture packages: one of each per home game. The two entry points are
// the club's existing offers; the price is the club's to confirm before quoting.
const FIXTURE_PACKAGES = {
  matchball: { key: 'matchball', slot: 'matchball', name: 'Match-ball sponsor (one home game)', listPence: 5000 },
  match: { key: 'match', slot: 'matchday', name: 'Matchday sponsor (one home game)', listPence: 10000 },
};
// Rights the club cannot grant at Tithe Farm.
const NOT_OFFERED = {
  board: 'Pitch-side boards are not the club’s to sell — Tithe Farm is shared and not owned by the club.',
  hospitality: 'Hospitality at Tithe Farm is not the club’s to sell — the ground is shared and not owned by the club.',
  naming: 'Ground naming rights are not the club’s to sell.',
};

function isFixturePackage(key) { return !!FIXTURE_PACKAGES[key]; }

// ── Dates in the club's time zone ────────────────────────────────────────
function londonDate(iso) {
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function londonLabel(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}
function addDays(ymd, n) { const t = Date.parse(ymd + 'T12:00:00Z') + n * 864e5; return new Date(t).toISOString().slice(0, 10); }

/**
 * May a sponsor slot be sold on this registry fixture? Only a HOME, first-team
 * fixture that is 'scheduled', not superseded by a rearranged row, and still
 * in the future.
 */
function slotEligible(f, nowMs = Date.now()) {
  if (!f) return { ok: false, why: 'Fixture not found in the registry.' };
  if (f.isHome === false) return { ok: false, why: 'Away fixture — sponsor slots are sold for home games only.' };
  if (f.firstTeam === false) return { ok: false, why: 'Not a first-team fixture.' };
  if (f.syncStatus === 'superseded') return { ok: false, why: 'This fixture was rearranged (superseded) — book the new date.' };
  if (f.status !== 'scheduled') return { ok: false, why: `Fixture is ${f.status || 'not scheduled'}.` };
  if (!f.kickoffAt || Date.parse(f.kickoffAt) <= nowMs) return { ok: false, why: 'That fixture has already kicked off.' };
  return { ok: true };
}

/**
 * A booking whose fixture will not happen as booked: postponed, cancelled,
 * abandoned, superseded by a rearranged row, or gone from the registry. A
 * played fixture is NOT stranded — that booking was delivered.
 */
function strandedWhy(f) {
  if (!f) return 'Fixture no longer in the registry.';
  if (f.syncStatus === 'superseded') return 'Fixture rearranged (superseded) — the sponsor needs the new date.';
  if (['postponed', 'cancelled', 'abandoned'].includes(f.status)) return `Fixture ${f.status} — the sponsor needs a new date.`;
  return null;
}

/**
 * Availability grid: every sellable home fixture with each slot's holder.
 * Bookings on fixtures that are no longer sellable come back in `stranded`
 * (postponed, superseded, gone) so a person re-assigns them.
 */
function availability(fixtures, slots, nowMs = Date.now()) {
  const byId = {}; fixtures.forEach((f) => { byId[f.id] = f; });
  const grid = fixtures.filter((f) => slotEligible(f, nowMs).ok).map((f) => {
    const out = { fixture_id: f.id, kickoffAt: f.kickoffAt, date: londonDate(f.kickoffAt), label: londonLabel(f.kickoffAt), opponent: f.opponent || 'Opponent TBC', slots: {} };
    for (const p of Object.values(FIXTURE_PACKAGES)) {
      const s = slots.find((x) => x.fixture_id === f.id && x.slot === p.slot);
      out.slots[p.slot] = s ? { free: false, opportunity_id: s.opportunity_id, held_by: s.held_by, status: s.status } : { free: true };
    }
    return out;
  });
  const stranded = slots.filter((s) => strandedWhy(byId[s.fixture_id]))
    .map((s) => Object.assign({}, s, { why: strandedWhy(byId[s.fixture_id]) }));
  return { fixtures: grid, stranded };
}

/** Can this opportunity be marked won? Adds the per-fixture rules to the generic guard. */
function wonGuard(opp, slot) {
  const d = opp.data || {};
  if (NOT_OFFERED[d.package]) return NOT_OFFERED[d.package];
  if (!isFixturePackage(d.package)) return null;
  if (!d.package_approved_by) return 'A named person must approve the package and price first (Approve package).';
  if (!slot) return 'Book a home fixture for this package first — it is sold per game.';
  if (d.rebook_needed) return 'The booked fixture was postponed or rearranged — book the new date first.';
  return null;
}

/** What the club owes a per-fixture sponsor, and nothing it cannot deliver. */
function fulfilmentSteps(pkgKey, fixtureLabel) {
  const at = fixtureLabel ? ' — ' + fixtureLabel : '';
  if (pkgKey === 'matchball' || pkgKey === 'match') {
    return [
      'Booking confirmed to the sponsor' + at,
      'Name/logo received and approved by the sponsor for use',
      'Programme / team-sheet credit prepared' + at,
      'Matchday acknowledgement made (announcement / club channels)' + at,
      pkgKey === 'matchball' ? 'Match ball presented / photographed (with consent)' + at : 'Matchday photo or post shared with the sponsor (with consent)' + at,
      'Evidence of delivery sent to the sponsor',
      'Thank-you and renewal conversation',
    ];
  }
  return null;   // fall back to the general 12-step checklist
}

/** When to talk about renewing: a week after the game, or the agreed date. */
function renewalDate(opp, fixture) {
  const d = (opp && opp.data) || {};
  if (d.renewal_date && /^\d{4}-\d{2}-\d{2}$/.test(d.renewal_date)) return d.renewal_date;
  if (fixture && fixture.kickoffAt) return addDays(londonDate(fixture.kickoffAt), 7);
  return null;
}

// ── Outreach draft in the chairman's voice ───────────────────────────────
// Local, personal, proud, plain. Never needy, never jargon, never a price or
// a right the club cannot give. A person edits it, someone else approves it,
// and it is sent by hand from the club mailbox — this only writes a draft.
const NEVER_SAY = /\b(desperate|struggl\w*|surviv\w*|save the club|saving the club|relaunch\w*|new ownership|crisis|urgent(ly)?|act now|last chance|limited time|synerg\w*|leverage|pitch-side board|naming rights|hospitality)\b/i;
function draftIntro(org, opts = {}) {
  const name = String((org && org.name) || 'your business').trim();
  const who = (org && org.contact_name) ? String(org.contact_name).split(/\s+/)[0] : null;
  const area = (org && org.town) ? org.town : 'Rayners Lane';
  const sender = opts.sender || 'Pete Singh';
  const role = opts.senderRole || 'Chairman, Rayners Lane FC';
  const subject = `Rayners Lane FC — a local partnership with ${name}`;
  const body = [
    `${who ? 'Dear ' + who : 'Hello'},`,
    '',
    `I'm ${sender.split(' ')[0]}, chairman of Rayners Lane FC. We've played football in HA2 since 1933 and we're at Tithe Farm on Rayners Lane most Saturdays.`,
    '',
    `I'm writing to a small number of businesses in and around ${area} because we'd like the club to be more closely connected with the people and firms on our doorstep. ${name} stood out as one of them.`,
    '',
    'There are simple ways to be part of it — sponsoring the match ball or a home matchday, a place in the programme, or something bigger across a season. We would shape it around what is useful to you.',
    '',
    'If you would like to hear more, just reply and I will get in touch personally — or come down to a home game as our guest and see the club for yourself.',
    '',
    'Best wishes,',
    sender,
    role,
    'info@raynerslanefc.co.uk',
  ].join('\n');
  return { subject, body, clean: !NEVER_SAY.test(subject + ' ' + body) };
}

module.exports = {
  FIXTURE_PACKAGES, NOT_OFFERED, isFixturePackage, slotEligible, strandedWhy, availability, wonGuard, fulfilmentSteps, renewalDate,
  draftIntro, NEVER_SAY, londonDate, londonLabel, addDays,
};
