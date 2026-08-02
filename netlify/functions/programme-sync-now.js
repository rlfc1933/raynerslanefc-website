// The button version of programme-sync.
//
// Netlify refuses direct HTTP calls to SCHEDULED functions — programme-sync
// returns 403 to any request, correctly and by design. Without this, "Refresh
// Programme Data" in the portal would look like it worked and do nothing, which
// is the same silent failure the old Push Score Live had.
//
// I made exactly this mistake with fwp-sync earlier in the build and it cost a
// deploy to find. Same shape, same fix, written at the same time this time.
'use strict';

const adminOk = require('./lib/pin');
const sync = require('./programme-sync');

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
    body: JSON.stringify(obj, null, 1),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { /* handled */ }
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Not signed in' });

  const out = await sync.handler({ httpMethod: 'POST', body: '{}', queryStringParameters: {} });
  let parsed = {};
  try { parsed = JSON.parse(out.body || '{}'); } catch (e) { /* pass through */ }
  return resp(200, Object.assign({ triggered: true }, parsed));
};
