#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   ASSET STUDIO — build the repository half of the asset library.

     node js/studio/tools/build-library.js

   Writes js/studio/library-seed.json: every genuine club asset already in the
   repository, with the metadata the Studio needs to use it safely — real pixel
   dimensions (read from the file header, never guessed), category, where it
   came from, who holds the rights as far as the repository records it, and an
   approval state. Uploaded assets live in Supabase (studio_assets) and are
   merged over this list at runtime.

   WHAT IS DELIBERATELY LEFT OUT
   • img/creative/** — generated campaign plates, not photography.
   • img/news/*.svg, img/players/*.svg — placeholders and illustrations.
   • Thumbnails and .webp twins — the Studio always draws from the largest
     original so print exports are not built from a 400px copy.

   The hero-film stills ARE listed, but as `needs_review`: the station roundel
   in that footage reads "Rayers Lane", which is not a photograph of the real
   station. Nobody should put that on a poster until a person has decided.
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'js', 'studio', 'library-seed.json');

/** Pixel size from a PNG or JPEG header. Returns null for anything else. */
function dims(file) {
  const b = fs.readFileSync(file);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), format: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), format: 'jpeg' };
      }
      i += 2 + len;
    }
  }
  return null;
}
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const assets = [];
function add(file, meta) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return;
  const d = dims(abs);
  if (!d) return;
  assets.push(Object.assign({
    id: 'repo:' + file,
    src: file,
    w: d.w, h: d.h, format: d.format,
    source: 'repository',
    version: 1,
  }, meta));
}

// ── Official club identity ────────────────────────────────────────────────
add('img/badge.png', {
  title: 'Club crest (master)', category: 'identity',
  rights_holder: 'Rayners Lane Football Club Limited', licence: 'Club-owned mark',
  approval: 'approved', usage: 'Every template. Never recoloured, cropped or stretched.',
});

