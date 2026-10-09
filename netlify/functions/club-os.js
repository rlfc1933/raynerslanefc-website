// ════════════════════════════════════════════════════════════════════════
//  CLUB OS — Staff HQ's records API (sponsors, outreach, grants, compliance,
//  comms approvals, invoices, coaching sessions, tasks, reward redemption).
//
//  POST { pin, actor, action, ... }      actor = the person acting (required for writes)
//
//  Storage: Supabase (supabase/migrations/20261009120000_club_os.sql), service
//  role only — none of this is ever written to the public repo or /data.
//  Rules: lib/club-os.js. Every write is audited (hq_audit). Nothing here
//  sends an email, posts to social media or moves money: outreach is
//  "approved" here and sent by a person from the club mailbox, then logged.
// ════════════════════════════════════════════════════════════════════════
'use strict';
const adminOk = require('./lib/pin');
const OS = require('./lib/club-os');

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const CH_KEY = process.env.COMPANIES_HOUSE_API_KEY || '';

const LADDER = [
  { key: 'home5', games: 5, title: '6th home game FREE' },
  { key: 'home10', games: 10, title: 'A drink on the house' },
  { key: 'home20', games: 20, title: 'Matchday VIP' },
  { key: 'home38', games: 38, title: 'After-Season Party invite' },
];

function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
    body: JSON.stringify(obj) };
}
const fail = (error, extra) => Object.assign({ ok: false, error }, extra || {});

// ── Supabase REST ──────────────────────────────────────────────────────────
async function sb(method, path, body, prefer) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method, signal: AbortSignal.timeout(9000),
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) {}
  if (!r.ok) {
    const code = json && json.code;
    const err = new Error((json && (json.message || json.hint)) || ('supabase ' + r.status));
    err.status = r.status; err.code = code;
    // 42P01 = relation does not exist → the migration has not been run yet.
    if (code === '42P01' || /relation .* does not exist/i.test(err.message)) err.notSetUp = true;
    if (code === '23505') err.duplicate = true;
    throw err;
  }
  return json;
}
const q = encodeURIComponent;
async function audit(actor, action, entity, id, before, after, note) {
  try { await sb('POST', 'hq_audit', { actor, action, entity, entity_id: id == null ? null : String(id), before: before || null, after: after || null, note: note || null }, 'return=minimal'); }
  catch (e) { /* the write already happened; an audit failure is reported in logs, never silently ignored upstream */ console.error('[club-os] audit failed', e.message); }
}
async function getItem(id) { const r = await sb('GET', 'hq_items?id=eq.' + q(id) + '&select=*'); return r && r[0]; }
async function getOrg(id) { const r = await sb('GET', 'hq_orgs?id=eq.' + q(id) + '&select=*'); return r && r[0]; }
async function suppressionSet() { const r = await sb('GET', 'hq_suppression?select=value'); return new Set((r || []).map((x) => x.value)); }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, n) => (v == null ? null : String(v).trim().slice(0, n || 500) || null);

// Fields a client may set on an item. Stage moves go through `move` only.
function cleanItemFields(b) {
  const o = {};
  if (b.title !== undefined) o.title = str(b.title, 300);
  if (b.owner !== undefined) o.owner = str(b.owner, 120);
  if (b.due_date !== undefined) { if (b.due_date && !DATE.test(b.due_date)) throw new Error('Due date must be a date.'); o.due_date = b.due_date || null; }
  if (b.next_action !== undefined) o.next_action = str(b.next_action, 500);
  if (b.org_id !== undefined) { if (b.org_id && !UUID.test(b.org_id)) throw new Error('Bad organisation.'); o.org_id = b.org_id || null; }
  if (b.parent_id !== undefined) { if (b.parent_id && !UUID.test(b.parent_id)) throw new Error('Bad parent.'); o.parent_id = b.parent_id || null; }
  for (const k of ['value', 'estimate']) {
    if (b[k] !== undefined) { const p = OS.poundsToPence(b[k]); if (Number.isNaN(p)) throw new Error(`${k === 'value' ? 'Agreed value' : 'Estimate'} must be an amount in pounds.`); o[k + '_pence'] = p; }
  }
  if (b.in_kind !== undefined) o.in_kind = !!b.in_kind;
  if (b.data !== undefined) { if (typeof b.data !== 'object' || Array.isArray(b.data)) throw new Error('Bad data.'); o.data = b.data; }
  return o;
}
const ORG_FIELDS = ['name', 'kind', 'relationship', 'website', 'sector', 'town', 'legal_form', 'companies_house_no', 'contact_name',
  'contact_email', 'contact_phone', 'permission', 'permission_note', 'source_url', 'verified_at', 'notes', 'public_listing'];
