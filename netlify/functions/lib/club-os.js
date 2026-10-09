// ════════════════════════════════════════════════════════════════════════
//  CLUB OS — the rules. Pure functions, no I/O, fully unit-tested
//  (tests/club-os.test.js). netlify/functions/club-os.js does the storage.
//
//  Every rule here exists because a real person will do the thing it guards
//  against: double-click Save, redeem the same reward twice, email a sole
//  trader who never agreed to marketing, mark a grant "submitted" that nobody
//  sent, or let a sponsor enquiry sit for a fortnight. See docs/CLUB-OS.md.
// ════════════════════════════════════════════════════════════════════════
'use strict';

// ── Stage machines ─────────────────────────────────────────────────────────
// from-stage → allowed next stages. Anything not listed is refused, so a
// record can never skip the step that makes it trustworthy (e.g. an invoice
// cannot go draft → issued without approval; outreach cannot be "sent" unless
// it was approved first).
const FLOW = {
  task:        { open: ['in_progress', 'blocked', 'done', 'cancelled'], in_progress: ['blocked', 'done', 'cancelled', 'open'],
                 blocked: ['in_progress', 'cancelled', 'open'], done: ['open'], cancelled: ['open'] },
  enquiry:     { new: ['acknowledged', 'assigned', 'closed'], acknowledged: ['assigned', 'answered', 'closed'],
                 assigned: ['answered', 'closed'], answered: ['closed', 'assigned'], closed: ['assigned'] },
  opportunity: { research: ['qualified', 'not_interested', 'lost'], qualified: ['contact_approved', 'research', 'not_interested'],
                 contact_approved: ['contacted', 'qualified'], contacted: ['responded', 'not_interested', 'lost'],
                 responded: ['meeting', 'proposal', 'not_interested', 'lost'], meeting: ['proposal', 'not_interested', 'lost'],
                 proposal: ['negotiation', 'won', 'lost', 'not_interested'], negotiation: ['won', 'lost', 'proposal'],
                 won: [], lost: ['research'], not_interested: ['research'] },
  fulfilment:  { todo: ['done', 'not_applicable'], done: ['todo'], not_applicable: ['todo'] },
  invoice:     { draft: ['approved', 'void'], approved: ['issued', 'draft', 'void'], issued: ['part_paid', 'paid', 'overdue', 'void'],
                 part_paid: ['paid', 'overdue', 'void'], overdue: ['part_paid', 'paid', 'void'], paid: [], void: [] },
  outreach:    { draft: ['approved', 'withdrawn'], approved: ['sent', 'draft', 'withdrawn'], sent: ['replied', 'no_reply'],
                 replied: [], no_reply: ['replied'], withdrawn: ['draft'] },
  grant:       { discovered: ['eligibility_review', 'ineligible'], eligibility_review: ['eligible', 'ineligible', 'uncertain'],
                 uncertain: ['eligibility_review', 'eligible', 'ineligible'], eligible: ['preparing', 'ineligible'],
                 ineligible: ['eligibility_review'], preparing: ['awaiting_approval', 'eligible'],
                 awaiting_approval: ['submitted', 'preparing'], submitted: ['awarded', 'declined'], awarded: [], declined: [] },
  compliance:  { not_started: ['in_progress', 'complete', 'not_applicable'], in_progress: ['complete', 'not_started'],
                 overdue: ['in_progress', 'complete'], complete: ['in_progress'], not_applicable: ['not_started'] },
  comms:       { draft: ['review', 'withdrawn'], review: ['approved', 'draft', 'withdrawn'], approved: ['scheduled', 'published', 'draft', 'withdrawn'],
                 scheduled: ['published', 'approved', 'withdrawn'], published: ['withdrawn'], withdrawn: ['draft'] },
  analysis:    { open: ['reviewed'], reviewed: ['shared', 'open'], shared: ['reviewed'] },
};
const FIRST = { task: 'open', enquiry: 'new', opportunity: 'research', fulfilment: 'todo', invoice: 'draft',
  outreach: 'draft', grant: 'discovered', compliance: 'not_started', comms: 'draft', analysis: 'open' };
