// Supabase → website. Regenerates data/players.json + data/squad.json FROM the
// Supabase roster (the single source of truth) and commits them to GitHub. This
// is now the ONLY thing that writes those two files — the admin editor feeds
// Supabase, this publishes. dryRun:true returns the generated content without
// committing (used to verify before going live).
const L = require('./lib/lane');
const REPO = 'rlfc1933/raynerslanefc-website', BRANCH = 'main';
const GH = 'https://api.github.com/repos/' + REPO + '/contents/';

function ghHeaders() { return { Authorization: 'token ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'RLFC-Admin' }; }
function slug(n) { return 'player-' + String(n || '').toLowerCase().replace(/\s+/g, '-'); }

async function putFile(path, obj) {
  const content = Buffer.from(JSON.stringify(obj, null, 2), 'utf8').toString('base64');
  let sha;
  const cur = await fetch(GH + path + '?ref=' + BRANCH, { headers: ghHeaders() });
  if (cur.ok) { sha = (await cur.json()).sha; }
  const body = { message: 'Squad: publish ' + path + ' from Supabase', content: content, branch: BRANCH };
  if (sha) body.sha = sha;
  const put = await fetch(GH + path, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()), body: JSON.stringify(body) });
  if (!put.ok) { const e = await put.json().catch(function () { return {}; }); return { ok: false, error: (e && e.message) || ('GitHub ' + put.status) }; }
  try { await fetch('https://purge.jsdelivr.net/gh/' + REPO + '@' + BRANCH + '/' + path, { signal: AbortSignal.timeout(6000) }); } catch (e) {}
  return { ok: true };
}

// callable internally (with an ok flag) or via the ADMIN_PIN endpoint
async function publish(dryRun) {
  const rows = await L.sel('la_players?select=*&status=in.(active,injured)&order=id');
  const profiles = rows.map(function (p) {
    return { id: slug(p.name), number: p.squad_no || 0, name: p.name, position: p.position || '', role: p.role || '', age: p.age || 0,
      nationality: p.nationality || '', nickname: p.nickname || '', bio: p.bio || '', apps: p.apps || 0, goals: p.goals || 0, assists: p.assists || 0, photo: p.photo_url || '' };
  });
  const grid = rows.map(function (p) {
    return { id: slug(p.name), no: p.squad_no || 0, name: p.name, pos: p.position || '', role: p.role || '', age: p.age || 0, apps: p.apps || 0, goals: p.goals || 0, photo: p.photo_url || '' };
  });
  const now = new Date().toISOString();
  if (dryRun) return { ok: true, dryRun: true, count: profiles.length, players: profiles, squad: grid };
  if (!process.env.GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN not set' };
  const r1 = await putFile('data/players.json', { players: profiles, updatedAt: now });
  const r2 = await putFile('data/squad.json', { players: grid, updatedAt: now });
  return { ok: r1.ok && r2.ok, count: profiles.length, players: r1, squad: r2 };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  const b = L.parseBody(event);
  if (String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')) return L.resp(401, { ok: false, error: 'Unauthorized' });
  const res = await publish(!!b.dryRun);
  return L.resp(res.ok ? 200 : 500, res);
};
exports.publish = publish;
