// The admin back-end squad editor saves here (ADMIN_PIN). Writes the edits into
// Supabase (the single source of truth), matched by name — PROFILE fields only,
// so a player's login/claim is never touched. Removed players are archived
// ('left'), never deleted (their history stays). Then republishes the website
// from Supabase. One writer for players.json/squad.json — this + la-publish.
const L = require('./lib/lane');
const P = require('./la-publish-players');

function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  if (event.httpMethod !== 'POST') return L.resp(405, { ok: false, error: 'POST only' });
  const b = L.parseBody(event);
  if (String(b.pin) !== String(process.env.ADMIN_PIN || '19332026')) return L.resp(401, { ok: false, error: 'Unauthorized' });
  const players = Array.isArray(b.players) ? b.players : [];
  const deleted = Array.isArray(b.deleted) ? b.deleted : [];

  const teams = await L.sel('la_teams?select=id&order=id&limit=1');
  const seasons = await L.sel('la_seasons?select=id&is_current=eq.true&limit=1');
  const team_id = (teams[0] || {}).id || null;
  const season = (seasons[0] || {}).id || '2026-27';

  const existing = await L.sel('la_players?select=id,name,status');
  const byName = {};
  existing.forEach(function (p) { byName[norm(p.name)] = p; });

  let added = 0, updated = 0;
  for (const p of players) {
    if (!p || !p.name) continue;
    const prof = {
      name: p.name, position: p.position || null, role: p.role || null,
      age: (p.age === '' || p.age == null) ? null : Number(p.age),
      squad_no: (p.number && Number(p.number) > 0) ? Number(p.number) : null,
      nationality: p.nationality || null, nickname: p.nickname || null, bio: p.bio || null,
      apps: Number(p.apps) || 0, goals: Number(p.goals) || 0, assists: Number(p.assists) || 0,
      photo_url: p.photo || null,
    };
    const ex = byName[norm(p.name)];
    if (ex) {
      const patch = Object.assign({}, prof);
      // if they were archived and are back in the list, reactivate
      if (ex.status === 'left' || ex.status === 'released') patch.status = 'active';
      await L.upd('la_players', 'id=eq.' + ex.id, patch);
      updated++;
    } else {
      await L.ins('la_players', Object.assign({ team_id: team_id, season: season, status: 'active' }, prof));
      added++;
    }
  }
  // archive removed players (keep their record + any history)
  let archived = 0;
  for (const name of deleted) {
    const ex = byName[norm(name)];
    if (ex) { await L.upd('la_players', 'id=eq.' + ex.id, { status: 'left' }); archived++; }
  }

  const pub = await P.publish(false);   // regenerate the website from Supabase
  return L.resp(200, { ok: true, added: added, updated: updated, archived: archived, published: pub.ok, count: pub.count });
};
