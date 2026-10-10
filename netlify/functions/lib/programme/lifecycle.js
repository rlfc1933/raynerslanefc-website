// THE TWO-STAGE PROGRAMME — pure decisions layered over publish-rules.js.
//
//   Stage A — the EDITORIAL edition. A named person approves it; on matchday
//             (Europe/London) the engine publishes it with the team sheet
//             showing "Confirmed teams will appear here when available."
//   Stage B — TEAMS CONFIRMED. When a genuine, validated team sheet arrives the
//             squads section is revised as a NEW immutable version. Editorial
//             content is untouched; nothing else is rebuilt.
//
// publish-rules.js keeps the original rule for an edition nobody approved:
// both elevens or nothing. Approval is what lets the editorial edition go out
// first. Neither path ever shows a predicted player as confirmed.
//
// Also here, because they are decisions and deserve tests rather than inline
// code in a scheduled function: postponement handling, retrospective Archive
// Editions, content hashing for idempotent revisions, approved sponsor
// placements, manual sections that survive a refresh, and rollback.
//
// No network, no database, no clock of its own.
'use strict';

var crypto = require('crypto');
var RULES = require('./publish-rules');

var TEAMS_PLACEHOLDER = 'Confirmed teams will appear here when available.';
var RETRO_MARKER = 'Archive Edition — Reconstructed from verified match records';
var CALLED_OFF = ['postponed', 'cancelled', 'abandoned'];

/* ── hashing ─────────────────────────────────────────────────────────────── */

/** Key-sorted JSON, so the same content always hashes the same. */
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(function (k) {
    // Volatile bookkeeping never makes content "different".
    return v[k] !== undefined && ['capturedAt', 'generatedAt', 'fetchedAt'].indexOf(k) === -1;
  }).map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
}
function contentHash(obj) {
  return crypto.createHash('sha256').update(stable(obj)).digest('hex').slice(0, 32);
}

/* ── team sheets ─────────────────────────────────────────────────────────── */

/**
 * Where the two team sheets stand. Each side is validated on its own, so a
 * confirmed home XI can be shown while the visitors' is still awaited.
 */
function teamSheets(home, away, fixture) {
  var h = RULES.validateLineup(home, { fixtureId: fixture && fixture.id, teamId: fixture && fixture.home_team_id });
  var a = RULES.validateLineup(away, { fixtureId: fixture && fixture.id, teamId: fixture && fixture.away_team_id });
  // A sheet that claims to be both teams is neither.
  if (home && away && home.teamId != null && away.teamId != null && String(home.teamId) === String(away.teamId)) {
    h = { ok: false, errors: ['both line-ups are for the same team'] };
    a = h;
  }
  var status = h.ok && a.ok ? 'confirmed' : (h.ok || a.ok ? 'partial' : 'pending');
  return { status: status, home: { ok: h.ok, errors: h.errors, lineup: h.ok ? home : null },
    away: { ok: a.ok, errors: a.errors, lineup: a.ok ? away : null } };
}

function shapePlayer(p) {
  return { name: p.name, number: p.number == null ? null : p.number, isCaptain: !!p.isCaptain };
}

/**
 * The squads section for whatever is genuinely confirmed.
 * @param ts   teamSheets() result
 * @param ctx  { homeTeam, awayTeam, homeCrest, awayCrest, sourceLabel }
 */
