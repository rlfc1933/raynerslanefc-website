// Deliver the club's new-member notifications.
//
// ⛔ SCHEDULED. Netlify returns 403 to direct HTTP, which is what we want: this
// reads an outbox and sends email, and nothing on the public internet should be
// able to make that happen on demand. The portal's Retry action goes through
// fan-admin.js, which is PIN-gated.
//
// Runs every five minutes. Joining also nudges the drain directly, so the
// normal case is that the club is told within seconds; this schedule exists for
// the abnormal case — the provider was down, the key had expired, the sender
// domain was not yet verified — where a supporter still joined and the club
// still needs to hear about it.
'use strict';

const NOTIFY = require('./lib/fan/notify');
const S = require('./lib/football/store');

exports.handler = async function () {
  if (!S.configured()) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'not configured' }) };
  }
  const out = await NOTIFY.drain({ limit: 25 });

  // Housekeeping: signup intents are short-lived by design and there is no
  // reason to keep the expired ones. They hold a name and an email somebody
  // typed but never verified, which is exactly the kind of data worth not
  // accumulating.
  try {
    await S.rest('fan_signup_intents?expires_at=lt.' +
      encodeURIComponent(new Date(Date.now() - 24 * 3600 * 1000).toISOString()), {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    });
  } catch (e) { /* not important enough to fail the run */ }

  return { statusCode: 200, body: JSON.stringify(out) };
};
