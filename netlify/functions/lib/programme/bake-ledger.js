// Bakes the season ledger into programmes.html as static HTML.
//
//   node netlify/functions/lib/programme/bake-ledger.js
//
// WHY: the archive used to ship "Loading the collection…" and nothing else, so
// any reader without JavaScript — a text-based checker, a crawler, a slow
// phone whose script failed — saw a page that looked broken. The baked copy is
// what they see now; the browser replaces it with the live ledger when the
// programme endpoint answers, and keeps it (with its date) when it does not.
//
// THE BASELINE BELOW IS VERIFIED RECORD, NOT A GUESS: fixtures and results as
// the Football Web Pages site listed them on 9 October 2026 (our goals first), the
// registry's postponement/supersession status from the same day, and the three
// editions the production programme endpoint was serving. When the season
// moves on, re-bake from a new verified snapshot; never edit the HTML by hand.
'use strict';

const fs = require('fs');
const path = require('path');
const REC = require('./reconcile');
const LEDGER = require('../../../../js/programme-ledger');

const AS_OF = '2026-10-09T12:00:00Z';
const L = 'Combined Counties Prem N';
function f(ext, ko, opp, o) {
  const x = o || {};
  return Object.assign({ id: x.id || 'fwp-' + ext, externalId: String(ext), kickoffAt: ko, homeTeam: 'Rayners Lane',
    awayTeam: opp, opponent: opp, isHome: true, competition: x.competition || L,
    competitionType: x.type || 'league', status: x.status || 'scheduled', programmeEligible: true,
    us: x.us == null ? null : x.us, them: x.them == null ? null : x.them }, x.extra || {});
}

const BASELINE = [
  f(578225, '2026-08-01T14:00:00Z', 'Wallingford & Crowmarsh', { status: 'played', us: 3, them: 3 }),
  f(578241, '2026-08-11T18:45:00Z', 'Hilltop', { status: 'postponed', extra: { syncStatus: 'superseded' } }),
  f(571413, '2026-08-15T14:00:00Z', 'New Bradwell St Peter', { id: 'favase-1q-new-bradwell-20260815',
    competition: 'FA Vase First Qualifying Round', type: 'fa_competition', status: 'played', us: 1, them: 2 }),
  f(578278, '2026-08-29T14:00:00Z', 'Ardley United', { status: 'played', us: 0, them: 1 }),
  f(590749, '2026-09-08T11:00:00Z', 'Hilltop', { status: 'played', us: 0, them: 1, extra: { kickoffTimeConfirmed: false } }),
  f(578321, '2026-09-19T13:00:00Z', 'Wokingham Town', { status: 'postponed', extra: { syncStatus: 'superseded' } }),
  f(578384, '2026-10-31T15:00:00Z', 'Thatcham Town'),
  f(578395, '2026-11-07T15:00:00Z', 'Abingdon United'),
  f(578415, '2026-11-28T15:00:00Z', 'Broadfields United'),
  f(578362, '2026-12-01T19:45:00Z', 'Amersham Town'),
];
const EDITIONS = [
  { internal_fixture_id: 'fwp-578225', state: 'full_time_current', published_at: '2026-08-02T00:00:00Z', current_version: 1 },
  { internal_fixture_id: 'favase-1q-new-bradwell-20260815', state: 'published_matchday', published_at: '2026-08-15T00:00:00Z', current_version: 1 },
  { internal_fixture_id: 'fwp-578278', state: 'full_time_current', published_at: '2026-08-29T00:00:00Z', current_version: 1 },
];

function bakedHtml() {
  const rows = REC.publicLedger(REC.reconcile(BASELINE, EDITIONS, Date.parse(AS_OF)));
  return LEDGER.render(rows, { season: '2026/27', asOf: AS_OF, live: false });
}

const START = '<!-- programme-ledger:start -->';
const END = '<!-- programme-ledger:end -->';

function bake(file) {
  const target = file || path.join(__dirname, '..', '..', '..', '..', 'programmes.html');
  const html = fs.readFileSync(target, 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a === -1 || b === -1) throw new Error('ledger markers not found in ' + target);
  const out = html.slice(0, a + START.length) + '\n' + bakedHtml() + '\n' + html.slice(b);
  fs.writeFileSync(target, out);
  return out;
}

if (require.main === module) { bake(); console.log('baked the programme ledger into programmes.html'); }

module.exports = { bake, bakedHtml, BASELINE, EDITIONS, AS_OF, START, END };
