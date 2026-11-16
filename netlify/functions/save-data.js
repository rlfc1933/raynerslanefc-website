const adminOk = require('./lib/pin');
// Rayners Lane FC — secure admin save proxy
// The GitHub token is read from the GITHUB_TOKEN environment variable
// (set in Netlify → Site settings → Environment variables). It is NEVER
// shipped to the browser, so it can't be scraped from the public site or
// auto-revoked by GitHub secret scanning.
//
// TWO write modes:
//
//  1. MERGE (list editors — the safe default for data/*.json arrays):
//       { pin, merge:true, domain, key, idField, upserts:[…], deletedIds:[…], extra:{…} }
//     The merge base is read from GitHub itself (always current — NO Netlify
//     rebuild lag), the incoming upserts/deletes are applied server-side, and
//     the result is committed atomically with the file's sha. On a 409 (someone
//     else committed in between) it re-reads and re-merges. This is what stops
//     the last-write-wins data loss where two admin saves inside the ~30–90s
//     rebuild window would overwrite each other. Returns the merged array so the
//     browser can trust the server's truth instead of re-reading the stale site.
//
//  2. RAW (images + whole-file writers like the programme):
//       { pin, path, content }   // content = base64 of the full file
//
// Requires Netlify env vars:
//   GITHUB_TOKEN  (required)  – a fine-grained or classic PAT with "Contents: write" on the repo
//   ADMIN_PIN     (optional)  – overrides the built-in PIN check

const REPO   = 'rlfc1933/raynerslanefc-website';
const BRANCH = 'main';
const API    = 'https://api.github.com/repos/' + REPO + '/contents/';
const PATH_OK = /^(data\/[\w-]+\.json|img\/uploads\/[\w.\-]+)$/;
const DOMAIN_OK = /^[\w-]+$/;

// ── PRIVATE DRAFTS ───────────────────────────────────────────────────────
// The repository is public, so anything committed is readable on GitHub no
// matter what the website serves. Unpublished drafts therefore never go to
// git: these paths live in a private Netlify Blobs store instead, reached only
// through this function and the committee password. The browser uses the same
// paths and the same three modes (read / whole-file with expectRevision /
// merge), so callers did not have to change.
// Blobs 8.2 has no conditional write, so the revision check is read-then-write
// in one invocation: a far smaller window than the old client-side check, but
// not an atomic compare-and-swap.
const PRIVATE = { 'data/programme-draft.json': 'programme-draft', 'data/news-drafts.json': 'news-drafts', 'data/programme-legacy-recovery.json': 'programme-legacy-recovery' };
// Read-only private paths: staff may read them, nothing may write them.
const READ_ONLY = { 'data/programme-legacy-recovery.json': true };
// The legacy draft that used to sit in public data/programme.json (and the
// unpublished items of data/programmes.json). It is NOT copied into the current
// tree (the repository is public): on the first signed-in read it is fetched
// from git history at the last commit that had it, and copied into the private
// store, so the Broadfields work is recoverable by staff without republishing it.
const LEGACY_REF = '86b2143acc7b82928c848a85f673ac50bb936794';
let ghForSeed = null;
async function fetchLegacy() {
  if (!ghForSeed) return null;
  async function at(p) {
    const r = await fetch(API + p + '?ref=' + LEGACY_REF, { headers: ghForSeed });
    if (!r.ok) return null;
    const j = await r.json();
    try { return JSON.parse(Buffer.from(String(j.content || '').replace(/\n/g, ''), 'base64').toString('utf8')); } catch (e) { return null; }
  }
  const programme = await at('data/programme.json');
  if (!programme) return null;
  const arch = await at('data/programmes.json');
  return { programme: programme, archiveDrafts: ((arch && arch.items) || []).filter(function (i) { return i && i.published !== true; }), fromCommit: LEGACY_REF };
}
async function seedLegacy(st) {
  if ((await st.get('programme-legacy-seeded', { type: 'json' })) != null) return;
  const legacy = await fetchLegacy();
  if (!legacy) return;                                   // try again on a later read
  if ((await st.get('programme-legacy-recovery', { type: 'json' })) == null) await st.setJSON('programme-legacy-recovery', legacy);
  if ((await st.get('programme-draft', { type: 'json' })) == null) {
    await st.setJSON('programme-draft', Object.assign({}, legacy.programme, { revision: 0, recoveredFrom: 'data/programme.json@' + LEGACY_REF.slice(0, 7) }));
  }
  await st.setJSON('programme-legacy-seeded', { at: new Date().toISOString() });
}
let draftStore = null, lastEvent = null;
async function drafts() {
  if (draftStore) return draftStore;
  const b = await import('@netlify/blobs');
  if (b.connectLambda && lastEvent) { try { b.connectLambda(lastEvent); } catch (e) { /* newer runtime injects context */ } }
  return b.getStore({ name: 'rlfc-private-drafts', consistency: 'strong' });
}
async function privRead(path) { const st = await drafts(); if (path === 'data/programme-draft.json' || path === 'data/programme-legacy-recovery.json') await seedLegacy(st); const d = await st.get(PRIVATE[path], { type: 'json' }); return d == null ? null : d; }
async function privWrite(path, obj) { const st = await drafts(); await st.setJSON(PRIVATE[path], obj); }

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(obj),
  };
}

