// Fan Zone membership: complete, read, update, and set marketing preference.
//
// Every action here needs a verified Supabase token — the caller proves who
// they are and the server decides what that means. The client never asserts
// membership; it asks.
//
// `me` is the workhorse. It is called on every page load that carries the
// bootstrap, and it BOTH reads and completes: a supporter who has verified
// their email but has no membership row yet gets one here. That is why signing
// in anywhere on the site is now enough, where before only one page could do
// it and that page could not construct a client.
'use strict';

const FAN = require('./lib/fan/members');
const S = require('./lib/football/store');
const NOTIFY = require('./lib/fan/notify');
const PHONE = require('./lib/fan/phone');

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      // Personal, always. A shared cache must never hold one of these.
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Authorization',
    },
    body: JSON.stringify(obj),
  };
}

/** The supporter's own history — theirs alone, read by member id from the token. */
async function historyFor(memberId) {
  try {
    const rows = await S.rest('fan_activity?member_id=eq.' + memberId +
      '&activity_type=eq.programme_opened&select=fixture_id,programme_id,activity_at' +
      '&order=activity_at.desc&limit=40');
    return (rows || []).map((h) => ({
      fixtureId: h.fixture_id, programmeId: h.programme_id, openedAt: h.activity_at,
    }));
  } catch (e) { return []; }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  if (!S.configured()) return resp(200, { ok: false, error: 'not configured' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { /* below */ }
  const action = String(body.action || 'me').toLowerCase();

  // Every action is authenticated. There is no anonymous write here.
  const user = await FAN.userFromToken(FAN.tokenFrom(event));
  if (!user) return resp(401, { ok: false, error: 'Sign in to continue' });

  try {
    if (action === 'me' || action === 'complete' || action === 'join') {
      // Anything the supporter told us before verifying is waiting server-side
      // against their now-VERIFIED email. Nothing travelled in the link.
      const intent = await FAN.claimIntent(user.email);

      const member = await FAN.ensure(user, {
        firstName: (body.firstName || (intent && intent.first_name) || '').trim().slice(0, 60) || null,
        lastName: (body.lastName || (intent && intent.last_name) || '').trim().slice(0, 60) || null,
        source: ((intent && intent.signup_source) || body.source || '').slice(0, 80) || null,
        fixtureId: ((intent && intent.fixture_id) || body.fixtureId || '').slice(0, 80) || null,
        programmeId: (intent && intent.programme_id) || body.programmeId || null,
        marketing: intent && typeof intent.marketing === 'boolean' ? intent.marketing
          : (typeof body.marketing === 'boolean' ? body.marketing : undefined),
        termsVersion: (intent && intent.terms_version) || undefined,
        privacyVersion: (intent && intent.privacy_version) || undefined,
      });

      if (!member) return resp(200, { ok: false, error: 'could not complete the membership' });

      // A brand-new membership means a queued club notification. Nudge the
      // sender, but never wait on it — the supporter's page must not depend on
      // an email provider being reachable.
      if (member._created) NOTIFY.drain({ limit: 3 }).catch(() => null);

      const [prefs, history, mobile, wa, interests] = await Promise.all([
        S.findOne('fan_marketing_preferences', 'member_id=eq.' + member.id + '&select=*')
          .catch(() => null),
        historyFor(member.id),
        S.findOne('fan_contact_numbers', 'member_id=eq.' + member.id + '&select=*').catch(() => null),
        S.findOne('fan_whatsapp_consent', 'member_id=eq.' + member.id + '&select=*').catch(() => null),
        S.rest('fan_interests?member_id=eq.' + member.id + '&select=interest').catch(() => []),
      ]);

      // Where to send them next. Preferred from the server-side intent, which
      // survives the magic link opening on a different device.
      const returnTo = FAN.safePath((intent && intent.return_path) || body.returnTo) || null;

      return resp(200, {
        ok: true,
        member: FAN.publicMember(member),
        created: !!member._created,
        linkedExisting: !!member._linkedExisting,
        marketing: { email: !!(prefs && prefs.email_marketing) },
        // The supporter's own contact state. Never the raw number back to the
        // browser beyond what they typed themselves — there is nothing gained
        // by shipping it around.
        mobile: mobile && mobile.status !== 'removed' ? {
          display: mobile.raw_input || mobile.e164,
          status: mobile.status,
          country: mobile.country,
        } : { status: 'not_provided' },
        whatsapp: {
          optedIn: !!(wa && wa.opted_in && !wa.withdrawn_at && !wa.suppressed),
          consentedAt: wa ? wa.consented_at : null,
        },
        interests: (interests || []).map((i) => i.interest),
        programmeHistory: history,
        returnTo: returnTo,
        // Only asked for when it is genuinely missing — a magic link opened on
        // another device has no name to carry over.
        needsName: !member.first_name,
      });
    }

    if (action === 'marketing') {
      const member = await FAN.byAuthUser(user.id);
      if (!member) return resp(200, { ok: false, error: 'no membership found' });
      await FAN.setMarketing(member.id, !!body.email, body.source || 'account');
      await FAN.record(member.id, 'marketing_changed', { source: body.source || 'account' });
      return resp(200, { ok: true, marketing: { email: !!body.email } });
    }

    if (action === 'profile') {
      const member = await FAN.byAuthUser(user.id);
      if (!member) return resp(200, { ok: false, error: 'no membership found' });
      const first = String(body.firstName || '').trim().slice(0, 60);
      const last = String(body.lastName || '').trim().slice(0, 60);
      if (!first) return resp(200, { ok: false, error: 'Please give us a first name.' });
      // A supporter may correct their name. They may NOT change their Lane
      // number — it is the club's reference to them, not a display preference.
      const patched = await S.rest('fan_members?id=eq.' + member.id, {
        method: 'PATCH',
        body: {
          first_name: first, last_name: last || null,
          display_name: [first, last].filter(Boolean).join(' '),
          updated_at: new Date().toISOString(),
        },
        headers: { Prefer: 'return=representation' },
      });
      const next = (patched && patched[0]) || member;
      await FAN.record(member.id, 'profile_updated', { source: 'account' });
      return resp(200, { ok: true, member: FAN.publicMember(next) });
    }

    if (action === 'contact') {
      const member = await FAN.byAuthUser(user.id);
      if (!member) return resp(200, { ok: false, error: 'no membership found' });

      const raw = String(body.mobile == null ? '' : body.mobile).trim();
      const removing = raw === '';
      let e164 = null; let country = null;

      if (!removing) {
        const parsed = PHONE.normalise(raw, body.country);
        if (!parsed.ok) {
          return resp(200, { ok: false,
            error: 'That does not look like a mobile number we can use. ' +
                   'A UK number like 07400 123456 is fine.' });
        }
        e164 = parsed.e164;
        country = parsed.country;
        // A landline is not wrong, and we keep it — but it must not be counted
        // towards a WhatsApp launch it could never be part of.
        if (body.whatsapp === true && !PHONE.couldReceiveWhatsApp(parsed)) {
          return resp(200, { ok: false,
            error: 'That number cannot receive WhatsApp. We have kept it on your ' +
                   'record — add a mobile if you would like WhatsApp updates later.' });
        }
      }

      const out = await S.rest('rpc/fan_set_contact', {
        method: 'POST',
        body: {
          p_member_id: member.id,
          p_raw: removing ? null : raw,
          p_e164: e164,
          p_country: country,
          p_whatsapp: (typeof body.whatsapp === 'boolean') ? body.whatsapp : null,
          p_wording: FAN.WHATSAPP_WORDING,
          p_source: (body.source || 'account').slice(0, 80),
        },
      });

      await FAN.record(member.id, 'profile_updated', { source: 'contact' });
      return resp(200, Object.assign({ ok: true }, out || {}));
    }

    if (action === 'interests') {
      const member = await FAN.byAuthUser(user.id);
      if (!member) return resp(200, { ok: false, error: 'no membership found' });
      const ALLOWED = ['volunteering', 'sponsorship', 'away_travel', 'matchday_help',
        'youth_football', 'social_events', 'photography', 'commentary'];
      const wanted = (Array.isArray(body.interests) ? body.interests : [])
        .filter((i) => ALLOWED.includes(i)).slice(0, ALLOWED.length);
      await S.rest('fan_interests?member_id=eq.' + member.id, {
        method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => null);
      if (wanted.length) {
        await S.rest('fan_interests', { method: 'POST',
          body: wanted.map((i) => ({ member_id: member.id, interest: i })),
          headers: { Prefer: 'return=minimal' } });
      }
      return resp(200, { ok: true, interests: wanted });
    }

    return resp(400, { ok: false, error: 'unknown action' });
  } catch (e) {
    return resp(200, { ok: false, error: String((e && e.message) || e) });
  }
};

exports._internal = { historyFor };
