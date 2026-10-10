// PROGRAMME RECONCILIATION — every Rayners Lane fixture against the programme
// record, in one table, with an honest status and a repair action per row.
//
// WHY THIS EXISTS (the October 2026 archive diagnosis)
// ---------------------------------------------------
// The archive looked broken from outside because it rendered "Loading the
// collection…" until JavaScript finished, and underneath that there were real
// faults, each of which hid a home fixture from the programme system:
//
//   1. programme-sync only looked at fixtures that kicked off in the last seven
//      days, so a home match that passed without an edition never got a record
//      at all — nothing could list it, recover it or say it was missing.
//   2. a fixture whose kick-off time was not known (the rearranged Hilltop
//      match, FWP 590749, stored with no confirmed time) was filtered out by
//      `f.scheduled_kickoff_at &&` before eligibility was even considered.
//   3. a provider fixture with no link to the club's legacy list carried
//      internal_fixture_id = null, and the edition was written with that null —
//      so programme.html?id=… could never find it.
//   4. a fixture the provider has dropped or replaced (P-P, new FWP id) kept
//      looking "scheduled" in the past, so it read as a missing programme
//      rather than a postponement.
//
// This module is pure: it takes the registry's fixtures (as the read layer
// shapes them) and the programme editions, and returns the reconciliation. No
// network, no clock of its own. The same function runs in the tests (against
// fixtures built from the verified facts), in the HQ status endpoint, and in
// the public archive ledger.
'use strict';

var PUBLIC_STATES = ['published_matchday', 'published_late', 'full_time_current',
  'archived', 'published_recovery'];
var REVIEW_STATES = ['retrospective_candidate', 'ready_for_review', 'approved'];
var DRAFT_STATES = ['draft_hidden', 'waiting_for_matchday', 'waiting_for_lineups', 'ready_to_publish'];

var DAY = 86400000;

function clubKey(name) {
  return String(name || '').toLowerCase().replace(/&/g, 'and')
    .replace(/\b(fc|afc|football club)\b/g, '').replace(/[^a-z0-9]+/g, '');
}

/** The id every surface uses for a fixture — the read layer's rule. */
function fixtureKey(f) {
  if (!f) return null;
  if (f.id) return String(f.id);
  if (f.internal_fixture_id) return String(f.internal_fixture_id);
  var ext = f.externalId || f.external_fixture_id;
  return ext ? 'fwp-' + ext : null;
}

function isCup(f) {
  var t = String(f.competitionType || '').toLowerCase();
  if (t) return t !== 'league';
  return /cup|vase|trophy|shield/i.test(f.competition || '');
}
function isFriendly(f) {
  return /friendly/i.test(f.competition || '') || String(f.competitionType || '') === 'friendly';
}

/** Official home designation. NEVER the venue — Broadfields share Tithe Farm. */
function isOfficialHome(f) {
  return f.isHome === true || f.is_home_fixture === true;
}

function hasResult(f) { return f.us != null && f.them != null; }

/** The club's calendar day for a fixture, or null when nothing is known. */
function clubDate(f) {
  if (f.providerDate) return String(f.providerDate).slice(0, 10);
  var ms = Date.parse(f.kickoffAt);
  if (!isFinite(ms)) return null;
  var p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day;
}

/**
 * What actually happened to this fixture.
 *
 * Tolerates the registry's superseded rows: the sync marks a fixture replaced by
 * a new provider id as fixture_status 'postponed' + sync_status 'superseded'.
 * Before that fix landed, the same row simply stayed 'scheduled' in the past —
 * so a stale scheduled row with no result is recognised by a LATER row against
 * the same opponent with the same home designation and competition.
 */
