// ════════════════════════════════════════════════════════════════════════════
// PROGRAMME STUDIO → THE WEBSITE.
//
// The website's programme is the authoritative edition model (programme_editions
// + programme_versions, built by programme-sync). The Studio does not write a
// second copy of it. Publishing an APPROVED Studio revision:
//
//   1. turns the editorial pages into the sections that model already accepts
//      (chairNotes, preview, history, article:<key>) — saved and approved through
//      programme-admin, in-process, under the same signed session;
//   2. approves the edition, with a time it may publish from (now, a chosen
//      time, or matchday morning as before);
//   3. runs the engine, then reads back the published version and checks it
//      carries exactly this revision's words. Only then does it say "Published".
//
// On a deploy preview the database is production's, so step 1–3 would change
// the live site. There the same sections are written to the preview's own
// store and served by the preview's programme-data (see sandboxOverlay), so the
// real reader and collection can be checked without touching production.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');
const STORE = require('./studio-store');

const ARTICLE_KEY = { manager: 'manager-notes', directory: 'club-directory', report: 'match-report', community: 'community',
  sponsors: 'player-sponsors', feature: 'feature', opposition: 'opposition-notes', history2: 'story-of-the-lane-2' };

/** Studio pages → edition sections. Only text a person wrote; pictures stay in print. */
function sectionsFrom(doc) {
  const out = [];
  (doc.pages || []).forEach((p) => {
    if (p.hidden || !p.body || !String(p.body).trim()) return;
    if (p.role === 'chair' && p.type === 'notes') {
      if (!p.author) return;               // never published without a named author
      out.push({ section_key: 'chairNotes', title: p.label || 'From the chair', body: p.body, byline: p.author });
    } else if (p.role === 'preview') {
      out.push({ section_key: 'preview', title: p.headline || 'Match preview', body: p.body });
    } else if (p.role === 'history') {
      out.push({ section_key: 'history', title: p.headline || 'Story of the Lane', body: p.body });
    } else if (p.type === 'article' || p.type === 'notes' || p.type === 'opposition') {
      const key = 'article:' + (ARTICLE_KEY[p.role] || ('page-' + p.id)).slice(0, 30);
      out.push({ section_key: key, title: p.headline || p.label || '', body: p.body, byline: p.author || null });
    }
  });
  return out;
}
function digest(sections) {
  return crypto.createHash('sha256').update(JSON.stringify(sections.map((s) => [s.section_key, s.title || '', s.body]))).digest('hex');
}

function when(b, now) {
  if (b.when === 'now') return { mode: 'now', at: new Date(now).toISOString() };
  if (b.when === 'matchday') return { mode: 'matchday', at: null };
  const t = Date.parse(b.when);
  if (!isFinite(t)) return null;
  return { mode: 'scheduled', at: new Date(Math.max(t, now)).toISOString() };
}

async function publish(event, store, b, who) {
  const now = Date.now();
  const cur = await STORE.readDraft(store, b.fixtureId);
  if (!cur) return { code: 404, body: { ok: false, error: 'There is no saved draft for this match.' } };
  const d = cur.draft;
  if (d.revision !== parseInt(b.baseRevision, 10)) return { code: 409, body: { ok: false, conflict: true, current: d,
    error: 'The programme changed since you looked at it. Check the latest version first.' } };
  if (d.status !== 'approved') return { code: 400, body: { ok: false, error: 'Approve this version before publishing it.', fix: 'approve' } };
  const w = when(b, now);
  if (!w) return { code: 400, body: { ok: false, error: 'Choose when to publish: now, a date and time, or matchday morning.' } };
  const sections = sectionsFrom(d.doc);
  if (!sections.length) return { code: 400, body: { ok: false, error: 'None of the written pages is set to appear on the website yet.' } };
  const hash = digest(sections);
  const rec = { fixtureId: d.fixtureId, revision: d.revision, by: who, at: new Date(now).toISOString(), mode: w.mode, publishAt: w.at,
    hash, sections, fixture: d.doc.fixture };

  const result = STORE.isProduction(event)
    ? await publishToEdition(event, rec)
    : await publishToSandbox(event, store, rec);
  await store.setJSON('publications/' + d.fixtureId + '/' + rec.at.replace(/[:.]/g, '-'), Object.assign({}, rec, { result: result.state }), { onlyIfNew: true });
  return { code: 200, body: Object.assign({ ok: true, revision: d.revision, mode: w.mode, publishAt: w.at }, result) };
}

