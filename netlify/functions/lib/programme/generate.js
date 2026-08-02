// GATE 6 — assembling a matchday programme from what the club already knows.
//
// The whole point: a complete, respectable programme exists for every home
// fixture WITHOUT anybody writing a word. The old system had eight fields and
// seven of them were empty, so there was no programme at all.
//
// Optional editorial makes it better. Its absence never decides whether it
// exists.
//
// Pure assembly — the caller supplies the data, this shapes it. No network.
'use strict';

var MT = require('../../../../js/match-time');

/** Sections in order. `mandatory` decides whether the programme may publish. */
var SECTIONS = [
  { key: 'cover',       heading: 'Matchday',              mandatory: true },
  { key: 'welcome',     heading: 'Welcome to The Lane',   mandatory: true },
  { key: 'opposition',  heading: 'Today’s Opposition',    mandatory: true },
  { key: 'staff',       heading: 'Committee & Staff',     mandatory: true },
  { key: 'sponsors',    heading: 'Our Partners',          mandatory: true },
  { key: 'standings',   heading: 'League Table',          mandatory: false },
  { key: 'fixtures',    heading: 'Results & Fixtures',    mandatory: true },
  { key: 'join',        heading: 'Join The Lane',         mandatory: true },
  { key: 'history',     heading: 'History of The Lane',   mandatory: true },
  { key: 'squads',      heading: 'Today’s Squads',        mandatory: false },
];

function clubTime(iso) {
  var ms = Date.parse(iso);
  return isFinite(ms) ? MT.formatKickoffClub(ms) : '';
}
function clubDateLong(iso) {
  var ms = Date.parse(iso);
  if (!isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(ms));
}

/**
 * The welcome.
 *
 * Deliberately NOT attributed to the Chair or the manager. Putting a real
 * person's name on generated copy is dishonest, and the moment a supporter
 * realises it was automatic, every genuine word in the programme is devalued.
 */
function welcomeCopy(ctx) {
  var opp = ctx.opponent || 'our visitors';
  var comp = ctx.competition ? ('today’s ' + ctx.competition + ' fixture') : 'today’s fixture';
  var venue = ctx.venue || 'Tithe Farm';
  return {
    lead: 'Rayners Lane Football Club extends a warm welcome to the players, ' +
      'officials and supporters of ' + opp + ' for ' + comp + ' at ' + venue + '.',
    body: 'Thank you for joining us. Whether you have travelled with ' + opp +
      ' or you are here to back The Lane, we hope you enjoy the game — and we ' +
      'look forward to seeing you again at Tithe Farm.',
    attributed: false,
  };
}

/**
 * Opposition. Uses an approved profile when one exists; otherwise builds an
 * honest factual preview from the table and recent form.
 *
 * Never invents history. A club with no profile yet gets real context, not
 * imagined heritage.
 */
function oppositionSection(ctx) {
  var facts = [];
  if (ctx.oppositionRow) {
    facts.push({ label: 'League position', value: ordinal(ctx.oppositionRow.position) });
    facts.push({ label: 'Played', value: String(ctx.oppositionRow.played) });
    facts.push({ label: 'Points', value: String(ctx.oppositionRow.points) });
    facts.push({ label: 'Goal difference', value: (ctx.oppositionRow.goalDifference > 0 ? '+' : '') + ctx.oppositionRow.goalDifference });
  }
  if (ctx.oppositionGround) facts.push({ label: 'Home ground', value: ctx.oppositionGround });
  return {
    name: ctx.opponent,
    crest: ctx.opponentCrest || null,
    approvedProfile: ctx.oppositionProfile || null,
    facts: facts,
    previousMeetings: ctx.previousMeetings || [],
    // Said plainly rather than padded out with invention.
    note: ctx.oppositionProfile ? null :
      'A fuller profile of ' + ctx.opponent + ' will appear here as the club’s records grow.',
  };
}

