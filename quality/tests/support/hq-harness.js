// Lane HQ test harness: the REAL club-os and football-data functions over the
// in-memory database, with a football registry seeded relative to "now" in
// Europe/London so the scenarios mean the same thing on any day they run.
//
// Every record here is TEST DATA for the browser journeys. Opponent names are
// real league clubs because the fixture list is public; dates, scores,
// owners and amounts are invented for the test and never shown as real.
'use strict';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';
const { makeDb, install } = require('./fake-supabase');

const DAY = 864e5;

/** The UTC instant for a wall-clock time in London on a given day. */
function london(day, hhmm) {
  const guess = Date.parse(`${day}T${hhmm}:00Z`);
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });
  const [h, m] = f.format(new Date(guess)).split(':').map(Number);
  const [H, M] = hhmm.split(':').map(Number);
  return new Date(guess - ((h * 60 + m) - (H * 60 + M)) * 60000).toISOString();
}
function londonDay(offsetDays, from = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(from + offsetDays * DAY));
}

let seq = 0;
function fixture(db, { opp, days, time = '15:00', home = true, status = 'scheduled', score = null, venue = null }) {
  let team = db.football_teams.find((t) => t.canonical_name === opp);
  if (!team) { team = { id: 'team-' + (++seq), canonical_name: opp, crest_asset_path: null, is_rayners_lane: false }; db.football_teams.push(team); }
  const us = db.football_teams[0];
  const day = londonDay(days);
  const row = {
    internal_fixture_id: 'test-' + (++seq), external_fixture_id: String(900000 + seq), season: '2026-2027',
    scheduled_kickoff_at: london(day, time), club_timezone: 'Europe/London',
    home_team_id: home ? us.id : team.id, away_team_id: home ? team.id : us.id, is_home_fixture: home,
    competition_id: 'comp-ccl', venue: venue || (home ? 'Tithe Farm Social Club' : opp + ' (test ground)'),
    fixture_status: status, programme_eligible: home, source_confidence: 'test',
    original_provider_time: score,
  };
  db.football_fixtures.push(row);
  return row;
}

/** The week of Friday 9 October 2026, made relative to today. */
function seedFootball(db) {
  db.football_teams = [{ id: 'team-rl', canonical_name: 'Rayners Lane', crest_asset_path: 'img/badge.png', is_rayners_lane: true }];
  db.football_competitions = [{ id: 'comp-ccl', canonical_name: 'Combined Counties Premier North', competition_type: 'league' }];
  db.football_fixtures = [];
  db.match_state = [];
  db.football_league_tables = [];
  const F = {};
  F.hilltopOff = fixture(db, { opp: 'Hilltop', days: -59, time: '19:45', status: 'postponed' });
  F.bradwell = fixture(db, { opp: 'New Bradwell St Peter', days: -55, status: 'played', score: '1 - 1' });
  F.hilltop = fixture(db, { opp: 'Hilltop', days: -31, time: '19:45', status: 'played', score: '2 - 1' });
  F.harefield = fixture(db, { opp: 'Harefield United', days: -27, home: false, status: 'played', score: '0 - 5' });
  F.wokingOff = fixture(db, { opp: 'Wokingham', days: -20, status: 'postponed' });
  F.ardley = fixture(db, { opp: 'Ardley United', days: -3, time: '19:45', status: 'played', score: '3 - 0' });
  F.holyport = fixture(db, { opp: 'Holyport', days: 1, home: false });
  F.amersham = fixture(db, { opp: 'Amersham Town', days: 11, time: '19:45', home: false });
  F.thatcham = fixture(db, { opp: 'Thatcham Town', days: 22 });
  return F;
}
const fid = (row) => row.internal_fixture_id;

/** Matchday-ops rows as the function returns them (home fixtures only). */
function mdRows(F) {
  const r = (row, status, record) => ({ fixture: { id: fid(row), date: londonDay(0, Date.parse(row.scheduled_kickoff_at)), opponent: (row.__opp || ''), played: false },
    recordStatus: status, record: record || null });
  const opp = (row, name) => { row.__opp = name; return row; };
  return [
    r(opp(F.bradwell, 'New Bradwell St Peter'), 'in_progress', { attendance_calculated: 61 }),
    r(opp(F.hilltop, 'Hilltop'), 'upcoming'),
    r(opp(F.hilltopOff, 'Hilltop'), 'upcoming'),
    r(opp(F.ardley, 'Ardley United'), 'awaiting_reconciliation', { attendance_calculated: 74 }),
    r(opp(F.thatcham, 'Thatcham Town'), 'upcoming'),
  ];
}

