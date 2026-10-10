// ── ONE DOOR: every public form POSTs here ──────────────────────────────────
// Writes a real record to Supabase `submissions` using the service_role key
// (server-side only — never shipped to the browser). No PIN: this is a public
// endpoint, so it's guarded by a honeypot, a minimum time-on-page check, a
// per-IP rate limit, strict validation and length caps. Supabase errors are
// NEVER leaked to the client. HubSpot stays a client-side bonus (hs-lead.js) for
// sponsor/trial — if HubSpot fails, this write still succeeds because they're
// independent calls. Resend alerts are handled separately and off by default.
//
// ⚠️ GDPR: the trials form carries special-category HEALTH data (injuries) and can
// be a child. That data only ever lands in Supabase here — never in a committed
// file or any public response. Under-18 trials are rejected unless a guardian
// name + email + consent are present.

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const TYPES = ['trial', 'volunteer', 'sponsor', 'contact', 'membership', 'lane100', 'other'];
const MAX_FIELD = 4000;      // any single free-text field
const MAX_PAYLOAD = 24000;   // total serialised extra fields

// Best-effort per-warm-instance IP rate limit (basic; complements the honeypot).
const HITS = {};
function rateLimited(ip) {
  const now = Date.now(), win = 60000, max = 8;
  HITS[ip] = (HITS[ip] || []).filter(function (t) { return now - t < win; });
  if (HITS[ip].length >= max) return true;
  HITS[ip].push(now);
  return false;
}

