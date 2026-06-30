// Rayners Lane FC — HubSpot lead capture (Phase 2).
//
// One endpoint for every lead form (sponsor / player / volunteer). Creates or
// updates a HubSpot CONTACT (tagged by source) and, when a pipeline is
// configured, a DEAL in the right pipeline. Called fire-and-forget from the
// site's own (bespoke) forms, so the user-facing flow + email alerts are never
// affected — if HubSpot isn't set up, this no-ops cleanly.
//
// ENV (Netlify):
//   HUBSPOT_TOKEN              private-app token (CRM scopes). SECRET. Required.
//   HUBSPOT_SPONSOR_PIPELINE   deal pipeline id for sponsors        (optional)
//   HUBSPOT_SPONSOR_STAGE      first stage id ("New")               (optional)
//   HUBSPOT_PLAYER_PIPELINE    deal pipeline id for player trials   (optional)
//   HUBSPOT_PLAYER_STAGE       first stage id ("Enquiry")           (optional)
//   (pipeline/stage ids: HubSpot → Settings → Objects → Deals → Pipelines →
//    the "..." menu → "Copy pipeline/stage id". If unset, only the contact is
//    created — no deal — so nothing errors.)
//
// CUSTOM CONTACT PROPERTIES to create once in HubSpot (Settings → Properties →
// Contact): lead_source, lead_type, age_group (single-line text). If they don't
// exist yet, this falls back to creating the contact with standard fields only.

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
  const TOKEN = process.env.HUBSPOT_TOKEN;
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (b['bot-field']) return resp(200, { ok: true, ignored: 'honeypot' });   // spam trap
  const email = String(b.email || '').trim();
  if (!email) return resp(400, { ok: false, error: 'no-email' });
  if (!TOKEN) return resp(200, { ok: false, error: 'no-hubspot' });          // not set up → no-op

  const headers = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
  const name = String(b.name || '').trim();
  const sp = name.indexOf(' ');
  const firstname = sp > 0 ? name.slice(0, sp) : name;
  const lastname = sp > 0 ? name.slice(sp + 1) : '';
  const source = (b.lead_source || 'fan');

  // ── contact props (standard + custom; custom are stripped on a 400) ──
  const full = {};
  if (firstname) full.firstname = firstname;
  if (lastname) full.lastname = lastname;
  full.email = email;
  if (b.phone) full.phone = String(b.phone);
  if (b.company) full.company = String(b.company);
  full.lead_source = source;
  if (b.lead_type) full.lead_type = String(b.lead_type);
  if (b.age_group) full.age_group = String(b.age_group);

  async function upsertContact(props) {
    let id = null;
    try {
      const sr = await fetch(BASE + '/crm/v3/objects/contacts/search', {
        method: 'POST', headers,
        body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }], properties: ['email'], limit: 1 }),
        signal: AbortSignal.timeout(9000),
      });
      if (sr.ok) { const sd = await sr.json(); if (sd.results && sd.results.length) id = sd.results[0].id; }
    } catch (e) {}
    const url = id ? BASE + '/crm/v3/objects/contacts/' + id : BASE + '/crm/v3/objects/contacts';
    const method = id ? 'PATCH' : 'POST';
    let r = await fetch(url, { method, headers, body: JSON.stringify({ properties: props }), signal: AbortSignal.timeout(9000) });
    if (r.status === 400) {
      // a custom property probably doesn't exist yet → retry with standards only
      const std = {};
      ['firstname', 'lastname', 'email', 'phone', 'company'].forEach(function (k) { if (props[k] != null) std[k] = props[k]; });
      r = await fetch(url, { method, headers, body: JSON.stringify({ properties: std }), signal: AbortSignal.timeout(9000) });
    }
    if (!r.ok) return null;
    if (id) return id;
    try { const d = await r.json(); return d.id || null; } catch (e) { return null; }
  }

  async function createDeal(dealname, pipeline, stage, description, amount, contactId) {
    if (!pipeline || !stage) return false; // not configured → skip the deal
    const properties = { dealname: dealname, pipeline: pipeline, dealstage: stage };
    if (amount) properties.amount = String(amount);
    if (description) properties.description = description;
    const body = { properties: properties };
    if (contactId) body.associations = [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }];
    try {
      const r = await fetch(BASE + '/crm/v3/objects/deals', { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(9000) });
      return r.ok;
    } catch (e) { return false; }
  }

  try {
    const contactId = await upsertContact(full);

    let dealMade = false;
    if (source === 'sponsor') {
      const desc = [['Package', b.package], ['Budget', b.budget], ['Website', b.website], ['Message', b.message]].filter(function (r) { return r[1]; }).map(function (r) { return r[0] + ': ' + r[1]; }).join('\n');
      dealMade = await createDeal(b.company || name || 'Sponsor enquiry', process.env.HUBSPOT_SPONSOR_PIPELINE, process.env.HUBSPOT_SPONSOR_STAGE, desc, b.budget, contactId);
    } else if (source === 'player') {
      const desc = [['Position', b.position], ['Age group', b.age_group], ['Current club', b.current_club], ['Availability', b.availability], ['Phone', b.phone], ['Guardian', b.guardian], ['Guardian contact', b.guardian_contact]].filter(function (r) { return r[1]; }).map(function (r) { return r[0] + ': ' + r[1]; }).join('\n');
      dealMade = await createDeal((name || 'Trialist') + (b.position ? ' — ' + b.position : ''), process.env.HUBSPOT_PLAYER_PIPELINE, process.env.HUBSPOT_PLAYER_STAGE, desc, null, contactId);
    }
    return resp(200, { ok: !!contactId, contactId: contactId, deal: dealMade });
  } catch (e) {
    return resp(200, { ok: false, error: e.message });
  }
};