function squadsSection(ts, ctx) {
  function side(s, team, crest) {
    if (!s.ok) return { team: team, confirmed: false, note: TEAMS_PLACEHOLDER };
    var l = s.lineup;
    return {
      team: team, crest: crest || null, confirmed: true,
      starters: (l.starters || (l.players || []).filter(function (p) { return p.role === 'starter'; })).map(shapePlayer),
      substitutes: (l.substitutes || (l.players || []).filter(function (p) { return p.role === 'substitute'; }))
        .filter(function (p) { return !p.role || p.role === 'substitute'; }).map(shapePlayer),
      sourceUpdatedAt: l.sourceUpdatedAt || null,
    };
  }
  var stamps = [ts.home, ts.away].filter(function (s) { return s.ok && s.lineup.sourceUpdatedAt; })
    .map(function (s) { return s.lineup.sourceUpdatedAt; }).sort();
  return {
    confirmed: ts.status === 'confirmed',
    status: ts.status,
    note: ts.status === 'confirmed' ? null : TEAMS_PLACEHOLDER,
    home: side(ts.home, ctx.homeTeam, ctx.homeCrest),
    away: side(ts.away, ctx.awayTeam, ctx.awayCrest),
    source: stamps.length ? (ctx.sourceLabel || 'Football Web Pages') : null,
    sourceUpdatedAt: stamps.length ? stamps[stamps.length - 1] : null,
    referee: ctx.referee || null,
  };
}

/**
 * Re-apply human name corrections to a freshly built squads section, so a
 * provider refresh never undoes "correct a name". A correction applies only
 * where the provider still sends the uncorrected name.
 */
function reapplyCorrections(squads, corrections) {
  if (!squads || !corrections || !corrections.length) return squads;
  var out = JSON.parse(JSON.stringify(squads));
  corrections.forEach(function (c) {
    var side = out[c.side];
    if (!side) return;
    (side.starters || []).concat(side.substitutes || []).forEach(function (p) {
      if (p.name === c.from) { p.name = c.to; p.corrected = true; }
    });
  });
  out.corrections = corrections.slice();
  return out;
}

/* ── the stage decision ──────────────────────────────────────────────────── */

function isCalledOff(fixture) {
  if (!fixture) return false;
  if (String(fixture.sync_status || '') === 'superseded') return true;
  return CALLED_OFF.indexOf(String(fixture.fixture_status || '')) !== -1;
}

var TEAMS_RANK = { pending: 0, partial: 1, confirmed: 2, not_applicable: 0 };

/**
 * What this run should do for one edition.
 *
 * @returns {{action:'none'|'publish'|'revise'|'mark_called_off'|'retrospective'|'hold',
 *            state:string, stage:string|null, reasons:string[]}}
 */
