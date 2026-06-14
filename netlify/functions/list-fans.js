// Rayners Lane FC — fan sign-ups for the admin portal.
//
// Fans "Join the Family List" on the Fan Zone via a Netlify Form (fan-signup).
// Their details (name, email, birthday…) are PRIVATE — they live in Netlify,
// NOT in the public repo. This function reads them back through the Netlify API
// so the chairman can see every sign-up inside the PIN-gated admin panel,
// instead of having to log into the Netlify dashboard.
//
// Requires Netlify env vars:
//   NETLIFY_API_TOKEN  (required) — a personal access token from
//                       Netlify → User settings → Applications → New access token.
//   ADMIN_PIN          (optional) — same shared PIN as save-data (defaults 19332026).
//
// SITE_ID is injected automatically by Netlify at runtime.

const API = 'https://api.netlify.com/api/v1';
const FORM_NAME = 'fan-signup';

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});

  // PIN gate (same shared secret as save-data) so the list isn't world-readable.
  let pin = '';
  try { pin = JSON.parse(event.body || '{}').pin; } catch (e) {}
  if (!pin && event.queryStringParameters) pin = event.queryStringParameters.pin;
  const expectedPin = process.env.ADMIN_PIN || '19332026';
  if (String(pin) !== String(expectedPin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) {
    return resp(200, { ok: false, error: 'no-token', fans: [],
      setup: 'Add NETLIFY_API_TOKEN in Netlify → Site configuration → Environment variables (create the token at Netlify → User settings → Applications → Personal access tokens).' });
  }

  const siteId = process.env.SITE_ID;
  const headers = { Authorization: 'Bearer ' + token };

  try {
    // Find the fan-signup form id (forms only exist once a real submission lands).
    const formsRes = await fetch(API + '/sites/' + siteId + '/forms', { headers, signal: AbortSignal.timeout(9000) });
    if (!formsRes.ok) return resp(200, { ok: false, error: 'forms ' + formsRes.status, fans: [] });
    const forms = await formsRes.json();
    const form = (forms || []).find(f => f.name === FORM_NAME);
    if (!form) return resp(200, { ok: true, fans: [], count: 0, note: 'No sign-ups yet.' });

    const subsRes = await fetch(API + '/forms/' + form.id + '/submissions?per_page=200', { headers, signal: AbortSignal.timeout(9000) });
    if (!subsRes.ok) return resp(200, { ok: false, error: 'subs ' + subsRes.status, fans: [] });
    const subs = await subsRes.json();

    const fans = (subs || []).map(function (s) {
      const d = s.data || {};
      return {
        name: d.name || s.name || '',
        email: d.email || s.email || '',
        town: d.town || '',
        birthday: d.birthday || '',
        since: d.since || '',
        meaning: d.meaning || '',
        lane_number: d.lane_number || '',
        created: s.created_at || '',
      };
    }).filter(function (f) { return f.email || f.name; });

    return resp(200, { ok: true, count: fans.length, fans: fans });
  } catch (e) {
    return resp(200, { ok: false, error: e.message, fans: [] });
  }
};
