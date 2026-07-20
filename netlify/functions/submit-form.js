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

const TYPES = ['trial', 'volunteer', 'sponsor', 'contact', 'membership', 'other'];
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
    const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    const r = await fetch(URL + '/rest/v1/submissions', { method: 'POST', headers: headers, body: JSON.stringify(row), signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'save-failed' });   // never leak Supabase detail
    return resp(200, { ok: true });
  } catch (e) {
    return resp(200, { ok: false, error: 'save-failed' });
  }
};