function decideStage(input) {
  var fx = input.fixture || {};
  var ed = input.edition || {};
  var now = input.now == null ? Date.now() : input.now;
  var ts = input.teams || { status: 'pending' };

  // Unpublished by a person: nothing automatic reverses that.
  if (ed.unpublished_at) {
    return { action: 'none', state: ed.state, stage: null, reasons: ['unpublished by ' + (ed.unpublished_by || 'staff')] };
  }

  // ── called off ─────────────────────────────────────────────────────────
  if (isCalledOff(fx)) {
    var st = String(fx.fixture_status || 'postponed');
    if (ed.published_at) {
      // Preserve the published edition; it gains a notice, never a deletion.
      return { action: ed.fixture_postponed_at ? 'none' : 'mark_called_off', state: ed.state,
        stage: null, reasons: ['fixture ' + st + ' after publication — edition preserved and marked'] };
    }
    var target = st === 'cancelled' ? 'cancelled' : 'postponed';
    return { action: ed.state === target ? 'none' : 'mark_called_off', state: target, stage: null,
      reasons: ['fixture ' + st + ' — publication paused; no fictional edition is created'] };
  }

  var base = RULES.decide({
    fixture: fx, edition: ed, ourTeamId: input.ourTeamId, now: now,
    homeLineup: input.homeLineup, awayLineup: input.awayLineup, isFinal: input.isFinal,
  });

  // ── retrospective Archive Edition, once a person has authorised it ─────
  if (!ed.published_at && base.state === RULES.STATES.RETROSPECTIVE_CANDIDATE) {
    return { action: 'hold', state: base.state, stage: null, reasons: base.reasons };
  }
  if (!ed.published_at && ed.retrospective_authorised_by && base.recovery && !base.canPublish) {
    // publish-rules refuses a recovery without confirmed teams. An Archive
    // Edition does not pretend to be the matchday programme, so it may
    // publish with the verified record alone — clearly labelled.
    var ko = Date.parse(fx.scheduled_kickoff_at);
    if (input.result && (!isFinite(ko) || ko < now)) {
      return { action: 'retrospective', state: RULES.STATES.PUBLISHED_RECOVERY, stage: 'retrospective',
        reasons: ['retrospective Archive Edition authorised by ' + ed.retrospective_authorised_by] };
    }
  }
  if (!ed.published_at && ed.retrospective_authorised_by && base.canPublish && base.retrospective) {
    return { action: 'retrospective', state: RULES.STATES.PUBLISHED_RECOVERY, stage: 'retrospective', reasons: base.reasons };
  }

  // ── Stage B straight away: both teams, the original rule ───────────────
  if (base.canPublish && !ed.published_at) {
    return { action: 'publish', state: base.state, stage: 'teams_confirmed', reasons: base.reasons,
      late: !!base.late, recovery: !!base.recovery, afterFullTime: !!base.afterFullTime };
  }

  // A played match with no edition and no authorisation is a PROPOSAL for a
  // person, never something a timer publishes by itself.
  if (!ed.published_at && base.recovery && !ed.retrospective_authorised_by) {
    return { action: 'hold', state: RULES.STATES.RETROSPECTIVE_CANDIDATE, stage: null,
      reasons: ['played without a programme — a retrospective Archive Edition needs authorising']
        .concat(base.reasons || []) };
  }

  // ── Stage A: the approved editorial edition on matchday ────────────────
  if (!ed.published_at) {
    var approved = !!ed.editorial_approved_at &&
      (!ed.editorial_approved_hash || !input.editorialHash || ed.editorial_approved_hash === input.editorialHash);
    if (ed.editorial_approved_at && !approved) {
      return { action: 'hold', state: 'ready_for_review', stage: null,
        reasons: ['editorial content changed after approval — needs a fresh look'] };
    }
    if (approved && input.contentValid && RULES.isMatchday(fx, now)) {
      var koMs = Date.parse(fx.scheduled_kickoff_at);
      return { action: 'publish', state: isFinite(koMs) && now >= koMs ? RULES.STATES.PUBLISHED_LATE
        : RULES.STATES.PUBLISHED_MATCHDAY, stage: ts.status === 'partial' ? 'teams_partial' : 'editorial',
        reasons: ['approved editorial edition — teams ' + ts.status] };
    }
    if (!approved && input.contentValid && !base.recovery && base.state !== RULES.STATES.WITHHELD) {
      return { action: 'hold', state: base.state === RULES.STATES.WAITING_FOR_LINEUPS ? base.state : 'ready_for_review',
        stage: null, reasons: ['awaiting editorial approval'].concat(base.reasons || []) };
    }
    return { action: 'hold', state: base.state, stage: null, reasons: base.reasons };
  }

  // ── already published: revise ONLY the team sheet when it improves ─────
  var was = TEAMS_RANK[ed.teams_status || 'pending'] || 0;
  if (TEAMS_RANK[ts.status] > was && !input.isFinal) {
    return { action: 'revise', state: ed.state, stage: ts.status === 'confirmed' ? 'teams_confirmed' : 'teams_partial',
      reasons: ['team sheet ' + (ed.teams_status || 'pending') + ' → ' + ts.status] };
  }
  return { action: 'none', state: base.state, stage: null, reasons: base.reasons };
}

/* ── sections: manual work survives every refresh ───────────────────────── */

/**
 * Overlay approved manual/evergreen sections on a freshly built edition.
 * A data refresh rebuilds `built`; this puts the human work back on top, so
 * nothing a person approved is ever erased by the provider.
 *
 * Chairman's notes appear ONLY with a named approver — the system never
 * writes in Pete's voice.
 */
