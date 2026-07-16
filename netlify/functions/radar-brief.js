// Sponsor Radar — AI BRIEF. A short, GROUNDED sponsor brief for one business,
// from verified facts only. PIN-gated. Reuses the gen-post.js provider pattern
// (Groq or Gemini). Degrades to { ok:false } if no key — the tool still works
// without it (the facts and fit reasoning stand on their own).
//
// ⛔ Invents NOTHING. No revenue, turnover, budgets, headcount, owner names or
//    contacts beyond the facts supplied. Missing facts are omitted, never guessed.

const adminOk = require('./lib/pin');
const { resp } = require('./lib/radar');

const SYSTEM = [
  'You help Rayners Lane FC — a community non-league football club (Step 5) at Tithe Farm, Rayners Lane, Harrow — research a LOCAL BUSINESS as a possible sponsor. You are given ONLY verified facts about the business. Write a short, honest brief for a volunteer who will make friendly, one-to-one contact.',
  '',
  'Structure it as four short labelled lines:',
  'WHAT THEY ARE — one plain sentence from the facts (type of business, where, how close).',
  'WHY THEY\'D FIT — why a local business of this kind, this close to the ground, might back a grassroots club (local visibility, community goodwill). Grounded in the facts only.',
  'SUGGESTED PACKAGE — suggest a TYPE of sponsorship that suits their size and trade (e.g. matchday ball, pitchside board, programme advert, social media shout-out, kit/training-wear). Do NOT quote a price — the club sets that.',
  'APPROACH — one line: a warm, non-pushy opening angle for a first email or call.',
  '',
  'HARD RULES: Invent NOTHING. Do not state revenue, turnover, marketing budget, employee numbers, owner names, or any contact detail unless it is in the facts. If Companies House data is absent, say the company registration is unconfirmed. If a fact is missing, leave it out — never guess. British English. Keep the whole thing under ~100 words. End with one line: "CONFIDENCE: …" summarising how much is actually known vs assumed.',
].join('\n');

function extractText(providerText) { return String(providerText || '').trim(); }

async function callGroq(userText) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', temperature: 0.6, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userText }] }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return { error: 'groq ' + r.status };
  const d = await r.json();
  return { text: d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content };
}
async function callGemini(userText) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: userText }] }], generationConfig: { temperature: 0.6 } }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return { error: 'gemini ' + r.status };
  const d = await r.json();
  return { text: d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text };
}

// Build the FACTS block server-side, from the real record only.
function factsBlock(b) {
  const L = [];
  L.push('Name: ' + b.name);
  L.push('Type: ' + (b.category_label || b.category || 'business') + (b.tags && (b.tags.shop || b.tags.amenity || b.tags.craft) ? ' (' + (b.tags.shop || b.tags.amenity || b.tags.craft) + ')' : ''));
  if (b.address) L.push('Address: ' + b.address);
  L.push('Distance from Tithe Farm: ' + b.distance_miles + ' miles');
  if (b.opening_hours) L.push('Opening hours: ' + b.opening_hours);
  L.push('Published contact: ' + [b.phone ? 'phone' : '', b.email ? 'email' : '', b.website ? 'website' : ''].filter(Boolean).join(', ') || 'none published');
  if (b.ch && b.ch.match) {
    L.push('Companies House: ' + b.ch.status + (b.ch.active ? ' (active)' : ' (NOT active — check before pitching)') + (b.ch.incorporated ? ', incorporated ' + b.ch.incorporated : '') + (b.ch.sic_codes && b.ch.sic_codes.length ? ', SIC ' + b.ch.sic_codes.join('/') : ''));
  } else {
    L.push('Companies House: no confident match (registration unconfirmed).');
  }
  return L.join('\n');
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  if (!adminOk(body.pin)) return resp(401, { ok: false, error: 'Unauthorized' });

  const biz = body.business || {};
  if (!biz.name) return resp(400, { ok: false, error: 'no-business' });

  const hasGroq = !!process.env.GROQ_API_KEY, hasGemini = !!process.env.GEMINI_API_KEY;
  if (!hasGroq && !hasGemini) return resp(200, { ok: false, error: 'no-key', setup: 'Add GEMINI_API_KEY (or GROQ_API_KEY) in Netlify env vars for AI briefs.' });

  try {
    const out = hasGroq ? await callGroq(factsBlock(biz)) : await callGemini(factsBlock(biz));
    if (out.error) return resp(200, { ok: false, error: out.error });
    const brief = extractText(out.text);
    if (!brief) return resp(200, { ok: false, error: 'empty' });
    return resp(200, { ok: true, brief: brief, generatedAt: new Date().toISOString() });
  } catch (e) { return resp(200, { ok: false, error: (e && e.message) || 'error' }); }
};
