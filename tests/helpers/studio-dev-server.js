// LOCAL TEST HARNESS — Programme Studio end to end, with no real database.
//
//   node tests/helpers/studio-dev-server.js [port]
//
// Serves the site from the repo and runs the REAL Netlify functions in-process
// against the in-memory PostgREST stand-in (tests/helpers/programme-fake-db)
// and in-memory Blobs (tests/helpers/fake-blobs). Requests arrive on
// localhost, so lib/deploy-scope treats them as a sandbox, exactly like a
// deploy preview.
//
// TEST ACCOUNTS ONLY (they exist nowhere but this process):
//   test.editor / local-test-only  — Programme Editor (edit, not publish)
//   test.chair  / local-test-only  — Chairman (edit and publish)
'use strict';
process.env.SUPABASE_URL = 'https://fake-supabase.local';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.SITE_ORIGIN = 'http://localhost';
process.env.NODE_ENV = 'test';
process.env.MD_TOKEN_SECRET = 'local-harness-secret-not-for-any-real-use';

const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FAKE = require('./programme-fake-db');
const BLOBS = require('./fake-blobs');
const SEASON = require('../fixtures/programme/season-2026-27');
const AUTH = require('../../netlify/functions/lib/md-auth');

const db = FAKE.makeDb(); FAKE.seedRegistry(db, SEASON.corrected());
FAKE.install(db);
require('../../netlify/functions/lib/programme/studio-store').useBackend(BLOBS.makeStores());

const ACCOUNTS = { 'test.editor': 'Programme Editor', 'test.chair': 'Chairman' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };

function fn(name) { return require(path.join(ROOT, 'netlify/functions', name + '.js')); }

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  const m = /^\/\.netlify\/functions\/([\w-]+)$/.exec(u.pathname);
  if (m) {
    if (m[1] === 'md-session') {
      let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
      const role = ACCOUNTS[b.username];
      const ok = role && b.password === 'local-test-only';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(ok ? { ok: true, token: AUTH.issue({ username: b.username, role, isChairman: role === 'Chairman', auth: 'custom' }),
        username: b.username, role, expiresInMs: AUTH.TTL_MS } : { ok: false, error: 'wrong-password' }));
    }
    try {
      const h = {}; Object.keys(req.headers).forEach((k) => { h[k] = req.headers[k]; });
      const out = await fn(m[1]).handler({ httpMethod: req.method, headers: h, body, queryStringParameters: Object.fromEntries(u.searchParams) });
      res.writeHead(out.statusCode || 200, out.headers || {});
      return res.end(out.isBase64Encoded ? Buffer.from(out.body, 'base64') : out.body);
    } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ ok: false, error: String(e.message) })); }
  }
  let p = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(parseInt(process.argv[2], 10) || 8790, () => console.log('studio harness on http://localhost:' + (parseInt(process.argv[2], 10) || 8790)));
