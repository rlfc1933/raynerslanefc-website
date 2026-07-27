#!/usr/bin/env node
/**
 * THE ARCHIVE — match photograph ingest.
 *
 * Turns a folder of raw camera/phone photographs into a properly named, properly
 * sized, credited set of images filed under the fixture they belong to, and adds
 * them to data/gallery.json in one go.
 *
 *   node tools-archive-match.js --fixture fwp-578225 --from ~/Desktop/lane-photos --credit "A. Volunteer"
 *
 * WHY THIS EXISTS (ROADMAP.md F1 — The Archive Ritual)
 * The staff portal uploads ONE photo at a time, at full size, straight into
 * img/uploads/ with a timestamp filename. Ten photographs from one match is ten
 * saves, ten GitHub commits, up to twenty Netlify builds, ~40 MB into the repo
 * forever, no photographer credit and no way to ask "show me the Wallingford
 * game" in ten years' time. That makes the archive ritual expensive, and an
 * expensive ritual does not survive February.
 *
 * This makes it one command and one commit.
 *
 * WHAT IT WILL NOT DO
 *  - It will not run without a credit. VISION.md principle 6: the volunteer who
 *    took the photograph is part of the record, not metadata.
 *  - It will not invent a fixture. The id must exist in data/fixtures.json —
 *    same discipline as import-fixtures.js, which fails rather than guesses.
 *  - It will not overwrite an existing archive folder unless you pass --force.
 *
 * Uses sharp, already in node_modules. No install, no network, no build.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = __dirname;
const FIXTURES = path.join(ROOT, 'data', 'fixtures.json');
const GALLERY = path.join(ROOT, 'data', 'gallery.json');
const ARCHIVE = path.join(ROOT, 'img', 'matchday');

// Web size and thumbnail. 1600px is the largest any layout on the site uses;
// anything bigger is bytes nobody sees. WebP for browsers that take it, JPEG so
// the archive is still openable by a human in 2046 without special software.
const FULL = 1600;
const THUMB = 480;
const OK_INPUT = /\.(jpe?g|png|webp|heic|heif|tiff?)$/i;

function die(msg) { console.error('\n  ✗ ' + msg + '\n'); process.exit(1); }
function slug(s) {
  return String(s).toLowerCase().replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
// "2026-08-01" -> "2026-27". The season turns on 1 July, which is how the
// club's own fixture list is grouped.
function seasonOf(iso) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
  const start = m >= 7 ? y : y - 1;
  return start + '-' + String(start + 1).slice(2);
}

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}

(async function main() {
  const fixtureId = arg('fixture');
  const from = arg('from');
  const credit = arg('credit');
  const dryRun = !!arg('dry-run', false);
  const force = !!arg('force', false);

  if (!fixtureId || !from || typeof credit !== 'string' || !credit.trim()) {
    console.log(`
  THE ARCHIVE — match photograph ingest

    node tools-archive-match.js --fixture <id> --from <folder> --credit "<name>"

    --fixture   a fixture id from data/fixtures.json  (e.g. fwp-578225)
    --from      folder of raw photographs
    --credit    who took them — required, they go in the record
    --dry-run   show what would happen, write nothing
    --force     allow writing into an archive folder that already exists

  Find a fixture id:
    node -e "require('./data/fixtures.json').fixtures.filter(f=>f.date>='$(date +%Y-%m-%d)').slice(0,5).forEach(f=>console.log(f.id,f.date,f.opponent))"
`);
    process.exit(1);
  }

  // ── the fixture must be real ──
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES, 'utf8')).fixtures || [];
  const fx = fixtures.find(f => f.id === fixtureId);
  if (!fx) {
    const near = fixtures.filter(f => f.date >= new Date().toISOString().slice(0, 10)).slice(0, 6);
    die(`No fixture "${fixtureId}" in data/fixtures.json.\n    Nothing was written — a photograph filed against a match that doesn't\n    exist is worse than one that isn't filed.\n\n    Next few fixtures:\n` +
        near.map(f => `      ${f.id.padEnd(24)} ${f.date}  ${f.opponent}`).join('\n'));
  }

  const srcDir = path.resolve(from.replace(/^~/, process.env.HOME || '~'));
  if (!fs.existsSync(srcDir)) die(`Folder not found: ${srcDir}`);
  const files = fs.readdirSync(srcDir).filter(f => OK_INPUT.test(f)).sort();
  if (!files.length) die(`No images in ${srcDir}`);

  const season = seasonOf(fx.date);
  const oppSlug = slug(fx.opponent);
  const folder = `${fx.date}-${oppSlug}`;
  const outDir = path.join(ARCHIVE, season, folder);
  const relBase = `img/matchday/${season}/${folder}`;

  if (fs.existsSync(outDir) && !force) {
    die(`${relBase} already exists.\n    Re-run with --force to add to it. Nothing was written.`);
  }

  console.log(`\n  ${fx.isHome ? 'HOME' : 'AWAY'}  Rayners Lane v ${fx.opponent}`);
  console.log(`  ${fx.date}  ${fx.competition}  ·  season ${season}`);
  console.log(`  ${files.length} photograph${files.length === 1 ? '' : 's'} → ${relBase}`);
  console.log(`  credit: ${credit.trim()}${dryRun ? '   [DRY RUN — nothing will be written]' : ''}\n`);

  if (!dryRun) fs.mkdirSync(outDir, { recursive: true });

  const entries = [];
  let bytesIn = 0, bytesOut = 0;

  for (let i = 0; i < files.length; i++) {
    const seq = String(i + 1).padStart(2, '0');
    const stem = `${fx.date}-${oppSlug}-${seq}`;
    const inPath = path.join(srcDir, files[i]);
    bytesIn += fs.statSync(inPath).size;

    let meta;
    try {
      meta = await sharp(inPath).metadata();
    } catch (e) {
      console.log(`   ⚠ skipped ${files[i]} — not readable as an image`);
      continue;
    }

    // .rotate() with no argument honours the EXIF orientation phones write.
    // Without it, portrait photographs from an iPhone arrive on their side.
    const base = sharp(inPath).rotate();

    if (!dryRun) {
      await base.clone().resize({ width: FULL, withoutEnlargement: true })
        .webp({ quality: 80 }).toFile(path.join(outDir, stem + '.webp'));
      await base.clone().resize({ width: FULL, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(outDir, stem + '.jpg'));
      await base.clone().resize({ width: THUMB, withoutEnlargement: true })
        .webp({ quality: 74 }).toFile(path.join(outDir, stem + '-thumb.webp'));
      await base.clone().resize({ width: THUMB, withoutEnlargement: true })
        .jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(outDir, stem + '-thumb.jpg'));
      bytesOut += ['.webp', '.jpg', '-thumb.webp', '-thumb.jpg']
        .reduce((a, ext) => a + fs.statSync(path.join(outDir, stem + ext)).size, 0);
    }

    entries.push({
      id: `md-${fx.date}-${oppSlug}-${seq}`,
      src: `${relBase}/${stem}.jpg`,
      srcWebp: `${relBase}/${stem}.webp`,
      thumb: `${relBase}/${stem}-thumb.jpg`,
      thumbWebp: `${relBase}/${stem}-thumb.webp`,
      label: `${fx.isHome ? 'Rayners Lane v ' + fx.opponent : fx.opponent + ' v Rayners Lane'}`,
      cat: 'matchday',
      fixtureId: fx.id,
      date: fx.date,
      season: season,
      credit: credit.trim(),
      w: Math.min(meta.width || FULL, FULL),
    });

    process.stdout.write(`\r   ${seq}/${files.length}  ${stem}          `);
  }
  console.log('\n');

  // ── merge into gallery.json, newest match first, no duplicates ──
  const gal = JSON.parse(fs.readFileSync(GALLERY, 'utf8'));
  const existing = (gal.items || []).filter(it => !entries.some(e => e.id === it.id));
  const merged = entries.concat(existing);

  if (!dryRun) {
    gal.items = merged;
    gal.updatedAt = fx.date;   // the archive is dated by the match, not by when we imported it
    fs.writeFileSync(GALLERY, JSON.stringify(gal, null, 2) + '\n');
  }

  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`  ${entries.length} filed${dryRun ? ' (dry run)' : ''}`);
  if (!dryRun) console.log(`  ${kb(bytesIn)} of camera files → ${kb(bytesOut)} in the repo`);
  console.log(`  gallery.json: ${merged.length} items total\n`);
  console.log(`  Next:  git add img/matchday data/gallery.json`);
  console.log(`         git commit -m "Archive: ${fx.date} v ${fx.opponent} (${entries.length} photographs, ${credit.trim()})"\n`);
  console.log(`  ONE commit. One build. Not ${entries.length}.\n`);
})().catch(e => die(e.message));
