// Rayners Lane FC — secure admin save proxy
// The GitHub token is read from the GITHUB_TOKEN environment variable
// (set in Netlify → Site settings → Environment variables). It is NEVER
// shipped to the browser, so it can't be scraped from the public site or
// auto-revoked by GitHub secret scanning.
//
// Admin panel POSTs { pin, path, content } where:
//   pin     – the admin PIN (shared secret, blocks casual abuse)
//   path    – data/<name>.json  OR  img/uploads/<file>
//   content – base64-encoded file contents
//
// Requires Netlify env vars:
//   GITHUB_TOKEN  (required)  – a fine-grained or classic PAT with "Contents: write" on the repo
//   ADMIN_PIN     (optional)  – overrides the built-in PIN check

const REPO   = 'rlfc1933/raynerslanefc-website';
const BRANCH = 'main';
const API    = 'https://api.github.com/repos/' + REPO + '/contents/';
const PATH_OK = /^(data\/[\w-]+\.json|img\/uploads\/[\w.\-]+)$/;

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST')    return resp(405, { error: 'POST only' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return resp(500, { error: 'Server not configured — set GITHUB_TOKEN in Netlify environment variables' });
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return resp(400, { error: 'Invalid request body' }); }

  const expectedPin = process.env.ADMIN_PIN || '19332026';
  if (String(payload.pin) !== String(expectedPin)) {
    return resp(401, { error: 'Unauthorized' });
  }

  const path    = payload.path;
  const content = payload.content;
  if (!path || typeof content !== 'string' || !PATH_OK.test(path)) {
    return resp(400, { error: 'Invalid path or content' });
  }

  const ghHeaders = {
    'Authorization': 'token ' + token,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'RLFC-Admin',
  };

  try {
    // 1. Look up the current file SHA (needed to update an existing file)
    let sha;
    const cur = await fetch(API + path + '?ref=' + BRANCH, { headers: ghHeaders });
    if (cur.ok) {
      const j = await cur.json();
      sha = j.sha;
    }

    // 2. Commit the new contents
    const body = { message: 'Admin: update ' + path, content: content, branch: BRANCH };
    if (sha) body.sha = sha;

    const put = await fetch(API + path, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders),
      body: JSON.stringify(body),
    });
    const result = await put.json();

    if (!put.ok) {
      return resp(put.status, { error: (result && result.message) || 'GitHub rejected the commit' });
    }
    return resp(200, { ok: true, commit: result.commit && result.commit.sha });
  } catch (err) {
    return resp(502, { error: 'Could not reach GitHub: ' + err.message });
  }
};
