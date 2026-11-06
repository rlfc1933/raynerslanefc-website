// ════════════════════════════════════════════════════════════════════════════
// SQUAD REVIEW — "Is the first-team squad up to date?"
//
// One endpoint for Staff HQ's squad reminder and review queue.
//   status          the welcome card: last confirmed, pending, missing photos
//   queue           open questions with their evidence
//   refresh         read the football registry → new questions (never removals)
//   import          staff-entered names from a named source (URL kept)
//   report_departure an explicit, sourced report that a player has left
//   resolve         Add to squad · Same player · Mark as departed · Ignore
//   set_status      active · on loan · needs review (by id)
//   confirm_current a person confirms the squad is current — recorded
//   remind_later    hide the card for this person for a few days
//
// Reading needs a signed staff session. Changing anything needs a PERSONAL
// session with can_manage_first_team_roster. On a Deploy Preview every write
// goes to that preview's sandbox (lib/deploy-scope.js), never the live roster.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const AZ = require('./lib/authz');
const ST = require('./lib/squad/store');
const RL = require('./lib/squad/review-logic');
const SRC = require('./lib/squad/sources');
const PUB = require('./lib/squad/publish');

function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }, body: JSON.stringify(obj) };
}
const clean = (s, n) => String(s == null ? '' : s).trim().slice(0, n || 200);

async function audit(by, action, player, before, after) {
  try { await AZ.audit({ action, targetUser: player, actorUsername: by.username, actorRole: by.role,
    capability: AZ.CAP.MANAGE_ROSTER, auth: by.auth, result: 'success', before: before || null, after: after || null }); } catch (e) { /* best effort */ }
}

/** Uniform roster operations over the live table or the preview sandbox. */
async function rosterOps(event) {
  const R = await ST.roster(event);
  if (R.production) {
    return { R, list: R.list,
      add: async (row) => { await R.insert(Object.assign({ status: 'active' }, row)); },
      patch: async (id, p) => { await R.patch(id, p); } };
  }
  return { R, list: R.list,
    add: (row) => R.mutate((ps) => { ps.push(Object.assign({ id: 'pv-' + Date.now().toString(36), slug: ST.slug(row.name), status: 'active', photo_url: '' }, row)); return ps; }),
    patch: (id, p) => R.mutate((ps) => { const x = ps.find((q) => String(q.id) === String(id)); if (!x) return undefined; Object.assign(x, p); return ps; }) };
}

async function nextHome(scope, deps) {
  try {
    if (deps && deps.fixtures) return deps.fixtures;
    const host = scope.production ? 'raynerslanefc.co.uk' : scope.host;
    const r = await fetch('https://' + host + '/data/fixtures.json', { signal: AbortSignal.timeout(6000) });
    const fx = r.ok ? ((await r.json()).fixtures || []) : [];
    const today = new Date().toISOString().slice(0, 10);
    return fx.filter((f) => f.isHome && f.date >= today && !/postpon|cancel/i.test(f.status || ''))
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  } catch (e) { return null; }
}

/** A proposal as the review screen sees it — no personal data beyond names. */
function publicProposal(p) {
  return { id: p.id, kind: p.kind, name: p.name, question: p.question, status: p.status,
    candidates: (p.candidates || []).map((c) => ({ id: c.id, name: c.name, status: c.status })),
    evidence: (p.evidence || []).map((e) => ({ source: e.source || null, url: e.url || null, season: e.season || null,
      checkedAt: e.checkedAt || null, note: e.note || null })) };
}

function publicExpect(kind, data) {
  const n = RL.norm(data.name);
  if (kind === 'present') return (ps) => ps.some((p) => RL.norm(p.name) === n);
  if (kind === 'absent') return (ps) => !ps.some((p) => RL.norm(p.name) === n);
  return () => true;
}

