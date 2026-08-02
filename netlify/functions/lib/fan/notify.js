// The club's notification about a new supporter.
//
// WHY AN OUTBOX AND NOT A fetch()
// -------------------------------
// If the email were sent inline as part of joining, then a slow provider, an
// expired API key or an unverified sender domain would become the supporter's
// problem — a spinner, or worse, a failed signup for a person who did nothing
// wrong. So joining writes a ROW inside the same transaction as the membership,
// and delivery happens afterwards, separately, and may fail as often as it
// likes without anybody noticing except the club's own health panel.
//
// The dedupe_key is what makes "one membership, one email" true rather than
// hoped for. ensure() is idempotent and gets called on every page load; the
// notification row is inserted `on conflict do nothing`, so the second, third
// and thousandth call queue nothing.
'use strict';

const S = require('../football/store');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const MAX_ATTEMPTS = 6;

// Until raynerslanefc.co.uk is verified in Resend, the only sender available
// is Resend's shared address. Do NOT put info@raynerslanefc.co.uk in `from`
// on an unverified domain — that is spoofing the club's own address, it fails
// SPF/DKIM, and it teaches mail providers to distrust the real one later.
// Reply-To carries the club address instead, which is honest and works.
function sender() {
  return process.env.FAN_NOTIFY_FROM || process.env.WELCOME_FROM
    || 'Rayners Lane FC <onboarding@resend.dev>';
}

function destination() {
  return process.env.FAN_NOTIFY_TO || 'info@raynerslanefc.co.uk';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function whenLondon(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch (e) { return String(iso).slice(0, 16).replace('T', ' '); }
}

/** How they came to us, said in English rather than in slugs. */
function sourceLine(payload) {
  const src = payload.source || '';
  const fixture = payload.fixtureId || '';
  if (/^programme:/.test(src)) {
    return 'Reading the matchday programme' + (fixture ? ' (' + fixture + ')' : '');
  }
  if (src === 'fan-zone' || !src) return 'Fan Zone page';
  return src;
}

function subjectFor(eventType, payload) {
  const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ')
    || payload.displayName || 'A supporter';
  return eventType === 'member_linked'
    ? 'Lane member linked online — ' + name
    : 'New Fan Zone member — ' + name;
}

/**
 * The email body.
 *
 * Deliberately short. Name, email, number, when, how, and one button. No
 * tokens, no IP address, no reading history, no internal ids as the identity,
 * no raw JSON — a committee member reads this on a phone, and everything that
 * is not useful to them is a small privacy cost with no benefit.
 */
function bodyFor(eventType, payload, portalUrl) {
  const linked = eventType === 'member_linked';
  const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ')
    || payload.displayName || 'Name not given';
  const rows = [
    ['Name', name],
    ['Email', payload.email || ''],
    ['Lane number', payload.membershipNumber || ''],
    [linked ? 'Linked' : 'Joined', whenLondon(payload.joinedAt)],
    ['How', sourceLine(payload)],
    ['Marketing', payload.marketing === true ? 'Opted in'
      : payload.marketing === false ? 'Not opted in' : 'No choice made'],
  ].filter((r) => r[1]);

  const table = rows.map((r) =>
    '<tr><td style="padding:7px 16px 7px 0;color:#8F8F8F;font-size:13px;vertical-align:top;white-space:nowrap">' +
    esc(r[0]) + '</td><td style="padding:7px 0;color:#eee;font-size:15px">' + esc(r[1]) +
    '</td></tr>').join('');

  const headline = linked
    ? esc(payload.firstName || 'A long-standing supporter') + ' has linked their Lane Card online'
    : esc(payload.firstName || 'Someone new') + ' has joined Fan Zone';

  const note = linked
    ? 'They already had a Lane Card, so their number and history are unchanged — they can now read programmes online.'
    : 'This is their first Lane number.';

  return '<div style="background:#080808;padding:24px;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="max-width:540px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:24px 26px">' +
      '<div style="color:#FFD100;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">' +
        (linked ? 'Lane member linked' : 'New Fan Zone member') + '</div>' +
      '<h1 style="color:#fff;font-size:21px;line-height:1.3;margin:0 0 6px">' + headline + '</h1>' +
      '<p style="color:#8F8F8F;font-size:13px;margin:0 0 18px">' + note + '</p>' +
      '<table style="width:100%;border-collapse:collapse">' + table + '</table>' +
      (portalUrl ? '<div style="margin-top:22px">' +
        '<a href="' + esc(portalUrl) + '" style="display:inline-block;background:#FFD100;color:#111;' +
        'font-weight:bold;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:8px">' +
        'View supporter</a>' +
        '<p style="color:#666;font-size:12px;margin:10px 0 0">You will be asked to sign in to the portal.</p>' +
      '</div>' : '') +
    '</div></div>';
}

/** Send one queued row. Returns { ok, id, error }. */
async function send(row) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };

  const payload = row.payload || {};
  const portal = (process.env.PORTAL_URL || 'https://raynerslanefc.co.uk/admin.html') +
    '#supporters';

  let res;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender(),
        to: [row.destination || destination()],
        reply_to: 'info@raynerslanefc.co.uk',
        subject: subjectFor(row.event_type, payload),
        html: bodyFor(row.event_type, payload, portal),
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    return { ok: false, error: 'network: ' + String((e && e.message) || e) };
  }

  const text = await res.text().catch(() => '');
  if (!res.ok) return { ok: false, error: 'resend ' + res.status + ': ' + text.slice(0, 200) };
  let id = null;
  try { id = (JSON.parse(text) || {}).id || null; } catch (e) {}
  return { ok: true, id: id };
}