function cleanOrgFields(b) {
  const o = {};
  for (const k of ORG_FIELDS) if (b[k] !== undefined) o[k] = k === 'public_listing' ? !!b[k] : str(b[k], k === 'notes' ? 4000 : 300);
  if (o.website) o.website_host = OS.hostOf(o.website);
  if (o.contact_email) o.contact_email = o.contact_email.toLowerCase();
  if (o.companies_house_no) o.companies_house_no = o.companies_house_no.toUpperCase().replace(/\s/g, '').padStart(8, '0');
  if (o.verified_at && !DATE.test(o.verified_at)) throw new Error('Verified date must be a date.');
  return o;
}

// ── Actions ────────────────────────────────────────────────────────────────
const A = {};

// Command Centre: everything open, plus what needs a human.
A.summary = async () => {
  const items = await sb('GET', 'hq_items?closed_at=is.null&select=id,kind,title,stage,owner,due_date,next_action,org_id,value_pence,estimate_pence,paid_pence,in_kind,created_at,updated_at&order=due_date.asc.nullslast&limit=1000');
  const att = OS.attention(items || []);
  const won = await sb('GET', "hq_items?kind=eq.opportunity&stage=eq.won&select=value_pence,in_kind,estimate_pence");
  const inv = await sb('GET', "hq_items?kind=eq.invoice&stage=in.(issued,part_paid,overdue,paid)&select=value_pence,paid_pence,stage");
  const money = {
    contracted_pence: (won || []).filter((w) => !w.in_kind).reduce((s, w) => s + (w.value_pence || 0), 0),
    in_kind_estimate_pence: (won || []).filter((w) => w.in_kind).reduce((s, w) => s + (w.estimate_pence || w.value_pence || 0), 0),
    invoiced_pence: (inv || []).reduce((s, i) => s + (i.value_pence || 0), 0),
    collected_pence: (inv || []).reduce((s, i) => s + (i.paid_pence || 0), 0),
  };
  money.owed_pence = money.invoiced_pence - money.collected_pence;
  return { ok: true, attention: att, money, open: (items || []).length };
};

A.list = async (b) => {
  if (!OS.KINDS.includes(b.kind)) return fail('Unknown record type.');
  let path = 'hq_items?kind=eq.' + q(b.kind) + '&select=*&order=updated_at.desc&limit=500';
  if (b.open) path += '&closed_at=is.null';
  if (b.parent_id && UUID.test(b.parent_id)) path += '&parent_id=eq.' + q(b.parent_id);
  return { ok: true, items: await sb('GET', path) };
};

A.get = async (b) => {
  if (!UUID.test(b.id || '')) return fail('Bad id.');
  const item = await getItem(b.id); if (!item) return fail('Not found.');
  const [children, history, org] = await Promise.all([
    sb('GET', 'hq_items?parent_id=eq.' + q(b.id) + '&select=*&order=created_at.asc'),
    sb('GET', "hq_audit?entity=eq.item&entity_id=eq." + q(b.id) + '&select=at,actor,action,note,after&order=at.desc&limit=100'),
    item.org_id ? getOrg(item.org_id) : null,
  ]);
  return { ok: true, item, children, history, org, flow: OS.FLOW[item.kind][item.stage] || [] };
};