function applySections(built, sections) {
  var out = JSON.parse(JSON.stringify(built));
  out.sections = out.sections || {};
  (sections || []).forEach(function (s) {
    var approved = !!(s.approved_by || s.preapproved);
    if (!approved) return;
    if (s.section_key === 'chairNotes') {
      if (!s.approved_by) return;   // pre-approval is not enough for a person's words
      out.sections.chairNotes = { title: s.title || 'From the chair', body: s.body, byline: s.byline || null,
        approvedBy: s.approved_by };
    } else if (s.section_key === 'article' || /^article:/.test(s.section_key)) {
      out.sections.articles = (out.sections.articles || []).concat([{ key: s.section_key, title: s.title, body: s.body,
        byline: s.byline || null, image: (s.data && s.data.image) || null, caption: (s.data && s.data.caption) || null,
        credit: (s.data && s.data.credit) || null }]);
    } else if (s.section_key === 'history' && s.body) {
      out.sections.history = Object.assign({}, out.sections.history || {}, { body: s.body, approved: true });
    } else if (s.section_key === 'welcome' && s.body) {
      out.sections.welcome = { lead: s.title || (out.sections.welcome || {}).lead, body: s.body, attributed: !!s.byline,
        byline: s.byline || null };
    } else if (s.section_key === 'preview' && s.body) {
      out.sections.preview = { title: s.title || 'Match preview', body: s.body };
    } else if (s.section_key === 'cover' && s.data) {
      out.sections.cover = Object.assign({}, out.sections.cover || {}, pick(s.data, ['feature', 'variant', 'photo', 'photoCredit']));
    }
  });
  return out;
}
function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] != null) r[k] = o[k]; }); return r; }

/* ── sponsors: approved records only ─────────────────────────────────────── */

var ARTWORK_KINDS = ['full_page', 'half_page', 'quarter_page'];

/**
 * The placements that may appear in this edition, and the problems with the
 * ones that may not. Never invents, never substitutes: a contracted placement
 * with missing artwork is FLAGGED, not silently swapped for somebody else.
 */
function sponsorPlacements(rows, ctx) {
  var c = ctx || {};
  var day = c.date || null;
  var usable = [], issues = [];
  (rows || []).forEach(function (p) {
    var mine = (p.edition_id != null && String(p.edition_id) === String(c.editionId)) ||
      (p.edition_id == null && p.season && p.season === c.season);
    if (!mine) return;
    if (p.approval_status !== 'approved' || !p.approved_by) return;   // proposals never render
    if (day && p.starts_on && day < p.starts_on) return;
    if (day && p.ends_on && day > p.ends_on) return;
    if (ARTWORK_KINDS.indexOf(p.placement_kind) !== -1 && !p.artwork_path) {
      issues.push({ id: p.id, sponsor: p.sponsor_name, kind: p.placement_kind, issue: 'artwork missing' });
      return;
    }
    if (p.artwork_path && p.artwork_width && p.artwork_height) {
      var ratio = p.artwork_width / p.artwork_height;
      var want = { full_page: 210 / 297, half_page: 210 / 148.5, quarter_page: 105 / 148.5 }[p.placement_kind];
      if (want && Math.abs(ratio - want) / want > 0.12) {
        issues.push({ id: p.id, sponsor: p.sponsor_name, kind: p.placement_kind,
          issue: 'artwork aspect ' + ratio.toFixed(2) + ' does not fit a ' + p.placement_kind.replace('_', ' ') });
        return;
      }
    }
    usable.push({ id: p.id, sponsor: p.sponsor_name, kind: p.placement_kind, artwork: p.artwork_path || null,
      website: p.website || null, copy: p.copy_text || null });
  });
  var order = ['title_sponsor', 'match_sponsor', 'match_ball', 'full_page', 'half_page', 'quarter_page', 'directory'];
  usable.sort(function (a, b) { return order.indexOf(a.kind) - order.indexOf(b.kind); });
  return { placements: usable, issues: issues };
}

