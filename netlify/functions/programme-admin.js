// PROGRAMME HQ — the committee's controls for the matchday programme.
//
// One POST endpoint, committee-password gated (lib/pin, the same gate as every
// other HQ write), used by the Programme HQ panel (js/programme-hq.js).
//
// Every decision is made by a NAMED person and recorded as a publication
// event. Nothing is deleted: unpublishing is a state with a reason, a rollback
// is a new version carrying an older payload, a corrected name is a new
// version with the correction noted. A data refresh never erases a manual edit
// because manual work lives in programme_sections, not in the generated payload.
//
// Never called by the scheduler, and it never calls a data provider.
'use strict';

const adminOk = require('./lib/pin');
const S = require('./lib/football/store');
const READ = require('./lib/football/read');
const REC = require('./lib/programme/reconcile');
const LC = require('./lib/programme/lifecycle');
const API = require('./lib/programme/fwp-api');

const SEASON = process.env.FWP_SEASON || '2026-2027';
const PUBLIC = REC.PUBLIC_STATES;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(obj),
  };
}

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 200);

async function editionFor(fixtureId) {
  if (!fixtureId) return null;
  return S.findOne('programme_editions', 'internal_fixture_id=eq.' + encodeURIComponent(fixtureId) + '&select=*');
}

async function event(edition, type, extra) {
  const e = extra || {};
  await S.rest('programme_publication_events?on_conflict=idempotency_key', {
    method: 'POST',
    body: [{ edition_id: edition ? edition.id : null, event_type: type, from_state: e.from || null, to_state: e.to || null,
      version: e.version || null, actor: e.actor, reason: e.reason || null, detail: e.detail || null,
      idempotency_key: e.key || null }],
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  }).catch(() => null);
}

async function patchEdition(id, body) {
  await S.rest('programme_editions?id=eq.' + id, { method: 'PATCH', body, headers: { Prefer: 'return=minimal' } });
}

async function versions(editionId) {
  return (await S.rest('programme_versions?edition_id=eq.' + editionId + '&select=*&order=version.asc')) || [];
}

