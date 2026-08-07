// GATE 7 — the identity review queue, and the recompute behind it.
//
// This is the only place a provider string becomes a person. Every decision
// carries the name of whoever made it and is written to a permanent audit,
// because each one is a claim about a real player's record.
//
// Nothing here happens automatically. The pipeline proposes; a committee member
// decides; this function writes down who decided and why.
'use strict';

const adminOk = require('./lib/pin');
const AUTHZ = require('./lib/authz');
const S = require('./lib/football/store');
const ID = require('./lib/football/identity');
const RP = require('./lib/football/read-players');
const STATS = require('./lib/football/player-stats');

const SEASON = process.env.FWP_SEASON || '2026-2027';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj, null, 1),
  };
}

/**
 * Who is doing this. Recorded against every decision; never optional.
 *
 * Taken from the SIGNED SESSION, never from the request body. It used to read
 * body.by, which the browser filled from a prompt() — so the permanent record
 * of who decided a player's identity was whatever anybody chose to type. The
 * role is carried too, because "Team Manager" is the part that explains why
 * that person was entitled to answer a football question.
 */
function actor(sess) {
  if (!sess) return '';
  const name = String(sess.username || '').trim();
  const role = String(sess.role || '').trim();
  return (role && role !== name ? name + ' (' + role + ')' : name).slice(0, 80);
}

async function audit(row) {
  try { await S.rest('football_identity_decisions', {
    method: 'POST', body: [row], headers: { Prefer: 'return=minimal' },
  }); } catch (e) { /* the decision still stands; the log is best effort */ }
}

async function loadPlayer(id) {
  return await S.findOne('football_players', 'id=eq.' + encodeURIComponent(id) + '&select=*');
}

async function patchPlayer(id, patch) {
  const out = await S.rest('football_players?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' },
  });
  return (out && out[0]) || null;
}

/* ── the decisions ───────────────────────────────────────────────────────── */

async function confirm(body, by) {
  const p = await loadPlayer(body.playerId);
  if (!p) return { ok: false, error: 'no such player record' };
  if (!body.clubPlayerId) return { ok: false, error: 'confirming needs the club player it refers to' };

  // One roster entry, one registry record. Confirming a second record onto the
  // same person would split his appearances across two pages.
  const taken = await S.findOne('football_players',
    'club_player_id=eq.' + encodeURIComponent(body.clubPlayerId) + '&select=id,canonical_name');
  if (taken && String(taken.id) !== String(p.id)) {
    return { ok: false, error: '"' + taken.canonical_name + '" is already confirmed as that player. ' +
      'If they are the same person, merge instead.' };
  }

  let patch;
  try { patch = ID.confirmPatch(p, body.clubPlayerId, by, body.reason); }
  catch (e) { return { ok: false, error: String(e.message || e) }; }

  // A slug collision would put two players on one URL.
  const clash = await S.findOne('football_players',
    'public_slug=eq.' + encodeURIComponent(patch.public_slug) + '&select=id');
  if (clash && String(clash.id) !== String(p.id)) patch.public_slug = patch.public_slug + '-' + p.id;

  const saved = await patchPlayer(p.id, patch);
  await audit({
    player_id: p.id, action: 'confirm',
    from_status: p.identity_status, to_status: 'confirmed',
    from_value: p.club_player_id || null, to_value: body.clubPlayerId,
    decided_by: by, reason: body.reason || null,
  });
  return { ok: true, player: saved };
}