function classify(f, all, nowMs) {
  var s = String(f.status || f.fixture_status || 'unknown').toLowerCase();
  var sync = String(f.syncStatus || f.sync_status || '').toLowerCase();
  var ko = Date.parse(f.kickoffAt);
  var replacement = findReplacement(f, all);

  if (sync === 'superseded') return { status: 'superseded', supersededBy: replacement };
  if (s === 'cancelled' || s === 'abandoned') return { status: s, supersededBy: replacement };
  if (s === 'postponed') return { status: replacement ? 'superseded' : 'postponed', supersededBy: replacement };
  if (s === 'played' || hasResult(f)) return { status: 'played' };
  if (s === 'scheduled' || s === 'awaiting_result' || s === 'unknown') {
    if (isFinite(ko) && ko + DAY < nowMs) {
      // In the past with no result. Either replaced, or genuinely unknown.
      if (replacement) return { status: 'superseded', supersededBy: replacement, inferred: true };
      return { status: 'unconfirmed' };
    }
    if (isFinite(ko) && ko <= nowMs) return { status: 'in_progress_or_awaiting' };
    return { status: 'scheduled' };
  }
  return { status: s };
}

function findReplacement(f, all) {
  var key = fixtureKey(f);
  var opp = clubKey(f.opponent || (isOfficialHome(f) ? f.awayTeam : f.homeTeam));
  var ko = Date.parse(f.kickoffAt);
  var c = (all || []).filter(function (g) {
    if (fixtureKey(g) === key) return false;
    var gOpp = clubKey(g.opponent || (isOfficialHome(g) ? g.awayTeam : g.homeTeam));
    if (!opp || gOpp !== opp) return false;
    if (isOfficialHome(g) !== isOfficialHome(f)) return false;
    if ((f.competition || '') && (g.competition || '') && f.competition !== g.competition) return false;
    var gs = String(g.status || '').toLowerCase();
    if (gs === 'postponed' || gs === 'cancelled' || String(g.syncStatus || g.sync_status || '') === 'superseded') return false;
    var gko = Date.parse(g.kickoffAt);
    // The replacement is later (or its date is unknown but it is played).
    return (isFinite(gko) && isFinite(ko) && gko > ko) || (!isFinite(gko) && gs === 'played');
  });
  // The nearest later one: a club plays the same opponent at home once per
  // league season, so a second candidate means a cup tie or bad data.
  c.sort(function (a, b) { return (Date.parse(a.kickoffAt) || 9e15) - (Date.parse(b.kickoffAt) || 9e15); });
  return c.length ? fixtureKey(c[0]) : null;
}

function editionFor(f, editions) {
  var key = fixtureKey(f);
  var ext = String(f.externalId || f.external_fixture_id || '');
  return (editions || []).filter(function (e) {
    return (e.internal_fixture_id && String(e.internal_fixture_id) === key) ||
      (ext && e.external_fixture_id && String(e.external_fixture_id) === ext);
  })[0] || null;
}

/**
 * One reconciliation row.
 * Status vocabulary is the directive's, so a person reading the HQ table and a
 * test reading the code agree on what each word means.
 */