/* ── production: through programme-admin and the engine ──────────────────── */
async function publishToEdition(event, rec) {
  const admin = require('../../programme-admin');
  const call = async (body) => JSON.parse((await admin.handler({ httpMethod: 'POST', headers: event.headers,
    body: JSON.stringify(Object.assign({ fixtureId: rec.fixtureId }, body)) })).body || '{}');
  // Already on the website with exactly these words: pressing Publish again
  // changes nothing and creates nothing.
  const already = await verifyEdition(rec);
  if (already.verified) return { state: 'published', verified: true, publishedAt: already.publishedAt, version: already.version,
    viewUrl: '/programme.html?id=' + encodeURIComponent(rec.fixtureId), unchanged: true };
  const isLive = !!already.publishedAt;
  for (const s of rec.sections) {
    const r = await call({ action: 'save_section', sectionKey: s.section_key, title: s.title, body: s.body, byline: s.byline, approve: true,
      reason: 'Programme Studio revision ' + rec.revision });
    if (!r.ok) return { state: 'failed', verified: false, error: r.error || 'A page could not be saved to the website.' };
  }
  const a = isLive
    ? await call({ action: 'approve_correction', reason: 'Programme Studio revision ' + rec.revision })
    : await call({ action: 'approve_editorial', publishAt: rec.publishAt, studioRevision: rec.revision });
  if (!a.ok) return { state: 'failed', verified: false, error: a.error };
  if (rec.mode === 'now' || isLive) await call({ action: 'run' });
  const v = await verifyEdition(rec);
  if (v.verified) return { state: 'published', verified: true, correction: isLive, publishedAt: v.publishedAt, version: v.version,
    viewUrl: '/programme.html?id=' + encodeURIComponent(rec.fixtureId) };
  if (rec.mode !== 'now') return { state: 'scheduled', verified: false, message: rec.mode === 'matchday'
    ? 'Approved. It will appear on the website on matchday morning.' : 'Approved. It will appear on the website at the time you chose.' };
  return { state: 'updating', verified: false, message: 'Approved, but the website has not shown it yet. Try "Check again" in a minute.' };
}

/** Read the newest PUBLISHED version and check it carries these words. */
async function verifyEdition(rec) {
  const S = require('./../football/store');
  const eds = await S.rest('programme_editions?internal_fixture_id=eq.' + encodeURIComponent(rec.fixtureId) + '&select=id,published_at&limit=1');
  const ed = eds && eds[0];
  if (!ed || !ed.published_at) return { verified: false, publishedAt: null };
  const vs = await S.rest('programme_versions?edition_id=eq.' + ed.id + '&published_at=not.is.null&select=version,published_at,payload&order=version.desc&limit=1');
  const v = vs && vs[0];
  if (!v || !v.payload || !v.payload.sections) return { verified: false, publishedAt: ed.published_at };
  // Words, not formatting: the engine may re-flow paragraphs.
  const norm = (t) => String(t).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  const published = norm(JSON.stringify(v.payload.sections));
  const ok = rec.sections.every((s) => published.indexOf(norm(JSON.stringify(s.body).slice(1, -1)).slice(0, 200)) > -1);
  return { verified: ok, publishedAt: ed.published_at, version: v.version };
}

/* ── deploy preview: the preview's own store ─────────────────────────────── */
async function publishToSandbox(event, store, rec) {
  await store.setJSON('published/' + rec.fixtureId, rec);
  const back = await store.get('published/' + rec.fixtureId, { type: 'json' });
  const visible = !rec.publishAt || Date.parse(rec.publishAt) <= Date.now();
  if (!back || back.hash !== rec.hash) return { state: 'failed', verified: false, error: 'The preview could not store the publication. Nothing changed.' };
  if (!visible || rec.mode === 'matchday') return { state: 'scheduled', verified: true, sandbox: true,
    message: 'Approved. On this preview it will appear at the chosen time.' };
  return { state: 'published', verified: true, sandbox: true, publishedAt: rec.at,
    viewUrl: '/programme.html?id=' + encodeURIComponent(rec.fixtureId) };
}

/**
 * For programme-data on a NON-production host only: the preview's Studio
 * publications, shaped like the real endpoint's answers. Never consulted on
 * the club's real hosts.
 */
async function sandboxOverlay(event) {
  if (STORE.isProduction(event)) return null;
  try {
    const store = await STORE.open(event);
    const { blobs } = await store.list({ prefix: 'published/' });
    const out = [];
    for (const k of blobs) {
      const r = await store.get(k.key, { type: 'json' });
      if (r && r.mode !== 'matchday' && (!r.publishAt || Date.parse(r.publishAt) <= Date.now())) out.push(r);
    }
    return out;
  } catch (e) { return null; }
}

/** The payload the public reader renders, for a sandbox publication. */
function sandboxPayload(rec) {
  const LC = require('./lifecycle');
  const f = rec.fixture || {};
  const built = { sections: { cover: { title: 'Rayners Lane v ' + f.opponent, date: f.date, kickoff: f.kickoff, competition: f.competition,
    venue: f.venue, homeTeam: 'Rayners Lane', awayTeam: f.opponent, awayCrest: f.oppCrest || null } } };
  const rows = rec.sections.map((s) => Object.assign({ approved_by: rec.by, data: null }, s));
  return LC.applySections(built, rows);
}

/** programme-data's answer for a sandbox edition — same member gate as real editions. */
async function sandboxResponse(event, r, FAN) {
  const payload = sandboxPayload(r);
  const edition = { fixtureId: r.fixtureId, slug: r.fixtureId, state: 'published_matchday', season: r.fixture.season,
    kickoffAt: r.fixture.date + 'T' + (r.fixture.kickoff || '15:00') + ':00', venue: r.fixture.venue, publishedAt: r.at,
    version: r.revision, publicationSource: 'manual', editionKind: 'matchday', sandbox: true,
    revisionReason: 'Programme Studio revision ' + r.revision + ' (deploy preview only)' };
  const gate = await FAN.context(event);
  if (!gate.entitled) return { ok: true, locked: true, reason: gate.user ? 'membership_incomplete' : 'not_signed_in',
    edition, cover: payload.sections.cover, finalMatch: null };
  return { ok: true, edition, programme: payload, lineups: null, table: null, finalMatch: null, legal: null };
}

module.exports = { sandboxResponse, publish, sectionsFrom, digest, sandboxOverlay, sandboxPayload, when };
