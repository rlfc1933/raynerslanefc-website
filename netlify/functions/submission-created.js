// Rayners Lane FC — automatic welcome email.
// Netlify runs this function automatically every time a form is submitted
// (the "submission-created" event). When a fan joins the Family List we send
// them a branded welcome from info@raynerslanefc.co.uk.
//
// Sends via Resend (https://resend.com) — fetch only, no dependencies.
// Requires Netlify environment variables:
//   RESEND_API_KEY   – free Resend API key
//   WELCOME_FROM     – optional, e.g. "Rayners Lane FC <info@raynerslanefc.co.uk>"
//
// SPAM-PROOFING: in Resend, verify the raynerslanefc.co.uk domain — it gives
// you SPF + DKIM + DMARC DNS records to add at your domain host. Those records
// are what tell Gmail/Outlook the mail is genuinely from your club, so it lands
// in the inbox, not spam. Until the key + domain are set up, this no-ops safely.

exports.handler = async function (event) {
  try {
    var body = JSON.parse(event.body || '{}');
    var sub = body.payload || {};
    var data = sub.data || {};
    var formName = sub.form_name || data['form-name'] || '';
    var key = process.env.RESEND_API_KEY;
    if (!key) return { statusCode: 200, body: 'not configured' };
    var from = process.env.WELCOME_FROM || 'Rayners Lane FC <info@raynerslanefc.co.uk>';
    var club = process.env.CLUB_INBOX || 'info@raynerslanefc.co.uk';

    // ── SPONSOR APPLICATION → alert the commercial team at info@ ──
    if (formName === 'sponsor-enquiry') {
      var rows = [
        ['Company', data.company], ['Contact', data.contact], ['Email', data.email],
        ['Phone', data.phone], ['Package', data.package], ['Budget', data.budget],
        ['Website', data.website], ['Message', data.message],
      ].filter(function (r) { return r[1]; })
        .map(function (r) { return '<tr><td style="padding:6px 14px 6px 0;color:#888;font-size:13px;vertical-align:top">' + r[0] + '</td><td style="padding:6px 0;color:#eee;font-size:14px">' + escapeHtml(r[1]) + '</td></tr>'; })
        .join('');
      var sHtml = '<div style="background:#080808;padding:24px;font-family:Arial,Helvetica,sans-serif">' +
        '<div style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:24px 26px">' +
          '<div style="color:#FFD100;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">New Sponsor Application</div>' +
          '<h1 style="color:#fff;font-size:22px;margin:0 0 16px">' + escapeHtml(data.company || 'A business') + ' wants to back The Lane</h1>' +
          '<table style="width:100%;border-collapse:collapse">' + rows + '</table>' +
          '<p style="font-size:13px;color:#888;margin-top:18px">Reply to this email to reach ' + escapeHtml(data.contact || 'them') + ' directly, or open the Sponsor Hub in the admin to track it.</p>' +
        '</div></div>';
      var sRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from, to: [club], reply_to: (data.email || club), subject: '💼 Sponsor application — ' + (data.company || 'New enquiry'), html: sHtml }),
      });
      return { statusCode: 200, body: sRes.ok ? 'sponsor alert sent' : 'resend error ' + sRes.status };
    }

    // ── PLAYER TRIAL APPLICATION → alert the management team at info@ ──
    if (formName === 'player-trial') {
      var prows = [
        ['Name', data.name], ['Date of birth', data.dob], ['Age group', data.age_group],
        ['Position', data.position], ['Current club', data.current_club],
        ['Email', data.email], ['Phone', data.phone], ['Availability', data.availability],
        ['Parent/guardian', data.guardian], ['Guardian contact', data.guardian_contact],
      ].filter(function (r) { return r[1]; })
        .map(function (r) { return '<tr><td style="padding:6px 14px 6px 0;color:#888;font-size:13px;vertical-align:top">' + r[0] + '</td><td style="padding:6px 0;color:#eee;font-size:14px">' + escapeHtml(r[1]) + '</td></tr>'; })
        .join('');
      var pHtml = '<div style="background:#080808;padding:24px;font-family:Arial,Helvetica,sans-serif">' +
        '<div style="max-width:560px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:14px;padding:24px 26px">' +
          '<div style="color:#FFD100;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">New Trial Registration</div>' +
          '<h1 style="color:#fff;font-size:22px;margin:0 0 16px">' + escapeHtml(data.name || 'A player') + ' wants to trial for The Lane</h1>' +
          '<table style="width:100%;border-collapse:collapse">' + prows + '</table>' +
          '<p style="font-size:13px;color:#888;margin-top:18px">Reply to reach them directly, or open the Trialists view in the admin to track it.</p>' +
        '</div></div>';
      var pRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from, to: [club], reply_to: (data.email || club), subject: '⚽ Trial registration — ' + (data.name || 'New applicant'), html: pHtml }),
      });
      return { statusCode: 200, body: pRes.ok ? 'trial alert sent' : 'resend error ' + pRes.status };
    }

    if (formName !== 'fan-signup') return { statusCode: 200, body: 'ignored' };

    var to = (data.email || '').trim();
    if (!to) return { statusCode: 200, body: 'no email' };
    var name = (data.name || 'Lane fan').split(' ')[0];

    var html =
      '<div style="background:#080808;padding:24px;font-family:Arial,Helvetica,sans-serif">' +
        '<div style="max-width:520px;margin:0 auto;background:#111;border:1px solid #2a2a2a;border-radius:14px;overflow:hidden">' +
          '<div style="background:linear-gradient(135deg,#1A5C32,#06120a);padding:26px 24px;text-align:center">' +
            '<img src="https://raynerslanefc.co.uk/img/badge.png" alt="Rayners Lane FC" width="64" height="64" style="display:inline-block">' +
            '<div style="color:#FFD100;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;margin-top:10px">The Lane Family</div>' +
          '</div>' +
          '<div style="padding:26px 28px;color:#eee">' +
            '<h1 style="color:#fff;font-size:26px;margin:0 0 12px">Welcome, ' + escapeHtml(name) + ' 💛</h1>' +
            '<p style="font-size:15px;line-height:1.7;color:#cfcfcf">You\'re officially part of <strong style="color:#fff">Rayners Lane FC</strong> — Harrow\'s club since 1933. Yellow first, The Lane always.</p>' +
            '<p style="font-size:15px;line-height:1.7;color:#cfcfcf">Here\'s how to make the most of it:</p>' +
            '<ul style="font-size:15px;line-height:1.8;color:#cfcfcf;padding-left:18px">' +
              '<li>Open your <strong style="color:#fff">Lane Membership card</strong> on the Fan Zone and add it to your home screen.</li>' +
              '<li>Show your card at every home game and collect a <strong style="color:#FFD100">yellow heart</strong>.</li>' +
              '<li>Climb the tiers and unlock rewards — free entry, a drink on the house, and more.</li>' +
            '</ul>' +
            '<div style="text-align:center;margin:24px 0 8px">' +
              '<a href="https://raynerslanefc.co.uk/fan-zone.html" style="background:#FFD100;color:#0d0d0d;font-weight:bold;text-decoration:none;padding:13px 26px;border-radius:8px;display:inline-block">Open My Fan Zone</a>' +
            '</div>' +
            '<p style="font-size:13px;line-height:1.6;color:#888;margin-top:22px">See you at Tithe Farm. Up The Lane!<br>— Rayners Lane FC</p>' +
          '</div>' +
        '</div>' +
      '</div>';

    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from,
        to: [to],
        reply_to: 'info@raynerslanefc.co.uk',
        subject: 'Welcome to The Lane Family 💛',
        html: html,
      }),
    });
    return { statusCode: 200, body: res.ok ? 'sent' : 'resend error ' + res.status };
  } catch (e) {
    return { statusCode: 200, body: 'error: ' + e.message };
  }
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