function row(f, all, editions, nowMs) {
  var c = classify(f, all, nowMs);
  var home = isOfficialHome(f);
  var friendly = isFriendly(f);
  var ed = editionFor(f, editions);
  var isPublic = !!(ed && PUBLIC_STATES.indexOf(ed.state) !== -1);
  var published = !!(ed && ed.published_at);
  var played = c.status === 'played';
  var calledOff = ['postponed', 'superseded', 'cancelled', 'abandoned'].indexOf(c.status) !== -1;
  var expected = home && !friendly && !calledOff;
  var errors = [];
  var status, action;

  if (!f.kickoffAt && !f.providerDate) errors.push('no date in the registry');
  if (f.kickoffTimeConfirmed === false) errors.push('kick-off time not confirmed (date only)');
  if (home && !f.programmeEligible && expected && !friendly) {
    errors.push('registry marks it not programme-eligible although it is an official home fixture');
  }

  if (!home) {
    status = 'Not required';
    action = 'none — away fixture (official designation, not venue)';
  } else if (friendly) {
    status = 'Not required';
    action = 'none — friendlies carry no automatic programme';
  } else if (calledOff) {
    status = c.status === 'cancelled' ? 'Fixture cancelled'
      : c.status === 'abandoned' ? 'Fixture abandoned' : 'Fixture postponed';
    if (published) {
      action = 'preserve the published edition and mark it postponed';
    } else if (c.supersededBy) {
      action = 'cancellation record only — the match was rearranged as ' + c.supersededBy;
    } else {
      action = 'cancellation record only — await a new date';
    }
  } else if (isPublic && ed.current_version > 0) {
    status = 'Published';
    action = 'none';
  } else if (published && !isPublic) {
    status = 'Published but inaccessible';
    action = ed.unpublished_at ? 'unpublished by ' + (ed.unpublished_by || 'staff') + ' — leave unless reversed'
      : 'restore a public state for the edition';
  } else if (published && !(ed.current_version > 0)) {
    status = 'Published but inaccessible';
    action = 'the edition points at no version — re-run publication (repairs, never duplicates)';
  } else if (c.status === 'unconfirmed') {
    status = 'Requires manual evidence';
    action = 'confirm the outcome against the league / FA Full-Time record before acting';
  } else if (played) {
    if (ed && REVIEW_STATES.indexOf(ed.state) !== -1) {
      status = 'Awaiting approval';
      action = 'authorise the retrospective Archive Edition in Programme HQ';
    } else {
      status = 'Historical edition missing';
      action = ed ? 'prepare a retrospective Archive Edition (record exists, never published)'
        : 'create the record and prepare a retrospective Archive Edition';
    }
  } else if (ed && REVIEW_STATES.indexOf(ed.state) !== -1) {
    status = 'Awaiting approval';
    action = 'approve the editorial edition in Programme HQ';
  } else if (ed && ed.state === 'publication_error') {
    status = 'Publication error';
    action = 'see the last error and retry — retries never duplicate';
  } else if (ed) {
    status = 'Draft only';
    action = 'none yet — publishes on matchday once approved';
  } else {
    status = 'Never generated';
    action = 'create the draft record (the next programme-sync run does this)';
  }

  return {
    fixtureId: fixtureKey(f),
    externalId: f.externalId || f.external_fixture_id || null,
    competition: f.competition || null,
    cup: isCup(f),
    date: clubDate(f),
    kickoffAt: f.kickoffAt || null,
    kickoffTimeConfirmed: f.kickoffTimeConfirmed !== false && !!f.kickoffAt,
    homeTeam: f.homeTeam || null,
    awayTeam: f.awayTeam || null,
    opponent: f.opponent || (home ? f.awayTeam : f.homeTeam) || null,
    officialHome: home,
    matchStatus: c.status,
    supersededBy: c.supersededBy || null,
    result: hasResult(f) ? { us: f.us, them: f.them } : null,
    programmeExpected: expected,
    recordExists: !!ed,
    htmlExists: !!(ed && ed.current_version > 0),
    // The PDF is printed from the HTML edition by its print stylesheet; there
    // is no separately stored PDF asset, so it exists exactly when the HTML does.
    pdfExists: !!(ed && ed.current_version > 0) ? 'on demand from the HTML edition' : false,
    published: published,
    publiclyAccessible: isPublic,
    editionState: ed ? ed.state : null,
    editionKind: ed ? (ed.edition_kind || (ed.publication_source_detail === 'retrospective' ? 'retrospective' : 'matchday')) : null,
    teamsStatus: ed ? (ed.teams_status || null) : null,
    status: status,
    errors: errors,
    repairAction: action,
  };
}

/**
 * Reconcile a season.
 * @param {object[]} fixtures shaped registry fixtures (READ.results/season)
 * @param {object[]} editions programme_editions rows
 * @param {number}   nowMs
 */
