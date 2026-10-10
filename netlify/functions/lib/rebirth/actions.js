// ════════════════════════════════════════════════════════════════════════
//  BACK THE LANE / RUN THE LANE — club-os API actions.
//  Installed into netlify/functions/club-os.js's action table; uses its
//  storage helpers so there is still ONE API, ONE audit log and ONE password
//  check. Rules live in the sibling pure modules and are unit-tested.
//  Nothing here sends a message, posts, publishes or moves money.
// ════════════════════════════════════════════════════════════════════════
'use strict';
const crypto = require('crypto');
const IMP = require('./prospect-import');
const SJ = require('./sponsor-journey');
const ATT = require('./attendance');
const VOL = require('./volunteers');
const FIN = require('./finance');
const SC = require('./scorecard');
const SEEDS = require('./seeds');

const SEASON = () => process.env.FWP_SEASON || '2026-2027';
const SYSTEM = 'Club OS (automatic)';

function install(A, H) {
  const { sb, q, audit, str, fail, getItem, getOrg, UUID, DATE, OS } = H;
  const today = () => SJ.londonDate(new Date().toISOString());
  const soft = async (p, fallback) => { try { return await p; } catch (e) { if (e.notSetUp) return fallback; throw e; } };

  // ── The registry, read directly (with sync_status, which the public read
  //    layer does not carry). Same shaping as everything else on the site.
  async function registry() {
    const READ = require('../football/read');
    const [teams, rows] = await Promise.all([
      soft(sb('GET', 'football_teams?select=id,canonical_name,crest_asset_path'), null),
      soft(sb('GET', 'football_fixtures?select=*&season=eq.' + q(SEASON()) + '&order=scheduled_kickoff_at.asc'), null),
    ]);
    if (!rows) return { fixtures: [], missing: true };
    const tm = {}; (teams || []).forEach((t) => { tm[t.id] = t; });
    return { fixtures: rows.map((f) => Object.assign(READ.shapeFixture(f, tm), { syncStatus: f.sync_status || null, firstTeam: f.first_team !== false })) };
  }
  const brief = (f) => f && { id: f.id, opponent: f.opponent, kickoffAt: f.kickoffAt, date: SJ.londonDate(f.kickoffAt), label: SJ.londonLabel(f.kickoffAt), isHome: f.isHome, status: f.status, venue: f.venue || null };

  // ── Sponsor slots: a postponed or rearranged fixture frees its slot and
  //    flags the deal for re-booking — the commitment follows the fixture.
  async function reconcileSlots(fixtures) {
    const slots = (await soft(sb('GET', 'hq_fixture_slots?select=*'), [])) || [];
    const byId = {}; fixtures.forEach((f) => { byId[f.id] = f; });
    const freed = [];
    for (const s of slots) {
      const why = SJ.strandedWhy(byId[s.fixture_id]);
      if (!why || !fixtures.length) continue;   // no registry → never free anything on a guess
      await sb('DELETE', 'hq_fixture_slots?id=eq.' + q(s.id), null, 'return=minimal');
      const opp = await getItem(s.opportunity_id);
      if (opp) {
        const data = Object.assign({}, opp.data, { rebook_needed: true, rebook_reason: why, previous_fixture_id: s.fixture_id, fixture_id: null });
        await sb('PATCH', 'hq_items?id=eq.' + q(opp.id), { data, next_action: 'Re-book the sponsor on the rearranged/next home fixture and tell them' }, 'return=minimal');
      }
      await audit(SYSTEM, 'release-slot', 'item', s.opportunity_id, { fixture_id: s.fixture_id, slot: s.slot }, null, why);
      freed.push(Object.assign({}, s, { why }));
    }
    return freed;
  }

  // ═══ PROSPECT IMPORT ═════════════════════════════════════════════════
  A.importPreview = async (b) => {
    const orgs = await sb('GET', 'hq_orgs?select=id,name,name_key,website_host,contact_email,relationship');
    const p = IMP.preview(b.csv, orgs || [], { source: b.source });
    return p.ok ? Object.assign({ ok: true }, p) : fail(p.error);
  };
  A.importStage = async (b, actor) => {
    const source = str(b.source, 300);
    if (!source) return fail('Describe where this list came from (e.g. "Local business research, Sept 2026 — public websites").');
    const orgs = await sb('GET', 'hq_orgs?select=id,name,name_key,website_host,contact_email,relationship');
    const p = IMP.preview(b.csv, orgs || [], { source });   // re-validated here: the browser's preview is never trusted
    if (!p.ok) return fail(p.error);
    const hash = crypto.createHash('sha256').update(String(b.csv) + '\n' + source).digest('hex');
    const ex = await sb('GET', 'hq_import_batches?content_hash=eq.' + q(hash) + '&select=*');
    if (ex && ex[0]) return { ok: true, duplicate: true, batch: ex[0] };
    const [batch] = await sb('POST', 'hq_import_batches', { filename: str(b.filename, 200), source_label: source, content_hash: hash, uploaded_by: actor, rows_total: p.rows.length });
    let staged = 0; const skipped = [];
    for (const r of p.rows) {
      if (!['ok', 'warn'].includes(r.status)) { skipped.push({ line: r.line, why: r.issues[0] || r.status }); continue; }
      try { await sb('POST', 'hq_orgs', IMP.stagedOrg(r.org, batch.id, actor), 'return=minimal'); staged++; }
      catch (e) { if (e.duplicate) skipped.push({ line: r.line, why: 'Already on record.' }); else throw e; }
    }
    const summary = { counts: p.counts, skipped: skipped.slice(0, 200) };
    await sb('PATCH', 'hq_import_batches?id=eq.' + q(batch.id), { rows_staged: staged, rows_skipped: skipped.length, summary }, 'return=minimal');
    await audit(actor, 'import', 'batch', batch.id, null, { source, staged, skipped: skipped.length }, 'Staged as research-only prospects; nobody contacted.');
    return { ok: true, batch: Object.assign({}, batch, { rows_staged: staged, rows_skipped: skipped.length, summary }) };
  };
  A.importBatches = async () => ({ ok: true, batches: (await soft(sb('GET', 'hq_import_batches?select=*&order=created_at.desc&limit=50'), [])) || [] });
  A.checkEmail = async (b, actor) => {
    if (!UUID.test(b.id || '')) return fail('Bad id.');
    const org = await getOrg(b.id); if (!org) return fail('Not found.');
    if (!org.contact_email) return fail('There is no email address to check.');
    const how = str(b.note, 300); if (!how) return fail('Say how you checked it (e.g. "on their own website contact page, 9 Oct").');
    const [after] = await sb('PATCH', 'hq_orgs?id=eq.' + q(b.id), { email_checked_at: today(), permission_note: [org.permission_note, 'Email checked ' + today() + ' by ' + actor + ': ' + how].filter(Boolean).join(' · ') });
    await audit(actor, 'check-email', 'org', b.id, { email_checked_at: org.email_checked_at || null }, { email_checked_at: after.email_checked_at }, how);
    return { ok: true, org: after };
  };

  // ═══ OUTREACH DRAFTS (chairman's voice; drafts only) ═════════════════
  A.draftOutreach = async (b, actor) => {
    const ids = (Array.isArray(b.org_ids) ? b.org_ids : [b.org_id]).filter((x) => UUID.test(x || ''));
    if (!ids.length) return fail('Choose the businesses to draft for.');
    if (ids.length > 10) return fail('Draft at most 10 at a time — small batches of highly relevant businesses get real replies.');
    const sup = await H.suppressionSet();
    const out = [];
    for (const id of ids) {
      const org = await getOrg(id); if (!org) continue;
      const perm = OS.sendPermission(org, sup);
      if (/opted|do_not/.test(org.permission) || /suppression/.test(perm.why || '')) { out.push({ org: org.name, skipped: perm.why || 'Do not contact.' }); continue; }
      const dr = SJ.draftIntro(org, { sender: str(b.sender, 80) || undefined });
      const r = await A.create({ kind: 'outreach', title: 'Introduction — ' + org.name, org_id: org.id, idempotency_key: 'draft:' + org.id + ':' + today(),
        next_action: perm.ok ? 'Edit, then ask someone else to approve' : 'Not sendable yet: ' + perm.why,
        data: { to: org.contact_email || null, subject: dr.subject, body: dr.body, offer: 'Match-ball / matchday / programme / season (to be shaped with them)' }, source: 'draft-assistant' }, actor);
      out.push({ org: org.name, item_id: r.item && r.item.id, duplicate: !!r.duplicate, sendable: perm.ok, why: perm.ok ? null : perm.why });
    }
    return { ok: true, drafts: out, note: 'Drafts only. Each needs approval by someone other than the drafter, then a person sends it from the club mailbox.' };
  };

  // ═══ SPONSOR JOURNEY ═════════════════════════════════════════════════
  A.availability = async () => {
    const reg = await registry();
    const freed = await reconcileSlots(reg.fixtures);
    const slots = (await soft(sb('GET', 'hq_fixture_slots?select=*'), [])) || [];
    const opps = slots.length ? await sb('GET', 'hq_items?kind=eq.opportunity&select=id,title,stage,data&limit=1000') : [];
    const rebook = (await sb('GET', 'hq_items?kind=eq.opportunity&closed_at=is.null&select=id,title,owner,data&limit=1000') || []).filter((o) => (o.data || {}).rebook_needed);
    const grid = SJ.availability(reg.fixtures, slots);
    const title = {}; (opps || []).forEach((o) => { title[o.id] = o.title; });
    grid.fixtures.forEach((f) => Object.values(f.slots).forEach((s) => { if (s.opportunity_id) s.title = title[s.opportunity_id] || null; }));
    return { ok: true, registryMissing: !!reg.missing, packages: SJ.FIXTURE_PACKAGES, fixtures: grid.fixtures, freed, rebook };
  };
  A.approvePackage = async (b, actor) => {
    if (!UUID.test(b.id || '')) return fail('Bad id.');
    const opp = await getItem(b.id); if (!opp || opp.kind !== 'opportunity') return fail('Not a deal.');
    if (OS.isClosed(opp.kind, opp.stage)) return fail('This deal is finished.');
    const pkg = str(b.package, 40);
    if (SJ.NOT_OFFERED[pkg]) return fail(SJ.NOT_OFFERED[pkg]);
    if (!OS.INVENTORY.find((p) => p.key === pkg)) return fail('Choose a package.');
    const clash = OS.inventoryClash(pkg, (opp.data || {}).season || str(b.season, 20), await sb('GET', 'hq_items?kind=eq.opportunity&stage=eq.won&select=title,data'));
    if (clash) return fail(clash);
    const price = OS.poundsToPence(b.price);
    if (price == null || Number.isNaN(price) || price <= 0) return fail('Enter the agreed price in pounds.');
    const data = Object.assign({}, opp.data, { package: pkg, package_price_pence: price, package_approved_by: actor, package_approved_at: new Date().toISOString() });
    const [after] = await sb('PATCH', 'hq_items?id=eq.' + q(opp.id), { data, value_pence: price });
    await audit(actor, 'approve-package', 'item', opp.id, { package: (opp.data || {}).package || null }, { package: pkg, price_pence: price });
    return { ok: true, item: after };
  };
  A.book = async (b, actor) => {
    if (!UUID.test(b.opportunity_id || '')) return fail('Bad id.');
    const opp = await getItem(b.opportunity_id); if (!opp || opp.kind !== 'opportunity') return fail('Not a deal.');
    if (OS.isClosed(opp.kind, opp.stage)) return fail('This deal is finished.');
    const pkg = SJ.FIXTURE_PACKAGES[(opp.data || {}).package];
    if (!pkg) return fail('Approve a match-ball or matchday package for this deal first.');
    const reg = await registry();
    if (reg.missing) return fail('The fixture registry is not available — nothing was booked.');
    const f = reg.fixtures.find((x) => x.id === b.fixture_id);
    const ok = SJ.slotEligible(f); if (!ok.ok) return fail(ok.why);
    const mine = await sb('GET', 'hq_fixture_slots?opportunity_id=eq.' + q(opp.id) + '&select=*');
    if (mine && mine[0]) return fail('This deal already holds a fixture. Release it first to change the date.');
    try { await sb('POST', 'hq_fixture_slots', { fixture_id: f.id, slot: pkg.slot, opportunity_id: opp.id, held_by: actor }, 'return=minimal'); }
    catch (e) { if (e.duplicate) return fail(`The ${pkg.slot === 'matchball' ? 'match-ball' : 'matchday'} slot for ${f.opponent || 'that match'} is already taken. Choose another home fixture.`); throw e; }
    const data = Object.assign({}, opp.data, { fixture_id: f.id, fixture_label: `${f.opponent || 'Home match'} · ${SJ.londonLabel(f.kickoffAt)}`, fixture_date: SJ.londonDate(f.kickoffAt), rebook_needed: false, rebook_reason: null });
    const [after] = await sb('PATCH', 'hq_items?id=eq.' + q(opp.id), { data, next_action: opp.next_action && /Re-book/.test(opp.next_action) ? 'Tell the sponsor the new date' : 'Confirm the date with the sponsor, then mark it won' });
    await audit(actor, 'book-slot', 'item', opp.id, null, { fixture_id: f.id, slot: pkg.slot });
    return { ok: true, item: after };
  };
  A.release = async (b, actor) => {
    if (!UUID.test(b.opportunity_id || '')) return fail('Bad id.');
    const reason = str(b.reason, 300); if (!reason) return fail('Say why the booking is being released.');
    const mine = await sb('GET', 'hq_fixture_slots?opportunity_id=eq.' + q(b.opportunity_id) + '&select=*');
    if (!mine || !mine[0]) return fail('This deal holds no fixture.');
    if (mine[0].status === 'confirmed' && !b.confirm) return fail('This booking was confirmed with the sponsor. Tell them first, then release with confirmation.', { needsConfirm: true });
    await sb('DELETE', 'hq_fixture_slots?id=eq.' + q(mine[0].id), null, 'return=minimal');
    const opp = await getItem(b.opportunity_id);
    await sb('PATCH', 'hq_items?id=eq.' + q(opp.id), { data: Object.assign({}, opp.data, { fixture_id: null, fixture_label: null, fixture_date: null }) }, 'return=minimal');
    await audit(actor, 'release-slot', 'item', opp.id, { fixture_id: mine[0].fixture_id }, null, reason);
    return { ok: true };
  };
  // Website enquiry → a deal at "responded", owned, with the enquiry assigned.
  A.convertEnquiry = async (b, actor) => {
    if (!UUID.test(b.id || '')) return fail('Bad id.');
    const enq = await getItem(b.id); if (!enq || enq.kind !== 'enquiry') return fail('Not an enquiry.');
    const owner = str(b.owner, 120) || enq.owner; if (!owner) return fail('Who will own this relationship?');
    const key = 'enq:' + enq.id + ':opp';
    const ex = await sb('GET', 'hq_items?idempotency_key=eq.' + q(key) + '&select=*');
    if (ex && ex[0]) return { ok: true, item: ex[0], duplicate: true };
    const org = enq.org_id ? await getOrg(enq.org_id) : null;
    const pkg = SJ.FIXTURE_PACKAGES[str(b.package, 40)] ? str(b.package, 40) : null;
    const [opp] = await sb('POST', 'hq_items', { kind: 'opportunity', stage: 'responded', title: (org ? org.name : enq.title) + ' — sponsorship', owner, org_id: enq.org_id, parent_id: enq.id,
      next_action: pkg ? 'Approve the package and book a home fixture' : 'Agree a package and send a proposal', idempotency_key: key, source: 'enquiry', created_by: actor,
      data: { package: pkg, season: str(b.season, 20) || null, enquiry_interest: (enq.data || {}).interest || null } });
    await audit(actor, 'create', 'item', opp.id, null, { kind: 'opportunity', title: opp.title, stage: opp.stage, from_enquiry: enq.id });
    if (['new', 'acknowledged'].includes(enq.stage)) await A.move({ id: enq.id, to: 'assigned', owner }, actor);
    return { ok: true, item: opp };
  };
  A.renew = async (b, actor) => {
    if (!UUID.test(b.id || '')) return fail('Bad id.');
    const won = await getItem(b.id); if (!won || won.kind !== 'opportunity' || won.stage !== 'won') return fail('Only a won deal can be renewed.');
    const org = won.org_id ? await getOrg(won.org_id) : null;
    if (org && /opted|do_not/.test(org.permission)) return fail('This business asked not to be contacted.');
    const r = await A.create({ kind: 'opportunity', title: won.title.replace(/ — renewal.*$/, '') + ' — renewal', org_id: won.org_id, owner: won.owner, parent_id: won.id,
      next_action: 'Send evidence of what was delivered, then ask about renewing', idempotency_key: 'renew:' + won.id, source: 'renewal',
      data: { renewal_of: won.id, package: (won.data || {}).package || null, season: str(b.season, 20) || (won.data || {}).season || null } }, actor);
    if (!r.ok || r.duplicate) return r;
    // An existing sponsor is an existing relationship: straight to "responded".
    const [after] = await sb('PATCH', 'hq_items?id=eq.' + q(r.item.id), { stage: 'responded' });
    await audit(actor, 'move', 'item', r.item.id, { stage: 'research' }, { stage: 'responded' }, 'Renewal of an existing sponsor');
    return { ok: true, item: after };
  };

  // Called from A.move: what a sponsor-journey stage change needs and sets in motion.
  H.journey = {
    async ctxFor(item) { if (item.kind !== 'opportunity') return {}; const s = await soft(sb('GET', 'hq_fixture_slots?opportunity_id=eq.' + q(item.id) + '&select=*'), []); return { slot: (s && s[0]) || null }; },
    async afterMove(after, before, actor, mk) {
      if (after.kind !== 'opportunity') return;
      const d = after.data || {};
      if (['lost', 'not_interested'].includes(after.stage)) {
        const s = await soft(sb('GET', 'hq_fixture_slots?opportunity_id=eq.' + q(after.id) + '&select=*'), []);
        if (s && s[0]) { await sb('DELETE', 'hq_fixture_slots?id=eq.' + q(s[0].id), null, 'return=minimal'); await audit(actor, 'release-slot', 'item', after.id, { fixture_id: s[0].fixture_id }, null, 'Deal ' + after.stage); }
      }
      if (after.stage === 'won' && SJ.isFixturePackage(d.package)) {
        await sb('PATCH', 'hq_fixture_slots?opportunity_id=eq.' + q(after.id), { status: 'confirmed' }, 'return=minimal');
      }
    },
    fulfilmentFor(after) { const d = after.data || {}; return SJ.fulfilmentSteps(d.package, d.fixture_label); },
    renewalDue(after) { const d = after.data || {}; return SJ.renewalDate(after, d.fixture_date ? { kickoffAt: d.fixture_date + 'T15:00:00Z' } : null); },
  };

  // ═══ ATTENDANCE ══════════════════════════════════════════════════════
  async function attendanceData() {
    const reg = await registry();
    const [hq, md, ci] = await Promise.all([
      soft(sb('GET', 'hq_attendance?select=*&order=match_date.desc&limit=200'), []),
      soft(sb('GET', 'md_records?select=fixture_id,status,attendance_official,fixture_snapshot&limit=500'), []),
      soft(sb('GET', 'attendance?home=eq.true&select=lane_no,match_date,home&limit=20000'), []),
    ]);
    const figures = ATT.verifiedFigures(hq || [], md || []);
    const byFixture = {}; reg.fixtures.forEach((f) => { byFixture[f.id] = f; });
    const missing = ATT.missingFigures(reg.fixtures, figures).slice(-6).reverse().map(brief);
    return { reg, figures, progress: ATT.progress(figures), checkins: ATT.checkins(ci || []), missing,
      unverified: (hq || []).filter((r) => !r.verified_by).map((r) => ({ id: r.id, date: r.match_date, opponent: r.opponent, headcount: r.headcount, recorded_by: r.recorded_by })) };
  }
  A.attendance = async () => {
    const a = await attendanceData();
    const played = a.reg.fixtures.filter((f) => f.isHome !== false && f.syncStatus !== 'superseded' && !['postponed', 'cancelled'].includes(f.status) && f.kickoffAt && Date.parse(f.kickoffAt) < Date.now()).map(brief).reverse();
    return { ok: true, registryMissing: !!a.reg.missing, figures: a.figures, progress: a.progress, checkins: a.checkins, missing: a.missing, unverified: a.unverified, playedHome: played, methods: ATT.METHODS };
  };
  A.recordAttendance = async (b, actor) => {
    const reg = await registry();
    const f = reg.fixtures.find((x) => x.id === b.fixture_id);
    const why = ATT.recordGuard(f, b.headcount); if (why) return fail(why);
    const method = ATT.METHODS.includes(b.method) ? b.method : null; if (!method) return fail('How was it counted?');
    const ex = await sb('GET', 'hq_attendance?fixture_id=eq.' + q(f.id) + '&select=*');
    if (ex && ex[0]) {
      if (ex[0].verified_by) return fail(`Already recorded (${ex[0].headcount}) and confirmed by ${ex[0].verified_by}.`);
      if (String(ex[0].recorded_by).toLowerCase() !== String(actor).toLowerCase()) return fail(`Already recorded (${ex[0].headcount}) by ${ex[0].recorded_by} — confirm it instead, or ask them to correct it.`);
      const [after] = await sb('PATCH', 'hq_attendance?id=eq.' + q(ex[0].id), { headcount: Number(b.headcount), method, note: str(b.note, 300) });
      await audit(actor, 'correct-attendance', 'attendance', ex[0].id, { headcount: ex[0].headcount }, { headcount: after.headcount });
      return { ok: true, record: after };
    }
    const [row] = await sb('POST', 'hq_attendance', { fixture_id: f.id, match_date: SJ.londonDate(f.kickoffAt), opponent: f.opponent || null, headcount: Number(b.headcount), method, recorded_by: actor, note: str(b.note, 300) });
    await audit(actor, 'record-attendance', 'attendance', row.id, null, { fixture_id: f.id, headcount: row.headcount, method });
    return { ok: true, record: row };
  };
  A.verifyAttendance = async (b, actor) => {
    if (!UUID.test(b.id || '')) return fail('Bad id.');
    const r = await sb('GET', 'hq_attendance?id=eq.' + q(b.id) + '&select=*'); const row = r && r[0];
    const why = ATT.verifyGuard(row, actor); if (why) return fail(why);
    const [after] = await sb('PATCH', 'hq_attendance?id=eq.' + q(b.id) + '&verified_by=is.null', { verified_by: actor, verified_at: new Date().toISOString() });
    if (!after) return fail('Someone confirmed it a moment ago.');
    await audit(actor, 'verify-attendance', 'attendance', b.id, null, { headcount: after.headcount });
    return { ok: true, record: after };
  };

  // ═══ VOLUNTEERS ══════════════════════════════════════════════════════
  // Website offers (already stored in `submissions`) → volunteer offers. Safe to re-run.
  A.collectVolunteerOffers = async (b, actor) => {
    const subs = (await soft(sb('GET', 'submissions?type=eq.volunteer&select=*&order=created_at.asc&limit=500'), [])) || [];
    let made = 0;
    for (const s of subs) { const r = await intakeVolunteer(s, actor); if (r && r.ok && !r.duplicate) made++; }
    return { ok: true, collected: made, seen: subs.length };
  };
  async function intakeVolunteer(sub, actor) {
    const p = sub.payload || sub.fields || {};
    const name = str(sub.name || p.name, 120) || 'Volunteer';
    const role = str(p.role || p.interest, 120);
    return A.create({ kind: 'volunteer_offer', title: `Offer — ${name}${role ? ' (' + role + ')' : ''}`, idempotency_key: 'submission:' + sub.id, source: 'website-form',
      due_date: SJ.addDays(today(), 3), next_action: 'Thank them and suggest an approved role',
      data: { name, email: str(sub.email || p.email, 200), phone: str(sub.phone || p.phone, 40), role_interest: role, message: str(sub.message || p.message, 2000), submission_id: sub.id, is_minor: !!sub.is_minor } }, actor || 'website');
  }
  H.intakeVolunteer = intakeVolunteer;
  A.volunteerInstructions = async (b) => {
    const offer = await getItem(b.id); if (!offer || offer.kind !== 'volunteer_offer') return fail('Not a volunteer offer.');
    const role = offer.parent_id ? await getItem(offer.parent_id) : null; if (!role) return fail('Link the offer to a role first.');
    return { ok: true, text: VOL.instructionsFor(role, offer), to: (offer.data || {}).email || null, protections: VOL.protections(role) };
  };
  H.volunteer = {
    async ctxFor(item, b) {
      if (item.kind === 'volunteer_offer') {
        const role = item.parent_id ? await getItem(item.parent_id) : (UUID.test(b.role_id || '') ? await getItem(b.role_id) : null);
        return { role: role && role.kind === 'volunteer_role' ? role : null, checks_confirmed_by: str(b.checks_confirmed_by, 120), hours: b.hours };
      }
      if (item.kind === 'volunteer_role') return { protections_confirmed_by: str(b.protections_confirmed_by, 120) };
      return {};
    },
    patch(item, ctx, b, patch, data) {
      if (item.kind === 'volunteer_offer') {
        if (ctx.role && !item.parent_id) patch.parent_id = ctx.role.id;
        if (ctx.checks_confirmed_by) data.checks_confirmed_by = ctx.checks_confirmed_by;
        if (b.to === 'delivered' && ctx.hours != null && ctx.hours !== '') data.hours = Number(ctx.hours);
        if (b.to === 'recognised') data.recognition = ctx.reason;
      }
      if (item.kind === 'volunteer_role' && ctx.protections_confirmed_by) data.protections_confirmed_by = ctx.protections_confirmed_by;
      if (item.kind === 'proposal' && ['approved', 'declined'].includes(b.to)) { data.decision = ctx.reason; data.decided_by = ctx.actor; data.decided_at = new Date().toISOString(); }
    },
    async afterMove(after, actor, mk) {
      if (after.kind === 'volunteer_offer' && after.stage === 'assigned') {
        const role = await getItem(after.parent_id);
        await mk({ kind: 'task', title: `Send instructions to ${(after.data || {}).name || 'volunteer'} — ${role ? role.title : ''}`, parent_id: after.id, owner: (role && (role.data || {}).coordinator) || after.owner,
          due_date: SJ.addDays(today(), 2), idempotency_key: 'vol:' + after.id + ':instructions', source: 'volunteer',
          data: { area: 'Community', instructions: role ? VOL.instructionsFor(role, after) : null } });
      }
      if (after.kind === 'volunteer_offer' && after.stage === 'delivered') {
        await mk({ kind: 'task', title: `Thank ${(after.data || {}).name || 'the volunteer'} and recognise their help`, parent_id: after.id, owner: after.owner,
          due_date: SJ.addDays(today(), 7), idempotency_key: 'vol:' + after.id + ':thanks', source: 'volunteer', data: { area: 'Community' } });
      }
    },
  };

  // ═══ FINANCE (confidential) ══════════════════════════════════════════
  function financeSession(b, event) {
    const AUTH = require('../md-auth');
    const h = (event && event.headers) || {};
    const raw = h.authorization || h.Authorization || '';
    const token = /^Bearer\s+/i.test(raw) ? raw.replace(/^Bearer\s+/i, '').trim() : (b.token || '');
    const s = token ? AUTH.verify(token) : null;
    if (!s) return { ok: false, why: 'Club finances need your personal staff sign-in (not the committee password).' };
    if (!(AUTH.has(s, AUTH.CAP.FINANCE) || (s.role === 'Treasurer' && s.auth === 'custom')))
      return { ok: false, why: 'Your role does not include club finances. The chairman can grant it.' };
    return { ok: true, actor: AUTH.actorOf(s), sess: s };
  }
  H.financeSession = financeSession;
  async function financeModel() {
    const [lines, inv, reg] = await Promise.all([
      sb('GET', 'hq_finance_lines?archived_at=is.null&select=*&order=created_at.asc&limit=1000'),
      sb('GET', 'hq_items?kind=eq.invoice&select=data,paid_pence'), registry()]);
    const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString();
    const collected = (inv || []).flatMap((i) => (i.data || {}).payments || []).filter((p) => String(p.at) >= yearAgo).reduce((s, p) => s + (p.pence || 0), 0);
    const home = reg.fixtures.filter((f) => f.isHome !== false && f.syncStatus !== 'superseded' && !['cancelled'].includes(f.status));
    // A season runs roughly August–April. With a partial fixture list, assume two home games a month — and say so.
    const assumed = home.length < 10;
    const hpm = assumed ? 2 : Math.round((home.length / 9) * 10) / 10;
    return { lines: lines || [], model: Object.assign(FIN.model(lines || [], { homeMatchesPerMonth: hpm, sponsorshipCollected12mPence: collected, today: today() }), { homeMatchesAssumed: assumed }) };
  }
  A.finance = async (b, actor, event) => {
    const f = financeSession(b, event); if (!f.ok) return fail(f.why, { restricted: true });
    const m = await financeModel();
    return { ok: true, lines: m.lines, model: m.model, categories: FIN.CATEGORIES, frequencies: FIN.FREQUENCIES, bases: FIN.BASES, receipts: FIN.RECEIPTS, signedAs: f.actor };
  };
  A.saveFinanceLine = async (b, actor, event) => {
    const f = financeSession(b, event); if (!f.ok) return fail(f.why, { restricted: true });
    const pence = OS.poundsToPence(b.amount);
    const line = { kind: str(b.kind, 20), category: str(b.category, 40), label: str(b.label, 200), amount_pence: pence == null || Number.isNaN(pence) ? -1 : pence,
      frequency: ['income', 'cost'].includes(b.kind) ? str(b.frequency, 20) : (str(b.frequency, 20) || null), basis: str(b.basis, 20), receipt: b.kind === 'income' ? str(b.receipt, 20) : null,
      fixed: !!b.fixed, repeatable: !!b.repeatable, as_of: str(b.as_of, 10), evidence: str(b.evidence, 300) };
    const why = FIN.validateLine(line); if (why) return fail(why);
    const [row] = await sb('POST', 'hq_finance_lines', Object.assign(line, { entered_by: f.actor }));
    await audit(f.actor, 'create', 'finance', row.id, null, { kind: row.kind, category: row.category, label: row.label, basis: row.basis });
    return { ok: true, line: row };
  };
  A.archiveFinanceLine = async (b, actor, event) => {
    const f = financeSession(b, event); if (!f.ok) return fail(f.why, { restricted: true });
    if (!UUID.test(b.id || '')) return fail('Bad id.');
    const reason = str(b.reason, 300); if (!reason) return fail('Say why this line is being removed.');
    const [after] = await sb('PATCH', 'hq_finance_lines?id=eq.' + q(b.id) + '&archived_at=is.null', { archived_at: new Date().toISOString(), archived_by: f.actor });
    if (!after) return fail('Not found or already removed.');
    await audit(f.actor, 'archive', 'finance', b.id, null, null, reason);
    return { ok: true };
  };

  // ═══ SCORECARD + PRIORITIES (for the command centre) ═════════════════
  async function members() {
    const rows = await soft(sb('GET', 'fan_members?membership_status=eq.active&select=joined_at&limit=20000'), null);
    if (!rows) return null;
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    return { active: rows.length, last30: rows.filter((r) => String(r.joined_at) >= since).length };
  }
  A.scorecard = async (b, actor, event) => {
    const [items, orgs, att, mem] = await Promise.all([
      sb('GET', 'hq_items?select=id,kind,title,stage,owner,org_id,value_pence,estimate_pence,paid_pence,in_kind,data,closed_at,created_at,updated_at,source&limit=5000'),
      sb('GET', 'hq_orgs?select=id,relationship&limit=5000'), attendanceData(), members()]);
    const f = financeSession(b, event);
    const finance = f.ok ? (await financeModel()).model : { restricted: true };
    return Object.assign({ ok: true }, SC.scorecard({ items: items || [], orgs: orgs || [], attendance: { progress: att.progress, checkins: att.checkins }, members: mem, finance }));
  };
  A.priorities = async () => {
    const READ = require('../football/read');
    const [items, att, mem] = await Promise.all([
      sb('GET', 'hq_items?closed_at=is.null&select=id,kind,title,stage,owner,due_date,org_id,value_pence,paid_pence,data,source,created_at,updated_at&order=due_date.asc.nullslast&limit=2000'),
      attendanceData(), members()]);
    await reconcileSlots(att.reg.fixtures);
    const fresh = att.reg.fixtures.length ? await sb('GET', 'hq_items?closed_at=is.null&select=id,kind,title,stage,owner,due_date,org_id,value_pence,paid_pence,data,source,created_at,updated_at&limit=2000') : items;
    const live = att.reg.fixtures.filter((f) => f.syncStatus !== 'superseded');
    const next = READ.nextFrom(live); const nextHome = READ.nextFrom(live.filter((f) => f.isHome !== false));
    const lastCi = att.checkins.matches[0] || null;
    const p = SC.priorities({ items: fresh || [], figures: att.figures, unverifiedAttendance: att.unverified, missingAttendance: att.missing,
      nextFixture: brief(next), nextHomeFixture: brief(nextHome), laneCard: { signups30d: mem ? mem.last30 : null, members: mem ? mem.active : null, lastHomeCheckins: lastCi } });
    return Object.assign({ ok: true, registryMissing: !!att.reg.missing }, p);
  };

  // ═══ STARTING RECORDS ════════════════════════════════════════════════
  A.seedRebirth = async (b, actor) => {
    const out = { proposals: 0, research: 0, volunteerRoles: 0, skipped: 0 };
    const add = async (row, k) => { const r = await A.create(row, actor); if (r.ok && !r.duplicate) out[k]++; else out.skipped++; return r; };
    for (const p of SEEDS.PROPOSALS) {
      await add({ kind: 'proposal', title: p.title, idempotency_key: 'seed:proposal:' + p.key, source: 'seed:' + SEEDS.CHECKED, next_action: 'Chairman to review',
        data: { summary: p.summary, benefits: p.benefits, conditions: p.conditions, decision_needed: p.decision_needed, drafted_by: 'starting record' } }, 'proposals');
    }
    for (const r of SEEDS.RESEARCH) {
      await add({ kind: 'research', title: r.title, idempotency_key: 'seed:research:' + r.key, source: 'seed:' + SEEDS.CHECKED, next_action: r.next,
        data: { topic: r.topic, source_url: r.source_url || null, finding: r.finding, last_verified: SEEDS.CHECKED, external_contact: 'none — research only' } }, 'research');
    }
    for (const t of VOL.ROLE_TEMPLATES) {
      const data = { what: t.what, commitment: t.commitment, checks: t.checks || null, template: true };
      if (t.sg_money) data.sg_money = true;
      await add({ kind: 'volunteer_role', title: t.title, idempotency_key: 'seed:volrole:' + t.key, source: 'seed:' + SEEDS.CHECKED,
        next_action: 'Add when, where and a coordinator, then approve', data }, 'volunteerRoles');
    }
    return { ok: true, loaded: out };
  };
}

module.exports = { install };
