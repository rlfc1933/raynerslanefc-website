// Rayners Lane FC — sponsor applications for the admin Sponsor Hub.
//
// Businesses apply via the Netlify Form "sponsor-enquiry" on investment.html.
// Their details stay PRIVATE in Netlify (not in the public repo). This function
// reads them back through the Netlify API so the commercial team can manage
// every application inside the PIN-gated admin.
//
// Requires env vars:
//   NETLIFY_API_TOKEN  (required) — Netlify personal access token (same one used by list-fans)
//   ADMIN_PIN          (optional) — shared PIN (defaults 19332026)
// SITE_ID is injected automatically by Netlify.

const API = 'https://api.netlify.com/api/v1';
const FORM_NAME = 'sponsor-enquiry';

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

  let pin = '';
  try { pin = JSON.parse(event.body || '{}').pin; } catch (e) {}
  if (!pin && event.queryStringParameters) pin = event.queryStringParameters.pin;
  const expectedPin = process.env.ADMIN_PIN || '19332026';
  if (String(pin) !== String(expectedPin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const token = process.env.NETLIFY_API_TOKEN;
  if (!token) {
    return resp(200, { ok: false, error: 'no-token', sponsors: [],
      setup: 'Add NETLIFY_API_TOKEN in Netlify → Site configuration → Environment variables.' });
  }

  const siteId = process.env.SITE_ID;
  const headers = { Authorization: 'Bearer ' + token };

  try {
    const formsRes = await fetch(API + '/sites/' + siteId + '/forms', { headers, signal: AbortSignal.timeout(9000) });
    if (!formsRes.ok) return resp(200, { ok: false, error: 'forms ' + formsRes.status, sponsors: [] });
    const forms = await formsRes.json();
    const form = (forms || []).find(f => f.name === FORM_NAME);
    if (!form) return resp(200, { ok: true, sponsors: [], count: 0, note: 'No applications yet.' });

    const subsRes = await fetch(API + '/forms/' + form.id + '/submissions?per_page=200', { headers, signal: AbortSignal.timeout(9000) });
    if (!subsRes.ok) return resp(200, { ok: false, error: 'subs ' + subsRes.status, sponsors: [] });
    const subs = await subsRes.json();

    const sponsors = (subs || []).map(function (s) {
      const d = s.data || {};
      return {
        id: s.id || '',
        company: d.company || '',
        contact: d.contact || '',
        email: d.email || s.email || '',
        phone: d.phone || '',
        package: d.package || '',
        budget: d.budget || '',
        website: d.website || '',
        message: d.message || '',
        created: s.created_at || '',
      };
    }).filter(function (x) { return x.company || x.email; });

    return resp(200, { ok: true, count: sponsors.length, sponsors: sponsors });
  } catch (e) {
    return resp(200, { ok: false, error: e.message, sponsors: [] });
  }
};
