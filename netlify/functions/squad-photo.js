// ════════════════════════════════════════════════════════════════════════════
// PLAYER HEADSHOTS — put an approved photograph on an EXISTING player.
//
// Never creates a player: the photo is attached to a player id or refused.
// The browser crops, fixes phone orientation and re-encodes to JPEG (which
// drops EXIF); the server checks it is a real JPEG of sensible size, strips any
// metadata again, and stores two files:
//   · the WEB image under a NEW, versioned name (img/players/<slug>-<hash>.jpg),
//     so replacing a headshot never changes an archived programme that points
//     at the old one;
//   · the ORIGINAL (up to print resolution) in a private store for programmes.
// Consent follows the club's existing photo_consent flag; a player under 18
// additionally needs the parent/guardian confirmation ticked.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');
const AZ = require('./lib/authz');
const ST = require('./lib/squad/store');
const JP = require('./lib/squad/jpeg');
const PUB = require('./lib/squad/publish');

const REPO = 'rlfc1933/raynerslanefc-website';
const LIMITS = { webMax: 900 * 1024, originalMax: 4 * 1024 * 1024, minSide: 300 };

function resp(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }, body: JSON.stringify(obj) };
}

/** data:image/jpeg;base64,… → Buffer, or an explanation of what is wrong. */
function decode(dataUrl, max, label) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: label + ' must be a JPEG photo. Phone photos in HEIC format: open the photo and use Share → Save as JPEG, or set the camera to “Most Compatible”, then try again.' };
  const buf = Buffer.from(m[1], 'base64');
  if (!JP.isJpeg(buf)) return { error: label + ' is not a readable JPEG.' };
  if (buf.length > max) return { error: label + ' is too large (' + Math.round(buf.length / 1024) + ' KB).' };
  const sz = JP.size(buf);
  if (!sz || Math.min(sz.width, sz.height) < LIMITS.minSide) return { error: label + ' is too small — use a photo at least ' + LIMITS.minSide + ' pixels on each side.' };
  let clean;
  try { clean = JP.strip(buf); } catch (e) { return { error: label + ' could not be read. Try a different photo.' }; }
  return { buf: clean, size: sz };
}

async function commitImage(path, buf, message) {
  const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + path, {
    method: 'PUT',
    headers: { Authorization: 'token ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'RLFC-Admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: buf.toString('base64'), branch: 'main' }),
  });
  // 422 = the same versioned file already exists: identical bytes, already published.
  return r.ok || r.status === 422;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return resp(204, {});
  if (event.httpMethod !== 'POST') return resp(405, { ok: false, error: 'POST only' });
  const g = await AZ.requireCap(event, AZ.CAP.MANAGE_ROSTER, { elevated: true });
  if (!g.ok) return g.response;
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { ok: false, error: 'bad request' }); }
  const deps = event._deps || {};

  try {
    const R = await ST.roster(event);
    const players = await R.list();
    const p = players.find((x) => String(x.id) === String(b.playerId));
    if (!p) return resp(404, { ok: false, error: 'Choose a player from the list. A photo never creates a new player.' });

    // Consent: the club's flag, or an explicit confirmation from staff; a
    // player under 18 always needs the parent/guardian confirmation.
    if (p.age && Number(p.age) < 18 && !b.guardianConsent) {
      return resp(200, { ok: false, needsConsent: 'guardian', error: p.name + ' is under 18. Confirm a parent or guardian has agreed to this photo being used, in line with the club’s safeguarding policy.' });
    }
    if (p.photo_consent !== true && !b.consentConfirmed) {
      return resp(200, { ok: false, needsConsent: 'player', error: 'Confirm ' + p.name + ' has agreed to their photo being on the club website and in programmes.' });
    }

    const web = decode(b.web, LIMITS.webMax, 'The website photo');
    if (web.error) return resp(400, { ok: false, error: web.error });
    const orig = b.original ? decode(b.original, LIMITS.originalMax, 'The original photo') : null;
    if (orig && orig.error) return resp(400, { ok: false, error: orig.error });

    const hash = crypto.createHash('sha256').update(web.buf).digest('hex').slice(0, 10);
    const slug = (p.slug || ST.slug(p.name)).replace(/^player-/, '');
    const scope = require('./lib/deploy-scope').scopeOf(event);
    const by = g.session.username, at = new Date().toISOString();
    const meta = { playerId: String(p.id), player: p.name, by, at, consent: p.photo_consent === true ? 'player-flag' : 'confirmed-by-staff',
      guardian: !!b.guardianConsent, width: web.size.width, height: web.size.height };

    // Originals: private, never served publicly.
    const originals = await ST.blobStore(event, ST.storeName(scope, 'photo-originals'));
    if (orig) await originals.set(slug + '/' + hash + '.jpg', orig.buf, { metadata: Object.assign({}, meta, { width: orig.size.width, height: orig.size.height }) });

    let photoUrl;
    if (scope.production) {
      if (!process.env.GITHUB_TOKEN) return resp(200, { ok: false, retry: true, error: 'The website photo store is not configured. Nothing has changed.' });
      photoUrl = '/img/players/' + slug + '-' + hash + '.jpg';
      const ok = await (deps.commitImage || commitImage)(photoUrl.slice(1), web.buf, 'Player photo: ' + p.name + ' (' + by + ')');
      if (!ok) return resp(200, { ok: false, retry: true, error: 'The photo could not be saved to the website. The player’s existing photo is unchanged — please try again.' });
      await R.patch(p.id, { photo_url: photoUrl });
    } else {
      const webStore = await ST.blobStore(event, ST.storeName(scope, 'photos'));
      await webStore.set(hash + '.jpg', web.buf, { metadata: meta });
      photoUrl = '/.netlify/functions/squad-data?photo=' + hash;
      const r = await R.mutate((ps) => { const x = ps.find((q) => String(q.id) === String(p.id)); if (!x) return undefined; x.photo_url = photoUrl; return ps; });
      if (!r.changed) return resp(200, { ok: false, retry: true, error: 'The photo was not attached. Please try again.' });
    }
    try { await AZ.audit({ action: 'roster_photo_updated', targetUser: p.name, actorUsername: by, actorRole: g.session.role,
      capability: AZ.CAP.MANAGE_ROSTER, result: 'success', before: { photo: p.photo_url || null }, after: { photo: photoUrl } }); } catch (e) { /* best effort */ }

    const website = await PUB.publishAndVerify(scope,
      (ps) => ps.some((x) => x.name === p.name && (x.photo === photoUrl || x.photo_url === photoUrl)),
      Object.assign({ previewPlayers: async () => (await R.list()).filter((x) => ST.CURRENT.indexOf(x.status) > -1) }, deps.publish));
    return resp(200, { ok: true, photo: photoUrl, original: !!orig, website });
  } catch (e) {
    if (e && e.code === 'busy') return resp(409, { ok: false, error: 'Someone else saved at the same moment. Please try again.' });
    console.error('[squad-photo]', (e && e.message) || e);
    return resp(200, { ok: false, retry: true, error: 'The photo could not be saved just now. The player’s existing photo is unchanged.' });
  }
};

exports._internal = { decode, LIMITS };