const CLOSED = new Set(['done', 'cancelled', 'closed', 'won', 'lost', 'not_interested', 'not_applicable', 'paid', 'void',
  'replied', 'withdrawn', 'ineligible', 'awarded', 'declined', 'complete', 'published', 'shared']);
const KINDS = Object.keys(FLOW);

// Moves that need something more than a click. Returned as a human sentence.
function guardTransition(item, to, ctx = {}) {
  const from = item.stage;
  const allowed = (FLOW[item.kind] || {})[from];
  if (!allowed) return `Unknown stage "${from}" for ${item.kind}.`;
  if (!allowed.includes(to)) return `A ${item.kind} cannot go from "${label(from)}" to "${label(to)}".`;
  const d = item.data || {};
  const needsOwner = { opportunity: ['contacted', 'meeting', 'proposal', 'negotiation', 'won'], enquiry: ['assigned', 'answered'],
    grant: ['preparing', 'awaiting_approval', 'submitted'], compliance: ['in_progress', 'complete'], comms: ['review'] };
  if ((needsOwner[item.kind] || []).includes(to) && !(ctx.owner || item.owner)) return 'Give it an owner first — someone has to be responsible.';
  if (item.kind === 'opportunity' && to === 'won' && !(ctx.value_pence || item.value_pence) && !item.in_kind)
    return 'Record the agreed value (or mark it in-kind) before marking it won.';
  if (item.kind === 'invoice' && to === 'approved' && !(item.value_pence > 0)) return 'An invoice needs an amount before it can be approved.';
  if (item.kind === 'invoice' && ['approved', 'issued'].includes(to) && !ctx.actor) return 'Approval must be recorded against a named person.';
  if (item.kind === 'invoice' && to === 'void' && !ctx.reason) return 'Say why the invoice is being voided.';
  if (item.kind === 'outreach' && to === 'approved' && !ctx.actor) return 'Approval must be recorded against a named person.';
  if (item.kind === 'outreach' && to === 'approved' && d.drafted_by && ctx.actor && norm(d.drafted_by) === norm(ctx.actor) && !ctx.allowSelfApprove)
    return 'Someone other than the person who drafted it should approve it.';
  if (item.kind === 'grant' && to === 'submitted' && !ctx.reference) return 'Record the funder’s confirmation/reference — a grant is only “submitted” when the funder has it.';
  if (item.kind === 'grant' && to === 'eligible' && !d.eligibility_note && !ctx.eligibility_note) return 'Write down why it is eligible (entity type, step level, project) before marking it eligible.';
  if (item.kind === 'compliance' && to === 'complete' && !(ctx.evidence || d.evidence)) return 'Say where the evidence is (document, reference, who holds it).';
  if (item.kind === 'comms' && to === 'approved' && !ctx.actor) return 'Approval must be recorded against a named person.';
  if (item.kind === 'comms' && to === 'approved' && d.drafted_by && ctx.actor && norm(d.drafted_by) === norm(ctx.actor) && !ctx.allowSelfApprove)
    return 'Someone other than the writer should approve it.';
  if (item.kind === 'comms' && to === 'scheduled' && !(ctx.publish_at || d.publish_at)) return 'Pick a publish date and time.';
  return null;
}

// ── Outreach permission (UK GDPR + PECR, ICO B2B guidance) ─────────────────
// Corporate subscribers (limited companies, LLPs, PLCs, public bodies) may be
// emailed on legitimate interests with an opt-out. Sole traders and some
// partnerships are "individual subscribers": they need consent (or soft
// opt-in). If we don't KNOW the legal form, treat it as individual — the
// protective default. A published email address is not permission.
const CORPORATE = new Set(['limited_company', 'llp', 'plc', 'public_body']);
function sendPermission(org, suppressed = new Set()) {
  if (!org) return { ok: false, why: 'No organisation on this record.' };
  const email = (org.contact_email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, why: 'No valid business email address recorded.' };
  const domain = '@' + email.split('@')[1];
  if (suppressed.has(email) || suppressed.has(domain)) return { ok: false, why: 'This address is on the suppression list (they asked not to be contacted).' };
  switch (org.permission) {
    case 'opted_out': case 'do_not_contact': return { ok: false, why: 'Marked do-not-contact.' };
    case 'research_only': return { ok: false, why: 'Research only — no lawful basis recorded yet.' };
    case 'legal_review': return { ok: false, why: 'Waiting for legal review.' };
    case 'express_consent': case 'existing_relationship': return { ok: true, basis: org.permission };
    case 'corporate_lawful_basis':
      if (!CORPORATE.has(org.legal_form)) return { ok: false, why: 'Lawful basis recorded as "corporate", but the business is not verified as a company. Sole traders and partnerships need consent.' };
      return { ok: true, basis: 'corporate_lawful_basis' };
    default: return { ok: false, why: 'Unknown permission state.' };
  }
}

