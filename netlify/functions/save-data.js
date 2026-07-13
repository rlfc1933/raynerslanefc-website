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
    const merged  = mergeArray(liveArr, upserts, deletedIds, idField);
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
      return resp(200, { ok: true, merged: merged, count: merged.length, commit: result.commit && result.commit.sha, purged: purged });
    }
    // 409 = sha conflict (concurrent commit); 422 GitHub sometimes returns for a
    // stale sha too. Either way: loop, re-read the newer sha, re-merge, re-try.
    if (put.status === 409 || put.status === 422) continue;

    const err = await put.json().catch(function () { return {}; });
    return resp(put.status, { error: (err && err.message) || 'GitHub rejected the merge — nothing was changed.' });
  }
  return resp(409, { error: 'Too many people saving at once — your changes were NOT lost, please press Save again.' });
}

// ── MODE 2: raw whole-file write (images, programme) ──
async function handleRaw(payload, ghHeaders) {
  const path = payload.path, content = payload.content;
  if (!path || typeof content !== 'string' || !PATH_OK.test(path)) {
    return resp(400, { error: 'Invalid path or content' });
  }
  let sha;
  const cur = await fetch(API + path + '?ref=' + BRANCH, { headers: ghHeaders });
  if (cur.ok) { const j = await cur.json(); sha = j.sha; }

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST')    return resp(405, { error: 'POST only' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return resp(500, { error: 'Server not configured — set GITHUB_TOKEN in Netlify environment variables' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return resp(400, { error: 'Invalid request body' }); }

  const expectedPin = process.env.ADMIN_PIN || '19332026';
  if (String(payload.pin) !== String(expectedPin)) return resp(401, { error: 'Unauthorized' });

  const ghHeaders = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'RLFC-Admin',
  };

  try {
    return payload.merge === true
      ? await handleMerge(payload, ghHeaders)
      : await handleRaw(payload, ghHeaders);
  } catch (err) {
    return resp(502, { error: 'Could not reach GitHub: ' + err.message });
  }
};