async function previewPlayersFn(event) {
  const R = await ST.roster(event);
  return async () => (await R.list()).filter((p) => ST.CURRENT.indexOf(p.status) > -1);
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { ok: false, error: 'bad request' }); }
  const action = clean(b.action || 'status', 40);

  const sess = AZ.sessionFrom(event);
  if (!sess) return resp(401, { ok: false, error: 'Please sign in with your own staff password.' });
  // EVERY action needs a PERSONAL session: a shared-password token carries a
  // role the caller typed. The card ('status') is for people who look after the
  // squad or the programme; the queue and every change are roster work only.
  let who = sess;
  if (action === 'status') {
    if (!sess.elevated) return resp(403, { ok: false, error: 'This needs your own personal password, not the shared committee one.' });
    const allowed = (await AZ.can(sess, AZ.CAP.MANAGE_ROSTER)) || (await AZ.can(sess, AZ.CAP.EDIT_PROGRAMME));
    if (!allowed) return resp(403, { ok: false, error: 'Your account does not look after the squad.' });
  } else {
    const g = await AZ.requireCap(event, AZ.CAP.MANAGE_ROSTER, { elevated: true });
    if (!g.ok) return g.response;
    who = g.session;
  }
  const deps = event._deps || {};   // test seams only; an HTTP request cannot set this

  try {
    const RV = await ST.review(event);
    const scope = RV.scope;

    if (action === 'status' || action === 'queue') {
      const [doc, ops] = [await RV.read(), await rosterOps(event)];
      const players = await ops.list();
      const current = players.filter((p) => ST.CURRENT.indexOf(p.status) > -1);
      const pending = (doc.proposals || []).filter((p) => p.status === 'pending');
      const nh = await nextHome(scope, deps);
      const reasons = RL.due(doc, { now: deps.now, nextHome: nh });
      const until = (doc.remind || {})[sess.username];
      const out = {
        ok: true, preview: !scope.production,
        lastConfirmed: (doc.reviews || [])[0] ? { by: doc.reviews[0].by, at: doc.reviews[0].at } : null,
        pendingCount: pending.length,
        missingHeadshots: current.filter((p) => !p.photo_url).map((p) => ({ id: p.id, name: p.name })),
        currentCount: current.length,
        reasons, show: reasons.length > 0 && !(until && Date.parse(until) > (deps.now || Date.now())),
        remindUntil: until || null, sources: doc.sources || {}, nextHome: nh,
      };
      if (action === 'queue') {
        // Only what the review screen needs: no age, contact details or consent
        // records; evidence keeps its source, season, date and link — the free-
        // text note is shown only to roster managers, who are the readers here.
        out.proposals = pending.map(publicProposal);
        out.players = players.map((p) => ({ id: p.id, name: p.name, position: p.position || '', status: p.status,
          photo: p.photo_url || '', hasPhoto: !!p.photo_url }));
      }
      return resp(200, out);
    }

    if (action === 'remind_later') {
      const days = Math.max(1, Math.min(14, Number(b.days) || 3));
      const until = new Date((deps.now || Date.now()) + days * 864e5).toISOString();
      await RV.update((d) => { d.remind = d.remind || {}; d.remind[who.username] = until; return d; });
      return resp(200, { ok: true, remindUntil: until });
    }

    if (action === 'confirm_current') {
      // A person looked: record who, when, and what was still open — this is a
      // review, not a reset. Open questions are NOT cleared by confirming.
      const ops = await rosterOps(event);
      const current = (await ops.list()).filter((p) => ST.CURRENT.indexOf(p.status) > -1);
      const at = new Date(deps.now || Date.now()).toISOString();
      const r = await RV.update((d) => {
        d.reviews = [{ by: who.username, role: who.role, at, currentCount: current.length,
          openQuestions: (d.proposals || []).filter((p) => p.status === 'pending').length }].concat(d.reviews || []).slice(0, 50);
        if (d.remind) delete d.remind[who.username];
        return d;
      });
      await audit(who, 'squad_confirmed_current', 'squad', null, r.doc.reviews[0]);
      return resp(200, { ok: true, confirmed: r.doc.reviews[0] });
    }

    if (action === 'refresh') {
      const src = await (deps.registry || SRC.registry)({});
      const at = new Date(deps.now || Date.now()).toISOString();
      if (!src.ok) {
        // A failed source changes nothing — not the queue, not the squad.
        await RV.update((d) => { d.sources = d.sources || {}; d.sources.registry = Object.assign({}, d.sources.registry, { lastError: src.error, lastErrorAt: at }); return d; });
        return resp(200, { ok: false, sourceUnavailable: true, error: src.error + ' Nothing has changed — the squad and the review list are as they were.' });
      }
      const ops = await rosterOps(event);
      const players = await ops.list();
      let added = [];
      await RV.update((d) => {
        const incoming = RL.proposalsFromSource(players, src.rows, d).concat(RL.duplicateProposals(players, ST.CURRENT));
        const m = RL.mergeProposals(d.proposals || [], incoming);
        d.proposals = m.list; added = m.added;
        d.sources = d.sources || {}; d.sources.registry = { lastOkAt: at, records: src.rows.length, url: SRC.FWP_URL, season: SRC.SEASON };
        return d;
      });
      return resp(200, { ok: true, added: added.length, checked: src.rows.length });
    }

    if (action === 'import') {
      const names = Array.isArray(b.names) ? b.names : String(b.names || '').split(/\n|,/);
      if (!clean(b.sourceUrl, 400) && !clean(b.sourceName, 120)) return resp(400, { ok: false, error: 'Say where these names come from (a link or the source’s name).' });
      const rows = SRC.manual(names, { sourceUrl: b.sourceUrl, sourceName: b.sourceName, season: b.season, note: b.note, by: who.username, now: deps.now });
      const ops = await rosterOps(event);
      const players = await ops.list();
      let added = [];
      await RV.update((d) => { const m = RL.mergeProposals(d.proposals || [], RL.proposalsFromSource(players, rows, d)); d.proposals = m.list; added = m.added; return d; });
      return resp(200, { ok: true, added: added.length });
    }

    if (action === 'report_departure') {
      const ops = await rosterOps(event);
      const p = (await ops.list()).find((x) => String(x.id) === String(b.playerId));
      if (!p) return resp(404, { ok: false, error: 'That player is not on the list.' });
      const url = /^https?:\/\/\S+$/i.test(clean(b.sourceUrl, 400)) ? clean(b.sourceUrl, 400) : '', note = clean(b.note, 300);
      if (!url && !note) return resp(400, { ok: false, error: 'A departure needs its source: a link to the announcement, or a note saying who confirmed it.' });
      const prop = { id: RL.idFor('dep', p.id + '|' + url + '|' + note), kind: 'departure', playerId: p.id, name: p.name,
        question: p.name + ' is reported as having left. Remove them from the current squad?', candidates: [{ id: p.id, name: p.name, status: p.status }],
        evidence: [{ source: clean(b.sourceName, 120) || 'Reported by staff', url: url || null, note: note || null, enteredBy: who.username,
          checkedAt: new Date(deps.now || Date.now()).toISOString() }], status: 'pending', createdAt: new Date().toISOString() };
      await RV.update((d) => { d.proposals = RL.mergeProposals(d.proposals || [], [prop]).list; return d; });
      return resp(200, { ok: true, proposal: prop.id });
    }

    if (action === 'resolve') {
      const decision = clean(b.decision, 20);   // add | same | departed | ignore
      if (['add', 'same', 'departed', 'ignore'].indexOf(decision) < 0) return resp(400, { ok: false, error: 'Choose what to do.' });
      const doc = await RV.read();
      const prop = (doc.proposals || []).find((p) => p.id === b.proposalId);
      if (!prop) return resp(404, { ok: false, error: 'That item is no longer in the list.' });
      if (prop.status !== 'pending') {
        return resp(200, { ok: true, already: true, message: 'Already dealt with by ' + (prop.resolvedBy || 'someone') + ' — nothing changed.', proposal: publicProposal(prop) });
      }
      const ops = await rosterOps(event);
      const players = await ops.list();
      let pub = null, playerId = null;

      if (decision === 'add') {
        const name = clean(b.name || prop.name, 80), position = clean(b.position, 40);
        if (!name) return resp(400, { ok: false, error: 'Enter the player’s name.' });
        if (!position) return resp(400, { ok: false, error: 'Choose a position.' });
        const clash = players.filter((p) => RL.similar(p.name, name));
        if (clash.length && !b.confirmNotDuplicate) {
          return resp(200, { ok: false, duplicate: true, matches: clash.map((p) => ({ id: p.id, name: p.name, status: p.status })),
            error: 'A player with a very similar name is already on the list. If it is the same person, choose “Same player” instead.' });
        }
        await ops.add({ name, position, squad_no: Number(b.number) > 0 ? Number(b.number) : null, photo_url: '' });
        pub = await PUB.publishAndVerify(ops.R.production ? { production: true } : scope, publicExpect('present', { name }), Object.assign({ previewPlayers: await previewPlayersFn(event) }, deps.publish));
        await audit(who, 'roster_player_added', name, null, { name, position, from: prop.id });
      } else if (decision === 'same') {
        playerId = b.playerId;
        const p = players.find((x) => String(x.id) === String(playerId));
        if (!p) return resp(400, { ok: false, error: 'Choose which squad player this is.' });
        await audit(who, 'roster_source_linked', p.name, null, { sourceName: prop.name, sourceKey: prop.sourceKey || null });
      } else if (decision === 'departed') {
        playerId = prop.playerId || b.playerId;
        const p = players.find((x) => String(x.id) === String(playerId));
        if (!p) return resp(400, { ok: false, error: 'Choose which squad player has left.' });
        if (prop.kind !== 'departure' && !clean(b.note, 300)) {
          return resp(400, { ok: false, error: 'Add how the departure was confirmed — a missing team sheet is not evidence.' });
        }
        await ops.patch(p.id, { status: 'left' });
        pub = await PUB.publishAndVerify(ops.R.production ? { production: true } : scope, publicExpect('absent', p), Object.assign({ previewPlayers: await previewPlayersFn(event) }, deps.publish));
        await audit(who, 'roster_player_deactivated', p.name, { status: p.status }, { status: 'left', evidence: prop.evidence });
      }

      const at = new Date(deps.now || Date.now()).toISOString();
      const r = await RV.update((d) => {
        const x = (d.proposals || []).find((p) => p.id === prop.id);
        if (!x || x.status !== 'pending') return undefined;      // somebody else got there first
        x.status = 'resolved'; x.decision = decision; x.resolvedBy = who.username; x.resolvedAt = at;
        x.note = clean(b.note, 300) || null; if (playerId) x.playerId = playerId;
        if (prop.sourceKey) { d.aliases = d.aliases || {}; d.aliases[prop.sourceKey] = { decision, playerId: playerId || null, by: who.username, at }; }
        return d;
      });
      return resp(200, { ok: true, decision, changed: r.changed, website: pub });
    }

    if (action === 'set_status') {
      const status = clean(b.status, 20);
      if (['active', 'on_loan', 'needs_review'].indexOf(status) < 0) return resp(400, { ok: false, error: 'Unknown status.' });
      const ops = await rosterOps(event);
      const p = (await ops.list()).find((x) => String(x.id) === String(b.playerId));
      if (!p) return resp(404, { ok: false, error: 'That player is not on the list.' });
      try { await ops.patch(p.id, { status }); }
      catch (e) {
        return resp(200, { ok: false, error: 'The club database does not accept “' + status.replace('_', ' ') + '” yet. It needs supabase/migrations/20261106120000_player_squad_states.sql applied. Nothing has changed.' });
      }
      await audit(who, 'roster_status_changed', p.name, { status: p.status }, { status });
      const pub = await PUB.publishAndVerify(ops.R.production ? { production: true } : scope,
        publicExpect(ST.CURRENT.indexOf(status) > -1 ? 'present' : 'absent', p), Object.assign({ previewPlayers: await previewPlayersFn(event) }, deps.publish));
      return resp(200, { ok: true, website: pub });
    }

    return resp(400, { ok: false, error: 'Unknown action.' });
  } catch (e) {
    if (e && e.code === 'busy') return resp(409, { ok: false, error: 'Someone else saved at the same moment. Nothing was lost — please try again.' });
    // Error class only: database errors can quote row contents.
    console.error('[squad-review] failed:', action, (e && (e.code || e.name)) || 'error');
    return resp(200, { ok: false, error: 'The squad could not be updated just now. Nothing has changed — please try again.' });
  }
};