async function reject(body, by) {
  const p = await loadPlayer(body.playerId);
  if (!p) return { ok: false, error: 'no such player record' };
  // Remember the refusal so the same suggestion is not offered next week.
  await S.rest('football_identity_rejections?on_conflict=normalised,team_id,club_player_id', {
    method: 'POST',
    body: [{
      normalised: require('./lib/fwp/normalise').playerKey(p.canonical_name),
      team_id: p.current_team_id,
      club_player_id: body.clubPlayerId || null,
      rejected_by: by, reason: body.reason || null,
    }],
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
  await audit({
    player_id: p.id, action: 'reject', from_status: p.identity_status,
    to_status: p.identity_status, to_value: body.clubPlayerId || null,
    decided_by: by, reason: body.reason || null,
  });
  return { ok: true, rejected: true };
}

async function merge(body, by) {
  const [loser, winner] = await Promise.all([loadPlayer(body.playerId), loadPlayer(body.intoPlayerId)]);
  if (!loser || !winner) return { ok: false, error: 'both records must exist' };
  if (String(loser.current_team_id) !== String(winner.current_team_id)) {
    // The one merge that must never happen without somebody saying it out loud.
    if (!body.acrossClubs) {
      return { ok: false, error: 'those records are at different clubs. Two clubs\' players with ' +
        'the same name are almost always two people — confirm you mean it.' };
    }
  }
  let patch;
  try { patch = ID.mergePatch(loser, winner.id, by, body.reason); }
  catch (e) { return { ok: false, error: String(e.message || e) }; }

  await patchPlayer(loser.id, patch);
  // The losing name becomes an alias of the survivor, so the next team sheet
  // spelled that way resolves straight through without another review.
  await S.rest('football_player_aliases', {
    method: 'POST',
    body: [{
      player_id: winner.id, alias: loser.canonical_name,
      normalised: require('./lib/fwp/normalise').playerKey(loser.canonical_name),
      team_id: winner.current_team_id, source: 'manual', confidence: 'confirmed',
    }],
    headers: { Prefer: 'return=minimal' },
  }).catch(() => null);

  await audit({
    player_id: loser.id, action: 'merge', other_player_id: winner.id,
    from_status: loser.identity_status, to_status: patch.identity_status,
    from_value: loser.canonical_name, to_value: winner.canonical_name,
    decided_by: by, reason: body.reason || null,
  });
  return { ok: true, mergedInto: winner.id, note: 'statistics move on the next recompute' };
}

async function unmerge(body, by) {
  const p = await loadPlayer(body.playerId);
  if (!p) return { ok: false, error: 'no such player record' };
  if (!p.merged_into_id) return { ok: false, error: 'that record is not merged' };
  const saved = await patchPlayer(p.id, {
    merged_into_id: null, identity_status: 'provisional',
    identity_decided_by: by, identity_decided_at: new Date().toISOString(),
    identity_note: body.reason || null,
  });
  await audit({
    player_id: p.id, action: 'unmerge', other_player_id: p.merged_into_id,
    from_status: p.identity_status, to_status: 'provisional',
    decided_by: by, reason: body.reason || null,
  });
  return { ok: true, player: saved };
}

/** A human correcting a match record. It outranks every future recompute. */
async function correctMatch(body, by) {
  if (!body.fixtureId || !body.playerId) return { ok: false, error: 'which match, and which player?' };
  const fields = {};
  ['goals', 'own_goals', 'yellow_cards', 'red_cards', 'minutes_played'].forEach((f) => {
    if (body[f] != null) fields[f] = body[f];
  });
  ['appearance', 'started', 'substitute', 'unused_substitute'].forEach((f) => {
    if (typeof body[f] === 'boolean') fields[f] = body[f];
  });
  if (!Object.keys(fields).length) return { ok: false, error: 'nothing to correct' };

  // An appearance that is neither a start nor a substitute appearance is not a
  // state a match can be in, and the record should not be able to say it was.
  const willAppear = fields.appearance != null ? fields.appearance : null;
  if (willAppear === true && fields.started === false && fields.substitute === false) {
    return { ok: false, error: 'a player who appeared either started or came on' };
  }

  const saved = await S.rest('football_player_match_stats?fixture_id=eq.' +
    encodeURIComponent(body.fixtureId) + '&player_id=eq.' + encodeURIComponent(body.playerId), {
    method: 'PATCH',
    body: Object.assign({}, fields, {
      manually_corrected: true, corrected_by: by,
      corrected_at: new Date().toISOString(),
      correction_note: body.reason || null,
      confidence: 'manually_corrected',
    }),
    headers: { Prefer: 'return=representation' },
  });
  if (!saved || !saved.length) return { ok: false, error: 'no record for that player in that match' };
  await audit({
    player_id: body.playerId, action: 'correct_match',
    from_value: 'match ' + body.fixtureId, to_value: JSON.stringify(fields),
    decided_by: by, reason: body.reason || null,
  });
  // Season totals are derived, so they follow immediately.
  const players = await STATS.loadPlayers();
  const out = await STATS.writeSeasonStats(body.season || SEASON, players.byId);
  return { ok: true, corrected: saved[0], seasonTotals: out };
}

/* ── handler ─────────────────────────────────────────────────────────────── */

exports.handler = async function (event) {
  const q = (event && event.queryStringParameters) || {};
  let body = {};
  try { body = JSON.parse((event && event.body) || '{}'); } catch (e) { /* GET */ }

  // Everything here is about named individuals the system is unsure about, so
  // the whole endpoint is behind the portal — reads included.
  if (!adminOk(body.pin || q.pin)) return resp(401, { ok: false, error: 'Sign in to review player identities' });
  if (!S.configured()) return resp(200, { ok: false, error: 'supabase not configured' });

  const action = String(body.action || q.action || 'queue').toLowerCase();

  try {
    if (action === 'queue') {
      const [queue, players] = await Promise.all([
        RP.reviewQueueDetailed(Number(q.limit) || 200),
        S.rest('football_players?select=id,canonical_name,current_team_id,identity_status,' +
          'club_player_id,merged_into_id&order=canonical_name.asc'),
      ]);
      const ourTeam = await RP.ourTeamId();
      const dups = ID.duplicateCandidates((players || []).filter(
        (p) => String(p.current_team_id) === String(ourTeam)));
      return resp(200, {
        ok: true, season: SEASON, queue: queue, duplicates: dups,
        confirmed: (players || []).filter((p) => p.identity_status === 'confirmed' && !p.merged_into_id).length,
        awaiting: queue.length,
      });
    }

    if (action === 'suggest') {
      // What the pipeline would propose for one record, shown before deciding.
      const p = await loadPlayer(q.playerId || body.playerId);
      if (!p) return resp(404, { ok: false, error: 'no such player record' });
      const [all, rejections] = await Promise.all([
        S.rest('football_players?select=id,canonical_name,current_team_id,identity_status,merged_into_id'),
        S.rest('football_identity_rejections?select=normalised,team_id,club_player_id'),
      ]);
      const index = {};
      (all || []).forEach((x) => {
        if (String(x.id) === String(p.id) || x.merged_into_id) return;
        index[x.current_team_id + '|' + require('./lib/fwp/normalise').playerKey(x.canonical_name)] = x;
      });
      const r = ID.resolve(p.canonical_name, p.current_team_id, {
        index: index, roster: body.roster || [],
        ourTeamId: await RP.ourTeamId(), rejections: rejections || [],
      });
      return resp(200, { ok: true, player: { id: p.id, name: p.canonical_name }, proposal: r });
    }

    // ── SUGGESTIONS FOR THE WHOLE QUEUE, IN ONE CALL ────────────────────
    // The review screen showed nineteen blank dropdowns and asked a committee
    // member to identify each person from a bare name. The resolver could
    // already propose an answer — the screen simply never asked it.
    //
    // Batched deliberately: nineteen separate round trips would make the screen
    // feel broken, and each would re-read the same two tables.
    //
    // A READ, so it sits above the permission gate below. Anybody who can open
    // the review screen may see what the computer thinks; only the roles that
    // hold CONFIRM_IDENTITY may act on it.
    //
    // NOTHING HERE DECIDES ANYTHING. Every proposal comes back as a suggestion
    // carrying its reason, and becomes real only when somebody presses confirm.
    // An exact string match is still only a suggestion: two people can share a
    // name, and the club — not the software — is accountable for saying which
    // of its players scored.
    if (action === 'suggestall') {
      const N = require('./lib/fwp/normalise');
      const ourTeam = await RP.ourTeamId();
      const [queue, all, rejections] = await Promise.all([
        RP.reviewQueueDetailed ? RP.reviewQueueDetailed() : RP.reviewQueue(),
        S.rest('football_players?select=id,canonical_name,current_team_id,identity_status,merged_into_id'),
        S.rest('football_identity_rejections?select=normalised,team_id,club_player_id'),
      ]);
      const index = {};
      (all || []).forEach((x) => {
        if (x.merged_into_id) return;
        index[x.current_team_id + '|' + N.playerKey(x.canonical_name)] = x;
      });
      // Which club players are already spoken for. Offering a taken player
      // would only produce a refusal at confirm time.
      const takenBy = {};
      (all || []).forEach((x) => { if (x.club_player_id) takenBy[x.club_player_id] = x.id; });

      const roster = Array.isArray(body.roster) ? body.roster : [];
      const items = (queue || []).filter((q) => q.ours).map((q) => {
        const self = { id: q.id, canonical_name: q.name, current_team_id: ourTeam };
        const idx = Object.assign({}, index);
        delete idx[ourTeam + '|' + N.playerKey(q.name)];
        let r;
        try {
          r = ID.resolve(q.name, ourTeam,
            { index: idx, roster: roster, ourTeamId: ourTeam, rejections: rejections || [] });
        } catch (e) { r = { suggestions: [], reason: 'could not be read' }; }

        const picks = (r.suggestions || []).filter((sg) =>
          !sg.clubPlayerId || !takenBy[sg.clubPlayerId] || String(takenBy[sg.clubPlayerId]) === String(q.id));
        const exact = picks.filter((sg) => sg.strength === 'exact');
        return {
          id: q.id,
          name: q.name,
          evidence: q.evidence || {},
          sameNameAtAnotherClub: !!q.sameNameAtAnotherClub,
          // 'exact'     — one unambiguous name match, safe to offer in bulk
          // 'ambiguous' — more than one candidate; the committee must choose
          // 'none'      — nothing to propose
          confidence: exact.length === 1 ? 'exact' : (picks.length ? 'ambiguous' : 'none'),
          suggestion: exact.length === 1 ? exact[0] : null,
          options: picks.slice(0, 5),
          reason: r.reason || '',
        };
      });

      return resp(200, {
        ok: true,
        items: items,
        counts: {
          total: items.length,
          exact: items.filter((i) => i.confidence === 'exact').length,
          ambiguous: items.filter((i) => i.confidence === 'ambiguous').length,
          none: items.filter((i) => i.confidence === 'none').length,
        },
      });
    }

    // ── FROM HERE ON, EVERYTHING CHANGES A REAL PERSON'S RECORD ──────────
    //
    // Two separate things had to be true and neither was.
    //
    // WHO. The decider used to be a name typed into a browser prompt, which
    // meant the permanent audit trail recorded whatever string was entered.
    // It is now taken from the signed session and the typed value is ignored,
    // so "Gary confirmed this" means Gary signed in.
    //
    // WHETHER. The endpoint was gated on the shared club PIN alone, so anyone
    // who could open the portal could rewrite the club's playing record. It now
    // needs CONFIRM_IDENTITY — held by the Chairman, the System Maintainer and
    // the Team Manager, and grantable to anyone else in la_permissions without
    // a deploy.
    //
    // Reads stay above this line on purpose. Seeing the queue is how a
    // volunteer knows there is work to do; only deciding is restricted.
    const gate = await AUTHZ.requireCap(event, AUTHZ.CAP.CONFIRM_IDENTITY);
    if (!gate.ok) return gate.response;
    const by = actor(gate.session);

    if (action === 'confirm') return resp(200, await confirm(body, by));

    // ── BULK CONFIRM ─────────────────────────────────────────────────────
    // Nineteen decisions is enough friction that the job does not get done.
    // This applies several at once, but every one goes through confirm() —
    // the same duplicate checks, the same audit row, the same named decider.
    // There is no faster path that skips a protection.
    //
    // The caller must send the exact pairs it was shown. A "confirm everything
    // you think is right" action would let the screen and the server disagree
    // about what was approved.
    if (action === 'confirmmany') {
      const pairs = Array.isArray(body.pairs) ? body.pairs.slice(0, 50) : [];
      if (!pairs.length) return resp(400, { ok: false, error: 'nothing to confirm' });
      const done = [], failed = [];
      for (const pr of pairs) {
        const r = await confirm({ playerId: pr.playerId, clubPlayerId: pr.clubPlayerId,
          reason: 'bulk exact-name confirmation, reviewed on screen' }, by);
        if (r.ok) done.push(pr); else failed.push({ playerId: pr.playerId, error: r.error });
      }
      return resp(200, { ok: true, confirmed: done.length, failed: failed });
    }
    if (action === 'reject') return resp(200, await reject(body, by));
    if (action === 'merge') return resp(200, await merge(body, by));
    if (action === 'unmerge') return resp(200, await unmerge(body, by));
    if (action === 'correct') return resp(200, await correctMatch(body, by));

    if (action === 'recompute') {
      // Not audited to the identity log: recomputing decides nothing about
      // anybody. It reproduces what the matches already say.
      const out = await STATS.recompute({ season: body.season || SEASON });
      return resp(200, Object.assign({ requestedBy: by }, out));
    }

    return resp(400, { ok: false, error: 'unknown action: ' + action });
  } catch (e) {
    return resp(200, { ok: false, error: String((e && e.message) || e) });
  }
};
