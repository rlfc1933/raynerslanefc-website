// RELEASE GATE — the one command that must pass before anything is deployed.
//
//   cd quality && npm run gate
//   QUALITY_BASE_URL=https://deploy-preview-N--<site>.netlify.app npm run gate   (adds real performance scoring)
//
// Steps, in order, stopping at nothing so the report is complete:
//   1. unit + contract tests (root `npm test`, node:test)     — no NEW failures vs known-failures.json
//   2. fixture integrity (tools-fixture-integrity.js)
//   3. rendered gates (Playwright): responsive · a11y · keyboard · visual ·
//      journeys · motion · images · slop
//   4. Lighthouse budgets
// Exit 0 only if every step passes. Nothing here deploys anything.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const KNOWN = JSON.parse(fs.readFileSync(path.join(__dirname, 'known-failures.json'), 'utf8'));
const results = [];

function run(name, cmd, args, cwd, judge) {
  process.stdout.write(`\n━━ ${name} ━━\n`);
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });
  const out = (r.stdout || '') + (r.stderr || '');
  const verdict = judge ? judge(out, r.status) : { ok: r.status === 0, note: r.status === 0 ? '' : `exit ${r.status}` };
  results.push({ name, ...verdict });
  process.stdout.write(out.split('\n').slice(-25).join('\n') + '\n');
}

// 1 · unit tests. Pre-existing failures are listed, with a reason, in
// known-failures.json; anything else failing blocks the release. Fixing one of
// the listed tests and leaving it listed is reported so the list only shrinks.
run('unit + contract tests', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], ROOT, (out) => {
  const failing = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  const known = new Set(KNOWN.unitTests.map((k) => k.name));
  const fresh = failing.filter((f) => !known.has(f));
  const healed = [...known].filter((k) => !failing.includes(k));
  return {
    ok: fresh.length === 0,
    note: (fresh.length ? `NEW failures: ${fresh.join(' | ')}` : `${failing.length} known failure(s) only`) +
          (healed.length ? ` · now passing, remove from known-failures.json: ${healed.join(' | ')}` : ''),
  };
});

run('fixture integrity', process.execPath, ['tools-fixture-integrity.js'], ROOT);
run('rendered gates (Playwright)', process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--reporter=dot'], __dirname, (out, code) => {
  const m = out.match(/(\d+) failed/); const p = out.match(/(\d+) passed/);
  return { ok: code === 0, note: `${p ? p[1] : 0} passed${m ? `, ${m[1]} FAILED — open quality/.report/index.html` : ''}` };
});
run('Lighthouse budgets', process.execPath, ['lighthouse.js'], __dirname);

console.log('\n══════════ RELEASE GATE ══════════');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? ' — ' + r.note : ''}`);
const ok = results.every((r) => r.ok);
console.log(ok ? '\nGATE PASSED — safe to deploy.' : '\nGATE FAILED — do not deploy.');
process.exit(ok ? 0 : 1);