async function insertVersion(edition, row) {
  await S.rest('programme_versions?on_conflict=edition_id,version', {
    method: 'POST', body: [Object.assign({ edition_id: edition.id }, row)],
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
  await patchEdition(edition.id, { current_version: row.version });
}

/** The whole picture for HQ: reconciliation, the next home fixture, sources. */
async function status() {
  const [all, played, editions] = await Promise.all([
    READ.season(SEASON), READ.results(SEASON),
    S.rest('programme_editions?season=eq.' + encodeURIComponent(SEASON) + '&select=*&order=scheduled_kickoff_at.asc'),
  ]);
  const byId = {}; played.forEach((p) => { byId[p.id] = p; });
  const fixtures = all.map((f) => byId[f.id] || f);
  const rec = REC.reconcile(fixtures, editions || [], Date.now());

  let next = null;
  if (rec.summary.nextHome) {
    const row = rec.rows.filter((r) => r.fixtureId === rec.summary.nextHome)[0];
    const ed = (editions || []).filter((e) => e.internal_fixture_id === rec.summary.nextHome)[0] || null;
    let sections = [], placements = [], vs = [], events = [];
    if (ed) {
      [sections, placements, vs, events] = await Promise.all([
        S.rest('programme_sections?or=(edition_id.eq.' + ed.id + ',edition_id.is.null)&select=*').catch(() => []),
        S.rest('programme_sponsor_placements?or=(edition_id.eq.' + ed.id + ',season.eq.' + SEASON + ')&select=*').catch(() => []),
        S.rest('programme_versions?edition_id=eq.' + ed.id + '&select=version,stage,published_at,revision_reason,created_by&order=version.desc').catch(() => []),
        S.rest('programme_publication_events?edition_id=eq.' + ed.id + '&select=*&order=created_at.desc&limit=20').catch(() => []),
      ]);
    }
    const sp = LC.sponsorPlacements(placements, { editionId: ed && ed.id, season: SEASON, date: row.date });
    const missing = [];
    if (!ed) missing.push('programme record (created on the next sync run)');
    if (ed && !ed.mandatory_content_valid) missing.push('mandatory sections incomplete');
    if (ed && !ed.editorial_approved_at) missing.push('editorial approval');
    if (!sp.placements.some((p) => p.kind === 'match_sponsor')) missing.push('no approved match sponsor (optional)');
    if (!sp.placements.some((p) => p.kind === 'match_ball')) missing.push('no approved match-ball sponsor (optional)');
    next = { fixture: row, edition: ed, sections, placements, sponsorIssues: sp.issues, versions: vs, events, missing };
  }

  const api = API.createClient({});
  let lastRun = null;
  try {
    const runs = await S.rest('football_sync_runs?sync_type=eq.programme&select=status,started_at,completed_at,final_error&order=id.desc&limit=1');
    lastRun = runs && runs[0];
  } catch (e) { /* not fatal */ }

  return {
    ok: true, season: SEASON,
    reconciliation: rec,
    next,
    sources: {
      registry: 'football registry (Football Web Pages fixture list, synced every 20 minutes)',
      fwpApi: api.configured() ? 'key present — untested until a real request succeeds' : 'not connected — FWP_API_KEY is not set',
      faFullTime: 'manual verification — see the programme-football-data skill (FA Full-Time workflow)',
    },
    lastRun,
  };
}

exports.handler = async function (ev) {
  if (ev.httpMethod === 'OPTIONS') return resp(204, {});
  if (ev.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b = {};
  try { b = JSON.parse(ev.body || '{}'); } catch (e) { return resp(400, { ok: false, error: 'bad JSON' }); }
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Not signed in' });
  if (!S.configured()) return resp(200, { ok: false, error: 'database not configured' });

  const action = String(b.action || 'status');
  const who = clean(b.by, 80);
  const needsName = action !== 'status' && action !== 'history' && action !== 'run';
  if (needsName && !who) return resp(400, { ok: false, error: 'Add your name so the club has a record of who did this.' });

  try {
    if (action === 'status') return resp(200, await status());

    if (action === 'run') {
      const sync = require('./programme-sync');
      const out = await sync.handler({ httpMethod: 'POST', body: '{}', queryStringParameters: {} });
      return resp(200, Object.assign({ triggered: true }, JSON.parse(out.body || '{}')));
    }

    // Season-long sponsor placement (no fixture) is the one action without an edition.
    if (action === 'add_placement' && !b.fixtureId) {
      if (!b.season) return resp(400, { ok: false, error: 'a season-long placement needs a season' });
    }

    const ed = await editionFor(b.fixtureId);
    if (!ed && !(action === 'add_placement' && b.season) && !(action === 'save_section' && b.evergreen)) {
      return resp(404, { ok: false, error: 'There is no programme record for that fixture yet. Run the programme refresh first.' });
    }

    if (action === 'history') {
      const [vs, evs] = await Promise.all([
        S.rest('programme_versions?edition_id=eq.' + ed.id + '&select=version,stage,published_at,revision_reason,created_by,restored_from_version&order=version.desc'),
        S.rest('programme_publication_events?edition_id=eq.' + ed.id + '&select=*&order=created_at.desc&limit=100'),
      ]);
      return resp(200, { ok: true, edition: ed, versions: vs || [], events: evs || [] });
    }

    if (action === 'approve_editorial') {
      if (ed.published_at) return resp(200, { ok: false, error: 'Already published — use corrections or rollback instead.' });
      if (!ed.mandatory_content_valid) return resp(200, { ok: false, error: 'The edition is missing mandatory sections; fix those first.' });
      const at = new Date().toISOString();
      await patchEdition(ed.id, { editorial_approved_by: who, editorial_approved_at: at, editorial_approved_hash: null,
        state: ed.state === 'ready_for_review' ? 'approved' : ed.state });
      await event(ed, 'editorial_approved', { actor: who, from: ed.state, to: 'approved', key: 'approve:' + ed.id + ':' + at });
      return resp(200, { ok: true, message: 'Approved. It publishes on matchday morning; confirmed teams are added when they are released.' });
    }

    if (action === 'save_section') {
      const key = clean(b.sectionKey, 40);
      if (!/^(welcome|preview|chairNotes|history|cover|article:[a-z0-9-]{1,30})$/.test(key)) {
        return resp(400, { ok: false, error: 'unknown section' });
      }
      if (key === 'chairNotes' && b.approve && !clean(b.byline, 80)) {
        return resp(400, { ok: false, error: 'Chairman\'s notes need a byline: the system never writes in somebody\'s voice.' });
      }
      const editionId = b.evergreen ? null : ed.id;
      const row = { edition_id: editionId, section_key: key, title: clean(b.title, 140) || null,
        body: clean(b.body, 8000) || null, byline: clean(b.byline, 80) || null,
        data: b.data && typeof b.data === 'object' ? b.data : null,
        source: b.evergreen ? 'evergreen' : 'manual', updated_by: who,
        approved_by: b.approve ? who : null, approved_at: b.approve ? new Date().toISOString() : null,
        preapproved: !!(b.evergreen && b.approve && key !== 'chairNotes') };
      const existing = await S.findOne('programme_sections', (editionId == null ? 'edition_id=is.null' : 'edition_id=eq.' + editionId) +
        '&section_key=eq.' + encodeURIComponent(key) + '&select=*');
      if (existing) {
        await S.rest('programme_section_revisions', { method: 'POST', headers: { Prefer: 'return=minimal' },
          body: [{ section_id: existing.id, body: existing.body, data: existing.data, changed_by: who, reason: clean(b.reason, 300) || null }] });
        await S.rest('programme_sections?id=eq.' + existing.id, { method: 'PATCH', body: row, headers: { Prefer: 'return=minimal' } });
      } else {
        await S.rest('programme_sections', { method: 'POST', body: [row], headers: { Prefer: 'return=minimal' } });
      }
      // Editorial changed after approval: it goes back for a look before it publishes.
      if (ed && ed.editorial_approved_at && !ed.published_at && !b.approve) {
        await patchEdition(ed.id, { editorial_approved_at: null, editorial_approved_by: null, state: 'ready_for_review' });
      }
      if (ed) await event(ed, 'section_saved', { actor: who, reason: key + (b.approve ? ' (approved)' : ' (draft)') });
      return resp(200, { ok: true, message: b.approve ? 'Saved and approved.' : 'Saved as a draft — not shown until approved.' });
    }

    if (action === 'authorise_retrospective') {
      if (ed.published_at) return resp(200, { ok: false, error: 'That edition is already published.' });
      await patchEdition(ed.id, { retrospective_authorised_by: who, retrospective_authorised_at: new Date().toISOString(),
        retrospective_note: clean(b.reason, 500) || null });
      await event(ed, 'retrospective_authorised', { actor: who, reason: clean(b.reason, 500), key: 'retro-auth:' + ed.id });
      const sync = require('./programme-sync');
      const out = JSON.parse((await sync.handler({ httpMethod: 'POST', body: '{}', queryStringParameters: {} })).body || '{}');
      const after = await editionFor(b.fixtureId);
      return resp(200, { ok: !!(after && after.published_at), state: after && after.state, run: out.ok,
        message: after && after.published_at ? 'Archive Edition published — labelled as reconstructed, dated today.'
          : 'Authorised; the engine could not publish it yet — see the reasons in the reconciliation table.' });
    }

    if (action === 'unpublish') {
      const reason = clean(b.reason, 500);
      if (!reason) return resp(400, { ok: false, error: 'Say why it is being unpublished.' });
      if (PUBLIC.indexOf(ed.state) === -1) return resp(200, { ok: false, error: 'It is not public.' });
      const at = new Date().toISOString();
      await patchEdition(ed.id, { state: 'withheld', withheld_by: who, withheld_reason: reason,
        unpublished_at: at, unpublished_by: who, unpublished_reason: reason });
      await event(ed, 'unpublished', { actor: who, from: ed.state, to: 'withheld', reason, key: 'unpub:' + ed.id + ':' + at });
      return resp(200, { ok: true, message: 'Unpublished. The edition and every version are kept.' });
    }

    if (action === 'restore') {
      if (!ed.unpublished_at) return resp(200, { ok: false, error: 'It was not unpublished.' });
      const evs = await S.rest('programme_publication_events?edition_id=eq.' + ed.id +
        '&event_type=eq.unpublished&select=from_state&order=created_at.desc&limit=1').catch(() => []);
      const back = (evs && evs[0] && evs[0].from_state) || 'archived';
      await patchEdition(ed.id, { state: back, withheld_by: null, withheld_reason: null,
        unpublished_at: null, unpublished_by: null, unpublished_reason: null });
      await event(ed, 'restored', { actor: who, from: 'withheld', to: back, reason: clean(b.reason, 300) });
      return resp(200, { ok: true, message: 'Restored.' });
    }

    if (action === 'rollback') {
      const vs = await versions(ed.id);
      const r = LC.rollbackVersion(vs, Number(b.toVersion), who, clean(b.reason, 300));
      if (!r.ok) return resp(400, r);
      r.row.published_at = new Date().toISOString();
      await insertVersion(ed, r.row);
      await event(ed, 'rolled_back', { actor: who, version: r.row.version, reason: r.row.revision_reason,
        key: 'rollback:' + ed.id + ':' + r.row.version });
      return resp(200, { ok: true, version: r.row.version, message: 'Version ' + b.toVersion + ' restored as version ' + r.row.version + '.' });
    }

    if (action === 'correct_player') {
      // A correction to a confirmed team sheet: a new version, with the note.
      const side = b.side === 'away' ? 'away' : 'home';
      const from = clean(b.from, 80), to = clean(b.to, 80);
      if (!from || !to) return resp(400, { ok: false, error: 'Which name, and what should it be?' });
      const vs = await versions(ed.id);
      const cur = vs[vs.length - 1];
      if (!cur) return resp(200, { ok: false, error: 'Nothing published to correct yet.' });
      const payload = JSON.parse(JSON.stringify(cur.payload));
      const sq = payload.sections && payload.sections.squads && payload.sections.squads[side];
      const list = sq ? (sq.starters || []).concat(sq.substitutes || []) : [];
      const hit = list.filter((p) => p.name === from);
      if (hit.length !== 1) return resp(200, { ok: false, error: 'That name is not on the ' + side + ' team sheet exactly once.' });
      hit[0].name = to;
      hit[0].corrected = true;
      payload.sections.squads.corrections = (payload.sections.squads.corrections || [])
        .concat([{ side, from, to, by: who, at: new Date().toISOString(), note: clean(b.note, 200) || null }]);
      const row = Object.assign({}, cur, { version: Number(cur.version) + 1, payload, stage: 'correction',
        revision_reason: 'name corrected by ' + who + ': ' + from + ' → ' + to, created_by: who,
        content_hash: null, published_at: new Date().toISOString(), restored_from_version: null });
      delete row.id; delete row.edition_id; delete row.generated_at;
      await insertVersion(ed, row);
      await event(ed, 'team_sheet_corrected', { actor: who, version: row.version, reason: row.revision_reason });
      return resp(200, { ok: true, version: row.version, message: 'Corrected in version ' + row.version + '. The earlier version is kept.' });
    }

    if (action === 'add_placement') {
      const kinds = ['full_page', 'half_page', 'quarter_page', 'title_sponsor', 'match_sponsor', 'match_ball', 'directory'];
      if (kinds.indexOf(b.kind) === -1) return resp(400, { ok: false, error: 'unknown placement' });
      const name = clean(b.sponsorName, 120);
      if (!name) return resp(400, { ok: false, error: 'Which sponsor?' });
      // Only a real, agreed commercial relationship is approved. A prospect is
      // saved as 'proposed' and never appears in a programme.
      const approve = !!b.approve && b.confirmAgreed === true;
      await S.rest('programme_sponsor_placements', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: [{
        edition_id: ed ? ed.id : null, season: ed ? null : clean(b.season, 9), sponsor_name: name, placement_kind: b.kind,
        approval_status: approve ? 'approved' : 'proposed', approved_by: approve ? who : null,
        approved_at: approve ? new Date().toISOString() : null,
        artwork_path: clean(b.artworkPath, 300) || null, website: clean(b.website, 300) || null,
        copy_text: clean(b.copy, 400) || null, hq_item_id: clean(b.hqItemId, 64) || null }] });
      if (ed) await event(ed, 'sponsor_placement_' + (approve ? 'approved' : 'proposed'), { actor: who, reason: name + ' · ' + b.kind });
      return resp(200, { ok: true, message: approve ? 'Approved placement saved.' : 'Saved as a proposal — it will not appear until approved.' });
    }

    return resp(400, { ok: false, error: 'unknown action' });
  } catch (e) {
    return resp(200, { ok: false, error: String(e && e.message || e) });
  }
};

exports._internal = { status };
