// Rayners Lane FC — match-day check-in (Phase 1, the scan loop).
//
// PIN-gated. scan.html POSTs a Lane number here when a staffer scans a fan's
// membership QR (or types it). Inserts an attendance row (idempotent on the
// unique (lane_no, match_date) constraint) and returns the fan's new totals,
// so the scanner can show "heart #N" or "already scanned today". Instant — no
// GitHub commit, no rebuild.
//
// Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PIN.
//
// SQL once (see supabase-schema.sql):
//   create table if not exists public.attendance (
//     id bigint generated always as identity primary key,
//     lane_no text not null, match_date date not null, home bool default true,
//     scanned_at timestamptz default now(), unique (lane_no, match_date));
//   alter table public.attendance enable row level security;
//   create policy "attendance public read" on public.attendance for select using (true);

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
    body: JSON.stringify(obj),
  };
}

async function laneTotals(headers, lane) {
  const cr = await fetch(URL + '/rest/v1/attendance?lane_no=eq.' + encodeURIComponent(lane) + '&select=home,match_date', { headers, signal: AbortSignal.timeout(9000) });
  const rows = cr.ok ? await cr.json() : [];
  return { rows: rows, total: rows.length, home: rows.filter(function (x) { return x.home; }).length };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  if (String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')) return resp(401, { ok: false, error: 'Unauthorized' });
  if (!URL || !KEY) return resp(200, { ok: false, error: 'no-supabase' });

  // Accept "RLFC LANE-1234 Name" or a raw number → keep digits only.
  const lane = String(b.lane_no || '').replace(/[^0-9]/g, '');
  if (!lane) return resp(400, { ok: false, error: 'no-lane' });
  const match_date = (b.match_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const home = b.home !== false;
  const headers = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  try {
    // already scanned for this match? → don't double count, report it.
    const ex = await fetch(URL + '/rest/v1/attendance?lane_no=eq.' + encodeURIComponent(lane) + '&match_date=eq.' + match_date + '&select=id', { headers, signal: AbortSignal.timeout(9000) });
    const exRows = ex.ok ? await ex.json() : [];
    if (exRows.length) {
      const t = await laneTotals(headers, lane);
      return resp(200, { ok: true, duplicate: true, lane_no: lane, total: t.total, home: t.home });
    }
    const ins = await fetch(URL + '/rest/v1/attendance', {
      method: 'POST',
      headers: Object.assign({}, headers, { Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({ lane_no: lane, match_date: match_date, home: home }),
      signal: AbortSignal.timeout(9000),
    });
    if (!ins.ok && ins.status !== 409) return resp(200, { ok: false, error: 'insert ' + ins.status });
    const t = await laneTotals(headers, lane);
    return resp(200, { ok: true, duplicate: false, lane_no: lane, total: t.total, home: t.home });
  } catch (e) {
    return resp(200, { ok: false, error: e.message });
  }
};