A.create = async (b, actor) => {
  if (!OS.KINDS.includes(b.kind)) return fail('Unknown record type.');
  const f = cleanItemFields(b);
  if (!f.title) return fail('Give it a title.');
  if (b.kind === 'opportunity' && b.data && b.data.package && b.data.season) {
    const won = await sb('GET', 'hq_items?kind=eq.opportunity&stage=eq.won&select=title,data');
    const clash = OS.inventoryClash(b.data.package, b.data.season, won || []);
    if (clash) return fail(clash);
  }
  const data = Object.assign({}, f.data || {}, (b.kind === 'outreach' || b.kind === 'comms') ? { drafted_by: actor } : {});
  const row = Object.assign({}, f, { kind: b.kind, stage: OS.FIRST[b.kind], data, created_by: actor, source: str(b.source, 60) || 'manual',
    idempotency_key: str(b.idempotency_key, 200) });
  try {
    const [created] = await sb('POST', 'hq_items', row);
    await audit(actor, 'create', 'item', created.id, null, { kind: created.kind, title: created.title, stage: created.stage });
    return { ok: true, item: created };
  } catch (e) {
    if (e.duplicate && row.idempotency_key) { // a retry / double click — return the record that already exists
      const ex = await sb('GET', 'hq_items?idempotency_key=eq.' + q(row.idempotency_key) + '&select=*');
      return { ok: true, item: ex && ex[0], duplicate: true };
    }
    throw e;
  }
};

A.update = async (b, actor) => {
  if (!UUID.test(b.id || '')) return fail('Bad id.');
  const before = await getItem(b.id); if (!before) return fail('Not found.');
  const f = cleanItemFields(b);
  if (f.data) f.data = Object.assign({}, before.data || {}, f.data, { drafted_by: (before.data || {}).drafted_by });
  if (before.kind === 'invoice' && !['draft'].includes(before.stage) && (f.value_pence !== undefined))
    return fail('An approved or issued invoice cannot be re-priced. Void it and raise a new one.');
  if (!Object.keys(f).length) return fail('Nothing to change.');
  const [after] = await sb('PATCH', 'hq_items?id=eq.' + q(b.id), f);
  await audit(actor, 'update', 'item', b.id, pick(before, Object.keys(f)), pick(after, Object.keys(f)), str(b.note, 500));
  return { ok: true, item: after };
};

// Stage changes: the guard decides; side effects follow.
A.move = async (b, actor) => {
  if (!UUID.test(b.id || '')) return fail('Bad id.');
  const item = await getItem(b.id); if (!item) return fail('Not found.');
  const ctx = { actor, owner: b.owner, value_pence: b.value != null ? OS.poundsToPence(b.value) : null, reason: str(b.reason, 500),
    reference: str(b.reference, 200), evidence: str(b.evidence, 500), eligibility_note: str(b.eligibility_note, 2000), publish_at: str(b.publish_at, 40) };
  const why = OS.guardTransition(item, b.to, ctx); if (why) return fail(why);
  const patch = { stage: b.to };
  if (b.owner) patch.owner = str(b.owner, 120);
  if (ctx.value_pence != null && !Number.isNaN(ctx.value_pence)) patch.value_pence = ctx.value_pence;
  const data = Object.assign({}, item.data || {});
  if (ctx.reason) data.reason = ctx.reason;
  if (ctx.reference) data.reference = ctx.reference;
  if (ctx.evidence) data.evidence = ctx.evidence;
  if (ctx.eligibility_note) data.eligibility_note = ctx.eligibility_note;
  if (ctx.publish_at) data.publish_at = ctx.publish_at;
  if (['approved'].includes(b.to)) { data.approved_by = actor; data.approved_at = new Date().toISOString(); }
  if (b.to === 'sent') { data.sent_by = actor; data.sent_at = new Date().toISOString(); data.channel = str(b.channel, 40) || 'club mailbox'; }
  if (b.to === 'issued' && !data.invoice_no) data.invoice_no = await nextInvoiceNo();
  patch.data = data;
  patch.closed_at = OS.CLOSED.has(b.to) ? new Date().toISOString() : null;

  // Outreach can only be marked sent if sending was permitted at that moment.
  if (item.kind === 'outreach' && b.to === 'sent') {
    const org = item.org_id ? await getOrg(item.org_id) : null;
    const perm = OS.sendPermission(org, await suppressionSet());
    if (!perm.ok) return fail('Not sent: ' + perm.why);
    data.basis = perm.basis;
  }
  const [after] = await sb('PATCH', 'hq_items?id=eq.' + q(b.id) + '&stage=eq.' + q(item.stage), patch); // optimistic lock on stage
  if (!after) return fail('Someone else changed this record a moment ago — reload and try again.');
  await audit(actor, 'move', 'item', b.id, { stage: item.stage }, { stage: b.to }, ctx.reason || ctx.reference || ctx.evidence || null);
  const effects = await sideEffects(after, item, actor);
  return { ok: true, item: after, effects };
};

