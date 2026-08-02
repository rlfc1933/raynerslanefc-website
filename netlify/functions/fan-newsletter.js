// "Stay in the Loop" — the footer mailing list, joined to the same supporter
// identity as everything else.
//
// It used to be a Netlify form that went nowhere near the club's supporter
// records, so the same person could be a Fan Zone member AND an unrelated
// newsletter row, and nothing could tell. Now there is one email key.
//
// TWO PATHS, AND THE DIFFERENCE IS DELIBERATE
// -------------------------------------------
//   Signed in  → this is a marketing preference on their membership. No second
//                record, no second consent story.
//   Signed out → a newsletter-only contact. They are NOT given a Lane Card and
//                NOT made a member: silently promoting a mailing-list signup
//                into club membership is how a supporter ends up holding an
//                account they never asked for. When they later join properly,
//                fan_ensure_membership attaches this contact to them and their
//                original consent timestamp and wording travel with it.
'use strict';

const FAN = require('./lib/fan/members');
const S = require('./lib/football/store');

const WORDING = 'newsletter-2026-08';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Authorization',
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  if (!S.configured()) return resp(200, { ok: false, error: 'not configured' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  const email = FAN.normalise(b.email);
  if (!EMAIL.test(email) || email.length > 200) {
    return resp(200, { ok: false, error: 'Please enter a valid email address.' });
  }

  // Already signed in? Then this is their existing membership speaking, and a
  // separate contact row for the same person would be the exact duplication
  // this release exists to end.
  const user = await FAN.userFromToken(FAN.tokenFrom(event));
  if (user) {
    const member = await FAN.byAuthUser(user.id);
    if (member) {
      await FAN.setMarketing(member.id, true, 'newsletter-footer');
      await FAN.record(member.id, 'marketing_changed', { source: 'newsletter-footer' });
      return resp(200, {
        ok: true, mode: 'member',
        message: 'You are on the list. We will keep you posted.',
      });
    }
  }

  try {
    await S.rest('fan_newsletter_contacts?on_conflict=email_normalised', {
      method: 'POST',
      body: [{
        email_normalised: email,
        first_name: (b.firstName || '').trim().slice(0, 60) || null,
        consent_wording_version: WORDING,
        consent_source: (b.source || 'footer').slice(0, 80),
        withdrawn_at: null,
      }],
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  } catch (e) {
    return resp(200, { ok: false, error: 'Sorry — that did not save. Please try again.' });
  }

  return resp(200, {
    ok: true, mode: 'contact',
    message: 'Thank you — you are on the mailing list.',
    // The invitation, not an assumption.
    invite: 'Want the matchday programme and a Lane Card too? Fan Zone is free.',
  });
};

exports._internal = { WORDING };
