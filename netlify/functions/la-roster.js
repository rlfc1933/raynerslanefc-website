// ════════════════════════════════════════════════════════════════════════════
// THE FIRST TEAM ROSTER — read and maintain, without a developer.
//
// WHY THIS EXISTS AND WHAT IT DELIBERATELY DOES NOT DO
// ----------------------------------------------------
// The canonical roster already lives in Supabase `la_players`, and
// la-admin-save-squad already writes it and regenerates data/players.json from
// it. Nothing here replaces that. What was missing was the operations a
// Programme Editor actually needs and could not perform:
//
//   EDIT a player without creating a second one. The existing save matches by
//   NAME, so correcting a spelling minted a new record and orphaned the old —
//   which is exactly how a roster grows duplicates and how a Full-Time identity
//   mapping gets silently detached.
//
//   SEE who has left, and RESTORE them. Removal already archived rather than
//   deleted (status 'left'), which was right, but nothing could read those rows
//   back, so a returning player had to be retyped and would come back as a
//   different person.
//
//   BE WARNED about a likely duplicate before adding one.
//
// THE DISTINCTION THAT MATTERS
// ----------------------------
// `la_players` answers "who plays for Rayners Lane". `football_players`
// answers "which Full-Time match-sheet names have we matched to a person".
// They are different questions and this endpoint never touches the second. A
// player belongs on the roster because the club says so, not because they have
// appeared in a line-up.
//
// HISTORY IS NEVER DESTROYED. There is no delete. Removing somebody sets their
// status, and every published programme keeps the squad it froze.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const L = require('./lib/lane');
const adminOk = require('./lib/pin');
const AUTHZ = require('./lib/authz');
const P = require('./la-publish-players');

