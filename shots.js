// Capture TIGHT, element-level crops. Two rules:
//  1. Give away a taste, not the blueprint. A rival should think "how?", not
//     "I'll have that."
//  2. Publish nothing personal and nothing competitive. The old app shot showed
//     a phone number and the full availability list (who's in, who's out) —
//     that's team news and PII on a public sponsor page.
const puppeteer = require('puppeteer-core');
const CH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async () => {
  const b = await puppeteer.launch({ executablePath: CH, headless:'new', args:['--hide-scrollbars'] });

  // ── The Lane App: ONLY the match card. No signup row, no availability list.
  const p1 = await b.newPage();
  await p1.setViewport({ width: 420, height: 1500, deviceScaleFactor: 2 });
  await p1.goto('http://localhost:8753/playermanager1933.html?shot=DEMO', { waitUntil:'networkidle2' });
  await new Promise(r=>setTimeout(r,3000));
  await p1.evaluate(() => {
    // strip anything personal or tactical before the shutter
    document.querySelectorAll('.card,.sect,section,div').forEach(el=>{
      const t=(el.innerText||'');
      if (/SIGNED UP|APPROVE TO ADD|AVAILABILITY|NO REPLY/i.test(t) && el.getBoundingClientRect().height<700) el.remove();
    });
  });
  await new Promise(r=>setTimeout(r,400));
  const card = await p1.$('.card') || await p1.$('.screen');
  await card.screenshot({ path:'/tmp/s-app.png' });

  // ── Portal: ONLY the Next Match control. Not the 37-tool grid.
  const p2 = await b.newPage();
  await p2.setViewport({ width: 420, height: 1400, deviceScaleFactor: 2 });
  await p2.goto('http://localhost:8753/admin.html', { waitUntil:'networkidle2' });
  await p2.evaluate(() => {
    PIN='19332026';
    document.getElementById('pin-screen').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('dash-home').style.display='block';
    initDash();
  });
  await new Promise(r=>setTimeout(r,3500));
  const nm = await p2.$('.nm');
  await nm.screenshot({ path:'/tmp/s-portal.png' });

  // ── Post Studio: the generated graphic only, not the whole control panel.
  const p3 = await b.newPage();
  await p3.setViewport({ width: 460, height: 1600, deviceScaleFactor: 2 });
  await p3.goto('http://localhost:8753/admin.html', { waitUntil:'networkidle2' });
  await p3.evaluate(() => {
    PIN='19332026';
    document.getElementById('pin-screen').style.display='none';
    document.getElementById('app').style.display='block';
    openPanel('poststudio');
  });
  await new Promise(r=>setTimeout(r,4000));
  const cv = await p3.$('#ps-canvas-wrap') || await p3.$('canvas') || await p3.$('#panel-poststudio');
  await cv.screenshot({ path:'/tmp/s-studio.png' });

  await b.close(); console.log('captured');
})().catch(e=>{console.log('FAILED '+e.message)});
