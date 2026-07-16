// Sponsor Radar — ENRICH. Attach PUBLIC Companies House records to a business.
// PIN-gated (uses our free CH key), cached in Blobs for 30 days.
//
// Endpoints (free API, HTTP Basic: key as username, empty password):
//   /search/companies?q=      → match the OSM business to a company
//   /company/{n}              → status, incorporation date, SIC, type, address
//   /company/{n}/officers     → directors (PUBLIC RECORD — not a sponsor contact)
//
// ⛔ Officers are public directors, shown as "Companies House public record".
//    We do NOT imply they are the sponsorship contact. We do NOT surface PSC
//    (owners) here, do NOT build a personal dossier, and store nothing invented.
//    If no confident match, we say so — we never force a wrong company.

const adminOk = require('./lib/pin');
const { cacheGet, cacheSet, resp } = require('./lib/radar');

const CH = 'https://api.company-information.service.gov.uk';
const CACHE_MS = 30 * 24 * 3600 * 1000;

function norm(s) { return String(s || '').toLowerCase().replace(/\b(ltd|limited|plc|llp|the|co|company|uk)\b/g, '').replace(/[^a-z0-9]/g, ''); }
function postFrom(s) { const m = String(s || '').toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/); return m ? m[0].replace(/\s+/g, '') : ''; }

async function ch(path) {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  const auth = 'Basic ' + Buffer.from(key + ':').toString('base64');
  const r = await fetch(CH + path, { headers: { Authorization: auth }, signal: AbortSignal.timeout(9000) });
  if (r.status === 429) throw new Error('rate-limited');
  if (!r.ok) return null;
  return r.json();
}

// Best match by name + postcode. Returns {number, confidence} or null.
function pickMatch(items, name, postcode) {
  const n = norm(name), pc = postFrom(postcode);
  let best = null, bestScore = 0;
  (items || []).forEach(function (it) {
    const cn = norm(it.title);
    let s = 0;
    if (cn === n) s += 60;
    else if (cn.indexOf(n) > -1 || n.indexOf(cn) > -1) s += 38;
    else {
      // token overlap
      const a = n.match(/.{3,}/g) || [];
      if (a.some(function (t) { return cn.indexOf(t) > -1; })) s += 18;
    }
    if (pc && postFrom(it.address_snippet) === pc) s += 34;      // same postcode = strong
    if (it.company_status === 'active') s += 6;
    if (s > bestScore) { bestScore = s; best = it; }
  });
  if (!best || bestScore < 45) return null;      // not confident enough — say "no match"
  return { number: best.company_number, confidence: bestScore >= 80 ? 'high' : 'medium', title: best.title };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(b.pin)) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!process.env.COMPANIES_HOUSE_API_KEY) return resp(200, { ok: false, error: 'no-ch-key', setup: 'Add COMPANIES_HOUSE_API_KEY (free) in Netlify env vars.' });

  const name = String(b.name || '').trim();
  const postcode = String(b.postcode || '').trim();
  if (!name) return resp(400, { ok: false, error: 'no-name' });
  const key = 'enrich:' + norm(name) + ':' + postFrom(postcode);

  if (!b.refresh) { const c = await cacheGet(key, CACHE_MS); if (c) return resp(200, Object.assign({ ok: true, cachedAt: c.at, source: 'cache' }, c.data)); }

  try {
    const search = await ch('/search/companies?items_per_page=8&q=' + encodeURIComponent(name + (postcode ? ' ' + postcode : '')));
    const m = pickMatch(search && search.items, name, postcode);
    if (!m) { const out = { match: false, note: 'No confident Companies House match — treat as unregistered / sole trader unless you know otherwise.' }; await cacheSet(key, out); return resp(200, Object.assign({ ok: true, source: 'ch' }, out)); }

    const [profile, officers] = await Promise.all([ch('/company/' + m.number), ch('/company/' + m.number + '/officers')]);
    const directors = ((officers && officers.items) || [])
      .filter(function (o) { return !o.resigned_on; })
      .filter(function (o) { return /director|partner|member/i.test(o.officer_role || ''); })
      .slice(0, 6)
      .map(function (o) { return { name: o.name, role: (o.officer_role || '').replace(/-/g, ' '), appointed: o.appointed_on || '' }; });

    const status = (profile && profile.company_status) || 'unknown';
    const out = {
      match: true, confidence: m.confidence,
      company_number: m.number,
      company_name: (profile && profile.company_name) || m.title,
      status: status,
      active: status === 'active',
      incorporated: (profile && profile.date_of_creation) || '',
      type: (profile && profile.type) || '',
      sic_codes: (profile && profile.sic_codes) || [],
      registered_office: profile && profile.registered_office_address ? Object.values(profile.registered_office_address).filter(Boolean).join(', ') : '',
      directors: directors,
      ch_url: 'https://find-and-update.company-information.service.gov.uk/company/' + m.number,
      source: 'Companies House (public record)',
    };
    await cacheSet(key, out);
    return resp(200, Object.assign({ ok: true, source: 'ch' }, out));
  } catch (e) {
    if (/rate-limited/.test(e.message)) return resp(200, { ok: false, error: 'rate-limited', note: 'Companies House is busy — try again shortly.' });
    return resp(200, { ok: false, error: (e && e.message) || 'ch-failed' });
  }
};