/** Names compare loosely so "Temi  Animashaun" and "temi animashaun" are one. */
function norm(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[’']/g, "'");
}

/** Two names that differ only by an initial or a middle name are suspicious. */
function looksLike(a, b) {
  const A = norm(a), B = norm(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const pa = A.split(' '), pb = B.split(' ');
  const sa = pa[pa.length - 1], sb = pb[pb.length - 1];
  if (sa !== sb) return false;                       // different surname, different person
  const fa = pa[0], fb = pb[0];
  // Same surname AND (same first name, or one first name is the other's initial,
  // or one is a prefix of the other — Temi / Temiloluwa).
  return fa === fb ||
         (fa.length === 1 && fb[0] === fa) || (fb.length === 1 && fa[0] === fb) ||
         fa.startsWith(fb) || fb.startsWith(fa);
}

const ACTIVE = ['active', 'injured'];

function shape(r) {
  return {
    id: r.id,
    name: r.name || '',
    position: r.position || '',
    number: r.squad_no || null,
    photo: r.photo_url || '',
    status: r.status || 'active',
    active: ACTIVE.indexOf(r.status || 'active') > -1,
  };
}

/** Who may change the squad. Reads stay behind the portal PIN. */
async function gate(event) {
  return AUTHZ.requireCap(event, AUTHZ.CAP.MANAGE_ROSTER);
}

async function audit(entry) {
  try {
    await AUTHZ.audit({
      action: entry.action,
      targetUser: entry.player,
      actorUsername: entry.by,
      actorRole: entry.role,
      capability: AUTHZ.CAP.MANAGE_ROSTER,
      result: 'success',
      before: entry.before || null,
      after: entry.after || null,
    });
  } catch (e) { /* the change stands; the log is best effort */ }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return L.resp(204, {});
  const b = L.parseBody(event);
  const q = (event && event.queryStringParameters) || {};
  const action = String(b.action || q.action || 'list').toLowerCase();

  // Reading the roster is open to anyone already inside the portal — seeing who
  // is in the squad is not a privileged act.
  if (!adminOk(b.pin || q.pin)) return L.resp(401, { ok: false, error: 'Sign in to view the squad' });

  try {
    if (action === 'list') {
      const rows = await L.sel('la_players?select=id,name,position,squad_no,photo_url,status&order=squad_no.asc,name.asc');
      const all = (rows || []).map(shape);
      return L.resp(200, {
        ok: true,
        active: all.filter((p) => p.active),
        inactive: all.filter((p) => !p.active),
      });
    }

    // ── FROM HERE ON THE SQUAD CHANGES ──────────────────────────────────
    const g = await gate(event);
    if (!g.ok) return g.response;
    const by = (g.session.username || '') + (g.session.role ? ' (' + g.session.role + ')' : '');

    if (action === 'add') {
      const name = String(b.name || '').trim();
      const position = String(b.position || '').trim();
      if (!name) return L.resp(400, { ok: false, error: 'Enter the player’s name.' });
      if (!position) return L.resp(400, { ok: false, error: 'Choose a position.' });

      const rows = await L.sel('la_players?select=id,name,status') || [];
      // A player already on the books — active or departed — is never silently
      // duplicated. The editor is shown the match and decides.
      const clash = rows.filter((r) => looksLike(r.name, name));
      if (clash.length && !b.confirmDuplicate) {
        return L.resp(200, {
          ok: false, duplicate: true,
          matches: clash.map(shape),
          error: 'A player with a very similar name already exists.',
        });
      }

      const teams = await L.sel('la_teams?select=id&order=id&limit=1');
      const seasons = await L.sel('la_seasons?select=id&is_current=eq.true&limit=1');
      await L.ins('la_players', {
        team_id: (teams[0] || {}).id || null,
        season: (seasons[0] || {}).id || '2026-27',
        status: 'active',
        name: name,
        position: position,
        squad_no: (b.number && Number(b.number) > 0) ? Number(b.number) : null,
        photo_url: b.photo || null,
      });
      await audit({ action: 'roster_player_added', player: name, by: by, after: { name, position } });
      const pub = await P.publish(false);
      return L.resp(200, { ok: true, published: pub.ok, count: pub.count });
    }

    if (action === 'update') {
      // BY ID, NEVER BY NAME. Matching on the name is what turned a spelling
      // correction into a second player and detached the old record from its
      // Full-Time identity mapping.
      const id = b.id;
      if (!id) return L.resp(400, { ok: false, error: 'Which player?' });
      const cur = (await L.sel('la_players?select=id,name,position,squad_no,photo_url,status&id=eq.' + encodeURIComponent(id)) || [])[0];
      if (!cur) return L.resp(404, { ok: false, error: 'That player is no longer on the list.' });

      const patch = {};
      if (b.name != null && String(b.name).trim()) patch.name = String(b.name).trim();
      if (b.position != null) patch.position = String(b.position).trim() || null;
      if (b.number !== undefined) patch.squad_no = (b.number && Number(b.number) > 0) ? Number(b.number) : null;
      if (b.photo !== undefined) patch.photo_url = b.photo || null;
      if (!Object.keys(patch).length) return L.resp(400, { ok: false, error: 'Nothing to change.' });

      await L.upd('la_players', 'id=eq.' + encodeURIComponent(id), patch);
      await audit({ action: 'roster_player_edited', player: cur.name, by: by,
        before: shape(cur), after: Object.assign({}, shape(cur), shape(Object.assign({}, cur, patch))) });
      const pub = await P.publish(false);
      return L.resp(200, { ok: true, published: pub.ok, count: pub.count });
    }

    if (action === 'deactivate' || action === 'restore') {
      const id = b.id;
      if (!id) return L.resp(400, { ok: false, error: 'Which player?' });
      const cur = (await L.sel('la_players?select=id,name,status&id=eq.' + encodeURIComponent(id)) || [])[0];
      if (!cur) return L.resp(404, { ok: false, error: 'That player is no longer on the list.' });

      // NOT A DELETE. The record, their appearances, their identity mapping and
      // every published programme they appear in all survive untouched.
      const status = action === 'restore' ? 'active' : 'left';
      await L.upd('la_players', 'id=eq.' + encodeURIComponent(id), { status: status });
      await audit({
        action: action === 'restore' ? 'roster_player_restored' : 'roster_player_deactivated',
        player: cur.name, by: by, before: { status: cur.status }, after: { status: status },
      });
      const pub = await P.publish(false);
      return L.resp(200, { ok: true, published: pub.ok, count: pub.count });
    }

    return L.resp(400, { ok: false, error: 'unknown action: ' + action });
  } catch (e) {
    console.error('[la-roster]', (e && e.message) || e);
    return L.resp(200, { ok: false, error: 'The squad could not be updated just now.' });
  }
};

exports._internal = { norm, looksLike, shape };