/* ── retrospective Archive Edition ───────────────────────────────────────── */

/**
 * A reconstructed edition for a match that was played without one.
 * Contains only verified record: who, what competition, when, the result,
 * and line-ups ONLY if confirmed ones exist. Everything else is left out
 * rather than written after the fact.
 */
function retrospectiveEdition(ctx) {
  var dateLong = ctx.dateLong || null;
  return {
    sections: {
      cover: {
        homeTeam: ctx.homeTeam, awayTeam: ctx.awayTeam,
        homeCrest: ctx.homeCrest || null, awayCrest: ctx.awayCrest || null,
        competition: ctx.competition || null, dateLong: dateLong,
        // A kick-off time the registry does not know is not printed.
        kickoff: ctx.kickoffTimeConfirmed === false ? null : (ctx.kickoff || null),
        venue: ctx.venue || null, season: ctx.season || null,
        title: 'Archive Edition', archiveMarker: RETRO_MARKER,
      },
      record: {
        marker: RETRO_MARKER,
        lines: [
          ctx.competition ? 'Competition: ' + ctx.competition : null,
          dateLong ? 'Date: ' + dateLong + (ctx.kickoffTimeConfirmed === false || !ctx.kickoff ? '' : ', ' + ctx.kickoff) : null,
          ctx.result ? 'Result: ' + ctx.homeTeam + ' ' + ctx.result.home + '–' + ctx.result.away + ' ' + ctx.awayTeam : null,
        ].filter(Boolean),
        sources: ctx.sources || [],
        note: 'No matchday programme was published for this fixture. This edition was prepared afterwards ' +
          'so the season’s record is complete. It contains only facts verified against the match record.',
      },
      squads: ctx.teams && ctx.teams.status !== 'pending' ? squadsSection(ctx.teams, ctx)
        : { confirmed: false, status: 'unavailable', note: 'Official team sheets for this match are not held in the club’s record.' },
      history: ctx.clubHistory || null,
    },
    order: ['cover', 'record', 'squads', 'history'],
    retrospective: true,
    validation: { ok: !!(ctx.homeTeam && ctx.awayTeam && ctx.result), missing: ctx.result ? [] : ['result'] },
  };
}

/* ── rollback ────────────────────────────────────────────────────────────── */

/** A rollback is a NEW version carrying an older payload. History stays. */
function rollbackVersion(versions, target, who, reason) {
  var t = (versions || []).filter(function (v) { return Number(v.version) === Number(target); })[0];
  if (!t) return { ok: false, error: 'no version ' + target };
  if (!who) return { ok: false, error: 'a rollback needs a name' };
  var highest = Math.max.apply(null, versions.map(function (v) { return Number(v.version); }));
  return { ok: true, row: {
    version: highest + 1, payload: t.payload, lineup_snapshot: t.lineup_snapshot, table_snapshot: t.table_snapshot,
    sponsor_snapshot: t.sponsor_snapshot, staff_snapshot: t.staff_snapshot, final_match_snapshot: t.final_match_snapshot,
    legal_version: t.legal_version, legal_footer: t.legal_footer, stage: 'rollback', restored_from_version: t.version,
    revision_reason: 'rolled back to v' + t.version + ' by ' + who + (reason ? ': ' + reason : ''), created_by: who,
  } };
}

module.exports = {
  TEAMS_PLACEHOLDER: TEAMS_PLACEHOLDER, RETRO_MARKER: RETRO_MARKER,
  stable: stable, contentHash: contentHash, teamSheets: teamSheets, squadsSection: squadsSection, reapplyCorrections: reapplyCorrections,
  isCalledOff: isCalledOff, decideStage: decideStage, applySections: applySections,
  sponsorPlacements: sponsorPlacements, retrospectiveEdition: retrospectiveEdition, rollbackVersion: rollbackVersion,
};