/** Club office records: one of each thing the chairman must see. */
function seedClubOffice(db) {
  const now = Date.now(), iso = (d) => new Date(now + d * DAY).toISOString();
  const mk = (o) => db.hq_items.push(Object.assign({ id: require('crypto').randomUUID(), created_at: iso(-1), updated_at: iso(-1), paid_pence: 0, data: {}, in_kind: false, closed_at: null }, o));
  mk({ kind: 'enquiry', title: 'Sponsorship enquiry — Pinner Test Bakery', stage: 'new', created_at: iso(-4), due_date: londonDay(-2) });
  mk({ kind: 'opportunity', title: 'Matchball — Harrow Test Motors', stage: 'proposal', owner: 'Pete Singh', estimate_pence: 10000 });
  mk({ kind: 'opportunity', title: 'Programme advert — Test Café', stage: 'contacted', owner: 'Pete Singh' });
  mk({ kind: 'invoice', title: 'Invoice — Test Lettings', stage: 'issued', value_pence: 25000, paid_pence: 5000, owner: 'Jenny' });
  mk({ kind: 'comms', title: 'Holyport matchday post', stage: 'review', data: { drafted_by: 'Jenny' } });
  mk({ kind: 'task', title: 'Renew FA affiliation paperwork', stage: 'open', owner: 'Jenny', due_date: londonDay(-2) });
  mk({ kind: 'task', title: 'Order new corner flags', stage: 'open', due_date: londonDay(4) });
  db.hq_audit.push({ id: 1, at: iso(-0.1), actor: 'Jenny', action: 'move', entity: 'item', entity_id: 'x', after: { stage: 'review', title: 'Holyport matchday post' } });
  db.hq_audit.push({ id: 2, at: iso(-0.5), actor: 'Pete Singh', action: 'create', entity: 'item', entity_id: 'y', after: { kind: 'opportunity', title: 'Matchball — Harrow Test Motors' } });
}

/**
 * Wire a page to the harness. Returns { db, F, restore }.
 * opts.mdops: rows for matchday-ops list (null = no personal staff session)
 */
async function setupHq(page, opts = {}) {
  const db = makeDb({ attendance: [] });
  const F = seedFootball(db);
  if (opts.clubOffice !== false) seedClubOffice(db);
  if (opts.tasks) opts.tasks(db, F);
  const restore = install(db);
  for (const k of Object.keys(require.cache)) if (/netlify[\\/]functions/.test(k)) delete require.cache[k];
  const fns = { 'club-os': require('../../../netlify/functions/club-os'), 'football-data': require('../../../netlify/functions/football-data') };
  await page.route('**/.netlify/functions/admin-pin', (r) => r.fulfill({ json: { ok: JSON.parse(r.request().postData() || '{}').pin === '1933' } }));
  await page.route('**/.netlify/functions/club-os', async (route) => {
    const res = await fns['club-os'].handler({ httpMethod: 'POST', body: route.request().postData(), headers: {} });
    await route.fulfill({ status: res.statusCode, headers: res.headers, body: res.body });
  });
  await page.route('**/.netlify/functions/football-data*', async (route) => {
    const u = new URL(route.request().url());
    const res = await fns['football-data'].handler({ httpMethod: 'GET', queryStringParameters: Object.fromEntries(u.searchParams) });
    await route.fulfill({ status: res.statusCode, headers: res.headers, body: res.body });
  });
  const rows = opts.mdops === undefined ? mdRows(F) : opts.mdops;
  await page.route('**/.netlify/functions/matchday-ops', (r) => r.fulfill({ json: rows ? { ok: true, rows } : { ok: false, error: 'no session' } }));
  await page.route('**/.netlify/functions/list-members', (r) => r.fulfill({ json: { ok: true, members: opts.members || [] } }));
  await page.route('**/.netlify/functions/list-submissions', (r) => r.fulfill({ json: { ok: true, submissions: opts.submissions || [] } }));
  if (opts.programme !== undefined) await page.route(/\/data\/programme\.json/, (r) => r.fulfill({ json: opts.programme }));
  await page.addInitScript((tok) => {
    try { localStorage.setItem('rlfc_actor', 'Pete Singh'); if (tok) sessionStorage.setItem('rlfc_md_token', 'test-token'); } catch (e) {}
  }, !!rows);
  return { db, F, restore, fid };
}

async function signIn(page, open) {
  await open(page, '/admin.html');
  for (const d of '1933') await page.locator('.pin-btn', { hasText: new RegExp(`^${d}$`) }).click();
  const temp = page.getByRole('button', { name: 'Continue with temporary committee access' });
  await Promise.race([page.locator('#app').waitFor({ state: 'visible' }), temp.waitFor({ state: 'visible' })]).catch(() => {});
  if (await temp.isVisible().catch(() => false)) await temp.click();
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.locator('#hq-home .hq-pri, #hq-home .hq-empty').first().waitFor({ timeout: 15000 });
}

module.exports = { setupHq, signIn, london, londonDay, seedFootball, fid };