async function nextInvoiceNo() {
  const y = new Date().getUTCFullYear();
  const r = await sb('GET', "hq_items?kind=eq.invoice&data->>invoice_no=like." + q('RLFC-' + y + '-%') + '&select=data');
  const n = (r || []).reduce((m, x) => Math.max(m, Number(String((x.data || {}).invoice_no || '').split('-')[2]) || 0), 0) + 1;
  return `RLFC-${y}-${String(n).padStart(4, '0')}`;
}

// What a stage change sets in motion. Idempotent: keys mean a re-run creates nothing new.
async function sideEffects(after, before, actor) {
  const made = [];
  const mk = async (row) => { const r = await A.create(row, actor); if (r.ok && !r.duplicate) made.push(r.item.title); return r; };
  if (after.kind === 'opportunity' && after.stage === 'won') {
    for (let i = 0; i < OS.FULFILMENT_STEPS.length; i++) {
      await mk({ kind: 'fulfilment', title: OS.FULFILMENT_STEPS[i], parent_id: after.id, org_id: after.org_id, owner: after.owner,
        idempotency_key: `opp:${after.id}:ful:${i}`, source: 'opportunity-won' });
    }
    if (!after.in_kind && after.value_pence > 0) {
      await mk({ kind: 'invoice', title: `Invoice — ${after.title}`, parent_id: after.id, org_id: after.org_id, owner: after.owner,
        value: after.value_pence / 100, idempotency_key: `opp:${after.id}:invoice:1`, source: 'opportunity-won',
        data: { terms_days: 30, vat: 'not set — confirm VAT status before issuing' } });
    }
    const renew = (after.data || {}).renewal_date;
    await mk({ kind: 'task', title: `Renewal conversation — ${after.title}`, parent_id: after.id, org_id: after.org_id, owner: after.owner,
      due_date: renew && DATE.test(renew) ? renew : null, idempotency_key: `opp:${after.id}:renewal`, source: 'opportunity-won' });
    if (after.org_id) await sb('PATCH', 'hq_orgs?id=eq.' + q(after.org_id), { relationship: 'sponsor' });
  }
  if (after.kind === 'enquiry' && after.stage === 'assigned' && after.owner) {
    await mk({ kind: 'task', title: `Reply to: ${after.title}`, parent_id: after.id, org_id: after.org_id, owner: after.owner,
      due_date: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), idempotency_key: `enq:${after.id}:reply`, source: 'enquiry' });
  }
  if (after.kind === 'grant' && after.stage === 'awarded') {
    await mk({ kind: 'task', title: `Grant reporting obligations — ${after.title}`, parent_id: after.id, owner: after.owner,
      idempotency_key: `grant:${after.id}:reporting`, source: 'grant-awarded' });
  }
  return made;
}

A.pay = async (b, actor) => {
  if (!UUID.test(b.id || '')) return fail('Bad id.');
  const inv = await getItem(b.id); if (!inv || inv.kind !== 'invoice') return fail('Not an invoice.');
  if (!str(b.evidence, 300)) return fail('Say how you know it was paid (bank reference, date).');
  const r = OS.applyPayment(inv, OS.poundsToPence(b.amount)); if (r.error) return fail(r.error);
  const pays = ((inv.data || {}).payments || []).concat([{ pence: OS.poundsToPence(b.amount), evidence: str(b.evidence, 300), by: actor, at: new Date().toISOString() }]);
  const [after] = await sb('PATCH', 'hq_items?id=eq.' + q(b.id) + '&paid_pence=eq.' + (inv.paid_pence || 0),
    { paid_pence: r.paid_pence, stage: r.stage, data: Object.assign({}, inv.data, { payments: pays }), closed_at: r.stage === 'paid' ? new Date().toISOString() : null });
  if (!after) return fail('That invoice changed a moment ago — reload and try again.');
  await audit(actor, 'payment', 'item', b.id, { paid_pence: inv.paid_pence, stage: inv.stage }, { paid_pence: r.paid_pence, stage: r.stage }, str(b.evidence, 300));
  return { ok: true, item: after };
};

