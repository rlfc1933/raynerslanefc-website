// The portal supporter CRM, and the deferral states.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const ADMIN = require('../netlify/functions/fan-admin.js');

test('SUPPORTER DATA STAYS RESTRICTED', async (t) => {
  await t.test('every view refuses without the portal gate', async () => {
    for (const view of ['summary', 'member', 'search', 'notifications', 'note', 'export']) {
      const out = await ADMIN.handler({ httpMethod: 'POST', body: JSON.stringify({ view }) });
      assert.strictEqual(out.statusCode, 401, view + ' must refuse');
      const body = JSON.parse(out.body);
      assert.ok(!body.summary && !body.member && !body.csv, view + ' leaked data with the refusal');
    }
  });
  await t.test('a full phone number never appears in the member feed', () => {
    const src = strip(read('netlify/functions/fan-admin.js'));
    const latest = /async function latest\(limit\)[\s\S]*?\n}/.exec(src)[0];
    assert.ok(!/e164/.test(latest.split('mobileOf')[1] || ''),
      'the list shows status only — a number on a list somebody scrolls past on ' +
      'a shared screen is a leak waiting to happen');
    assert.match(latest, /mobile: mobileOf\[r\.id\] \|\| 'not_provided'/);
  });
  await t.test('the staff profile masks the number', () => {
    assert.match(strip(read('netlify/functions/fan-admin.js')), /masked: PHONE\.mask\(mobile\.e164\)/);
  });
});

test('AN EXPORT LEAVES A TRACE', async (t) => {
  const src = strip(read('netlify/functions/fan-admin.js'));
  await t.test('a reason and a name are required', () => {
    assert.match(src, /reason\.length < 3/);
    assert.match(src, /if \(!who\) return resp\(200, \{ ok: false, error: 'Who is exporting this\?' \}\)/);
  });
  await t.test('an audit row is written before the data is returned', () => {
    const block = /if \(view === 'export'[\s\S]*?\n    \}/.exec(src)[0];
    assert.ok(block.indexOf('fan_export_audit') < block.indexOf('toCsv(rows)'),
      'the audit must not depend on the export succeeding');
  });
  await t.test('it exports the agreed fields and nothing else', () => {
    const csv = ADMIN._internal.toCsv([{ first_name: 'A', last_name: 'B',
      membership_number: '1042', e164: '+447400123456', consented_at: 'x',
      wording_version: 'whatsapp-2026-08', signup_source: 'programme:fwp-1' }]);
    ['Lane number', 'Mobile (E.164)', 'WhatsApp consent date'].forEach((h) =>
      assert.ok(csv.includes(h), 'missing column ' + h));
    [/programme.?history/i, /loyalty/i, /auth_user/i, /token/i, /note/i].forEach((banned) =>
      assert.doesNotMatch(csv, banned, 'must not export ' + banned));
  });
  await t.test('a spreadsheet cannot execute a supporter name', () => {
    const c = ADMIN._internal.csvCell;
    ['=SUM(A1)', '+1+1', '-2+3', '@SUM(A1)'].forEach((evil) => {
      const out = c(evil);
      assert.ok(out.startsWith('"\''), 'formula not neutralised: ' + out);
    });
    assert.strictEqual(c('O"Brien'), '"O""Brien"', 'quotes must still escape properly');
  });
});

test('THE 50 IS COUNTED FROM CONSENT, NOT FROM NUMBERS', async (t) => {
  const src = strip(read('netlify/functions/fan-admin.js'));
  await t.test('it reads the eligibility view', () => {
    assert.match(src, /count\('fan_whatsapp_eligible'/,
      'counting fan_contact_numbers would include people who agreed to nothing');
  });
  await t.test('the three named states', () => {
    assert.match(src, /'Ready to prepare launch'/);
    assert.match(src, /'Nearly ready'/);
    assert.match(src, /'Building the community'/);
    assert.match(src, /eligible >= 40/);
    assert.strictEqual(ADMIN._internal.WHATSAPP_TARGET, 50);
  });
  await t.test('reaching 50 offers an export and nothing else', () => {
    const ui = read('admin.html');
    assert.match(ui, /w\.ready \? '<p style="margin:12px 0 0"><button class="btn" onclick="supExport\(\)">/);
    assert.ok(!/createGroup|sendMessage|uploadContacts/i.test(ui),
      'reaching the target must not message anybody or create a group');
    assert.match(ui, /Nothing is sent and no group exists/);
  });
});

test('SHARED NUMBERS ARE SURFACED, NEVER MERGED', async (t) => {
  await t.test('the server counts other holders', () => {
    assert.match(strip(read('netlify/functions/fan-admin.js')), /sharedWithOtherMembers/);
  });
  await t.test('the portal warns instead of acting', () => {
    const ui = read('admin.html');
    assert.match(ui, /Families share phones/);
    assert.match(ui, /Nothing has been merged/);
  });
});

test('DEFERRED IS NOT FAILED', async (t) => {
  await t.test('no provider means park, not retry', () => {
    const src = strip(read('netlify/functions/lib/fan/notify.js'));
    const drain = /async function drain\(opts\)[\s\S]*?\n  let sent/.exec(src)[0];
    assert.match(drain, /if \(!process\.env\.RESEND_API_KEY\)/);
    assert.match(drain, /disabled_unconfigured/);
    assert.ok(drain.indexOf('RESEND_API_KEY') < drain.indexOf('due'),
      'the early return must come before anything is selected for sending');
  });
  await t.test('the database allows that state', () => {
    const sql = read('supabase/migrations/20260804200000_outbox_deferred_state.sql');
    assert.match(sql, /'disabled_unconfigured'/);
    assert.match(sql, /drop constraint if exists/, 'and replaces the old constraint');
  });
  await t.test('health reports deferral as deferral', () => {
    const src = strip(read('netlify/functions/fan-health.js'));
    assert.match(src, /brandedClubEmail: \{ state: 'Deferred'/);
    assert.match(src, /authenticationEmail: \{ state: 'Active'/);
    assert.match(src, /check\('Club notifications', true,/,
      'a thing nobody chose to break must not show as a failure — an amber panel ' +
      'people learn to ignore is worse than no panel');
  });
});

test('THE PORTAL DOES NOT LIE ABOUT AN EMPTY LIST', async (t) => {
  await t.test('an error is distinguishable from having no members', () => {
    const ui = read('admin.html');
    assert.match(ui, /Could not load supporters/);
    assert.match(ui, /No Fan Zone members yet/);
  });
});
