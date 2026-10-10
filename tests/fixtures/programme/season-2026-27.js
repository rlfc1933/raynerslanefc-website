// The 2026/27 Rayners Lane fixture list as the REGISTRY READ LAYER shapes it,
// built from the facts verified on footballwebpages.co.uk on 9 October 2026
// (FWP lists OUR goals first, so us/them are already oriented) and from the
// production registry and programme endpoints read the same day.
//
// Test data for the reconciliation — never served, never presented as live.
//
// Two shapes of the registry are provided, because the reconciliation must be
// right on both:
//   STALE     — before the sync fix: 578241/578321 still 'scheduled' in the
//               past, 590749 with a null kick-off and no internal link.
//   CORRECTED — after the fix: superseded rows carry status 'postponed' and
//               syncStatus 'superseded'; 590749 has a date and
//               kickoffTimeConfirmed=false.
'use strict';

const L = 'Combined Counties Prem N';
const RL = 'Rayners Lane';

function fx(ext, kickoffAt, home, away, opts) {
  const o = opts || {};
  const isHome = home === RL;
  return Object.assign({
    id: o.id || 'fwp-' + ext,
    externalId: String(ext),
    season: '2026-2027',
    kickoffAt,
    homeTeam: home, awayTeam: away,
    isHome,
    opponent: isHome ? away : home,
    competition: o.competition || L,
    competitionType: o.competitionType || 'league',
    status: o.status || 'scheduled',
    programmeEligible: isHome,
    venue: o.venue === undefined ? 'Tithe Farm Sports & Social Club' : o.venue,
    us: o.us == null ? null : o.us,
    them: o.them == null ? null : o.them,
  }, o.extra || {});
}

function base() {
  return [
    fx(578225, '2026-08-01T14:00:00Z', RL, 'Wallingford & Crowmarsh', { status: 'played', us: 3, them: 3 }),
    // Broadfields' home fixture at the ground we share. Official away.
    fx(578227, '2026-08-04T18:45:00Z', 'Broadfields United', RL, { status: 'played', us: 1, them: 2 }),
    fx(571321, '2026-08-08T14:00:00Z', 'London Lions', RL, { id: 'facup-ep-london-lions-20260808',
      competition: 'FA Cup EP', competitionType: 'fa_competition', status: 'played', venue: 'Rowley Lane Sports Ground' }),
    // CUP. FA Vase First Qualifying Round. Must be included.
    fx(571413, '2026-08-15T14:00:00Z', RL, 'New Bradwell St Peter', { id: 'favase-1q-new-bradwell-20260815',
      competition: 'FA Vase 1Q', competitionType: 'fa_competition', status: 'played', us: 1, them: 2 }),
    fx(578256, '2026-08-19T18:45:00Z', 'Burnham', RL, { status: 'played', us: 0, them: 1, venue: 'The 1878 Stadium' }),
    fx(578278, '2026-08-29T14:00:00Z', RL, 'Ardley United', { status: 'played', us: 0, them: 1 }),
    fx(578283, '2026-08-31T10:30:00Z', 'North Greenford United', RL, { status: 'played', venue: 'Berkeley Fields' }),
    fx(578309, '2026-09-15T18:45:00Z', 'Northwood', RL, { status: 'played', venue: 'Northwood Park' }),
    fx(578325, '2026-09-26T14:00:00Z', 'Bedfont', RL, { status: 'played', venue: 'The Orchard' }),
    fx(578264, '2026-09-29T14:00:00Z', 'Harefield United', RL, { status: 'played', us: 0, them: 5, venue: 'Preston Park' }),
    fx(578338, '2026-10-03T14:00:00Z', 'Easington Sports', RL, { status: 'played', us: 0, them: 2, venue: 'Addison Road' }),
    fx(593622, '2026-10-10T13:00:00Z', 'Holyport', RL, { venue: null }),
    fx(578359, '2026-10-17T13:00:00Z', 'Reading City', RL, { venue: 'Scours Lane' }),
    fx(578371, '2026-10-24T13:00:00Z', 'Penn & Tylers Green', RL, { venue: 'Elm Road' }),
    fx(578384, '2026-10-31T15:00:00Z', RL, 'Thatcham Town'),
    fx(578395, '2026-11-07T15:00:00Z', RL, 'Abingdon United'),
    fx(594563, '2026-11-21T15:00:00Z', 'Camberley Town', RL, { competition: 'Premier Challenge Cup 2',
      competitionType: 'league_cup', venue: null }),
    // OUR home fixture against Broadfields at the shared ground — the reverse
    // of 4 Aug. Same venue, opposite official designation.
    fx(578415, '2026-11-28T15:00:00Z', RL, 'Broadfields United'),
    fx(578362, '2026-12-01T19:45:00Z', RL, 'Amersham Town'),
  ];
}

/** The registry before the lead engineer's superseded-row fix. */
function stale() {
  return base().concat([
    fx(578241, '2026-08-11T18:45:00Z', RL, 'Hilltop'),                 // P-P, still 'scheduled'
    fx(578296, '2026-10-10T13:00:00Z', 'Holyport', RL, { venue: 'Summerleaze Village' }),
    fx(578321, '2026-09-19T13:00:00Z', RL, 'Wokingham Town'),          // P-P, dropped by FWP
    // The rearranged Hilltop match: new FWP id, played 0-1, no kick-off known.
    fx(590749, null, RL, 'Hilltop', { status: 'played', us: 0, them: 1, venue: null }),
  ]);
}

/** The registry after the fix (Europe/London facts from the coordinator). */
function corrected() {
  return base().concat([
    fx(578241, '2026-08-11T18:45:00Z', RL, 'Hilltop', { status: 'postponed', extra: { syncStatus: 'superseded' } }),
    fx(578296, '2026-09-05T13:00:00Z', 'Holyport', RL, { status: 'postponed', extra: { syncStatus: 'superseded' } }),
    fx(578321, '2026-09-19T13:00:00Z', RL, 'Wokingham Town', { status: 'postponed', extra: { syncStatus: 'superseded' } }),
    // Date known, time not: stored as 12:00 with kickoffTimeConfirmed=false.
    fx(590749, '2026-09-08T11:00:00Z', RL, 'Hilltop', { status: 'played', us: 0, them: 1,
      extra: { kickoffTimeConfirmed: false } }),
  ]);
}

/** programme_editions as production served them on 9 Oct 2026. */
function productionEditions() {
  return [
    { id: 1, internal_fixture_id: 'fwp-578225', external_fixture_id: '578225', state: 'full_time_current',
      published_at: '2026-08-02T09:00:00Z', current_version: 2, publication_source_detail: 'recovery' },
    { id: 2, internal_fixture_id: 'favase-1q-new-bradwell-20260815', external_fixture_id: '571413',
      state: 'published_matchday', published_at: '2026-08-15T13:10:00Z', current_version: 1 },
    { id: 3, internal_fixture_id: 'fwp-578278', external_fixture_id: '578278', state: 'full_time_current',
      published_at: '2026-08-29T13:20:00Z', current_version: 2 },
  ];
}

// 9 Oct 2026, midday in London.
const NOW = Date.parse('2026-10-09T11:00:00Z');

module.exports = { stale, corrected, productionEditions, NOW, fx };
