// "Send the queued club notifications now" — the button's version of fan-notify.
//
// fan-notify is SCHEDULED, and Netlify answers 403 to any direct HTTP request
// for a scheduled function. This project has shipped a portal button wired
// straight to a scheduled function twice, and both times it looked like it had
// worked: the button responded, the toast appeared, nothing ran.
//
// So the timer and the button are two files, and this is the one a person may
// press. PIN-gated, because it makes the club send email.
'use strict';

const adminOk = require('./lib/pin');
const NOTIFY = require('./lib/fan/notify');
const S = require('./lib/football/store');

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'private, no-store, max-age=0',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!S.configured()) return resp(200, { ok: false, error: 'not configured' });

  const out = await NOTIFY.drain({ limit: 25 });
  return resp(200, Object.assign({ ok: true }, out));
};
