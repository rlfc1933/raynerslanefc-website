// Rayners Lane FC — REAL-TIME live scoreboard write (Fix A part 2).
//
// PIN-gated. The admin score buttons POST here to update the single live_match
// row in Supabase INSTANTLY (no GitHub commit, no rebuild) — the homepage reads
// that row and a tapped score reaches fans in ~10-15s. matchday.json is still
// committed separately for the non-live "next match / countdown" + as a fallback.
//
// Requires env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  (service_role secret — SECRET)
//   ADMIN_PIN  (defaults 19332026 if unset)
//
// Run this SQL once in Supabase (see supabase-schema.sql):
//   create table if not exists public.live_match (
//     id int primary key default 1, opponent text, is_home bool,
//     home_score int default 0, away_score int default 0, status text,
//     scorers text, is_live bool default false, updated_at timestamptz default now());
//   insert into public.live_match (id) values (1) on conflict do nothing;
//   alter table public.live_match enable row level security;
//   create policy "live_match public read" on public.live_match for select using (true);

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

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
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase' });

  const row = {
    opponent: b.opponent || '',
    is_home: b.is_home !== false,
    home_score: parseInt(b.home_score, 10) || 0,
    away_score: parseInt(b.away_score, 10) || 0,
    status: b.status || '',
    scorers: b.scorers || '',
    is_live: !!b.is_live,
    updated_at: new Date().toISOString(),
  };
  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  try {
    const r = await fetch(URL + '/rest/v1/live_match?id=eq.1', { method: 'PATCH', headers, body: JSON.stringify(row), signal: AbortSignal.timeout(9000) });
    if (!r.ok) return resp(200, { ok: false, error: 'patch ' + r.status });
    return resp(200, { ok: true });
  } catch (e) {
    return resp(200, { ok: false, error: e.message });
  }
};
