// THE LANE 100 — the public read: the REAL count and the recognition wall.
//
// GET /.netlify/functions/lane-100 → { ok, count, target, wall:[{no,name,town}] }
//
// · count  = active founding supporters in lane100_members. Zero is a real,
//            honest answer; the page then says "be one of the first".
// · wall   = only members who ticked the public-recognition box, shown as
//            first name + surname initial (and town if they gave one).
//            Never an email, never a full surname.
// If the database is not reachable the answer is { ok:false } and the page
// shows no number at all rather than a guess.
'use strict';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rewkixywfgsyqinfbggv.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET = 100;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    body: JSON.stringify(obj),
  };
}

/** "Sam Baker-Jones" → "Sam B." ; "Prince" → "Prince". */
function publicName(full) {
  const parts = String(full || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!parts.length) return '';
  const first = parts[0].slice(0, 40);
  return parts.length > 1 ? first + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : first;
}

exports.publicName = publicName;
exports.handler = async function (event) {
  if (event && event.httpMethod && event.httpMethod !== 'GET') return resp(405, { ok: false, error: 'GET only' });
  if (!KEY) return resp(200, { ok: false, error: 'not-configured' });
  try {
    const r = await fetch(URL + '/rest/v1/lane100_members?select=supporter_no,name,town,show_on_wall&status=eq.active&order=supporter_no.asc&limit=1000',
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return resp(200, { ok: false, error: 'unavailable' });
    const rows = await r.json();
    const wall = rows.filter((m) => m.show_on_wall).map((m) => ({ no: m.supporter_no, name: publicName(m.name), town: m.town || null }));
    return resp(200, { ok: true, count: rows.length, target: TARGET, wall });
  } catch (e) {
    return resp(200, { ok: false, error: 'unavailable' });
  }
};