function reconcile(fixtures, editions, nowMs) {
  var now = nowMs == null ? Date.now() : nowMs;
  var all = fixtures || [];
  var rows = all.map(function (f) { return row(f, all, editions, now); });
  rows.sort(function (a, b) { return String(a.date || '9999').localeCompare(String(b.date || '9999')); });

  // Editions whose fixture has vanished from the registry are still the
  // club's record. Never delete them; report them.
  var keys = {};
  rows.forEach(function (r) { keys[r.fixtureId] = true; if (r.externalId) keys['ext:' + r.externalId] = true; });
  var orphans = (editions || []).filter(function (e) {
    return !keys[e.internal_fixture_id] && !(e.external_fixture_id && keys['ext:' + e.external_fixture_id]);
  }).map(function (e) {
    return { fixtureId: e.internal_fixture_id, state: e.state, status: 'Edition without a registry fixture',
      repairAction: 'keep the edition; link it to the replacement fixture if one exists' };
  });

  var home = rows.filter(function (r) { return r.officialHome; });
  var expected = home.filter(function (r) { return r.programmeExpected; });
  var playedExpected = expected.filter(function (r) { return r.matchStatus === 'played'; });
  return {
    rows: rows,
    orphans: orphans,
    summary: {
      fixtures: rows.length,
      homeFixtures: home.length,
      eligibleHome: expected.length,
      eligiblePlayedHome: playedExpected.length,
      cupHome: expected.filter(function (r) { return r.cup; }).length,
      programmeRecords: rows.filter(function (r) { return r.recordExists; }).length,
      published: rows.filter(function (r) { return r.status === 'Published'; }).length,
      historicalMissing: rows.filter(function (r) { return r.status === 'Historical edition missing'; })
        .map(function (r) { return r.fixtureId; }),
      postponed: home.filter(function (r) { return /postponed|cancelled|abandoned/i.test(r.status); })
        .map(function (r) { return r.fixtureId; }),
      superseded: rows.filter(function (r) { return r.matchStatus === 'superseded'; })
        .map(function (r) { return { fixtureId: r.fixtureId, by: r.supersededBy }; }),
      needsEvidence: rows.filter(function (r) { return r.status === 'Requires manual evidence'; })
        .map(function (r) { return r.fixtureId; }),
      nextHome: (expected.filter(function (r) {
        return r.matchStatus === 'scheduled' && Date.parse(r.kickoffAt) > now;
      })[0] || {}).fixtureId || null,
    },
  };
}

/**
 * The public face of the reconciliation: the season's home fixtures and what
 * a supporter can find for each. No internal vocabulary, nothing private.
 */
function publicLedger(rec) {
  return rec.rows.filter(function (r) {
    return r.officialHome && (r.programmeExpected || /postponed|cancelled|abandoned/i.test(r.status));
  }).map(function (r) {
    var label, kind;
    if (r.publiclyAccessible) {
      kind = r.editionKind === 'retrospective' ? 'retrospective' : 'published';
      label = kind === 'retrospective' ? 'Archive edition' : 'Programme published';
    } else if (/postponed|cancelled|abandoned/i.test(r.status)) {
      kind = 'postponed';
      label = r.status === 'Fixture cancelled' ? 'Match cancelled'
        : r.status === 'Fixture abandoned' ? 'Match abandoned'
        : (r.supersededBy ? 'Postponed · rearranged' : 'Postponed');
    } else if (r.matchStatus === 'played') {
      kind = 'missing';
      label = 'Archive edition in preparation';
    } else if (r.status === 'Requires manual evidence') {
      kind = 'unknown';
      label = 'Awaiting the official record';
    } else {
      kind = 'upcoming';
      label = 'Not yet published';
    }
    return {
      fixtureId: r.fixtureId, date: r.date, kickoffAt: r.kickoffAt,
      kickoffTimeConfirmed: r.kickoffTimeConfirmed,
      opponent: r.opponent, competition: r.competition, cup: r.cup,
      result: r.result, kind: kind, label: label,
      supersededBy: r.supersededBy, readable: r.publiclyAccessible,
    };
  });
}

module.exports = {
  PUBLIC_STATES: PUBLIC_STATES, fixtureKey: fixtureKey, classify: classify,
  isOfficialHome: isOfficialHome, isCup: isCup, clubDate: clubDate,
  reconcile: reconcile, publicLedger: publicLedger, row: row,
};