/**
 * Deliver whatever is due.
 *
 * Bounded backoff, bounded attempts. A row that has failed six times is
 * marked abandoned rather than retried forever — it stays visible in the
 * portal so somebody can look at it, which is more use than a queue that
 * silently grinds.
 */
async function drain(opts) {
  const o = opts || {};
  const limit = o.limit || 25;
  let due = [];
  try {
    due = await S.rest('fan_notification_outbox?status=eq.pending&next_attempt_at=lte.' +
      encodeURIComponent(new Date().toISOString()) +
      '&select=*&order=created_at.asc&limit=' + limit) || [];
  } catch (e) {
    return { ok: false, error: String(e.message || e), sent: 0, failed: 0 };
  }

  let sent = 0; let failed = 0;
  for (const row of due) {
    const attempts = (row.attempts || 0) + 1;
    const result = await send(row);
    const patch = { attempts: attempts };
    if (result.ok) {
      patch.status = 'sent';
      patch.sent_at = new Date().toISOString();
      patch.provider_id = result.id;
      patch.last_error = null;
      sent++;
    } else {
      failed++;
      patch.last_error = String(result.error).slice(0, 400);
      if (attempts >= MAX_ATTEMPTS) {
        patch.status = 'abandoned';
      } else {
        // 2, 4, 8, 16, 32 minutes. Long enough to outlast a provider blip,
        // short enough that the club hears about a real member the same day.
        const wait = Math.pow(2, attempts) * 60 * 1000;
        patch.next_attempt_at = new Date(Date.now() + wait).toISOString();
      }
    }
    try {
      await S.rest('fan_notification_outbox?id=eq.' + row.id, {
        method: 'PATCH', body: patch, headers: { Prefer: 'return=minimal' },
      });
    } catch (e) { /* it stays pending and will be picked up next time */ }
  }
  return { ok: true, considered: due.length, sent, failed };
}

/** Put a row back in the queue. Used by the portal's Retry action. */
async function retry(id) {
  if (!id) return null;
  await S.rest('fan_notification_outbox?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    body: { status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null },
    headers: { Prefer: 'return=minimal' },
  });
  return await drain({ limit: 1 });
}

module.exports = {
  drain, retry, send, sender, destination,
  _internal: { subjectFor, bodyFor, sourceLine, whenLondon, MAX_ATTEMPTS },
};
