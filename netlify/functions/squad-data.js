// SQUAD DATA (Deploy Previews only) — the preview sandbox's squad, in exactly
// the public data/players.json and data/squad.json shapes, plus its photos.
// js/components.js asks for this only on a non-production host, and the
// freshest copy wins, so a confirmed change on a preview shows on that
// preview's squad and player pages. On the live site this returns 404 and the
// static files remain the only source.
'use strict';

const SCOPE = require('./lib/deploy-scope');
const ST = require('./lib/squad/store');

function json(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  const scope = SCOPE.scopeOf(event);
  if (scope.production) return json(404, { ok: false });
  const q = event.queryStringParameters || {};
  try {
    if (q.photo) {
      if (!/^[a-f0-9]{10}$/.test(q.photo)) return json(404, { ok: false });
      const s = await ST.blobStore(event, ST.storeName(scope, 'photos'));
      const buf = await s.get(q.photo + '.jpg', { type: 'arrayBuffer' });
      if (!buf) return json(404, { ok: false });
      return { statusCode: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
        body: Buffer.from(buf).toString('base64'), isBase64Encoded: true };
    }
    const R = await ST.roster(event);
    const m = await R.meta();
    if (!m.version) return json(404, { ok: false });          // untouched: the deployed files are current
    const ps = (await R.list()).filter((p) => ST.CURRENT.indexOf(p.status) > -1);
    if (q.file === 'squad') {
      return json(200, { players: ps.map((p) => ({ id: p.slug || ST.slug(p.name), no: p.squad_no || 0, name: p.name, pos: p.position || '', role: p.role || '',
        age: p.age || 0, apps: p.apps || 0, goals: p.goals || 0, photo: p.photo_url || '' })), updatedAt: m.updatedAt, preview: true });
    }
    return json(200, { players: ps.map((p) => ({ id: p.slug || ST.slug(p.name), number: p.squad_no || 0, name: p.name, position: p.position || '',
      role: p.role || '', age: p.age || 0, nationality: p.nationality || '', nickname: p.nickname || '', bio: p.bio || '',
      apps: p.apps || 0, goals: p.goals || 0, assists: p.assists || 0, photo: p.photo_url || '' })), updatedAt: m.updatedAt, preview: true });
  } catch (e) {
    return json(404, { ok: false });
  }
};