// ── Prospect score — explainable, configurable, NOT a probability ──────────
const SCORE_WEIGHTS = { proximity: 20, audience: 20, community: 15, packageFit: 15, activity: 10, contactable: 10, value: 10 };
// Each factor is entered by a person as 0–1 (or computed from facts); the score
// shows its working so nobody mistakes it for a prediction.
function scoreProspect(f = {}, weights = SCORE_WEIGHTS) {
  const breakdown = {}; let total = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = Math.max(0, Math.min(1, Number(f[k]) || 0));
    breakdown[k] = Math.round(v * w); total += breakdown[k];
  }
  return { score: Math.min(100, total), breakdown, band: band(total, f) };
}
function band(total, f) {
  if (f.doNotContact) return 'Do not contact';
  if ((f.known || 0) < 0.5) return 'Research incomplete';
  if (f.inKind) return 'In-kind partnership opportunity';
  if (total >= 70) return 'High-priority financial sponsor';
  if (total >= 45) return 'Suitable small-business advertiser';
  return 'Community collaboration';
}
// Miles from Tithe Farm (51.5717, -0.3604) → proximity factor (core catchment = full marks).
const GROUND = { lat: 51.57173, lng: -0.36044 };
function milesFromGround(lat, lng) {
  const R = 3958.8, toR = (d) => d * Math.PI / 180;
  const dLat = toR(lat - GROUND.lat), dLng = toR(lng - GROUND.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(GROUND.lat)) * Math.cos(toR(lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function proximityFactor(miles) { if (miles == null || isNaN(miles)) return 0; if (miles <= 1.5) return 1; if (miles <= 3) return 0.75; if (miles <= 5) return 0.5; if (miles <= 8) return 0.25; return 0; }

// ── Sponsorship fulfilment: what "won" turns into ─────────────────────────
const FULFILMENT_STEPS = [
  'Agreement approved by the club', 'Contract signed (both parties)', 'Invoice issued', 'Logo received (vector/PNG)',
  'Logo usage rights recorded', 'Website listing approved by sponsor', 'Programme artwork delivered',
  'Matchday acknowledgement scheduled', 'Physical branding ordered (if any)', 'All agreed deliverables completed',
  'Evidence of delivery sent to sponsor', 'Renewal reminder set',
];

// ── Inventory (what the club actually sells; prices only when approved) ────
const INVENTORY = [
  { key: 'home-shirt', name: 'Home shirt', capacity: 1, exclusive: true },
  { key: 'away-shirt', name: 'Away shirt', capacity: 1, exclusive: true },
  { key: 'training-kit', name: 'Training kit', capacity: 1, exclusive: true },
  { key: 'match', name: 'Match sponsor (per home game)', capacity: null, per: 'fixture' },
  { key: 'matchball', name: 'Matchball sponsor (per home game)', capacity: null, per: 'fixture' },
  { key: 'player', name: 'Player sponsor (per player)', capacity: null, per: 'player' },
  { key: 'board', name: 'Pitch-side board', capacity: null },
  { key: 'programme', name: 'Programme advert', capacity: null },
  { key: 'website', name: 'Website partner placement', capacity: null },
  { key: 'hospitality', name: 'Matchday hospitality', capacity: null, per: 'fixture' },
  { key: 'community', name: 'Community project sponsor', capacity: null },
  { key: 'bespoke', name: 'Bespoke partnership', capacity: null },
];
// Would selling this package double-sell an exclusive right this season?
function inventoryClash(pkgKey, season, existingWon = []) {
  const pkg = INVENTORY.find((p) => p.key === pkgKey); if (!pkg || !pkg.exclusive) return null;
  const taken = existingWon.find((o) => (o.data || {}).package === pkgKey && (o.data || {}).season === season);
  return taken ? `${pkg.name} for ${season} is already sold (${taken.title}).` : null;
}

// ── Loyalty: eligibility is computed from VERIFIED attendance only ─────────
// Mirrors the ladder published in js/fan-zone.js — the public promise and the
// thing staff can honour are the same table.
function rewardStatus(visits, ladder, redeemedKeys = []) {
  const red = new Set(redeemedKeys);
  return ladder.map((r) => ({ ...r, earned: visits >= r.games, redeemed: red.has(r.key), redeemable: visits >= r.games && !red.has(r.key) }));
}

// ── Command Centre: what needs a human today ──────────────────────────────
function attention(items, today = new Date()) {
  const t0 = new Date(today.toISOString().slice(0, 10) + 'T00:00:00Z').getTime(), DAY = 864e5;
  const open = items.filter((i) => !CLOSED.has(i.stage));
  const out = { overdue: [], today: [], week: [], unowned: [], enquiriesOver48h: [], invoicesUnpaid: [], counts: {} };
  for (const i of open) {
    const due = i.due_date ? new Date(i.due_date + 'T00:00:00Z').getTime() : null;
    if (due != null && due < t0) out.overdue.push(i);
    else if (due != null && due === t0) out.today.push(i);
    else if (due != null && due <= t0 + 7 * DAY) out.week.push(i);
    if (!i.owner && ['task', 'enquiry', 'opportunity', 'grant', 'compliance', 'comms'].includes(i.kind)) out.unowned.push(i);
    if (i.kind === 'enquiry' && ['new'].includes(i.stage) && (today.getTime() - new Date(i.created_at).getTime()) > 48 * 3600e3) out.enquiriesOver48h.push(i);
    if (i.kind === 'invoice' && ['issued', 'part_paid', 'overdue'].includes(i.stage)) out.invoicesUnpaid.push(i);
    out.counts[i.kind] = (out.counts[i.kind] || 0) + 1;
  }
  const byDue = (a, b) => String(a.due_date || '9').localeCompare(String(b.due_date || '9'));
  for (const k of ['overdue', 'today', 'week', 'unowned']) out[k].sort(byDue);
  return out;
}

// ── Invoices: payments move the stage, never the other way round ──────────
function applyPayment(inv, amountPence) {
  const amt = Math.round(Number(amountPence));
  if (!(amt > 0)) return { error: 'Payment must be a positive amount.' };
  if (!['issued', 'part_paid', 'overdue'].includes(inv.stage)) return { error: `Payments can only be recorded on an issued invoice (this one is "${label(inv.stage)}").` };
  const paid = (inv.paid_pence || 0) + amt;
  if (paid > inv.value_pence) return { error: `That would take payments to £${(paid / 100).toFixed(2)}, more than the invoice (£${(inv.value_pence / 100).toFixed(2)}).` };
  return { paid_pence: paid, stage: paid === inv.value_pence ? 'paid' : 'part_paid' };
}

// ── Organisation identity: duplicate detection ────────────────────────────
function nameKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function hostOf(url) { try { return new URL(/^https?:/i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return null; } }
function findDuplicate(candidate, orgs) {
  const k = nameKey(candidate.name), h = candidate.website ? hostOf(candidate.website) : null;
  const e = (candidate.contact_email || '').toLowerCase();
  return orgs.find((o) => o.name_key === k || nameKey(o.name) === k || (h && o.website_host === h) || (e && (o.contact_email || '').toLowerCase() === e)) || null;
}

// ── Small helpers ──────────────────────────────────────────────────────────
function norm(s) { return String(s || '').trim().toLowerCase(); }
function label(s) { return String(s || '').replace(/_/g, ' '); }
function poundsToPence(v) { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[£,\s]/g, '')); return isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN; }

module.exports = {
  FLOW, FIRST, CLOSED, KINDS, guardTransition, sendPermission, CORPORATE, SCORE_WEIGHTS, scoreProspect,
  milesFromGround, proximityFactor, FULFILMENT_STEPS, INVENTORY, inventoryClash, rewardStatus, attention,
  applyPayment, nameKey, hostOf, findDuplicate, label, poundsToPence,
};