// ── Organisations ──────────────────────────────────────────────────────────
A.orgs = async (b) => {
  let path = 'hq_orgs?select=*&order=updated_at.desc&limit=1000';
  if (b.relationship) path += '&relationship=eq.' + q(b.relationship);
  return { ok: true, orgs: await sb('GET', path) };
};
A.org = async (b) => {
  if (!UUID.test(b.id || '')) return fail('Bad id.');
  const org = await getOrg(b.id); if (!org) return fail('Not found.');
  const [items, sup] = await Promise.all([sb('GET', 'hq_items?org_id=eq.' + q(b.id) + '&select=*&order=updated_at.desc'), suppressionSet()]);
  return { ok: true, org, items, send: OS.sendPermission(org, sup) };
};
A.saveOrg = async (b, actor) => {
  const f = cleanOrgFields(b);
  if (b.score_factors) { const s = OS.scoreProspect(b.score_factors); f.score = s.score; f.score_breakdown = Object.assign({ band: s.band }, s.breakdown); }
  if (b.id) {
    if (!UUID.test(b.id)) return fail('Bad id.');
    const before = await getOrg(b.id); if (!before) return fail('Not found.');
    const [after] = await sb('PATCH', 'hq_orgs?id=eq.' + q(b.id), f);
    await audit(actor, 'update', 'org', b.id, pick(before, Object.keys(f)), pick(after, Object.keys(f)));
    return { ok: true, org: after };
  }
  if (!f.name) return fail('Name the organisation.');
  const all = await sb('GET', 'hq_orgs?select=id,name,name_key,website_host,contact_email,relationship');
  const dup = OS.findDuplicate(f, all || []);
  if (dup) return fail(`Already on record as “${dup.name}” (${dup.relationship}). Open that record instead of creating a second one.`, { duplicate_of: dup.id });
  f.created_by = actor;
  const [org] = await sb('POST', 'hq_orgs', f);
  await audit(actor, 'create', 'org', org.id, null, { name: org.name, relationship: org.relationship });
  return { ok: true, org };
};
A.suppress = async (b, actor) => {
  const v = str(b.value, 200); if (!v || !/^(@[^@\s]+\.[^@\s]+|[^@\s]+@[^@\s]+\.[^@\s]+)$/.test(v)) return fail('Enter an email address or @domain.');
  const reason = str(b.reason, 300); if (!reason) return fail('Record why (e.g. "asked not to be contacted, 9 Oct").');
  await sb('POST', 'hq_suppression', { value: v.toLowerCase(), reason, added_by: actor }, 'resolution=ignore-duplicates,return=minimal');
  await sb('PATCH', 'hq_orgs?contact_email=eq.' + q(v.toLowerCase()), { permission: 'opted_out' }, 'return=minimal');
  await audit(actor, 'suppress', 'suppression', v.toLowerCase(), null, { reason });
  return { ok: true };
};

