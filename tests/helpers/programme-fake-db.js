// An in-memory PostgREST stand-in for driving the REAL programme functions
// (programme-sync, programme-data, programme-admin) end to end, in node tests
// and in the browser journeys. Enough of PostgREST for what those functions
// send: eq/neq/is/in/gt/gte/lt/lte/not.*, or=(…), order, limit, one level of
// embedding, on_conflict upserts and the Prefer resolutions — and the unique
// constraints from the migrations, so a duplicate fails here as it would there.
//
// TEST DATA ONLY. Nothing here is real club information.
'use strict';

const UNIQUE = {
  programme_editions: [['fixture_id'], ['slug']],
  programme_versions: [['edition_id', 'version'], ['edition_id', 'content_hash']],
  programme_publication_events: [['idempotency_key']],
  programme_team_sheets: [['edition_id', 'side', 'content_hash']],
  programme_sections: [['edition_id', 'section_key']],
  match_state: [['fixture_id']],
};
const SCHEMA_V2_TABLES = ['programme_sections', 'programme_section_revisions', 'programme_team_sheets',
  'programme_sponsor_placements', 'programme_publication_events', 'programme_source_snapshots',
  'programme_source_discrepancies', 'programme_provider_requests'];

function makeDb(seed, opts) {
  const o = opts || {};
  const db = {
    football_teams: [], football_competitions: [], football_fixtures: [], football_lineups: [],
    football_lineup_players: [], football_league_tables: [], football_league_table_rows: [],
    football_sync_runs: [], match_state: [], match_events: [],
    programme_editions: [], programme_versions: [],
    fan_members: [], fan_events: [],
  };
  if (o.schemaV2 !== false) SCHEMA_V2_TABLES.forEach((t) => { db[t] = []; });
  db.__v2 = o.schemaV2 !== false;
  db.__seq = 1000;
  return Object.assign(db, seed || {});
}

function cell(row, col) { return row[col]; }

function test1(row, col, expr) {
  if (expr.startsWith('not.')) return !test1(row, col, expr.slice(4));
  const i = expr.indexOf('.');
  const op = expr.slice(0, i);
  const raw = expr.slice(i + 1);
  const v = cell(row, col);
  const s = v == null ? null : String(v);
  switch (op) {
    case 'eq': return s === raw;
    case 'neq': return s !== raw;
    case 'is': return raw === 'null' ? v == null : raw === 'true' ? v === true : raw === 'false' ? v === false : s === raw;
    case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(s);
    case 'gt': return s != null && (isNaN(+s) ? s > raw : +s > +raw);
    case 'gte': return s != null && (isNaN(+s) ? s >= raw : +s >= +raw);
    case 'lt': return s != null && (isNaN(+s) ? s < raw : +s < +raw);
    case 'lte': return s != null && (isNaN(+s) ? s <= raw : +s <= +raw);
    default: throw new Error('programme-fake-db: unsupported op ' + op);
  }
}

function orMatch(row, expr) {
  // or=(a.eq.1,b.is.null) — no nested groups needed by the functions.
  return expr.replace(/^\(|\)$/g, '').split(',').some((part) => {
    const j = part.indexOf('.');
    return test1(row, part.slice(0, j), part.slice(j + 1));
  });
}

function embed(db, table, rows, select) {
  const m = /(\w+)\((\*|[^)]*)\)/.exec(select || '');
  if (!m) return rows;
  const child = m[1];
  if (!db[child]) return rows;
  const fk = table === 'football_lineups' ? 'lineup_id' : table.replace(/s$/, '') + '_id';
  return rows.map((r) => Object.assign({}, r, { [child]: db[child].filter((c) => String(c[fk]) === String(r.id)) }));
}

