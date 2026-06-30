// Rayners Lane FC — open Player-Trials deals for the admin "Trialists" view.
//
// PIN-gated. Reads deals in the Player-Trials pipeline from HubSpot so staff see
// applicants inside the admin without logging into HubSpot. No-ops cleanly if
// HubSpot isn't set up.
//
// ENV: HUBSPOT_TOKEN, HUBSPOT_PLAYER_PIPELINE, ADMIN_PIN (defaults 19332026).

const BASE = 'https://api.hubapi.com';

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')) return resp(401, { ok: false, error: 'Unauthorized' });

  const TOKEN = process.env.HUBSPOT_TOKEN;
  const PIPELINE = process.env.HUBSPOT_PLAYER_PIPELINE;
  if (!TOKEN) return resp(200, { ok: false, error: 'no-hubspot', leads: [] });
  if (!PIPELINE) return resp(200, { ok: false, error: 'no-pipeline', leads: [] });

  const headers = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
  try {
    const r = await fetch(BASE + '/crm/v3/objects/deals/search', {
      method: 'POST', headers,
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE }] }],
        properties: ['dealname', 'dealstage', 'description', 'createdate'],
        sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
        limit: 100,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return resp(200, { ok: false, error: 'hubspot ' + r.status, leads: [] });
    const d = await r.json();
    const leads = (d.results || []).map(function (x) {
      const p = x.properties || {};
      return { id: x.id, name: p.dealname || '', stage: p.dealstage || '', detail: p.description || '', created: p.createdate || '' };
    });
    return resp(200, { ok: true, count: leads.length, leads: leads });
  } catch (e) {
    return resp(200, { ok: false, error: e.message, leads: [] });
  }
};
