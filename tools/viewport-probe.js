// A REAL viewport harness: headless Chrome driven over the DevTools Protocol.
//
// CSS inspection is not proof. The browser extension could not set a genuine
// narrow viewport — the window manager clamped it — so this drives Chrome
// directly with Emulation.setDeviceMetricsOverride, which sets the layout
// viewport exactly and is what device emulation in DevTools itself uses.
//
// No dependencies: Node's global WebSocket speaks CDP.
'use strict';

const { spawn } = require('child_process');
const http = require('http');

const CHROME = process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT || 9222);

function get(path, method) {
  return new Promise((res, rej) => {
    // /json/new requires PUT — Chrome deprecated GET for it and answers with a
    // plain-text warning instead of JSON, which looks like a parse error.
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method: method || 'GET' }, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(new Error(d.slice(0, 120))); } });
    });
    req.on('error', rej);
    req.end();
  });
}

async function waitForChrome(tries) {
  for (let i = 0; i < (tries || 60); i++) {
    try { return await get('/json/version'); } catch (e) { await sleep(250); }
  }
  throw new Error('Chrome did not expose a debugging port');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(userDir) {
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + userDir,
    '--window-size=1440,900',
    'about:blank',
  ];
  const p = spawn(CHROME, args, { stdio: 'ignore', detached: true });
  p.unref();
  return p;
}

/** One CDP session against a fresh tab. */
class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }
  static async open() {
    const t = await get('/json/new?about:blank', 'PUT');
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    s.targetId = t.id;
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && s.pending.has(msg.id)) {
        const { resolve, reject } = s.pending.get(msg.id);
        s.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        s.handlers.forEach((h) => h(msg));
      }
    };
    return s;
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  on(fn) { this.handlers.push(fn); }
  async close() { try { this.ws.close(); await get('/json/close/' + this.targetId); } catch (e) {} }
}

/**
 * Load a page at an exact viewport and run a measurement function in it.
 * Returns { result, consoleErrors, failedRequests }.
 */
async function measure(url, viewport, expression, opts) {
  const o = opts || {};
  const s = await Session.open();
  const consoleErrors = [];
  const failedRequests = [];
  try {
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    await s.send('Log.enable');
    await s.send('Network.enable');
    s.on((m) => {
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        consoleErrors.push(m.params.entry.text.slice(0, 200));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        consoleErrors.push((m.params.exceptionDetails.text || 'exception').slice(0, 200));
      }
      if (m.method === 'Network.loadingFailed' && !m.params.canceled) {
        failedRequests.push((m.params.blockedReason || m.params.errorText || 'failed'));
      }
    });

    // The layout viewport, set exactly. This is what device emulation uses.
    await s.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.w, height: viewport.h,
      deviceScaleFactor: viewport.dpr || 2,
      mobile: !!viewport.mobile,
      screenWidth: viewport.w, screenHeight: viewport.h,
    });
    if (viewport.mobile) {
      await s.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }

    const loaded = new Promise((res) => {
      s.on((m) => { if (m.method === 'Page.loadEventFired') res(); });
    });
    await s.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(o.timeout || 20000)]);
    await sleep(o.settle || 2500);   // client-rendered pages need to finish

    const r = await s.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    return {
      result: r.result && r.result.value,
      consoleErrors, failedRequests,
    };
  } finally {
    await s.close();
  }
}

async function screenshot(url, viewport, file) {
  const s = await Session.open();
  try {
    await s.send('Page.enable');
    await s.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.w, height: viewport.h,
      deviceScaleFactor: 2, mobile: !!viewport.mobile,
      screenWidth: viewport.w, screenHeight: viewport.h,
    });
    const loaded = new Promise((res) => { s.on((m) => { if (m.method === 'Page.loadEventFired') res(); }); });
    await s.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(20000)]);
    await sleep(2500);
    const shot = await s.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    require('fs').writeFileSync(file, Buffer.from(shot.data, 'base64'));
    return file;
  } finally { await s.close(); }
}

module.exports = { launch, waitForChrome, measure, screenshot, Session, sleep, PORT };
