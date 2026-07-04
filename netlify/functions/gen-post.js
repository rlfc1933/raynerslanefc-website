// Rayners Lane FC — AI copywriter for Post Studio (server-side, PIN-gated).
//
// Rewrites a volunteer's rough note into ready-to-post X captions + a short
// call-to-action HOOK headline for a graphic. The AI key NEVER touches the
// browser. Works with EITHER provider — set whichever you have:
//   GROQ_API_KEY    (OpenAI-compatible, very fast)  + optional GROQ_MODEL
//   GEMINI_API_KEY  (Google)                         + optional GEMINI_MODEL
// Plus ADMIN_PIN (reused; default 19332026) to gate it like live-score.js.
//
// POST { pin, mode, text, context? }   mode ∈ "tweet" | "hook" | "both"
// → { ok:true, tweets:[3 strings], hook:"…" }   (returns what the mode asks)
// Never throws; degrades to { ok:false, error:'no-key' } if unconfigured.

function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: JSON.stringify(obj) };
}

var SYSTEM = [
  'You are the social media copywriter for Rayners Lane FC ("The Lane"), a proud English non-league football club founded 1933, playing Step 5 in the Combined Counties Premier Division North. Club identity: yellow and green, confident, warm, community-first, punchy. Signature sign-off: "Up The Lane." Never corporate, never cringe, never over-hashtagged.',
  '',
  'For mode "tweet": rewrite the user\'s rough note into 3 distinct ready-to-post X captions. Each: under 280 characters, scroll-stopping first line, natural British football tone, at most 1-2 relevant hashtags (e.g. #UpTheLane), tasteful emoji only if it earns its place. Real punctuation, no markdown. Do not invent facts (scores, names, times) not present in the input.',
  '',
  'For mode "hook": write ONE very short call-to-action headline of 2-6 words for a graphic title card. It must tease and pull the reader into the tweet WITHOUT restating its content (e.g. "BIG NEWS DROPS", "THE LANE IS BACK", "YOU\'LL WANT TO SEE THIS", "MARK THE DATE"). ALL CAPS friendly (renders in Bebas Neue). No emoji, no hashtags, no punctuation unless essential.',
  '',
  'Return strict JSON only: { "tweets": ["…","…","…"], "hook": "…" }'
].join('\n');

function extractJSON(s) {
  if (!s) return null;
  var m = s.match(/```(?:json)?\s*([\s\S]*?)```/i); // strip code fences if present
  var body = m ? m[1] : s;
  var a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a === -1 || b === -1) return null;
  try { return JSON.parse(body.slice(a, b + 1)); } catch (e) { return null; }
}

async function callGroq(userText, mode) {
  var model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  var r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: 'mode: ' + mode + '\nrough note: ' + userText }
      ]
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return { error: 'groq ' + r.status };
  var d = await r.json();
  return { text: d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content };
}

async function callGemini(userText, mode) {
  var model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + process.env.GEMINI_API_KEY;
  var r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: 'mode: ' + mode + '\nrough note: ' + userText }] }],
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json' }
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return { error: 'gemini ' + r.status };
  var d = await r.json();
  var text = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text;
  return { text: text };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  var b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')) return resp(401, { ok: false, error: 'Unauthorized' });

  var hasGroq = !!process.env.GROQ_API_KEY, hasGemini = !!process.env.GEMINI_API_KEY;
  if (!hasGroq && !hasGemini) return resp(200, { ok: false, error: 'no-key', setup: 'Add GROQ_API_KEY (or GEMINI_API_KEY) in Netlify env vars.' });

  var mode = (b.mode === 'tweet' || b.mode === 'hook') ? b.mode : 'both';
  var text = String(b.text || '').slice(0, 1200).trim();
  if (!text) return resp(400, { ok: false, error: 'no-text' });

  try {
    var out = hasGroq ? await callGroq(text, mode) : await callGemini(text, mode);
    if (out.error) return resp(200, { ok: false, error: out.error });
    var parsed = extractJSON(out.text);
    if (!parsed) return resp(200, { ok: false, error: 'bad-json' });
    var tweets = Array.isArray(parsed.tweets) ? parsed.tweets.filter(Boolean).slice(0, 3).map(function (s) { return String(s).slice(0, 280); }) : [];
    var hook = parsed.hook ? String(parsed.hook).slice(0, 60) : '';
    var res = { ok: true };
    if (mode !== 'hook') res.tweets = tweets;
    if (mode !== 'tweet') res.hook = hook;
    return resp(200, res);
  } catch (e) {
    return resp(200, { ok: false, error: (e && e.message) || 'error' });
  }
};
