// ════════════════════════════════════════════════════════════════════════
//  SUPPORTER GROWTH — measured, not imagined. Pure functions.
//
//  One verified home-attendance figure per home fixture:
//    · recorded by one person (turnstile count / headcount), confirmed by a
//      DIFFERENT named person — or taken from a Match Day Ops record that has
//      already been completed/locked through its own approval;
//  First-time vs returning supporters come ONLY from Lane Card check-ins
//  (attendance table) and are labelled as such — they are a subset of the
//  crowd, never the crowd. Page views are never attendance.
//  The 40 / 50 / 75 / 100 milestones are aspirations, not forecasts.
// ════════════════════════════════════════════════════════════════════════
'use strict';
const SJ = require('./sponsor-journey');

const MILESTONES = [40, 50, 75, 100];
const METHODS = ['turnstile count', 'manual headcount', 'clicker count', 'match day ops'];
const BASELINE_MATCHES = 3;

function recordGuard(fixture, headcount, nowMs = Date.now()) {
  if (!fixture) return 'Pick a home fixture from the registry.';
  if (fixture.isHome === false) return 'Only home attendance is recorded here.';
  if (fixture.syncStatus === 'superseded') return 'That fixture row was rearranged — record against the new date.';
  if (['postponed', 'cancelled'].includes(fixture.status)) return `That fixture was ${fixture.status} — there is no attendance to record.`;
  if (!fixture.kickoffAt || Date.parse(fixture.kickoffAt) > nowMs) return 'That match has not been played yet.';
  const n = Number(headcount);
  if (!Number.isInteger(n) || n < 0 || n > 5000) return 'Enter the counted number of people (a whole number).';
  return null;
}
function verifyGuard(row, actor) {
  if (!row) return 'Not found.';
  if (row.verified_by) return `Already verified by ${row.verified_by}.`;
  if (!actor) return 'Verification must be signed by a named person.';
  if (String(row.recorded_by || '').trim().toLowerCase() === String(actor).trim().toLowerCase())
    return 'Someone other than the person who counted should confirm the figure.';
  return null;
}

/** Merge HQ figures and completed Match Day Ops records into one list, newest first. */
function verifiedFigures(hqRows = [], mdRows = []) {
  const out = {};
  for (const m of mdRows) {
    if (!['completed', 'locked'].includes(m.status) || m.attendance_official == null) continue;
    const snap = m.fixture_snapshot || {};
    if (snap.isHome === false) continue;
    const date = String(snap.date || '').slice(0, 10); if (!date) continue;
    out[date] = { date, fixture_id: m.fixture_id, opponent: snap.opponent || null, headcount: m.attendance_official, source: 'Match Day Ops (approved)', verified: true };
  }
  for (const r of hqRows) {
    const date = String(r.match_date || '').slice(0, 10); if (!date) continue;
    if (r.verified_by) out[date] = { date, fixture_id: r.fixture_id, opponent: r.opponent, headcount: r.headcount, source: r.method + ' · verified by ' + r.verified_by, verified: true };
    else if (!out[date]) out[date] = { date, fixture_id: r.fixture_id, opponent: r.opponent, headcount: r.headcount, source: r.method + ' · awaiting confirmation', verified: false, id: r.id, recorded_by: r.recorded_by };
  }
  return Object.values(out).sort((a, b) => b.date.localeCompare(a.date));
}

function avg(list) { return list.length ? Math.round(list.reduce((s, x) => s + x.headcount, 0) / list.length) : null; }

/** Progress against the aspirational milestones — only verified figures count. */
function progress(figures) {
  const v = figures.filter((f) => f.verified).sort((a, b) => a.date.localeCompare(b.date));
  const baselineReady = v.length >= BASELINE_MATCHES;
  const baseline = baselineReady ? avg(v.slice(0, BASELINE_MATCHES)) : null;
  const recent = avg(v.slice(-5));
  const next = MILESTONES.find((m) => recent == null || recent < m) || null;
  return {
    verifiedMatches: v.length, average: avg(v), recentAverage: recent, baseline, baselineReady,
    baselineNote: baselineReady ? `Average of the first ${BASELINE_MATCHES} verified home matches.` : `Establishing the verified baseline: ${v.length} of ${BASELINE_MATCHES} home matches recorded and confirmed.`,
    milestones: MILESTONES.map((m) => ({ target: m, reached: recent != null && recent >= m })),
    nextMilestone: next,
    kind: 'aspiration',
    note: 'Milestones are aspirations for the club, not predictions.',
  };
}

/**
 * Lane Card check-ins per home match date: first-time vs returning cardholders.
 * A "first time" is the first home check-in we have for that card — so it means
 * "first time with the card", and says so.
 */
function checkins(rows = []) {
  const home = rows.filter((r) => r.home !== false && r.lane_no && r.match_date);
  const firstSeen = {}; const visits = {};
  for (const r of home.slice().sort((a, b) => String(a.match_date).localeCompare(String(b.match_date)))) {
    const d = String(r.match_date).slice(0, 10);
    if (!firstSeen[r.lane_no]) firstSeen[r.lane_no] = d;
    visits[r.lane_no] = visits[r.lane_no] || new Set(); visits[r.lane_no].add(d);
  }
  const byDate = {};
  for (const r of home) {
    const d = String(r.match_date).slice(0, 10);
    byDate[d] = byDate[d] || new Set(); byDate[d].add(r.lane_no);
  }
  const matches = Object.keys(byDate).sort().reverse().map((d) => {
    const cards = Array.from(byDate[d]);
    const first = cards.filter((c) => firstSeen[c] === d).length;
    return { date: d, checkins: cards.length, firstTime: first, returning: cards.length - first };
  });
  const holders = Object.keys(visits);
  const repeaters = holders.filter((h) => visits[h].size >= 2).length;
  return { matches, cardholders: holders.length, repeatVisitRate: holders.length ? Math.round((repeaters / holders.length) * 100) : null,
    note: 'Lane Card check-ins only — a subset of the crowd, not the whole attendance.' };
}

/** Home fixtures that have been played and still need a figure. */
function missingFigures(fixtures, figures, nowMs = Date.now()) {
  const have = new Set(figures.map((f) => f.date));
  return fixtures.filter((f) => f.isHome !== false && f.syncStatus !== 'superseded' && !['postponed', 'cancelled'].includes(f.status)
    && f.kickoffAt && Date.parse(f.kickoffAt) < nowMs && !have.has(SJ.londonDate(f.kickoffAt)));
}

module.exports = { MILESTONES, METHODS, BASELINE_MATCHES, recordGuard, verifyGuard, verifiedFigures, progress, checkins, missingFigures };
