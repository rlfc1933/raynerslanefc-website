// The human-pressed version of the scheduled registry sync.
//
// It exists for the same reason fwp-sync-now does: Netlify returns 403 to any
// direct HTTP request for a SCHEDULED function, so a portal button wired to
// football-registry-sync would fail silently and look like it had worked. That
// has now happened twice in this project — once with fwp-sync, once with
// programme-sync. A test enforces the pairing so it cannot happen a third time.
'use strict';

const adminOk = require('./lib/pin');
const F = require('./lib/fwp');
const sync = require('./football-registry-sync');

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { /* handled below */ }
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Not signed in' });

  if (!F.isEnabled()) {
    return resp(200, {
      ok: false, enabled: false,
      error: 'Automatic updates are switched off. Nothing was fetched.',
    });
  }

  const out = await sync.handler({ httpMethod: 'POST', body: '{}' });
  let parsed = {};
  try { parsed = JSON.parse(out.body || '{}'); } catch (e) { /* pass through */ }
  return resp(200, Object.assign({ triggered: true }, parsed));
};