// Companies House (free API key; server-side only — the API has no CORS).
A.companiesHouse = async (b) => {
  if (!CH_KEY) return fail('Companies House lookup is not switched on (COMPANIES_HOUSE_API_KEY not set). Check manually at find-and-update.company-information.service.gov.uk.', { disabled: true });
  const term = str(b.q, 120); if (!term) return fail('Search for a company name or number.');
  const r = await fetch('https://api.company-information.service.gov.uk/search/companies?items_per_page=8&q=' + q(term),
    { headers: { Authorization: 'Basic ' + Buffer.from(CH_KEY + ':').toString('base64') }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return fail('Companies House did not answer (' + r.status + '). Try again later.');
  const j = await r.json();
  return { ok: true, results: (j.items || []).map((c) => ({ number: c.company_number, name: c.title, status: c.company_status, type: c.company_type,
    address: c.address_snippet, created: c.date_of_creation })) };
};

// ── Loyalty redemption ─────────────────────────────────────────────────────
function seasonOf(d = new Date()) { const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return { label: `${y}/${String(y + 1).slice(2)}`, from: `${y}-07-01`, to: `${y + 1}-06-30` }; }
async function verifiedHomeVisits(lane, season) {
  const rows = await sb('GET', 'attendance?lane_no=eq.' + q(lane) + '&home=eq.true&match_date=gte.' + season.from + '&match_date=lte.' + season.to + '&select=match_date');
  return new Set((rows || []).map((r) => r.match_date)).size;
}
A.rewards = async (b) => {
  const lane = str(b.lane_no, 20); if (!lane || !/^[A-Za-z0-9-]{3,20}$/.test(lane)) return fail('Enter the Lane number from the card.');
  const season = seasonOf();
  const [visits, red] = await Promise.all([verifiedHomeVisits(lane, season),
    sb('GET', 'hq_redemptions?lane_no=eq.' + q(lane) + '&season=eq.' + q(season.label) + '&select=reward_key,redeemed_at,redeemed_by')]);
  return { ok: true, lane_no: lane, season: season.label, verified_home_visits: visits,
    rewards: OS.rewardStatus(visits, LADDER, (red || []).map((r) => r.reward_key)), redemptions: red || [] };
};
A.redeem = async (b, actor) => {
  const st = await A.rewards(b); if (!st.ok) return st;
  const r = st.rewards.find((x) => x.key === b.reward_key); if (!r) return fail('Unknown reward.');
  if (r.redeemed) { const when = st.redemptions.find((x) => x.reward_key === r.key); return fail(`Already redeemed${when && when.redeemed_at ? ' on ' + String(when.redeemed_at).slice(0, 10) + ' (by ' + when.redeemed_by + ')' : ''}. It can only be used once a season.`); }
  if (!r.earned) return fail(`Not earned yet: ${st.verified_home_visits} verified home visit(s) this season, needs ${r.games}.`);
  try {
    await sb('POST', 'hq_redemptions', { lane_no: st.lane_no, reward_key: r.key, season: st.season, visits_at_redemption: st.verified_home_visits,
      redeemed_by: actor, fixture_id: str(b.fixture_id, 60), note: str(b.note, 300) }, 'return=minimal');
  } catch (e) { if (e.duplicate) return fail('Already redeemed — someone else just recorded it.'); throw e; }
  await audit(actor, 'redeem', 'reward', st.lane_no, null, { reward: r.key, season: st.season, visits: st.verified_home_visits });
  return { ok: true, redeemed: r.title };
};

// ── Export (CSV) — the club's data is the club's ──────────────────────────
A.export = async (b) => {
  const what = b.what === 'orgs' ? 'hq_orgs?select=*' : OS.KINDS.includes(b.what) ? 'hq_items?kind=eq.' + q(b.what) + '&select=*' : null;
  if (!what) return fail('Choose what to export.');
  const rows = await sb('GET', what + '&order=created_at.asc&limit=5000') || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const cell = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return { ok: true, filename: `rlfc-${b.what}-${new Date().toISOString().slice(0, 10)}.csv`, csv: [cols.join(',')].concat(rows.map((r) => cols.map((c) => cell(r[c])).join(','))).join('\n') };
};

// Load the verified starting records (grants, compliance register, published sponsors). Safe to re-run.
A.seed = async (b, actor) => {
  const S = require('./lib/club-os-seeds');
  const out = { grants: 0, compliance: 0, sponsors: 0, skipped: 0 };
  for (const g of S.GRANTS) {
    const r = await A.create({ kind: 'grant', title: g.title, idempotency_key: 'seed:grant:' + g.key, source: 'seed:' + S.CHECKED,
      data: { source_url: g.url, last_verified: S.CHECKED, amount: g.amount, eligibility_note: g.note, entity_note: S.ENTITY_NOTE } }, actor);
    if (r.ok && !r.duplicate) {
      out.grants++;
      if (g.stage !== 'discovered') {   // record the assessment as a real, audited move
        const path = g.stage === 'eligibility_review' ? ['eligibility_review'] : ['eligibility_review', g.stage];
        for (const to of path) await A.move({ id: r.item.id, to, eligibility_note: g.note }, actor);
      }
    } else out.skipped++;
  }
  for (const c of S.COMPLIANCE) {
    const r = await A.create({ kind: 'compliance', title: c.title, idempotency_key: 'seed:compliance:' + c.key, source: 'seed:' + S.CHECKED,
      next_action: 'Enter the real due date from the document, and an owner', data: { authority: c.authority, source_url: c.url || null, role: c.role } }, actor);
    if (r.ok && !r.duplicate) out.compliance++; else out.skipped++;
  }
  try {
    const base = process.env.URL || 'https://raynerslanefc.co.uk';
    const sj = await (await fetch(base + '/data/sponsors.json', { signal: AbortSignal.timeout(8000) })).json();
    for (const o of S.sponsorOrgs(sj)) {
      const r = await A.saveOrg(o, actor);
      if (r.ok) out.sponsors++; else out.skipped++;
    }
  } catch (e) { out.sponsorsError = 'Could not read the public sponsors list: ' + e.message; }
  return { ok: true, loaded: out };
};

// Website enquiry → organisation (deduplicated) + enquiry record + a 48-hour clock.
// Called by submit-form.js after the submission is safely stored.
async function intakeEnquiry(sub) {
  if (!SB_KEY) return { ok: false, error: 'no-supabase' };
  const f = sub.fields || {};
  const bizName = str(f.business || f.company || f.organisation || f.org || sub.name, 200) || 'Unnamed business';
  let orgId = null;
  try {
    const all = await sb('GET', 'hq_orgs?select=id,name,name_key,website_host,contact_email,relationship');
    const cand = { name: bizName, website: str(f.website, 300), contact_email: str(sub.email, 200) };
    const dup = OS.findDuplicate(cand, all || []);
    if (dup) orgId = dup.id;
    else {
      const [org] = await sb('POST', 'hq_orgs', { name: bizName, kind: 'business', relationship: 'prospect', website: cand.website,
        website_host: cand.website ? OS.hostOf(cand.website) : null, contact_name: str(sub.name, 120), contact_email: cand.contact_email ? cand.contact_email.toLowerCase() : null,
        contact_phone: str(sub.phone, 40), permission: 'existing_relationship',
        permission_note: 'They contacted the club through the website sponsorship form — reply about their enquiry is expected. Marketing beyond this needs its own basis.',
        source_url: 'website enquiry', created_by: 'website' });
      orgId = org.id;
    }
  } catch (e) { if (e.notSetUp) return { ok: false, error: 'not-set-up' }; throw e; }
  const due = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);   // the site promises a reply within 48 hours
  const r = await A.create({ kind: 'enquiry', title: `Sponsorship enquiry — ${bizName}`, org_id: orgId, due_date: due,
    next_action: 'Acknowledge and assign an owner (48-hour promise)', source: 'website-form', idempotency_key: 'submission:' + sub.id,
    data: { interest: str(f.package || f.interest || f.sponsorship, 120), budget: str(f.budget, 60), message: str(sub.message, 4000), submission_id: sub.id } }, 'website');
  return r;
}
exports.intakeEnquiry = intakeEnquiry;

A.history = async (b) => ({ ok: true, audit: await sb('GET', 'hq_audit?select=*&order=at.desc&limit=' + Math.min(500, Number(b.limit) || 100)) });

function pick(o, keys) { const r = {}; for (const k of keys) r[k] = o ? o[k] : undefined; return r; }

const WRITES = new Set(['create', 'update', 'move', 'pay', 'saveOrg', 'suppress', 'redeem', 'seed']);

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(200, fail('Bad request.')); }
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });
  const fn = A[b.action]; if (!fn) return resp(200, fail('Unknown action.'));
  const actor = str(b.actor, 80);
  if (WRITES.has(b.action) && !actor) return resp(200, fail('Tell us who you are (top of Staff HQ) — every change is signed.'));
  if (!SB_KEY) return resp(200, fail('The club database is not connected (SUPABASE_SERVICE_KEY not set).', { notSetUp: true }));
  try { return resp(200, await fn(b, actor)); }
  catch (e) {
    if (e.notSetUp) return resp(200, fail('Club OS is not set up yet: run supabase/migrations/20261009120000_club_os.sql once in Supabase → SQL Editor.', { notSetUp: true }));
    if (e.message && !e.status) return resp(200, fail(e.message));       // validation messages from clean*()
    console.error('[club-os]', b.action, e.status, e.message);
    return resp(200, fail('The database refused that change. Nothing was saved. (' + (e.code || e.status) + ')'));
  }
};
exports._test = { A, cleanItemFields, cleanOrgFields, seasonOf, LADDER };