// Union-merge by idField, preserving order: existing first (in their order),
// then any new ids appended. Deletions apply BEFORE upserts, so deleting and
// re-adding the same id in one save keeps it (the upsert wins). Identical rules
// to the old client-side merge — only the base is now authoritative (GitHub).
function mergeArray(liveArr, upserts, deletedIds, idField) {
  const map = {}, order = [];
  (liveArr || []).forEach(function (it) {
    if (it && it[idField] != null) { if (!(it[idField] in map)) order.push(it[idField]); map[it[idField]] = it; }
  });
  (deletedIds || []).forEach(function (k) { delete map[k]; });
  (upserts || []).forEach(function (it) {
    if (it && it[idField] != null) { if (!(it[idField] in map)) order.push(it[idField]); map[it[idField]] = it; }
  });
  const merged = [], seen = {};
  order.forEach(function (k) { if ((k in map) && !(k in seen)) { seen[k] = 1; merged.push(map[k]); } });
  return merged;
}

async function purgeCDN(path) {
  try {
    const pg = await fetch('https://purge.jsdelivr.net/gh/' + REPO + '@' + BRANCH + '/' + path, { signal: AbortSignal.timeout(6000) });
    return pg.ok;
  } catch (e) { return false; }
}

// ── MODE 1: atomic merge against GitHub ──
async function handleMerge(payload, ghHeaders) {
  const domain = payload.domain, key = payload.key, idField = payload.idField;
  if (!domain || !DOMAIN_OK.test(domain)) return resp(400, { error: 'Invalid domain' });
  if (!key || !idField) return resp(400, { error: 'merge requires key and idField' });

  const path = 'data/' + domain + '.json';
  if (!PATH_OK.test(path)) return resp(400, { error: 'Invalid path' });

  const upserts    = Array.isArray(payload.upserts) ? payload.upserts : [];
  const deletedIds = Array.isArray(payload.deletedIds) ? payload.deletedIds : [];
  const extra      = (payload.extra && typeof payload.extra === 'object') ? payload.extra : null;
  if (READ_ONLY[path]) return resp(403, { error: 'Read-only: ' + path + ' is a recovery copy and cannot be changed.' });
  if (PRIVATE[path]) {
    const obj = (await privRead(path)) || {};
    const merged = mergeArray(Array.isArray(obj[key]) ? obj[key] : [], upserts, deletedIds, idField);
    obj[key] = merged; obj.updatedAt = new Date().toISOString();
    await privWrite(path, obj);
    return resp(200, { ok: true, merged: merged, count: merged.length, skipped: [], private: true });
  }

  // Up to 5 read-merge-write attempts; each retry re-reads the latest sha so a
  // concurrent commit never causes a lost update — it just makes us merge again.
  for (let attempt = 0; attempt < 5; attempt++) {
    let sha, obj = {};
    const cur = await fetch(API + path + '?ref=' + BRANCH, { headers: ghHeaders });
    if (cur.ok) {
      const j = await cur.json();
      sha = j.sha;
      try { obj = JSON.parse(Buffer.from(String(j.content || '').replace(/\n/g, ''), 'base64').toString('utf8')) || {}; }
      catch (e) { obj = {}; }
    } else if (cur.status !== 404) {
      return resp(cur.status, { error: 'Could not read current ' + path + ' from GitHub — nothing was changed.' });
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};

    const liveArr = Array.isArray(obj[key]) ? obj[key] : [];
    // GUARDS (programme archive). A stale client must not overwrite a record
    // someone else has changed since it was loaded, and a DRAFT save must never
    // replace a PUBLISHED edition — that is how editing a draft used to
    // unpublish the programme supporters had already been given.
    const byId = {}; liveArr.forEach(function (it) { if (it && it[idField] != null) byId[it[idField]] = it; });
    const expect = (payload.expectRevisions && typeof payload.expectRevisions === 'object') ? payload.expectRevisions : null;
    if (expect) {
      for (const id of Object.keys(expect)) {
        const cur = byId[id]; const have = cur ? (cur.revision || 0) : 0;
        if (have !== (Number(expect[id]) || 0)) {
          return resp(409, { error: 'stale', id: id, current: cur ? { revision: have, savedAt: cur.savedAt || cur.updatedAt || null, savedBy: cur.savedBy || null, published: !!cur.published } : null });
        }
      }
    }
    let effUpserts = upserts; const skipped = [];
    if (payload.protectPublished === true) {
      effUpserts = upserts.filter(function (it) {
        const cur = it && byId[it[idField]];
        if (cur && cur.published === true && it.published !== true) { skipped.push(it[idField]); return false; }
        return true;
      });
    }
    const merged  = mergeArray(liveArr, effUpserts, deletedIds, idField);
    obj[key] = merged;                                    // preserves every other top-level key in the file
    if (extra) Object.keys(extra).forEach(function (k) { obj[k] = extra[k]; });
    obj.updatedAt = new Date().toISOString();

    const content = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
    const body = { message: 'Admin: merge ' + path + ' (+' + upserts.length + ' / -' + deletedIds.length + ')', content: content, branch: BRANCH };
    if (sha) body.sha = sha;

    const put = await fetch(API + path, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders),
      body: JSON.stringify(body),
    });

    if (put.ok) {
      const result = await put.json();
      const purged = await purgeCDN(path);
      return resp(200, { ok: true, merged: merged, count: merged.length, skipped: skipped, commit: result.commit && result.commit.sha, purged: purged });
    }
    // 409 = sha conflict (concurrent commit); 422 GitHub sometimes returns for a
    // stale sha too. Either way: loop, re-read the newer sha, re-merge, re-try.
    if (put.status === 409 || put.status === 422) continue;

    const err = await put.json().catch(function () { return {}; });
    return resp(put.status, { error: (err && err.message) || 'GitHub rejected the merge — nothing was changed.' });
  }
  return resp(409, { error: 'Too many people saving at once — your changes were NOT lost, please press Save again.' });
}

