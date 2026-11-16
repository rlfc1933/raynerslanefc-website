// ════════════════════════════════════════════════════════════════════════
//  COMMERCIAL LINKS — enquiry → organisation → agreed deal → fixture booking
//  → approved artwork → programme placement → fulfilment. Pure rules, no I/O
//  (tests/commercial-links.test.js). Storage stays in lib/rebirth/actions.js.
//
//  One canonical answer per question:
//    isConfirmed(opp)          — is this a confirmed sponsorship?
//    orgMatches(cand, orgs)    — which existing organisations is this?
//    artworkState(data)        — approved / awaiting approval / missing
//    fixtureSponsors(...)      — what the programme may offer for a fixture
//    fulfilmentGuard(...)      — may fulfilment be recorded against an edition?
// ════════════════════════════════════════════════════════════════════════
'use strict';

// Only these stages are an agreed deal. Everything earlier is a proposal.
const CONFIRMED_STAGES = ['won', 'agreed'];
function isConfirmed(opp) { return !!opp && opp.kind !== 'enquiry' && CONFIRMED_STAGES.includes(String(opp.stage || '')); }

// Case- and whitespace-insensitive name; punctuation and "Ltd" style suffixes
// are ignored so "Hanlon  Dry Lining Ltd." matches "hanlon dry lining".
function normName(s) {
  return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ltd|limited|plc|llp|co|company|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|btinternet|sky|virginmedia|talktalk|protonmail|msn)\./;
function domainOf(v) {
  let s = String(v || '').trim().toLowerCase(); if (!s) return null;
  if (s.indexOf('@') > -1) { s = s.split('@').pop(); if (FREE_MAIL.test(s)) return null; return s.replace(/^www\./, ''); }
  try { return new URL(/^https?:/.test(s) ? s : 'https://' + s).hostname.replace(/^www\./, ''); } catch (e) { return null; }
}
// Every existing organisation this candidate could be. The caller asks a person
// to confirm before reusing one; it never silently picks between several.
function orgMatches(cand, orgs) {
  const n = normName(cand && cand.name);
  const doms = [domainOf(cand && cand.website), domainOf(cand && cand.contact_email)].filter(Boolean);
  return (orgs || []).filter((o) => {
    if (n && normName(o.name) === n) return true;
    const od = [o.website_host || domainOf(o.website), domainOf(o.contact_email)].filter(Boolean);
    return doms.some((d) => od.includes(d));
  }).map((o) => ({ id: o.id, name: o.name, relationship: o.relationship || null }));
}

// Artwork: a logo file is not approval. Approved needs the file AND a named approver.
function artworkState(d) {
  d = d || {};
  if (!d.artwork_path) return 'missing';
  if (d.artwork_status === 'approved' && d.artwork_approved_by) return 'approved';
  return 'awaiting_approval';
}
function artworkApproveGuard(opp, actor) {
  const d = (opp && opp.data) || {};
  if (!d.artwork_path) return 'There is no artwork to approve. Add the sponsor’s artwork file first.';
  if (!actor) return 'Approval must be recorded against a named person.';
  return null;
}

// The booking conflict a person sees when a slot is already taken.
function conflictMessage(slot, fixture, holder) {
  const what = slot === 'matchball' ? 'match-ball' : 'matchday';
  return `The ${what} slot for ${(fixture && fixture.opponent) || 'that match'} is already taken` +
    (holder && holder.title ? ` by “${holder.title}”` : '') + (holder && holder.stage ? ` (${String(holder.stage).replace(/_/g, ' ')})` : '') +
    '. Release that booking first or choose another home fixture.';
}

const SLOT_FIELD = { matchball: 'ballSponsor', matchday: 'matchSponsor' };
// What the programme editor may offer for ONE fixture. Only a confirmed deal
// holding that fixture's slot is offered; proposals are listed as not confirmed.
// slots: hq_fixture_slots rows; opps: hq_items opportunities; orgs: hq_orgs.
function fixtureSponsors(fixtureId, slots, opps, orgs) {
  const oppById = {}; (opps || []).forEach((o) => { oppById[o.id] = o; });
  const orgById = {}; (orgs || []).forEach((o) => { orgById[o.id] = o; });
  const offers = [], notConfirmed = [], conflicts = [];
  const mine = (slots || []).filter((s) => String(s.fixture_id) === String(fixtureId));
  const bySlot = {};
  mine.forEach((s) => { (bySlot[s.slot] = bySlot[s.slot] || []).push(s); });
  Object.keys(bySlot).forEach((k) => { if (bySlot[k].length > 1) conflicts.push({ slot: k, opportunity_ids: bySlot[k].map((s) => s.opportunity_id), why: 'two bookings for the same slot' }); });
  // A deal that says it holds this fixture but has no slot row is a conflict too.
  (opps || []).forEach((o) => {
    const d = o.data || {};
    if (String(d.fixture_id || '') === String(fixtureId) && !mine.some((s) => s.opportunity_id === o.id))
      conflicts.push({ slot: d.slot || null, opportunity_ids: [o.id], why: 'the deal says it is booked here but holds no slot' });
  });
  mine.forEach((s) => {
    const o = oppById[s.opportunity_id]; if (!o) { conflicts.push({ slot: s.slot, opportunity_ids: [s.opportunity_id], why: 'booking points at a missing deal' }); return; }
    const d = o.data || {}, org = orgById[o.org_id || d.booking_org_id] || null;
    const row = { opportunity_id: o.id, org_id: o.org_id || d.booking_org_id || null, slot: s.slot, field: SLOT_FIELD[s.slot] || null,
      sponsor: (org && org.name) || String(o.title || '').replace(/\s+—\s+.*$/, ''), stage: o.stage,
      artwork: artworkState(d), artwork_path: artworkState(d) === 'approved' ? d.artwork_path : null,
      fulfilled_edition: d.fulfilled_edition || null };
    if (isConfirmed(o) && s.status === 'confirmed') offers.push(row);
    else notConfirmed.push(Object.assign(row, { why: isConfirmed(o) ? 'booking not confirmed' : 'deal not agreed (' + String(o.stage).replace(/_/g, ' ') + ')' }));
  });
  return { offers, notConfirmed, conflicts };
}

// Fulfilment is recorded only against a published edition, never a draft.
function fulfilmentGuard(opp, result) {
  if (!opp) return 'That deal no longer exists.';
  if (!isConfirmed(opp)) return 'Only a confirmed sponsorship can be fulfilled.';
  const r = result || {};
  if (!r.editionId) return 'No published edition id — fulfilment is not recorded for drafts or previews.';
  if (r.published !== true) return 'The edition is not published yet — fulfilment is recorded when it is.';
  return null;
}

module.exports = { CONFIRMED_STAGES, isConfirmed, normName, domainOf, orgMatches, artworkState, artworkApproveGuard,
  conflictMessage, fixtureSponsors, fulfilmentGuard, SLOT_FIELD };
