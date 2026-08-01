// Emergency manual control of a live match.
//
// The normal state is automatic. This exists for the Saturday when the feed is
// stuck on 1-0 and the club is 2-0 up, and somebody has to be able to say so.
//
// Two guarantees, and they are the whole point:
//   1. While override is on, fwp-sync records what the provider said but does
//      NOT apply it. A deliberate human correction is never silently undone.
//   2. Every override is attributed and reasoned. "Who changed the score and
//      why" has an answer, which the old shared-PIN scoreboard never had.
//
// Overrides expire on their own (default 3 hours). A volunteer who forgets to
// hand control back does not leave the scoreboard frozen for a week.

'use strict';

const adminOk = require('./lib/pin');
const store = require('./lib/match-store');

const DEFAULT_HOURS = 3;

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

  // Same gate as every other writing function on the site.
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Not signed in' });
  if (!store.configured()) return resp(503, { ok: false, error: 'Live match storage is not configured yet' });

  const fixtureId = String(b.fixture_id || '').trim();
  if (!fixtureId) return resp(400, { ok: false, error: 'Which match? No fixture was given.' });

  const existing = await store.getState(fixtureId);
  if (!existing) return resp(404, { ok: false, error: 'That match is not being tracked yet' });

  const turningOn = !!b.on;

  if (turningOn) {
    const reason = String(b.reason || '').trim();
    const by = String(b.by || '').trim();
    // Deliberately strict: an override with no reason and no name is how a
    // scoreboard ends up wrong with nobody accountable.
    if (!reason) return resp(400, { ok: false, error: 'Please say why you are taking manual control' });
    if (!by) return resp(400, { ok: false, error: 'Please put your name to it' });

    const hours = Number(b.hours) > 0 && Number(b.hours) <= 12 ? Number(b.hours) : DEFAULT_HOURS;
    const patch = {
      manual_override: true,
      manual_override_reason: reason.slice(0, 300),
      manual_override_by: by.slice(0, 120),
      manual_override_at: new Date().toISOString(),
      manual_override_expires_at: new Date(Date.now() + hours * 3600000).toISOString(),
      sync_status: 'overridden',
    };
    // Optional: let the override carry a corrected score in the same call.
    if (b.home_score != null && b.away_score != null) {
      const hs = parseInt(b.home_score, 10);
      const as = parseInt(b.away_score, 10);
      if (isFinite(hs) && isFinite(as) && hs >= 0 && as >= 0 && hs <= 30 && as <= 30) {
        patch.home_score = hs;
        patch.away_score = as;
        patch.source_updated_at = new Date().toISOString();
      }
    }
    const upd = await store.updateState(fixtureId, patch, existing.version);
    if (!upd.ok) return resp(409, { ok: false, error: 'Somebody else just changed this match — reopen the page and try again' });
    await store.log({
      fixture_id: fixtureId, outcome: 'override_on',
      detail: by.slice(0, 120) + ': ' + reason.slice(0, 200),
    });
    return resp(200, { ok: true, manual: true, expiresAt: patch.manual_override_expires_at });
  }

  // Returning to automatic. The next scheduled sync reconciles against the
  // provider; we clear the hash so that reconciliation always writes, even if
  // the provider's state happens to match what it last sent.
  const patch = {
    manual_override: false,
    manual_override_reason: null,
    manual_override_expires_at: null,
    sync_status: 'ready',
    payload_hash: null,
  };
  const upd = await store.updateState(fixtureId, patch, existing.version);
  if (!upd.ok) return resp(409, { ok: false, error: 'Somebody else just changed this match — reopen the page and try again' });
  await store.log({ fixture_id: fixtureId, outcome: 'override_off', detail: 'returned to automatic' });
  return resp(200, { ok: true, manual: false });
};