function resp(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(obj),
  };
}
function clean(s, cap) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, cap || MAX_FIELD); }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(200, { ok: false, error: 'method' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(200, { ok: false, error: 'bad-request' }); }

  // Honeypot: any of these hidden fields filled → a bot. Pretend success, drop it.
  if (b['bot-field'] || b.company_website || b.hp) return resp(200, { ok: true });
  // Minimum time on page (client sends _elapsed ms). Submitted in < 2.5s → a bot.
  if (typeof b._elapsed === 'number' && b._elapsed >= 0 && b._elapsed < 2500) return resp(200, { ok: true });

  const ip = String(event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return resp(200, { ok: false, error: 'rate' });

  let type = clean(b.type, 20).toLowerCase();
  if (TYPES.indexOf(type) < 0) type = 'other';
  const name = clean(b.name, 200);
  const email = clean(b.email, 200).toLowerCase();
  const phone = clean(b.phone, 50);
  if (!name) return resp(200, { ok: false, error: 'name-required' });
  if (!email && !phone) return resp(200, { ok: false, error: 'contact-required' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resp(200, { ok: false, error: 'email-invalid' });

  // THE LANE 100 — its own table (lane100_members), where the DATABASE assigns
  // the supporter number at the moment of a real sign-up. Nothing here invents
  // or predicts a number: the visitor is told the number the row came back with.
  if (type === 'lane100') return lane100(b, name, email, event);

  const isMinor = !!b.is_minor;
  const guardianName = clean(b.guardian_name || b.guardian, 200);
  const guardianEmail = clean(b.guardian_email, 200).toLowerCase();
  const consent = !!b.consent;
  // GDPR: an under-18 trial cannot be stored without guardian details + consent.
  if (type === 'trial' && isMinor && (!guardianName || !guardianEmail || !consent)) {
    return resp(200, { ok: false, error: 'guardian-required' });
  }

  // Everything not mapped to a column goes into `payload` (capped).
  const reserved = { type: 1, name: 1, email: 1, phone: 1, consent: 1, guardian: 1, guardian_name: 1, guardian_email: 1, guardian_contact: 1, is_minor: 1, source_page: 1, 'bot-field': 1, company_website: 1, hp: 1, _elapsed: 1, pin: 1, 'form-name': 1 };
  const payload = {};
  let total = 0;
  Object.keys(b || {}).forEach(function (k) {
    if (reserved[k]) return;
    let v = typeof b[k] === 'string' ? clean(b[k], MAX_FIELD) : b[k];
    if (v === '' || v == null) return;
    payload[k] = v; total += String(v).length + k.length;
  });
  if (b.guardian_contact) payload.guardian_contact = clean(b.guardian_contact, 200); // keep on trials
  if (total > MAX_PAYLOAD) return resp(200, { ok: false, error: 'too-large' });

  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase' });

  const row = {
    type: type, name: name, email: email || null, phone: phone || null,
    payload: payload,
    source_page: clean(b.source_page, 200) || null,
    user_agent: clean(event.headers['user-agent'], 400) || null,
    consent: consent,
    guardian_name: guardianName || null,
    guardian_email: guardianEmail || null,
    is_minor: isMinor,
  };

  try {
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    const r = await fetch(URL + '/rest/v1/submissions', { method: 'POST', headers: headers, body: JSON.stringify(row), signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'save-failed' });   // never leak Supabase detail
    // A sponsorship enquiry is also a commercial lead: put it in front of a
    // person in Staff HQ with the 48-hour clock running. Best-effort — the
    // submission is already safely stored, so a Club OS hiccup never loses it
    // (it stays visible in Records either way).
    if (type === 'sponsor') {
      try {
        const saved = (await r.json())[0] || {};
        await require('./club-os').intakeEnquiry({ id: saved.id, name: name, email: email, phone: phone, message: payload.message || payload.msg || '', fields: payload });
      } catch (e) { console.error('[submit-form] club-os intake failed', e && e.message); }
    }
    // A volunteer offer becomes something the club can approve in Staff HQ.
    // Best-effort, exactly like the sponsor intake: the submission is already
    // saved, so a Club OS failure never fails the visitor's offer.
    if (type === 'volunteer') {
      try {
        const CO = require('./club-os');
        if (typeof CO.intakeVolunteer === 'function') {
          const saved = (await r.json())[0] || {};
          await CO.intakeVolunteer({ id: saved.id, name: name, email: email, phone: phone,
            role: payload.role || payload.opportunity || '', opportunity: payload.opportunity || payload.role || '',
            availability: payload.availability || '', message: payload.message || '', fields: payload });
        }
      } catch (e) { console.error('[submit-form] club-os volunteer intake failed', e && e.message); }
    }
    return resp(200, { ok: true });
  } catch (e) {
    return resp(200, { ok: false, error: 'save-failed' });
  }
};

// ── THE LANE 100 ─────────────────────────────────────────────────────────
// Participation & recognition only: no payment, no ownership. Email is
// required (it is how the club recognises a duplicate), consent is required,
// the public wall and club updates are separate opt-ins. Errors are mapped to
// plain outcomes and never leak database detail.
async function lane100(b, name, email, event) {
  if (!email) return resp(200, { ok: false, error: 'email-required' });
  if (!b.consent) return resp(200, { ok: false, error: 'consent-required' });
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase' });
  const yes = (v) => v === true || v === 'on' || v === 'yes' || v === 'true' || v === '1';
  const row = {
    name: name, email: email,
    town: clean(b.town, 80) || null,
    show_on_wall: yes(b.show_on_wall),
    updates_opt_in: yes(b.updates_opt_in),
    consent: true,
    source_page: clean(b.source_page, 200) || null,
  };
  try {
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    const r = await fetch(URL + '/rest/v1/lane100_members', { method: 'POST', headers: headers, body: JSON.stringify(row), signal: AbortSignal.timeout(9000) });
    if (!r.ok) {
      let code = ''; let msg = '';
      try { const e = await r.json(); code = String(e.code || ''); msg = String(e.message || ''); } catch (e) {}
      if (code === '23505' || r.status === 409) return resp(200, { ok: false, error: 'already-joined' });
      if (/lane100_full/.test(msg)) return resp(200, { ok: false, error: 'full' });
      return resp(200, { ok: false, error: 'save-failed' });
    }
    const saved = (await r.json())[0] || {};
    const no = Number(saved.supporter_no);
    if (!(no >= 1)) return resp(200, { ok: false, error: 'save-failed' });   // never claim a number the database did not give
    return resp(200, { ok: true, number: no });
  } catch (e) {
    return resp(200, { ok: false, error: 'save-failed' });
  }
}
