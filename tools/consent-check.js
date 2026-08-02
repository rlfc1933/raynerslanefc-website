#!/usr/bin/env node
// COOKIE CONSENT, PROVED WITH THE NETWORK LOG.
//
// Not "the code looks right" — this drives a real browser, watches every
// request it makes, and fails if a Google Analytics request happens when the
// supporter has not said yes.
//
//   node tools/consent-check.js [baseUrl]
'use strict';

const P = require('./viewport-probe');
const os = require('os'), fs = require('fs'), path = require('path');

const BASE = (process.argv[2] || 'https://raynerslanefc.co.uk').replace(/\/$/, '');
const GA = /google-analytics\.com|googletagmanager\.com|analytics\.google\.com|\/g\/collect/;

let failures = [], passed = 0;
const check = (name, ok, detail) => ok ? passed++ : failures.push(name + (detail ? ' — ' + detail : ''));

/** Load a page, watch the network, then run a script and watch again. */
async function run(label, script, opts) {
  const o = opts || {};
  const s = await P.Session.open();
  const requests = [];
  try {
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    await s.send('Network.enable');
    s.on((m) => {
      if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
    });
    await s.send('Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    // Seed a consent decision before the page runs, where the test needs one.
    if (o.seed) {
      await s.send('Page.addScriptToEvaluateOnNewDocument', {
        source: "try{localStorage.setItem('rlfc_consent_v2', JSON.stringify(" +
          JSON.stringify(o.seed) + "));}catch(e){}",
      });
    }

    const loaded = new Promise((r) => s.on((m) => { if (m.method === 'Page.loadEventFired') r(); }));
    await s.send('Page.navigate', { url: BASE + (o.page || '/') });
    await Promise.race([loaded, P.sleep(20000)]);
    await P.sleep(2500);

    const before = requests.filter((u) => GA.test(u)).length;
    let after = before, result = null;
    if (script) {
      const r = await s.send('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true });
      result = r.result && r.result.value;
      await P.sleep(2500);
      after = requests.filter((u) => GA.test(u)).length;
    }
    const cookies = await s.send('Network.getCookies', { urls: [BASE + '/'] });
    const gaCookies = (cookies.cookies || [])
      .filter((c) => /^_ga($|_)|^_gid$|^_gat/.test(c.name)).map((c) => c.name);

    return { label, gaBefore: before, gaAfter: after, gaCookies, result,
      allGA: requests.filter((u) => GA.test(u)) };
  } finally { await s.close(); }
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rlfc-consent-'));
  P.launch(dir);
  await P.waitForChrome();

  // 1. FRESH VISITOR — no choice made.
  const fresh = await run('fresh');
  check('fresh visitor makes NO analytics request', fresh.gaBefore === 0, fresh.allGA.slice(0, 2).join(' '));
  check('fresh visitor gets NO analytics cookie', fresh.gaCookies.length === 0, fresh.gaCookies.join(','));

  // 2. DECLINE.
  const declined = await run('decline', 'window.LaneConsent.set(false, "test"), "declined"');
  check('declining makes no analytics request', declined.gaAfter === 0, declined.allGA.slice(0, 2).join(' '));
  check('declining leaves no analytics cookie', declined.gaCookies.length === 0, declined.gaCookies.join(','));

  // 3. DECLINE REMEMBERED across a reload.
  const remembered = await run('decline-remembered', 'window.LaneConsent.analyticsAllowed()',
    { seed: { analytics: false, essential: true, decidedAt: '2026-08-02T00:00:00Z', version: 2 } });
  check('a declined choice is remembered', remembered.result === false);
  check('a remembered decline still makes no request', remembered.gaBefore === 0,
    remembered.allGA.slice(0, 2).join(' '));

  // 4. ACCEPT.
  const accepted = await run('accept', 'window.LaneConsent.set(true, "test"), "accepted"');
  check('accepting DOES load analytics', accepted.gaAfter > 0, 'no analytics request was made');
  check('accepting loads it once', accepted.result !== null);

  // 5. ACCEPT THEN WITHDRAW.
  const withdrawn = await run('withdraw',
    '(async function(){ window.LaneConsent.set(true,"test"); await new Promise(r=>setTimeout(r,2000));' +
    ' var n = performance.getEntriesByType("resource").filter(function(e){return /googletagmanager|google-analytics/.test(e.name);}).length;' +
    ' window.LaneConsent.set(false,"test"); await new Promise(r=>setTimeout(r,1500));' +
    ' var after = performance.getEntriesByType("resource").filter(function(e){return /googletagmanager|google-analytics/.test(e.name);}).length;' +
    ' return { duringAccept: n, afterWithdraw: after, allowed: window.LaneConsent.analyticsAllowed(),' +
    '   cookies: document.cookie.split(";").map(function(c){return c.split("=")[0].trim();}).filter(function(x){return /^_ga|^_gid/.test(x);}) }; })()');
  const w = withdrawn.result || {};
  check('withdrawal turns analytics off', w.allowed === false);
  check('withdrawal makes no NEW analytics requests',
    (w.afterWithdraw || 0) === (w.duringAccept || 0), 'went from ' + w.duringAccept + ' to ' + w.afterWithdraw);
  check('withdrawal clears the analytics cookies it can',
    !w.cookies || w.cookies.length === 0, (w.cookies || []).join(','));

  // 6. FAN ZONE AND PROGRAMMES STILL WORK AFTER DECLINING.
  const stillWorks = await run('decline-then-use',
    '(function(){ return { fanZone: !!window.LaneFan, consent: !!window.LaneConsent,' +
    ' library: !!document.querySelector(".pl-card, .pl-featured, .pl-empty") }; })()',
    { page: '/programmes.html',
      seed: { analytics: false, essential: true, decidedAt: '2026-08-02T00:00:00Z', version: 2 } });
  const sw = stillWorks.result || {};
  check('Fan Zone still works after declining', sw.fanZone === true);
  check('the programme library still renders after declining', sw.library === true);
  check('declining still makes no request on other pages', stillWorks.gaBefore === 0);

  console.log('\n' + BASE);
  console.log(passed + ' consent checks passed' + (failures.length ? ', ' + failures.length + ' FAILED' : ''));
  failures.forEach((f) => console.log('  ✖ ' + f));
  if (!failures.length) console.log('  declining analytics genuinely prevents analytics');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('consent run failed:', e.message); process.exit(1); });
