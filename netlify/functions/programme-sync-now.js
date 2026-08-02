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
const S = require('./lib/football/store');

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

  /* ── authorising a retrospective edition ───────────────────────────────────
     A match played outside the recovery window gets no programme by itself —
     a timer quietly manufacturing editions for matches played months ago would
     be inventing a history the club never had. A person decides, is named for
     it, and the reason is kept with the edition. The publication date is still
     the real one: this authorises publishing now, not pretending it was then. */
  if (b.action === 'authorise_retrospective') {
    if (!b.fixtureId) return resp(400, { ok: false, error: 'which fixture?' });
    const who = String(b.by || '').trim();
    if (!who) return resp(400, { ok: false, error: 'who is authorising this? Send "by".' });

    const ed = await S.findOne('programme_editions',
      'internal_fixture_id=eq.' + encodeURIComponent(b.fixtureId) + '&select=id,state,published_at');
    if (!ed) return resp(404, { ok: false, error: 'no edition for that fixture' });
    if (ed.published_at) return resp(200, { ok: false, error: 'that edition is already published' });

    await S.rest('programme_editions?id=eq.' + ed.id, {
      method: 'PATCH',
      body: {
        retrospective_authorised_by: who.slice(0, 80),
        retrospective_authorised_at: new Date().toISOString(),
        retrospective_note: (b.reason || '').slice(0, 500) || null,
      },
      headers: { Prefer: 'return=minimal' },
    });
    // Then run the engine, which will now find the authorisation and publish.
  }

  const out = await sync.handler({ httpMethod: 'POST', body: '{}', queryStringParameters: {} });
  let parsed = {};
  try { parsed = JSON.parse(out.body || '{}'); } catch (e) { /* pass through */ }
  return resp(200, Object.assign({ triggered: true }, parsed));
};
