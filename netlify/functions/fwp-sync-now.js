// "Retry sync" — the human-triggered version of the scheduled sync.
//
// Why this exists as a separate file: Netlify will not let a SCHEDULED function
// be invoked over HTTP (fwp-sync returns 403 to any direct request, which is
// correct and deliberate on their side). Without this, the Retry button in the
// portal would look like it worked and do nothing at all — the exact class of
// silent failure this whole release was meant to remove.
//
// Same work, same safety rules, one addition: it is PIN-gated, because it is a
// button a person presses rather than a timer.

'use strict';

const adminOk = require('./lib/pin');
const client = require('./lib/fwp-client');
const sync = require('./fwp-sync');

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

  // Say so plainly rather than pretending a sync ran. A volunteer pressing
  // Retry deserves to know the difference between "it failed" and "this is
  // switched off on purpose".
  if (!client.isEnabled()) {
    return resp(200, {
      ok: false, enabled: false,
      error: 'Automatic updates are switched off until Football Web Pages confirm we may use their feed.',
    });
  }

  const out = await sync.handler({ httpMethod: 'POST', body: '{}' });
  let parsed = {};
  try { parsed = JSON.parse(out.body || '{}'); } catch (e) { /* pass through as-is */ }
  return resp(200, Object.assign({ ok: true, triggered: true }, parsed));
};