// ── READ: the authoritative current copy of one data file ──
// The site's own copy of data/*.json lags a save by a rebuild (30–90 s), so an
// editor that reloads from it can start from an older version than the one it
// just saved — and then overwrite it. Reading from GitHub closes that gap.
async function handleRead(payload, ghHeaders) {
  const path = payload.path;
  if (!path || !/^data\/[\w-]+\.json$/.test(path)) return resp(400, { error: 'Invalid path' });
  if (PRIVATE[path]) { const d = await privRead(path); return resp(200, { ok: true, exists: d != null, data: d, private: true }); }
  const cur = await fetch(API + path + '?ref=' + BRANCH, { headers: ghHeaders });
  if (cur.status === 404) return resp(200, { ok: true, exists: false, data: null });
  if (!cur.ok) return resp(cur.status, { error: 'Could not read ' + path });
  const j = await cur.json();
  let data = null;
  try { data = JSON.parse(Buffer.from(String(j.content || '').replace(/\n/g, ''), 'base64').toString('utf8')); } catch (e) { return resp(502, { error: 'Unreadable JSON in ' + path }); }
  return resp(200, { ok: true, exists: true, data: data, sha: j.sha });
}

// ── MODE 2: raw whole-file write (images, programme) ──
async function handleRaw(payload, ghHeaders) {
  const path = payload.path, content = payload.content;
  if (!path || typeof content !== 'string' || !PATH_OK.test(path)) {
    return resp(400, { error: 'Invalid path or content' });
  }
  if (READ_ONLY[path]) return resp(403, { error: 'Read-only: ' + path + ' is a recovery copy and cannot be changed.' });
  if (PRIVATE[path]) {
    let next; try { next = JSON.parse(Buffer.from(content, 'base64').toString('utf8')); } catch (e) { return resp(400, { error: 'Draft must be JSON' }); }
    const cur = await privRead(path);
    if (payload.expectRevision != null) {
      const have = cur ? (Number(cur.revision) || 0) : 0;
      if (have !== (Number(payload.expectRevision) || 0)) {
        return resp(409, { error: 'stale', current: cur ? { revision: have, savedAt: cur.savedAt || cur.updatedAt || null, savedBy: cur.savedBy || null, opponent: cur.opponent || null, fixtureId: cur.fixtureId || null } : null });
      }
    }
    await privWrite(path, next);
    return resp(200, { ok: true, private: true });
  }
  let sha;
  const cur = await fetch(API + path + '?ref=' + BRANCH, { headers: ghHeaders });
  if (cur.ok) {
    const j = await cur.json(); sha = j.sha;
    // Optional optimistic lock for whole-file JSON documents (the programme
    // draft): refuse if the file's `revision` is not the one this client
    // started from, and say who saved the newer one.
    if (payload.expectRevision != null) {
      let doc = {};
      try { doc = JSON.parse(Buffer.from(String(j.content || '').replace(/\n/g, ''), 'base64').toString('utf8')) || {}; } catch (e) { doc = {}; }
      const have = Number(doc.revision) || 0;
      if (have !== (Number(payload.expectRevision) || 0)) {
        return resp(409, { error: 'stale', current: { revision: have, savedAt: doc.savedAt || doc.updatedAt || null, savedBy: doc.savedBy || null, opponent: doc.opponent || null, fixtureId: doc.fixtureId || null } });
      }
    }
  } else if (cur.status !== 404) {
    return resp(cur.status, { error: 'Could not read current ' + path + ' from GitHub — nothing was changed.' });
  } else if (payload.expectRevision != null && Number(payload.expectRevision) !== 0) {
    return resp(409, { error: 'stale', current: null });
  }

  const body = { message: 'Admin: update ' + path, content: content, branch: BRANCH };
  if (sha) body.sha = sha;

  const put = await fetch(API + path, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders),
    body: JSON.stringify(body),
  });
  const result = await put.json();
  if (!put.ok) return resp(put.status, { error: (result && result.message) || 'GitHub rejected the commit' });

  const purged = await purgeCDN(path);
  return resp(200, { ok: true, commit: result.commit && result.commit.sha, purged: purged });
}

exports._setDraftStore = function (st) { draftStore = st; };
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST')    return resp(405, { error: 'POST only' });

  lastEvent = event;
  const token = process.env.GITHUB_TOKEN;
  if (!token) return resp(500, { error: 'Server not configured — set GITHUB_TOKEN in Netlify environment variables' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return resp(400, { error: 'Invalid request body' }); }

  if (!adminOk(payload.pin)) return resp(401, { error: 'Unauthorized' });

  const ghHeaders = ghForSeed = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'RLFC-Admin',
  };

  try {
    if (payload.read === true) return await handleRead(payload, ghHeaders);
    return payload.merge === true
      ? await handleMerge(payload, ghHeaders)
      : await handleRaw(payload, ghHeaders);
  } catch (err) {
    return resp(502, { error: 'Could not reach GitHub: ' + err.message });
  }
};
