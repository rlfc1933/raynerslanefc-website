// Park what a supporter typed BEFORE they proved the email is theirs.
//
// This is the only unauthenticated write in Fan Zone, and it has to be: it
// runs at the moment the supporter asks for a magic link, which is by
// definition before there is a session.
//
// It is safe because the row is inert. Nothing here grants anything. The
// details are applied only once a VERIFIED token arrives carrying the same
// email — see claimIntent() — so writing an intent for somebody else's address
// achieves nothing except a row that expires in two hours.
//
// The response is deliberately identical whatever happens. Telling a caller
// "that address is already a member" would turn this into a way to test which
// of the club's supporters exist.
'use strict';

const FAN = require('./lib/fan/members');
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

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false });
  if (!S.configured()) return resp(200, { ok: true });   // same answer, always

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(200, { ok: true }); }

  const email = FAN.normalise(b.email);
  if (!EMAIL.test(email) || email.length > 200) return resp(200, { ok: true });

  try {
    await FAN.storeIntent({
      email: email,
      firstName: b.firstName,
      lastName: b.lastName,
      returnPath: b.returnPath,
      source: b.source,
      fixtureId: b.fixtureId,
      programmeId: b.programmeId,
      marketing: typeof b.marketing === 'boolean' ? b.marketing : null,
      termsVersion: b.termsVersion,
      privacyVersion: b.privacyVersion,
    });
  } catch (e) {
    // The magic link still works without this; they will simply be asked for
    // a name on arrival. Never fail the journey over a convenience record.
  }
  return resp(200, { ok: true });
};