function ordinal(n) {
  n = Number(n);
  if (!isFinite(n)) return '';
  var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function standingsSection(ctx) {
  // A cup tie is not decided by the league table, so it does not get one.
  if (ctx.competitionType && ctx.competitionType !== 'league') {
    return {
      type: 'cup',
      competition: ctx.competition,
      round: ctx.round || null,
      form: ctx.form || [],
      note: 'Cup football — league standings do not apply to today’s tie.',
    };
  }
  if (!ctx.table || !ctx.table.rows || !ctx.table.rows.length) return null;
  return {
    type: 'league',
    competition: ctx.competition,
    lastUpdated: ctx.table.lastSyncedAt || null,
    rows: ctx.table.rows.map(function (r) {
      return {
        position: r.position, team: r.team,
        played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
        goalDifference: r.goalDifference, points: r.points,
        isUs: !!r.isUs,
        isOpposition: !!(ctx.opponentKey && r.team && ctx.opponentKey(r.team)),
      };
    }),
  };
}

function squadsSection(ctx) {
  if (!ctx.lineups || !ctx.lineups.confirmed) {
    return { confirmed: false, note: 'Official squads will appear here once both teams are submitted.' };
  }
  function side(l, teamName, crest) {
    return {
      team: teamName, crest: crest || null,
      starters: (l.starters || []).map(shapePlayer),
      substitutes: (l.substitutes || []).filter(function (p) { return p.role === 'substitute'; }).map(shapePlayer),
    };
  }
  function shapePlayer(p) {
    return { name: p.name, number: p.number || null, isCaptain: !!p.isCaptain };
  }
  return {
    confirmed: true,
    home: side(ctx.lineups.home, ctx.homeTeam, ctx.homeCrest),
    away: side(ctx.lineups.away, ctx.awayTeam, ctx.awayCrest),
    referee: ctx.referee || null,
  };
}

/**
 * Build the whole edition.
 * @returns {{sections:Object, order:string[], validation:{ok:boolean, missing:string[]}}}
 */
function build(ctx) {
  var sections = {};

  sections.cover = {
    homeTeam: ctx.homeTeam, awayTeam: ctx.awayTeam,
    homeCrest: ctx.homeCrest || null, awayCrest: ctx.awayCrest || null,
    competition: ctx.competition || null,
    dateLong: clubDateLong(ctx.kickoffAt),
    kickoff: clubTime(ctx.kickoffAt),
    venue: ctx.venue || null,
    season: ctx.season || null,
    matchSponsor: ctx.matchSponsor || null,
    title: 'Matchday Programme',
  };
  sections.welcome    = welcomeCopy(ctx);
  sections.opposition = oppositionSection(ctx);
  sections.staff      = { groups: ctx.staffGroups || [] };
  sections.sponsors   = { tiers: ctx.sponsorTiers || [] };
  sections.standings  = standingsSection(ctx);
  sections.fixtures   = {
    recent: ctx.recentResults || [],
    today: {
      homeTeam: ctx.homeTeam, awayTeam: ctx.awayTeam,
      competition: ctx.competition, kickoff: clubTime(ctx.kickoffAt),
    },
    upcoming: ctx.upcomingFixtures || [],
  };
  sections.join = {
    headline: 'JOIN THE LANE',
    lead: 'Put your business at the heart of The Lane.',
    body: 'Rayners Lane FC has played in Harrow since 1933. Partnering with the ' +
      'club puts your name in front of a local community every matchday — on ' +
      'the pitch side, in this programme and across the club’s website.',
    // Real routes only. No invented packages, no prices the club has not agreed.
    options: ctx.sponsorshipOptions || [],
    contact: ctx.sponsorshipContact || null,
  };
  sections.history = ctx.clubHistory || null;
  sections.squads  = squadsSection(ctx);

  // Optional editorial, layered on top. Never gates anything.
  if (ctx.chairNotes)    sections.chairNotes = { body: ctx.chairNotes, byline: ctx.chairName || null };
  if (ctx.managerNotes)  sections.managerNotes = { body: ctx.managerNotes, byline: ctx.managerName || null };

  var missing = SECTIONS.filter(function (s) {
    if (!s.mandatory) return false;
    var v = sections[s.key];
    if (!v) return true;
    if (s.key === 'staff' && !v.groups.length) return true;
    if (s.key === 'sponsors' && !v.tiers.length) return true;
    if (s.key === 'history' && !v) return true;
    return false;
  }).map(function (s) { return s.key; });

  return {
    sections: sections,
    order: SECTIONS.map(function (s) { return s.key; }),
    headings: SECTIONS.reduce(function (m, s) { m[s.key] = s.heading; return m; }, {}),
    validation: { ok: missing.length === 0, missing: missing },
  };
}

module.exports = { SECTIONS, build, welcomeCopy, oppositionSection, standingsSection, squadsSection, ordinal };
