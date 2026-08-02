// Fan Zone membership: join, reconcile, read, and set marketing preference.
//
// Every action here needs a verified Supabase token — the caller proves who
// they are and the server decides what that means. The client never asserts
// membership; it asks.
'use strict';

const FAN = require('./lib/fan/members');
const S = require('./lib/football/store');

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      // Personal, always.
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Authorization',
    },
    body: JSON.stringify(obj),
  };
}

/**
 * Where a supporter may be sent after signing in.
 *
 * Only a path on this site, and only one that looks like a programme or a
 * known page. An open redirect in a magic-link return is how a phishing page
 * borrows the club's own login flow.
 */
function safeReturn(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  // No scheme, no host, no protocol-relative, no backslash tricks.
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
  if (v.startsWith('//') || v.startsWith('\\')) return null;
  if (!v.startsWith('/')) return null;
  if (v.includes('\n') || v.includes('\r')) return null;
  return v;
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
    if (action === 'join' || action === 'me') {
      const member = await FAN.ensure(user, {
        firstName: (body.firstName || '').trim().slice(0, 60) || null,
        lastName: (body.lastName || '').trim().slice(0, 60) || null,
        source: (body.source || '').slice(0, 80) || null,
        fixtureId: (body.fixtureId || '').slice(0, 80) || null,
        programmeId: body.programmeId || null,
      });
      if (!member) return resp(200, { ok: false, error: 'could not create the membership' });

      // Marketing is a SEPARATE decision, only recorded when the join form
      // actually carried one. Never inferred from having joined.
      if (action === 'join' && typeof body.marketing === 'boolean') {
        await FAN.setMarketing(member.id, body.marketing, body.source || 'join');
      }

      const [prefs, history] = await Promise.all([
        S.findOne('fan_marketing_preferences', 'member_id=eq.' + member.id + '&select=*'),
        S.rest('fan_activity?member_id=eq.' + member.id +
          '&activity_type=eq.programme_opened&select=fixture_id,programme_id,activity_at' +
          '&order=activity_at.desc&limit=30'),
      ]);

      return resp(200, {
        ok: true,
        member: {
          membershipNumber: member.membership_number,
          displayName: member.display_name,
          firstName: member.first_name,
          status: member.membership_status,
          joinedAt: member.joined_at,
          entitled: FAN.canReadProgrammes(member),
        },
        marketing: { email: !!(prefs && prefs.email_marketing) },
        programmeHistory: (history || []).map((h) => ({
          fixtureId: h.fixture_id, openedAt: h.activity_at,
        })),
        returnTo: safeReturn(body.returnTo),
      });
    }

    if (action === 'marketing') {
      const member = await FAN.byAuthUser(user.id);
      if (!member) return resp(200, { ok: false, error: 'no membership found' });
      await FAN.setMarketing(member.id, !!body.email, body.source || 'account');
      await FAN.record(member.id, 'marketing_changed', { source: body.source || 'account' });
      return resp(200, { ok: true, marketing: { email: !!body.email } });
    }

    return resp(400, { ok: false, error: 'unknown action' });
  } catch (e) {
    return resp(200, { ok: false, error: String((e && e.message) || e) });
  }
};

exports._internal = { safeReturn };
