// ADMIN_PIN-gated ONE-TIME import: pull the current website squad
// (data/players.json) into Supabase la_players so the app and the site share
// ONE roster. Matches by name (case-insensitive) and upserts — safe to re-run,
// never duplicates. These roster rows have NO login yet; a player attaches their
// login by signing up with their name (la-signup "claim"). Does NOT touch the
// website — purely fills Supabase.
const L = require('./lib/lane');
const adminOk = require('./lib/pin');

function slug(name) { return String(name || '').toLowerCase().replace(/\s+/g, '-'); }
function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  if (!adminOk(b.pin)) return L.resp(401, { ok: false, error: 'Unauthorized' });

  // Read the authoritative website squad.
  let players = [];
  try {
    const r = await fetch('https://raw.githubusercontent.com/rlfc1933/raynerslanefc-website/main/data/players.json', { signal: AbortSignal.timeout(9000) });
    const j = await r.json();
    players = (j && j.players) || [];
  } catch (e) { return L.resp(502, { ok: false, error: 'Could not read the website squad.' }); }
  if (!players.length) return L.resp(200, { ok: false, error: 'Website squad is empty — nothing to import.' });

  const teams = await L.sel('la_teams?select=id&order=id&limit=1');
  const seasons = await L.sel('la_seasons?select=id&is_current=eq.true&limit=1');
  const team_id = (teams[0] || {}).id || null;
  const season = (seasons[0] || {}).id || '2026-27';

  const existing = await L.sel('la_players?select=id,name');
  const byName = {};
  existing.forEach(function (p) { byName[norm(p.name)] = p.id; });

  let added = 0, updated = 0;
  for (const p of players) {
    const row = {
      team_id: team_id, season: season, name: p.name,
      position: p.position || null, role: p.role || null, age: p.age || null,
      squad_no: (p.number && Number(p.number) > 0) ? Number(p.number) : null,
      photo_url: p.photo || null, bio: p.bio || null,
      nationality: p.nationality || null, nickname: p.nickname || null,
      apps: p.apps || 0, goals: p.goals || 0, assists: p.assists || 0,
    };
    const id = byName[norm(p.name)];
    if (id) { await L.upd('la_players', 'id=eq.' + id, row); updated++; }
    else {
      // new roster entry — active on the squad, no login yet
      const inr = await L.ins('la_players', Object.assign({ status: 'active' }, row));
      if (inr.ok) added++;
    }
  }
  return L.resp(200, { ok: true, websitePlayers: players.length, added: added, updated: updated });
};