// ── Player photographs (the squad page set) ───────────────────────────────
const players = (read('data/players.json').players || []).filter((p) => p.photo);
for (const p of players) {
  const jpg = p.photo.replace(/^\//, '').replace(/\.webp$/, '.jpg');
  add(jpg, {
    title: p.name, category: 'player',
    rights_holder: 'Rayners Lane FC (club squad photography)',
    licence: 'Club use — photographer not recorded in the repository',
    approval: 'approved', usage: 'Published on the squad page.',
    related: { player: p.id },
    // Squad portraits are framed head-and-shoulders. This is the zone text must
    // not cover; it is the framing convention, not face detection.
    subject: { x: 0.18, y: 0.04, w: 0.64, h: 0.5, basis: 'squad portrait framing' },
  });
}

// ── Ground photography ────────────────────────────────────────────────────
const GROUND = {
  'img/ground/tithe-farm-aerial-wide-1600.jpg': 'Tithe Farm from above',
  'img/ground/tithe-farm-aerial-clubhouse-1600.jpg': 'The pitch and clubhouse from above',
  'img/ground/tithe-farm-goalmouth-1600.jpg': 'Goalmouth at Tithe Farm',
};
for (const f of Object.keys(GROUND)) {
  add(f, {
    title: GROUND[f], category: 'ground',
    rights_holder: 'Rayners Lane FC (club photography)', licence: 'Club use',
    approval: 'approved', usage: 'Published on the website. The ground is shared — never imply the club owns it.',
  });
}

// ── Committee portraits — identity of named officials, not general imagery ─
for (const f of ['img/committee/pete-singh.jpg', 'img/committee/nigel-hanlon.jpg']) {
  add(f, {
    title: f.indexOf('pete') > -1 ? 'Pete Singh, Chairman' : 'Nigel Hanlon, Vice Chairman',
    category: 'team', rights_holder: 'Rayners Lane FC', licence: 'Club use — named official',
    approval: 'approved', usage: 'Club statements and committee announcements only.',
    subject: { x: 0.15, y: 0.04, w: 0.7, h: 0.5, basis: 'portrait framing' },
  });
}

// ── Promotional film stills — held for review, see header ─────────────────
add('video/hero-poster-1920.jpg', {
  title: 'Promotional film still (station)', category: 'matchday',
  rights_holder: 'Rayners Lane FC', licence: 'Club use',
  approval: 'needs_review',
  usage: 'Not cleared: the station sign in this frame reads "Rayers Lane". Confirm the source before any use.',
});

// ── Opponent crests ───────────────────────────────────────────────────────
const crests = (read('data/crests.json').crests || []).filter((c) => /^img\/crests\//.test(c.file));
for (const c of crests) {
  if (!/\.png$/.test(c.file)) continue;            // SVG crests are drawn at runtime, not measured here
  add(c.file, {
    title: c.name + ' crest', category: 'crest',
    rights_holder: c.name, licence: 'Fixture identification only (editorial)',
    approval: 'approved', usage: 'Identifies the opponent on fixture and result graphics. Never altered.',
    related: { opponent: c.name },
  });
}

// ── Sponsor logos: version 1 is what the repository already approves ──────
const partners = read('data/partners.json');
// Which background each colour logo was DRAWN for. Checked by eye on light and
// dark grounds (2026-10-09): HDL, McCafferty's, AHiQ and Acerbis carry white
// lettering and vanish on a light plate; Ashwood and The King are dark-on-light.
// A logo placed on the wrong ground loses half its words, so this is data, not taste.
const LOGO_GROUND = { acerbis: 'dark', hdl: 'dark', mccafferty: 'dark', ahiq: 'dark', ashwood: 'light', king: 'light',
  'mjm-sports': 'light', 'you-nique-training': 'dark' };
const sponsorsJson = read('data/sponsors.json').sponsors || [];
const logos = {};
const sponsors = [];
for (const key of Object.keys(partners.sponsors || {})) {
  const s = partners.sponsors[key];
  const colour = s.colour, white = s.white;
  const d = dims(path.join(ROOT, colour));
  if (!d) continue;
  sponsors.push({ key, name: s.name, role: s.role });
  logos[key] = [{
    version: 1, colour, white: white || null, ground: LOGO_GROUND[key] || 'light', w: d.w, h: d.h, ar: +(d.w / d.h).toFixed(4),
    source: 'repository', approval: 'approved', current: true,
    approved_at: partners.updatedAt || null, note: 'Pre-trimmed band artwork used by the sponsor rail.',
  }];
  add(colour, { title: s.name + ' logo', category: 'sponsor', rights_holder: s.name,
    licence: 'Sponsor agreement — club use while the partnership is current', approval: 'approved',
    usage: 'Sponsor acknowledgements and the partner rail.', related: { sponsor: key }, version: 1 });
}
const known = new Set(sponsors.map((s) => s.name.toLowerCase()));
for (const s of sponsorsJson) {
  if (!s || !s.name || known.has(s.name.toLowerCase())) continue;
  if (/league|\bfa\b|england football/i.test(s.name + ' ' + (s.tier || ''))) continue;   // governing bodies are not sponsors
  const key = slug(s.name);
  sponsors.push({ key, name: s.name, role: s.role || s.tier || 'Partner' });
  if (s.logo) {
    const d = dims(path.join(ROOT, s.logo));
    if (d) {
      logos[key] = [{ version: 1, colour: s.logo, white: null, ground: LOGO_GROUND[key] || 'light', w: d.w, h: d.h, ar: +(d.w / d.h).toFixed(4),
        source: 'repository', approval: 'approved', current: true, approved_at: null,
        note: 'Logo as listed in data/sponsors.json. Untrimmed; always placed on a light plate.' }];
      add(s.logo, { title: s.name + ' logo', category: 'sponsor', rights_holder: s.name,
        licence: 'Sponsor agreement — club use while the partnership is current', approval: 'approved',
        usage: 'Sponsor acknowledgements.', related: { sponsor: key }, version: 1 });
    }
  } else {
    logos[key] = [];
  }
}

const out = {
  _generated: 'js/studio/tools/build-library.js — do not edit by hand; re-run the tool.',
  assets: assets.sort((a, b) => (a.category + a.title).localeCompare(b.category + b.title)),
  sponsors,
  sponsorLogos: logos,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log('library-seed.json:', assets.length, 'assets,', sponsors.length, 'sponsors');
