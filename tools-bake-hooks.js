// Stamp a shareHeadline onto every fixture in data/fixtures.json.
//
// The public share card must never generate a hook — it reads a stored field.
// This is what stores it. Run it after adding fixtures:  node tools-bake-hooks.js
//
// Safe to re-run. A hook a human has edited is left alone: we only write where
// the field is missing, or where it still matches what this engine last produced
// (tracked via shareHeadlineAuto). Staff edits win, always.
const fs = require('fs');
require('./js/hooks.js');
const H = globalThis.rlHooks;

const P = './data/fixtures.json';
const doc = JSON.parse(fs.readFileSync(P, 'utf8'));
const opponents = JSON.parse(fs.readFileSync('./data/opponents.json', 'utf8')).opponents;

// Opening day is the first LEAGUE game of the season, not the first fixture —
// pre-season friendlies come before it and are not "the wait is over".
const sorted = doc.fixtures.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
const opener = sorted.find((f) => /combined counties/i.test(f.competition || ''));

let wrote = 0, kept = 0, edited = 0;
doc.fixtures.forEach((f) => {
  const o = H.findOpponent(opponents, f.opponent);
  const hook = H.fixtureHook(f, o, { opener: f === opener });
  if (f.shareHeadline && f.shareHeadline !== f.shareHeadlineAuto) { edited++; kept++; return; }  // a human wrote this
  if (f.shareHeadline === hook) { kept++; return; }
  f.shareHeadline = hook;
  f.shareHeadlineAuto = hook;   // remember what WE wrote, so an edit is detectable
  wrote++;
});

doc.updatedAt = new Date().toISOString();
fs.writeFileSync(P, JSON.stringify(doc, null, 2));

const all = doc.fixtures.map((f) => f.shareHeadline);
console.log(`  fixtures: ${doc.fixtures.length}`);
console.log(`  written: ${wrote} | unchanged: ${kept} (of which human-edited and preserved: ${edited})`);
console.log(`  distinct hooks: ${new Set(all).size}`);
const missing = doc.fixtures.filter((f) => !f.shareHeadline);
console.log(`  fixtures with no hook: ${missing.length ? missing.map((f) => f.opponent).join(', ') : 'none'}`);
