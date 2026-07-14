// Verify the admin PIN without ever shipping it to the browser.
//
// admin.html used to hold `const PIN = '<the real PIN>'` and compare in the
// page, which meant the PIN was in the public source of every visitor's
// view-source. This moves the comparison to the server: the browser sends what
// was typed and learns only yes/no.
//
// To be clear about what this is and isn't: the PIN screen is a front door, not
// a vault. Every function that actually writes anything checks the PIN itself
// (lib/pin.js), so a determined person skipping this screen in devtools still
// can't save, publish or seed staff. This stops the PIN being *published*; the
// real gate is on each write.
//
// Body: { pin }
// Returns: { ok:true } | { ok:false } | { ok:false, error:'not-configured' }
const adminOk = require('./lib/pin');

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',            // never cache an auth answer
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });

  // Tell the staff the difference between "wrong PIN" and "nobody set one",
  // otherwise a missing env var looks exactly like everyone forgetting the PIN.
  if (!process.env.ADMIN_PIN) return resp(200, { ok: false, error: 'not-configured' });

  let pin = '';
  try { pin = (JSON.parse(event.body || '{}') || {}).pin || ''; } catch (e) {}

  // Small constant delay: makes a scripted guessing run slow and pointless
  // without being noticeable to someone typing their own PIN once.
  await new Promise(function (r) { setTimeout(r, 350); });

  return resp(200, { ok: adminOk(pin) });
};
