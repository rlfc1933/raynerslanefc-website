// The programme skills are real workflows (every required section, every file
// they point at exists), and the archive never ships as a blank loading state.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SKILLS = ['fixture-intelligence', 'archive-recovery', 'football-data', 'team-sheets', 'editorial-director',
  'art-director', 'typography-layout', 'mobile-reader', 'print-pdf', 'sponsor-director', 'heritage-researcher',
  'content-researcher', 'chairman-assistant', 'publishing-orchestrator', 'news-intelligence', 'accessibility-audit',
  'visual-regression', 'fact-verification', 'analytics', 'failure-recovery'].map((s) => 'programme-' + s);
const SECTIONS = ['## Purpose', '## When to invoke', '## Required inputs', '## Authoritative data sources', '## Workflow',
  '## Expected output', '## Error handling', '## Approval requirements', '## Verification tests', '## Other skills it may call'];

test('all twenty programme skills exist with every required section', () => {
  SKILLS.forEach((name) => {
    const f = path.join(ROOT, '.claude/skills', name, 'SKILL.md');
    assert.ok(fs.existsSync(f), 'missing ' + name);
    const s = fs.readFileSync(f, 'utf8');
    assert.match(s, new RegExp('^---\\nname: ' + name + '\\ndescription: .{40,}\\n---', 'm'));
    SECTIONS.forEach((h) => assert.ok(s.includes(h), name + ' lacks ' + h));
  });
});

test('every file, test and skill a programme skill points at actually exists', () => {
  const skills = fs.readdirSync(path.join(ROOT, '.claude/skills'));
  SKILLS.forEach((name) => {
    const s = fs.readFileSync(path.join(ROOT, '.claude/skills', name, 'SKILL.md'), 'utf8');
    (s.match(/`((?:netlify|tests|js|css|quality)\/[\w./-]+\.(?:js|css))`/g) || []).forEach((m) => {
      const p = m.replace(/`/g, '');
      assert.ok(fs.existsSync(path.join(ROOT, p)), name + ' points at a missing file: ' + p);
    });
    (s.match(/tests\/[\w.-]+\.test\.js/g) || []).forEach((p) => {
      assert.ok(fs.existsSync(path.join(ROOT, p)), name + ' cites a missing test: ' + p);
    });
    const calls = s.slice(s.indexOf('## Other skills it may call')).match(/^- ([\w-]+)$/gm) || [];
    calls.map((c) => c.slice(2)).forEach((c) => assert.ok(skills.includes(c), name + ' calls an unknown skill: ' + c));
  });
});

test('the archive ships real content, not a loading placeholder', () => {
  const html = fs.readFileSync(path.join(ROOT, 'programmes.html'), 'utf8');
  assert.ok(!/Loading the collection/.test(html), 'the old blank state is back');
  const BAKE = require('../netlify/functions/lib/programme/bake-ledger');
  const a = html.indexOf(BAKE.START) + BAKE.START.length;
  const b = html.indexOf(BAKE.END);
  assert.strictEqual(html.slice(a, b).trim(), BAKE.bakedHtml().trim(),
    'the baked ledger was hand-edited or is stale — run node netlify/functions/lib/programme/bake-ledger.js');
  const block = html.slice(a, b);
  ['Wallingford', 'New Bradwell St Peter', 'Ardley United', 'Thatcham Town'].forEach((t) => assert.ok(block.includes(t), t));
  assert.match(block, /FA Vase/, 'the cup tie is listed');
  assert.match(block, /Wokingham Town[\s\S]*?Postponed/);
  assert.match(block, /Archive edition in preparation/, 'the missing Hilltop edition is stated, not hidden');
  assert.ok(!/Broadfields United<\/span><span class="pg-led__c">[^<]*<\/span><span class="pg-led__res">/.test(block),
    'the 4 Aug away fixture at the shared ground is not a home match');
});

test('the library tells a failure apart from an empty collection', () => {
  const s = fs.readFileSync(path.join(ROOT, 'js/programme-library.js'), 'utf8');
  assert.match(s, /function failed\(\)/);
  assert.match(s, /could not be loaded/);
  // the session wait is bounded
  assert.match(s, /grace\(Promise\.all\(\[crestsReady, sessionReady\]\), 2500\)/);
  // a failed response goes to failed(), never to the empty-collection message
  assert.match(s, /if \(!d \|\| d\.ok !== true \|\| !Array\.isArray\(d\.editions\)\) \{ failed\(\); return; \}/);
});

test('programmes never offer what the club cannot sell (shared ground)', () => {
  ['netlify/functions/lib/programme/generate.js', 'netlify/functions/programme-sync.js'].forEach((f) => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/pitch[- ]side|ground naming|hospitality/i.test(code), f + ' offers ground rights');
  });
});
