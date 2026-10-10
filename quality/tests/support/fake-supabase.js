// A tiny in-memory stand-in for Supabase's REST API (PostgREST), just enough
// of it to run the REAL Netlify functions (club-os.js, submit-form.js) inside
// browser journeys with isolated test data — no production rows, no emails.
// Enforces the constraints the journeys depend on: unique keys, one
// redemption per reward per season, append-only audit.
'use strict';
const crypto = require('crypto');

const UNIQUE = {
  hq_orgs: [['name_key'], ['website_host']],
  hq_items: [['idempotency_key']],
  hq_redemptions: [['lane_no', 'reward_key', 'season']],
  hq_suppression: [['value']],
  // Back the Lane / Run the Lane (20261009140000_rebirth_hq.sql)
  hq_import_batches: [['content_hash']],
  hq_fixture_slots: [['fixture_id', 'slot'], ['opportunity_id']],
  hq_attendance: [['fixture_id']],
  studio_revisions: [['composition_id', 'rev']],
  studio_sponsor_logos: [['sponsor_key', 'version']],
  lane100_members: [['email_key'], ['supporter_no']],
};

function makeDb(seed = {}) {
  const t = { hq_orgs: [], hq_items: [], hq_audit: [], hq_suppression: [], hq_redemptions: [], submissions: [], attendance: [],
    hq_import_batches: [], hq_fixture_slots: [], hq_attendance: [], hq_finance_lines: [], lane100_members: [], ...seed };
  return t;
}

function parseFilters(params) {
  const f = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    f.push([k, v]);
  }
  return f;
}
function get(row, col) {
  if (col.includes('->>')) { const [a, b] = col.split('->>'); return row[a] ? row[a][b] : undefined; }
  return row[col];
}
function match(row, [col, expr]) {
  const i = expr.indexOf('.'); const op = expr.slice(0, i), val = (() => { try { return decodeURIComponent(expr.slice(i + 1)); } catch (e) { return expr.slice(i + 1); } })();
  const v = get(row, col);
  switch (op) {
    case 'eq': return String(v) === val;
    case 'neq': return String(v) !== val;
    case 'is': return val === 'null' ? v == null : String(v) === val;
    case 'in': return val.replace(/^\(|\)$/g, '').split(',').includes(String(v));
    case 'gte': return v != null && String(v) >= val;
    case 'lte': return v != null && String(v) <= val;
    case 'like': return v != null && new RegExp('^' + val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$').test(String(v));
    default: throw new Error('fake-supabase: unsupported op ' + op);
  }
}
function nameKey(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

function handle(db, method, urlStr, body, prefer = '') {
  const u = new URL(urlStr);
  const table = u.pathname.split('/rest/v1/')[1];
  if (!db[table]) return { status: 404, json: { code: '42P01', message: `relation "${table}" does not exist` } };
  const rows = db[table];
  const filters = parseFilters(u.searchParams);
  const sel = (r) => filters.every((f) => match(r, f));
  if (method === 'GET') {
    let out = rows.filter(sel);
    const ord = u.searchParams.get('order');
    if (ord) { const [c, dir] = ord.split('.'); out = out.slice().sort((a, b) => (String(a[c] ?? '\uffff') < String(b[c] ?? '\uffff') ? -1 : 1) * (dir === 'desc' ? -1 : 1)); }
    const lim = +u.searchParams.get('limit'); if (lim) out = out.slice(0, lim);
    return { status: 200, json: JSON.parse(JSON.stringify(out)) };
  }
  if (method === 'POST') {
    const list = Array.isArray(body) ? body : [body];
    const made = [];
    for (const b of list) {
      const now = new Date().toISOString();
      const r = { id: table === 'hq_audit' ? rows.length + 1 : crypto.randomUUID(), created_at: now, updated_at: now, ...b };
      if (table === 'hq_orgs') r.name_key = nameKey(r.name);
      if (table === 'hq_items') { r.paid_pence = r.paid_pence || 0; r.data = r.data || {}; r.in_kind = !!r.in_kind; }
      if (table === 'hq_audit') r.at = now;
      if (table === 'hq_redemptions') r.redeemed_at = now;
      if (table === 'lane100_members') {
        // mirrors the lane100_assign_no trigger: duplicate email refused,
        // number = max + 1 (no gaps), never more than 100
        r.email_key = String(r.email || '').trim().toLowerCase();
        r.status = r.status || 'active';
        if (rows.some((x) => x.email_key === r.email_key)) return { status: 409, json: { code: '23505', message: 'lane100_duplicate' } };
        r.supporter_no = rows.reduce((m, x) => Math.max(m, x.supporter_no || 0), 0) + 1;
        if (r.supporter_no > 100) return { status: 400, json: { code: 'P0001', message: 'lane100_full' } };
      }
      for (const cols of UNIQUE[table] || []) {
        if (cols.some((c) => r[c] == null)) continue;
        if (rows.some((x) => cols.every((c) => x[c] === r[c]))) {
          if (/ignore-duplicates/.test(prefer)) { r.__skip = true; break; }
          return { status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
      }
      if (r.__skip) continue;
      rows.push(r); made.push(r);
    }
    return { status: 201, json: /return=minimal/.test(prefer) ? null : JSON.parse(JSON.stringify(made)) };
  }
  if (method === 'PATCH') {
    if (table === 'hq_audit') return { status: 400, json: { message: 'hq_audit is append-only' } };
    const hit = rows.filter(sel);
    // Mirrors the studio_revision_guard / append-only triggers in 20261009150000_asset_studio.sql.
    if (table === 'studio_revisions' && hit.some((r) => body.doc !== undefined && JSON.stringify(body.doc) !== JSON.stringify(r.doc))) return { status: 400, json: { message: 'a revision\'s document is fixed once saved' } };
    if (table === 'studio_exports' || table === 'studio_publications') return { status: 400, json: { message: table + ' is append-only' } };
    for (const r of hit) Object.assign(r, body, { updated_at: new Date().toISOString() });
    return { status: 200, json: /return=minimal/.test(prefer) ? null : JSON.parse(JSON.stringify(hit)) };
  }
  if (method === 'DELETE') {
    if (table === 'hq_audit') return { status: 400, json: { message: 'hq_audit is append-only' } };
    db[table] = rows.filter((r) => !sel(r));
    return { status: 204, json: null };
  }
  return { status: 405, json: { message: 'method' } };
}

// Install as global.fetch for the Supabase host only; everything else passes through.
function install(db, host = 'fake-supabase.local') {
  const real = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const s = String(url);
    if (!s.includes(host)) return real(url, opts);
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    const prefer = (opts.headers && (opts.headers.Prefer || opts.headers.prefer)) || '';
    const r = handle(db, (opts.method || 'GET').toUpperCase(), s, body, prefer);
    return new Response(r.json == null ? null : JSON.stringify(r.json), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  return () => { global.fetch = real; };
}

module.exports = { makeDb, install, handle };
