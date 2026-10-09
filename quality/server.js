// Local stand-in for Netlify, so the gates audit the RENDERED site, not source.
//
//   node server.js [port]          (default 4173; QUALITY_PORT also works)
//
// What it imitates, and only this:
//   • static files from the repo root, with Netlify's pretty URLs (/about → about.html)
//   • /.netlify/images?url=… → the original file (the Image CDN resizes; we don't,
//     so image-quality checks judge the SOURCE asset, which is the stricter test)
//   • /.netlify/functions/*  → 503 {ok:false,error:'local-stub'} — pages must cope
//     with a function being down; journeys that need a real answer mock it per test
//   • the [[redirects]] rewrites in netlify.toml for /rss.xml and /sitemap.xml → 404
// No dependencies, so it runs anywhere Node 20 does.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.QUALITY_PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain', '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf',
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain', 'Cache-Control': 'no-store' });
  res.end(body);
}
function safe(p) {
  const abs = path.resolve(ROOT, '.' + p);
  return abs.startsWith(ROOT) ? abs : null;   // no ../ escapes
}
function serveFile(res, abs, code) {
  fs.readFile(abs, (err, buf) => {
    if (err) return notFound(res);
    send(res, code || 200, buf, TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream');
  });
}
function notFound(res) {
  const p404 = path.join(ROOT, '404.html');
  if (fs.existsSync(p404)) return serveFile(res, p404, 404);
  send(res, 404, 'not found');
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  let p = decodeURIComponent(u.pathname);

  if (p.startsWith('/.netlify/functions/')) {
    return send(res, 503, JSON.stringify({ ok: false, error: 'local-stub' }), 'application/json');
  }
  if (p === '/.netlify/images') {
    const src = u.searchParams.get('url') || '';
    if (/^https?:/i.test(src)) return send(res, 404, 'remote image not proxied locally');
    const abs = safe(src.startsWith('/') ? src : '/' + src);
    return abs ? serveFile(res, abs) : notFound(res);
  }
  if (p.endsWith('/')) p += 'index.html';
  let abs = safe(p);
  if (!abs) return send(res, 400, 'bad path');
  if (!path.extname(abs) && fs.existsSync(abs + '.html')) abs += '.html';
  fs.stat(abs, (err, st) => (err || !st.isFile()) ? notFound(res) : serveFile(res, abs));
}).listen(PORT, () => console.log(`[quality] serving ${ROOT} at http://127.0.0.1:${PORT}`));
