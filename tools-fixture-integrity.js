#!/usr/bin/env node
/**
 * FIXTURE INTEGRITY — the Stage 0 backfill for Match Day Operations.
 *
 *   node tools-fixture-integrity.js            # dry run — prints, changes nothing
 *   node tools-fixture-integrity.js --write    # applies the changes
 *
 * WHY THIS EXISTS
 * data/fixtures.json is the canonical fixture spine, and Match Day Ops keys
 * every operational record to a fixture id. Two things were missing from it:
 *
 *   1. `season`. NO code path ever wrote it. The 42 fixtures that carry it got
 *      it from a one-off commit (f3679bf). Any fixture a staffer added since
 *      was season-less — and therefore invisible to a season-scoped view.
 *   2. `competitionId`. `competition` is free text ("FA Cup EP"), so revenue
 *      per competition could not be grouped without a stable key.
 *
 * And `status` had two spellings of one state ('ft' and 'played').
 *
 * WHAT IT WILL NOT DO
 *  - It will not touch id, date, kickoff, opponent, venue, isHome, us, them or
 *    scorers. Those are the club's record of what happened.
 *  - It will not rewrite the human-readable `competition` label. That is what
 *    the public site shows.
 *  - It will not GUESS a competitionId. A label with no confident mapping is
 *    left without one and printed in an UNMAPPED report for a human to read.
 *    An honest gap beats a wrong join key.
 *  - It will not write anything without --write.
 *
 * Re-runnable: running it twice changes nothing the second time.
 */

const fs = require('fs');
const path = require('path');
const MDC = require('./js/matchday-core.js');

const ROOT = __dirname;
const FIXTURES = path.join(ROOT, 'data', 'fixtures.json');
const COMPS = path.join(ROOT, 'data', 'competitions.json');

const WRITE = process.argv.includes('--write');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const doc = readJSON(FIXTURES);
  const list = doc.fixtures;
  if (!Array.isArray(list)) {
    console.error('data/fixtures.json has no `fixtures` array — refusing to touch it.');
    process.exit(1);
  }
  const known = (readJSON(COMPS).competitions) || [];

  const changes = [];
  const unmapped = new Map();

  list.forEach(function (f) {
    const before = JSON.stringify(f);
    const touched = [];

    // 1 · SEASON — derived from the fixture's own date, never assumed.
    const season = MDC.seasonOf(f.date);
    if (season && f.season !== season) {
      touched.push(`season ${f.season === undefined ? '(absent)' : JSON.stringify(f.season)} → "${season}"`);
      f.season = season;
    }

    // 2 · STATUS — one vocabulary. 'ft' becomes 'played'.
    const status = MDC.normaliseFixtureStatus(f.status);
    if (f.status !== status) {
      touched.push(`status ${JSON.stringify(f.status)} → "${status}"`);
      f.status = status;
    }

    // 3 · COMPETITION ID — additive, explicit, never guessed.
    const cid = MDC.competitionIdFor(f.competition, known);
    if (cid) {
      if (f.competitionId !== cid) {
        touched.push(`competitionId ${f.competitionId === undefined ? '(absent)' : JSON.stringify(f.competitionId)} → "${cid}"`);
        f.competitionId = cid;
      }
    } else if (f.competition) {
      // No confident mapping. Say so; leave the fixture alone.
      const kind = MDC.fixtureKind(f.competition);
      const key = f.competition;
      if (!unmapped.has(key)) unmapped.set(key, { count: 0, kind: kind });
      unmapped.get(key).count++;
    }

    if (touched.length) changes.push({ id: f.id, date: f.date, opponent: f.opponent, touched: touched });
    if (before === JSON.stringify(f) && touched.length) {
      throw new Error('internal: reported a change that did not happen for ' + f.id);
    }
  });

  // ── REPORT ─────────────────────────────────────────────────────────────
  console.log('\nFIXTURE INTEGRITY' + (WRITE ? '  —  WRITING' : '  —  DRY RUN (use --write to apply)'));
  console.log('='.repeat(64));
  console.log(`fixtures read        : ${list.length}`);
  console.log(`fixtures changed     : ${changes.length}`);

  if (changes.length) {
    console.log('\nCHANGES');
    changes.forEach(function (c) {
      console.log(`  ${c.date}  ${c.id}`);
      console.log(`      vs ${c.opponent}`);
      c.touched.forEach(function (t) { console.log(`      · ${t}`); });
    });
  }

  console.log('\nCOMPETITION MAPPING');
  const mapped = {};
  list.forEach(function (f) {
    if (!f.competitionId) return;
    const k = f.competition + '  →  ' + f.competitionId;
    mapped[k] = (mapped[k] || 0) + 1;
  });
  Object.keys(mapped).sort().forEach(function (k) {
    console.log(`  ✓ ${k}   (${mapped[k]})`);
  });

  if (unmapped.size) {
    console.log('\nUNMAPPED — left WITHOUT a competitionId on purpose:');
    for (const [label, info] of unmapped) {
      const why = info.kind
        ? `classified as a ${info.kind} — not a competition the club has entered`
        : 'no entry in data/competitions.json and no alias in js/matchday-core.js';
      console.log(`  ! "${label}"  (${info.count})`);
      console.log(`      ${why}`);
    }
    console.log('\n  These still work in Match Day Ops — they group under their');
    console.log('  human label instead of a competition id. To map one, either add');
    console.log('  it to data/competitions.json or add an alias to');
    console.log('  js/matchday-core.js → COMPETITION_ALIASES. Do NOT guess.');
  }

  if (!WRITE) {
    console.log('\nNothing written. Re-run with --write to apply.\n');
    return;
  }
  if (!changes.length) {
    console.log('\nAlready consistent — nothing to write.\n');
    return;
  }

  doc.updatedAt = new Date().toISOString();
  fs.writeFileSync(FIXTURES, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`\nWrote data/fixtures.json (${changes.length} fixture(s) updated).\n`);
}

main();
