// ════════════════════════════════════════════════════════════════════════
//  ASSET STUDIO — the library API.
//
//  POST { pin, actor, action, ... }
//    reads:  library · list · get
//    writes: save · move · recordExport · uploadLogo · approveLogo ·
//            registerAsset · approveAsset          (actor required)
//
//  Rules: js/studio/backend.js (the same file the browser falls back to).
//  Storage: supabase/migrations/20261009150000_asset_studio.sql — service
//  role only. Every write is audited in hq_audit.
//
//  Nothing here posts to social media, uploads to the website or emails
//  anyone. "published" is a record a person makes, with the link as evidence.
// ════════════════════════════════════════════════════════════════════════
'use strict';
const adminOk = require('./lib/pin');
const Backend = require('../../js/studio/backend.js');
const { adapter } = require('./lib/studio/supabase-adapter');
const seed = require('../../js/studio/library-seed.json');

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
const SB_KEY = () => process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { ok: false, error: 'Bad request.' }); }
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Committee password required.' });
  const key = SB_KEY();
  if (!key) return resp(200, { ok: false, notSetUp: true, error: 'The asset library database is not configured.' });
  const api = Backend.create(adapter({ url: process.env.SUPABASE_URL || SB_URL, key }), { seed });
  try {
    const out = await api.handle(String(b.action || ''), b, b.actor);
    return resp(200, out);
  } catch (e) {
    if (e.notSetUp) return resp(200, { ok: false, notSetUp: true, error: 'The asset library tables have not been created yet (migration 20261009150000_asset_studio.sql).' });
    if (e.duplicate) return resp(200, { ok: false, conflict: true, error: 'Someone saved at the same moment. Reload and try again.' });
    console.error('[studio-assets]', b.action, e.message);
    return resp(200, { ok: false, error: 'The library could not save that. Nothing was changed.' });
  }
};