function handle(db, method, urlStr, body, prefer) {
  const u = new URL(urlStr);
  const table = u.pathname.split('/rest/v1/')[1];
  if (!db[table]) return { status: 404, json: { code: '42P01', message: 'relation "' + table + '" does not exist' } };
  const sel = u.searchParams.get('select') || '';
  if (!db.__v2 && table === 'programme_versions' && /content_hash|stage/.test(sel)) {
    return { status: 400, json: { code: '42703', message: 'column programme_versions.content_hash does not exist' } };
  }
  const filters = [];
  for (const [k, v] of u.searchParams) {
    if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) continue;
    filters.push([k, v]);
  }
  const ok = (r) => filters.every(([k, v]) => (k === 'or' ? orMatch(r, v) : test1(r, k, v)));
  const rows = db[table];
  const p = prefer || '';

  if (method === 'GET') {
    let out = rows.filter(ok);
    const ord = u.searchParams.get('order');
    if (ord) {
      const keys = ord.split(',').map((x) => x.split('.'));
      out = out.slice().sort((a, b) => {
        for (const [c, dir] of keys) {
          const av = a[c], bv = b[c];
          if (av === bv) continue;
          const cmp = av == null ? 1 : bv == null ? -1 : (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av) < String(bv) ? -1 : 1);
          return dir === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }
    const lim = +u.searchParams.get('limit'); if (lim) out = out.slice(0, lim);
    return { status: 200, json: JSON.parse(JSON.stringify(embed(db, table, out, sel))) };
  }
  if (method === 'POST') {
    const list = Array.isArray(body) ? body : [body];
    const conflictCols = (u.searchParams.get('on_conflict') || '').split(',').filter(Boolean);
    const made = [];
    for (const b of list) {
      const now = new Date().toISOString();
      if (conflictCols.length) {
        const hit = rows.find((x) => conflictCols.every((c) => String(x[c]) === String(b[c])));
        if (hit) {
          if (/ignore-duplicates/.test(p)) continue;
          if (/merge-duplicates/.test(p)) { Object.assign(hit, b, { updated_at: now }); made.push(hit); continue; }
        }
      }
      const r = Object.assign({ id: ++db.__seq, created_at: now, updated_at: now }, b);
      for (const cols of UNIQUE[table] || []) {
        if (cols.some((c) => r[c] == null)) continue;
        if (rows.some((x) => cols.every((c) => String(x[c]) === String(r[c])))) {
          if (/ignore-duplicates/.test(p)) { r.__skip = true; break; }
          return { status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint ' + table + '(' + cols + ')' } };
        }
      }
      if (r.__skip) continue;
      rows.push(r); made.push(r);
    }
    return { status: 201, json: /return=minimal/.test(p) ? null : JSON.parse(JSON.stringify(made)) };
  }
  if (method === 'PATCH') {
    const hit = rows.filter(ok);
    hit.forEach((r) => Object.assign(r, body, { updated_at: new Date().toISOString() }));
    return { status: 200, json: /return=minimal/.test(p) ? null : JSON.parse(JSON.stringify(hit)) };
  }
  if (method === 'DELETE') {
    db[table] = rows.filter((r) => !ok(r));
    return { status: 204, json: null };
  }
  return { status: 405, json: { message: 'method' } };
}

/**
 * Install as global.fetch. Supabase calls hit the fake; requests to the site
 * origin for /data/*.json are answered from the repo's own files (that is
 * what production fetches); everything else is refused so a test can never
 * reach a real provider.
 */
function install(db, opts) {
  const o = opts || {};
  const host = o.host || 'fake-supabase.local';
  const fs = require('fs');
  const path = require('path');
  const real = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    const s = String(url);
    const i = init || {};
    if (s.includes(host)) {
      const body = i.body ? JSON.parse(i.body) : undefined;
      const prefer = (i.headers && (i.headers.Prefer || i.headers.prefer)) || '';
      calls.push({ method: (i.method || 'GET').toUpperCase(), url: s });
      const r = handle(db, (i.method || 'GET').toUpperCase(), s, body, prefer);
      return new Response(r.json == null ? '' : JSON.stringify(r.json), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }
    const m = /^https?:\/\/[^/]+\/(data\/[\w-]+\.json)/.exec(s);
    if (m) {
      const f = path.join(__dirname, '..', '..', m[1]);
      if (fs.existsSync(f)) return new Response(fs.readFileSync(f, 'utf8'), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response('not found', { status: 404 });
    }
    if (o.passthrough) return real(url, init);
    throw new Error('programme-fake-db: blocked outbound request to ' + s);
  };
  const restore = () => { global.fetch = real; };
  restore.calls = calls;
  return restore;
}

/**
 * Seed the registry with a season shaped like production's: teams,
 * competitions, fixtures (raw football_fixtures rows). `fixtures` entries use
 * the tests/fixtures/programme shape and are converted here.
 */
function seedRegistry(db, fixtures) {
  const teamId = {};
  const compId = {};
  function team(name) {
    if (!teamId[name]) {
      const id = db.football_teams.length + 1;
      teamId[name] = id;
      db.football_teams.push({ id, canonical_name: name, crest_asset_path: null, is_rayners_lane: name === 'Rayners Lane' });
    }
    return teamId[name];
  }
  function comp(name, type) {
    if (!compId[name]) {
      const id = db.football_competitions.length + 1;
      compId[name] = id;
      db.football_competitions.push({ id, canonical_name: name, competition_type: type });
    }
    return compId[name];
  }
  team('Rayners Lane');
  fixtures.forEach((f, i) => {
    const score = f.us != null ? f.us + ' - ' + f.them : null;
    db.football_fixtures.push({
      id: 500 + i,
      internal_fixture_id: /^fwp-/.test(f.id) && f.id === 'fwp-' + f.externalId && ['578241', '578296', '578321', '590749', '593622', '594563'].indexOf(f.externalId) !== -1
        ? null : f.id,
      external_provider: 'fwp', external_fixture_id: f.externalId, season: '2026-2027',
      competition_id: comp(f.competition, f.competitionType),
      home_team_id: team(f.homeTeam), away_team_id: team(f.awayTeam),
      scheduled_kickoff_at: f.kickoffAt, club_timezone: 'Europe/London',
      original_provider_time: score, venue: f.venue || null,
      fixture_status: f.status, is_home_fixture: f.isHome, programme_eligible: f.isHome,
      sync_status: f.syncStatus || 'ok', kickoff_time_confirmed: f.kickoffTimeConfirmed === false ? false : true,
      source_confidence: 'exact_id',
    });
  });
  return { teamId, compId };
}

module.exports = { makeDb, install, handle, seedRegistry, SCHEMA_V2_TABLES };
