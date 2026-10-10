/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — ASSET STUDIO CORE

   The rules of the Studio in one pure module: formats, approved colour
   variants, the template registry, layout composition, quality control and
   the approval workflow. No DOM, no network. The browser loads it with a
   <script> tag; the server function and the unit tests require() it. There is
   no second copy of any of these rules.

   HOW A GRAPHIC IS MADE
     doc  (what the person chose: template, fields, photo crops, variant,
           a SNAPSHOT of the fixture facts, pinned sponsor-logo version)
     ctx  (the library: image sizes, sponsors, logo versions)
       → compose(doc, formatId, ctx, measure) → scene (exact pixel layers)
       → render.js draws the scene to a canvas of exactly that size
       → qc(scene, doc, ctx) says whether it is fit to approve and export.

   WHY LAYOUTS ARE WRITTEN PER ORIENTATION. A 9:16 story is not a square with
   bits cut off. Every archetype has a square-ish, a tall and a wide
   composition, and each is laid out on purpose.

   LOGOS AND CRESTS CANNOT BE DISTORTED. Image layers with the role `crest` or
   `logo` are always fitted with `contain` from the asset's real pixel size;
   there is no field anywhere that sets their width and height independently.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StudioCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TZ = 'Europe/London';
  var SITE = 'raynerslanefc.co.uk';
  var CLUB = { name: 'Rayners Lane', full: 'Rayners Lane FC', crest: 'img/badge.png' };

  // ── Formats ──────────────────────────────────────────────────────────────
  // Safe areas are where nothing that must be read may go. The story safe
  // area keeps clear of Instagram's own header and reply bar.
  var FORMATS = {
    square:    { id: 'square',    label: 'Square',    w: 1080, h: 1080, use: 'Instagram and Facebook feed', kind: 'sq',   safe: { t: 64,  r: 64,  b: 64,  l: 64 } },
    portrait:  { id: 'portrait',  label: 'Portrait',  w: 1080, h: 1350, use: 'Instagram feed, 4:5',          kind: 'sq',   safe: { t: 72,  r: 64,  b: 72,  l: 64 } },
    story:     { id: 'story',     label: 'Story',     w: 1080, h: 1920, use: 'Stories and WhatsApp status',  kind: 'tall', safe: { t: 250, r: 72,  b: 300, l: 72 } },
    landscape: { id: 'landscape', label: 'Landscape', w: 1920, h: 1080, use: 'X, website and screens',       kind: 'wide', safe: { t: 72,  r: 96,  b: 72,  l: 96 } },
    a4:        { id: 'a4',        label: 'A4 PDF',    w: 2480, h: 3508, use: 'Print and programme, 300 dpi', kind: 'tall', safe: { t: 177, r: 177, b: 177, l: 177 },
                 pdf: { wPt: 595.28, hPt: 841.89 } }
  };
  var FORMAT_ORDER = ['square', 'portrait', 'story', 'landscape', 'a4'];

  // ── Approved colour variants — the only styling choice a template offers ─
  var VARIANTS = {
    night: { id: 'night', label: 'Night',  bg: '#080808', panel: '#141414', accent: '#FFD100', text: '#F5F3ED', soft: '#AAAAAA', onAccent: '#080808', plate: '#F5F3ED', dark: true },
    green: { id: 'green', label: 'Green',  bg: '#1A5C32', panel: '#236B3C', accent: '#FFD100', text: '#F5F3ED', soft: '#D9E4DC', onAccent: '#080808', plate: '#F5F3ED', dark: true },
    paper: { id: 'paper', label: 'Paper',  bg: '#F5F3ED', panel: '#E2E2E2', accent: '#1A5C32', text: '#111111', soft: '#555555', onAccent: '#F5F3ED', plate: '#FFFFFF', dark: false }
  };

  // ── Europe/London — every date the Studio prints ─────────────────────────
  function londonParts(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return null;
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false });
    var p = {};
    f.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var hh = +p.hour % 24, mm = p.minute;
    var ampm = hh >= 12 ? 'pm' : 'am';
    var h12 = hh % 12 === 0 ? 12 : hh % 12;
    return {
      weekday: p.weekday, day: +p.day, month: p.month, year: +p.year,
      ymd: p.year + '-' + pad(monthIndex(p.month) + 1) + '-' + pad(+p.day),
      time: h12 + (mm === '00' ? '' : ':' + mm) + ampm,
      time24: pad(hh) + ':' + mm
    };
  }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function monthIndex(m) { return MONTHS.indexOf(m); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function londonYmd(ms) { var p = londonParts(new Date(ms == null ? Date.now() : ms).toISOString()); return p && p.ymd; }
  function dateLine(iso) { var p = londonParts(iso); return p ? p.weekday + ' ' + p.day + ' ' + p.month : ''; }
  function shortDate(iso) { var p = londonParts(iso); return p ? p.weekday.slice(0, 3) + ' ' + p.day + ' ' + p.month.slice(0, 3) : ''; }
  /** today | tomorrow | future | past — in the club's time zone, never the device's. */
  function dayRelation(iso, nowMs) {
    var p = londonParts(iso); if (!p) return null;
    var today = londonYmd(nowMs);
    var tomorrow = londonYmd((nowMs == null ? Date.now() : nowMs) + 864e5);
    if (p.ymd === today) return 'today';
    if (p.ymd === tomorrow) return 'tomorrow';
    return p.ymd > today ? 'future' : 'past';
  }

  // ── Geometry ─────────────────────────────────────────────────────────────
  /** Largest rect of aspect `ar` inside the box, centred. The only way a logo or crest is sized. */
  function contain(box, ar) {
    var w = box.w, h = w / ar;
    if (h > box.h) { h = box.h; w = h * ar; }
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w: w, h: h };
  }
  /** Source crop for a cover fit, honouring a focal point and a zoom (1–3). */
  function cover(box, nw, nh, focus, zoom) {
    var z = Math.max(1, Math.min(3, zoom || 1));
    var f = focus || { x: 0.5, y: 0.5 };
    var scale = Math.max(box.w / nw, box.h / nh) * z;
    var sw = box.w / scale, sh = box.h / scale;
    var sx = clamp(f.x * nw - sw / 2, 0, nw - sw);
    var sy = clamp(f.y * nh - sh / 2, 0, nh - sh);
    return { sx: sx, sy: sy, sw: sw, sh: sh, scale: scale };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function intersects(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  // ── Text ─────────────────────────────────────────────────────────────────
  var FAMILY = { display: "'Bebas Neue'", body: 'Manrope' };
  /** Rough widths for when no canvas is available (tests, server). Deliberately generous. */
  function approxMeasure(text, font) {
    var per = font.family === 'display' ? 0.43 : (font.weight >= 700 ? 0.6 : 0.56);
    return String(text).length * font.size * per + Math.max(0, String(text).length - 1) * (font.tracking || 0) * font.size;
  }
  function wrap(text, maxW, font, measure) {
    var paras = String(text == null ? '' : text).split(/\n/);
    var lines = [];
    paras.forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }
      var cur = '';
      words.forEach(function (w) {
        var t = cur ? cur + ' ' + w : w;
        if (!cur || measure(t, font) <= maxW) cur = t;
        else { lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
    });
    return lines;
  }
  /** Shrink to fit within the box and the line limit. Never below minSize: overflow is reported, not hidden. */
  function fitText(L, measure) {
    var text = L.upper ? String(L.text || '').toUpperCase() : String(L.text || '');
    var size = L.size, best = null;
    while (size >= L.minSize - 0.01) {
      var font = { family: L.family, weight: L.weight, size: size, tracking: L.tracking || 0 };
      var lines = wrap(text, L.w, font, measure);
      var lh = size * L.lineHeight;
      var widest = 0;
      lines.forEach(function (ln) { widest = Math.max(widest, measure(ln, font)); });
      var ok = lines.length <= L.maxLines && lines.length * lh <= L.h + 0.5 && widest <= L.w + 0.5;
      best = { size: size, lines: lines, lh: lh, widest: widest, overflow: !ok };
      if (ok) return best;
      size = size > L.minSize ? Math.max(L.minSize, Math.floor(size * 0.94)) : L.minSize - 1;
    }
    return best;
  }

  // ── Scene builder ────────────────────────────────────────────────────────
  function Scene(fmt, pal, ctx, measure) {
    this.measure = measure || approxMeasure;
    this.fmt = fmt; this.w = fmt.w; this.h = fmt.h; this.pal = pal; this.ctx = ctx;
    this.u = Math.min(fmt.w, fmt.h) / 1080;
    this.S = { l: fmt.safe.l, t: fmt.safe.t, r: fmt.w - fmt.safe.r, b: fmt.h - fmt.safe.b };
    this.S.w = this.S.r - this.S.l; this.S.h = this.S.b - this.S.t;
    this.layers = []; this.notes = [];
  }
  /** Height a text layer actually uses, so the next block can follow it rather than a guess. */
  Scene.prototype.fitted = function (L) {
    if (!String(L.text || '').trim()) return 0;
    var f = fitText(L, this.measure);
    return f.lines.length * f.lh;
  };
  Scene.prototype.rect = function (x, y, w, h, fill, o) {
    this.layers.push(Object.assign({ type: 'rect', x: x, y: y, w: w, h: h, fill: fill }, o || {})); return this;
  };
  Scene.prototype.grad = function (x, y, w, h, stops, dir) {
    this.layers.push({ type: 'grad', x: x, y: y, w: w, h: h, stops: stops, dir: dir || 'v' }); return this;
  };
  Scene.prototype.text = function (o) {
    var d = this.u;
    var L = Object.assign({ type: 'text', family: 'body', weight: 600, maxLines: 1, align: 'left', valign: 'top',
      lineHeight: o && o.family === 'display' ? 0.92 : 1.3, color: this.pal.text, tracking: 0 }, o);
    if (L.minSize == null) L.minSize = Math.round(L.size * 0.6);
    L.size = Math.round(L.size); L.minSize = Math.round(L.minSize);
    void d;
    this.layers.push(L); return L;
  };
  /**
   * An image. role 'crest' and 'logo' are ALWAYS contain-fitted from the real
   * pixel size; role 'photo' is cover-fitted with the person's focal point.
   */
  Scene.prototype.image = function (o) {
    var meta = o.src ? this.ctx.meta(o.src) : null;
    var L = Object.assign({ type: 'image', fit: o.role === 'photo' ? 'cover' : 'contain' }, o);
    if (L.role === 'crest' || L.role === 'logo') L.fit = 'contain';
    L.natural = meta ? { w: meta.w, h: meta.h } : null;
    if (!meta) { L.missing = true; this.layers.push(L); return L; }
    if (L.fit === 'contain') {
      var r = contain({ x: L.x, y: L.y, w: L.w, h: L.h }, meta.w / meta.h);
      L.draw = { dx: r.x, dy: r.y, dw: r.w, dh: r.h, sx: 0, sy: 0, sw: meta.w, sh: meta.h };
    } else {
      var c = cover({ w: L.w, h: L.h }, meta.w, meta.h, L.focus, L.zoom);
      L.draw = { dx: L.x, dy: L.y, dw: L.w, dh: L.h, sx: c.sx, sy: c.sy, sw: c.sw, sh: c.sh };
    }
    this.layers.push(L); return L;
  };

  // ── Shared pieces ────────────────────────────────────────────────────────
  function brandRow(s, c, x, y, w) {
    var u = s.u, cs = 84 * u;
    s.image({ role: 'crest', src: CLUB.crest, x: x, y: y, w: cs, h: cs, name: 'club-crest' });
    s.text({ role: 'club-name', text: 'Rayners Lane FC', x: x + cs + 20 * u, y: y, w: w * 0.5, h: cs, size: 30 * u, minSize: 24 * u,
      weight: 800, valign: 'middle', color: s.pal.text });
    if (c.competition) {
      s.text({ role: 'competition', text: c.competition, x: x + w * 0.5, y: y, w: w * 0.5, h: cs, size: 24 * u, minSize: 18 * u,
        weight: 700, align: 'right', valign: 'middle', color: s.pal.text, maxLines: 2, lineHeight: 1.2 });
    }
  }
  function footer(s, c, x, y, w) {
    var u = s.u, fh = 64 * u;
    s.text({ role: 'site', text: SITE, x: x, y: y - fh, w: w * 0.5, h: fh, size: 24 * u, minSize: 20 * u, weight: 700, valign: 'middle', color: s.pal.soft });
    if (c.sponsor && c.sponsor.logo) sponsorMark(s, c.sponsor, x + w * 0.45, y - fh, w * 0.55, fh, 'Presented by');
  }
  /** A sponsor mark. White artwork on a dark ground; otherwise the colour artwork on a light plate. */
  function sponsorMark(s, sp, x, y, w, h, label) {
    var u = s.u;
    var lw = 0;
    if (label) {
      lw = Math.min(w * 0.45, 240 * u);
      s.text({ role: 'sponsor-label', text: label, x: x, y: y, w: lw, h: h, size: 22 * u, minSize: 18 * u, weight: 700, align: 'right', valign: 'middle', color: s.pal.soft, maxLines: 2, lineHeight: 1.15 });
      lw += 18 * u;
    }
    var bx = x + lw, bw = w - lw;
    var onDark = s.pal.dark && sp.logo.white;
    if (onDark) {
      s.image({ role: 'logo', src: sp.logo.white, x: bx, y: y, w: bw, h: h, name: 'sponsor-logo', align: 'right' });
    } else {
      var pad = 10 * u;
      var ar = sp.logo.ar || 2;
      var inner = contain({ x: 0, y: 0, w: bw - pad * 2, h: h - pad * 2 }, ar);
      var pw = inner.w + pad * 2;
      s.rect(bx + bw - pw, y, pw, h, plateFill(s, sp.logo), { radius: 6 * u, role: 'logo-plate' });
      s.image({ role: 'logo', src: sp.logo.colour, x: bx + bw - pw + pad, y: y + pad, w: inner.w, h: h - pad * 2, name: 'sponsor-logo' });
    }
  }
  /**
   * The ground a sponsor's artwork was drawn for. HDL's colour mark has white
   * lettering; on a light plate half the name disappears. Ground is recorded
   * per logo version, never guessed at render time.
   */
  function plateFill(s, logo) {
    if (logo && logo.ground === 'dark') return s.pal.dark && s.pal.bg === '#080808' ? '#141414' : '#080808';
    return s.pal.plate;
  }
  function photoLayer(s, c, box, scrim) {
    if (!c.photo) return false;
    var f = c.crop || {};
    // With no crop chosen, centre on the recorded subject (a player's head and shoulders), not the middle of the frame.
    var sb = c.photo.subject;
    if (!f.focus && sb) f = { focus: { x: sb.x + sb.w / 2, y: sb.y + sb.h * 0.4 }, zoom: f.zoom };
    s.image({ role: 'photo', src: c.photo.src, assetId: c.photo.id, subject: c.photo.subject || null,
      x: box.x, y: box.y, w: box.w, h: box.h, focus: f.focus, zoom: f.zoom });
    if (scrim === 'bottom') {
      s.grad(box.x, box.y + box.h * 0.35, box.w, box.h * 0.65 + 1, [[0, rgba(s.pal.bg, 0)], [1, rgba(s.pal.bg, 1)]], 'v');
      // Top scrim: the club name and competition sit on the photograph and must stay readable on a bright sky.
      s.grad(box.x, box.y, box.w, s.fmt.safe.t + 220 * s.u, [[0, rgba(s.pal.bg, 0.88)], [0.55, rgba(s.pal.bg, 0.6)], [1, rgba(s.pal.bg, 0)]], 'v');
    } else if (scrim === 'right') {
      s.grad(box.x + box.w * 0.55, box.y, box.w * 0.45 + 1, box.h, [[0, rgba(s.pal.bg, 0)], [1, rgba(s.pal.bg, 1)]], 'h');
    } else if (scrim === 'full') {
      s.grad(box.x, box.y, box.w, box.h, [[0, rgba(s.pal.bg, 0.55)], [0.45, rgba(s.pal.bg, 0.15)], [0.7, rgba(s.pal.bg, 0.75)], [1, rgba(s.pal.bg, 0.97)]], 'v');
    }
    return true;
  }
  function rgba(hex, a) {
    var h = hex.replace('#', '');
    return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')';
  }
  /** Crest + name row. A missing crest leaves the name on its own — never a made-up mark. */
  function teamRow(s, team, x, y, w, h, size) {
    var u = s.u;
    if (team.crest) s.image({ role: 'crest', src: team.crest, x: x, y: y, w: h, h: h, name: 'crest:' + team.name });
    var tx = team.crest ? x + h + 28 * u : x;
    s.text({ role: 'team', text: team.name, x: tx, y: y, w: x + w - tx, h: h, family: 'display', size: size, minSize: size * 0.55, maxLines: 2, valign: 'middle', upper: true });
  }
  function infoCols(s, items, x, y, w, h, cols) {
    var u = s.u, n = cols || items.length, gap = 24 * u, cw = (w - gap * (n - 1)) / n;
    items.forEach(function (it, i) {
      var cx = x + (i % n) * (cw + gap), cy = y + Math.floor(i / n) * h;
      s.rect(cx, cy, 4 * u, h - 16 * u, s.pal.accent, { role: 'rule' });
      s.text({ role: 'info-label', text: it.label, x: cx + 20 * u, y: cy, w: cw - 20 * u, h: 30 * u, size: 20 * u, minSize: 18 * u, weight: 700, color: s.pal.soft, tracking: 0.04 });
      s.text({ role: 'info-' + it.key, text: it.value, x: cx + 20 * u, y: cy + 34 * u, w: cw - 20 * u, h: h - 50 * u, family: 'display',
        size: 54 * u, minSize: 30 * u, maxLines: 2, upper: true });
    });
  }

  // ── Archetypes: one deliberate layout per orientation ────────────────────
  var ARCH = {};

  ARCH.fixture = function (s, c) {
    var u = s.u, S = s.S, k = s.fmt.kind, w = s.w, h = s.h, P = s.pal;
    s.rect(0, 0, w, h, P.bg, { role: 'bg' });
    var info = [{ key: 'date', label: 'Date', value: c.date }, { key: 'time', label: c.timeLabel || 'Kick-off', value: c.time }, { key: 'venue', label: 'Venue', value: c.venue }];
    if (k === 'wide') {
      var split = w * 0.46;
      if (!photoLayer(s, c, { x: 0, y: 0, w: split, h: h }, 'right')) {
        s.rect(0, 0, split, h, P.panel, { role: 'panel' });
        var cs = Math.min(split * 0.3, 260 * u);
        var cy = c.stamp ? h * 0.36 - cs / 2 : h / 2 - cs / 2;
        if (c.home.crest) s.image({ role: 'crest', src: c.home.crest, x: split * 0.27 - cs / 2, y: cy, w: cs, h: cs, name: 'crest:home' });
        s.text({ role: 'versus', text: 'v', x: split / 2 - 40 * u, y: cy + cs / 2 - 50 * u, w: 80 * u, h: 100 * u, family: 'display', size: 90 * u, align: 'center', valign: 'middle', color: P.accent });
        if (c.away.crest) s.image({ role: 'crest', src: c.away.crest, x: split * 0.73 - cs / 2, y: cy, w: cs, h: cs, name: 'crest:away' });
      }
      if (c.stamp) stamp(s, c.stamp, 0, h * 0.62, split);
      var x0 = split + 72 * u, cw = S.r - x0;
      brandRow(s, c, x0, S.t, cw);
      s.text({ role: 'kicker', text: c.kicker, x: x0, y: S.t + 130 * u, w: cw, h: 150 * u, family: 'display', size: 160 * u, minSize: 100 * u, color: P.accent, upper: true });
      teamRow(s, c.home, x0, S.t + 300 * u, cw, 110 * u, 74 * u);
      teamRow(s, c.away, x0, S.t + 430 * u, cw, 110 * u, 74 * u);
      infoCols(s, info, x0, S.t + 580 * u, cw, 140 * u, 3);
      if (c.note) s.text({ role: 'note', text: c.note, x: x0, y: S.t + 720 * u, w: cw, h: 70 * u, size: 28 * u, weight: 700, maxLines: 2, color: P.accent });
      footer(s, c, x0, S.b, cw);
    } else if (k === 'tall') {
      var ph = h * 0.42;
      photoLayer(s, c, { x: 0, y: 0, w: w, h: ph }, 'bottom');
      brandRow(s, c, S.l, S.t, S.w);
      var y = c.photo ? Math.max(ph - 120 * u, S.t + 180 * u) : S.t + 220 * u;
      if (c.stamp) { stamp(s, c.stamp, 0, S.t + 110 * u, w); y = Math.max(y, S.t + 270 * u); }
      s.text({ role: 'kicker', text: c.kicker, x: S.l, y: y, w: S.w, h: 210 * u, family: 'display', size: 220 * u, minSize: 130 * u, color: P.accent, upper: true });
      y += 240 * u;
      teamRow(s, c.home, S.l, y, S.w, 170 * u, 110 * u);
      s.text({ role: 'versus', text: 'v', x: S.l, y: y + 175 * u, w: 170 * u, h: 70 * u, family: 'display', size: 64 * u, align: 'center', valign: 'middle', color: P.soft });
      teamRow(s, c.away, S.l, y + 250 * u, S.w, 170 * u, 110 * u);
      y += 470 * u;
      var rows = Math.max(1, Math.min(3, Math.floor((S.b - 90 * u - y) / (150 * u))));
      infoCols(s, info, S.l, y, S.w, 150 * u, rows === 3 ? 1 : 3);
      if (c.note) s.text({ role: 'note', text: c.note, x: S.l, y: S.b - 170 * u, w: S.w, h: 90 * u, size: 34 * u, weight: 700, maxLines: 2, color: P.accent });
      footer(s, c, S.l, S.b, S.w);
    } else {
      var portrait = h > w;
      var ph2 = h * (portrait ? 0.5 : 0.46);
      photoLayer(s, c, { x: 0, y: 0, w: w, h: ph2 }, 'bottom');
      brandRow(s, c, S.l, S.t, S.w);
      var y2 = c.photo ? ph2 - 150 * u : S.t + 150 * u;
      var ks = 180 * u;
      if (c.stamp) { stamp(s, c.stamp, 0, S.t + 104 * u, w); y2 = Math.max(y2, S.t + 254 * u); ks = 140 * u; }
      s.text({ role: 'kicker', text: c.kicker, x: S.l, y: y2, w: S.w, h: ks - 10 * u, family: 'display', size: ks, minSize: 100 * u, color: P.accent, upper: true });
      y2 += ks;
      teamRow(s, c.home, S.l, y2, S.w, 112 * u, 80 * u);
      teamRow(s, c.away, S.l, y2 + 128 * u, S.w, 112 * u, 80 * u);
      y2 += 270 * u;
      infoCols(s, info, S.l, y2, S.w, 136 * u, 3);
      if (c.note) s.text({ role: 'note', text: c.note, x: S.l, y: y2 + 140 * u, w: S.w, h: 64 * u, size: 28 * u, weight: 700, maxLines: 2, color: P.accent });
      footer(s, c, S.l, S.b, S.w);
    }
  };
  /** POSTPONED is a statement of fact, set straight across the graphic — never a decorative tilt. */
  function stamp(s, text, x, y, w) {
    var u = s.u, bh = 120 * u;
    s.rect(x, y, w, bh, '#E5341F', { role: 'stamp-band' });
    var tx = Math.max(x, s.S.l), tw = Math.min(x + w, s.S.r) - tx;
    s.text({ role: 'stamp', text: text, x: tx, y: y, w: tw, h: bh, family: 'display', size: 100 * u, minSize: 70 * u, align: 'center', valign: 'middle', color: '#FFFFFF', upper: true });
  }

  ARCH.score = function (s, c) {
    var u = s.u, S = s.S, k = s.fmt.kind, w = s.w, h = s.h, P = s.pal;
    s.rect(0, 0, w, h, P.bg, { role: 'bg' });
    var tall = k === 'tall', wide = k === 'wide';
    var ph = tall ? h * 0.36 : wide ? h : h * 0.42;
    if (wide) photoLayer(s, c, { x: 0, y: 0, w: w, h: h }, 'full');
    else photoLayer(s, c, { x: 0, y: 0, w: w, h: ph }, 'bottom');
    brandRow(s, c, S.l, S.t, S.w);
    var y = wide ? S.t + 140 * u : (c.photo ? ph - 120 * u : S.t + 160 * u);
    s.text({ role: 'kicker', text: c.kicker, x: S.l, y: y, w: S.w, h: (tall ? 200 : 160) * u, family: 'display', size: (tall ? 210 : 170) * u, minSize: 100 * u, color: P.accent, upper: true, align: wide ? 'center' : 'left' });
    y += (tall ? 230 : 180) * u;
    var cs = (tall ? 230 : wide ? 230 : 180) * u;
    var lockW = wide ? Math.min(S.w, 1400 * u) : S.w;
    var lx = wide ? S.l + (S.w - lockW) / 2 : S.l;
    if (c.home.crest) s.image({ role: 'crest', src: c.home.crest, x: lx, y: y, w: cs, h: cs, name: 'crest:home' });
    if (c.away.crest) s.image({ role: 'crest', src: c.away.crest, x: lx + lockW - cs, y: y, w: cs, h: cs, name: 'crest:away' });
    s.text({ role: 'score', text: c.score, x: lx + cs, y: y - 20 * u, w: lockW - cs * 2, h: cs + 40 * u, family: 'display', size: (tall ? 300 : 260) * u, minSize: 150 * u, align: 'center', valign: 'middle', color: P.text });
    var ny = y + cs + 18 * u, nw = cs + 120 * u;
    s.text({ role: 'team', text: c.home.name, x: lx - (wide ? 60 * u : 0), y: ny, w: nw, h: 110 * u, family: 'display', size: 46 * u, minSize: 30 * u, maxLines: 2, align: wide ? 'center' : 'left', upper: true });
    s.text({ role: 'team', text: c.away.name, x: lx + lockW - nw + (wide ? 60 * u : 0), y: ny, w: nw, h: 110 * u, family: 'display', size: 46 * u, minSize: 30 * u, maxLines: 2, align: wide ? 'center' : 'right', upper: true });
    var by = ny + 130 * u;
    if (c.scorers) {
      s.rect(wide ? lx : S.l, by, 4 * u, (tall ? 200 : 110) * u, P.accent, { role: 'rule' });
      s.text({ role: 'scorers', text: c.scorers, x: (wide ? lx : S.l) + 22 * u, y: by, w: (wide ? lockW : S.w) - 22 * u, h: (tall ? 200 : 110) * u, size: 30 * u, minSize: 22 * u, weight: 700, maxLines: tall ? 5 : 3, lineHeight: 1.3 });
    }
    var fy = S.b - 64 * u - 90 * u;
    if (c.meta) s.text({ role: 'meta', text: c.meta, x: S.l, y: fy, w: S.w, h: 80 * u, size: 26 * u, minSize: 20 * u, weight: 700, color: P.soft, maxLines: 2, lineHeight: 1.25, valign: 'bottom', align: wide ? 'center' : 'left' });
    footer(s, c, S.l, S.b, S.w);
  };

  ARCH.lineup = function (s, c) {
    var u = s.u, S = s.S, k = s.fmt.kind, w = s.w, h = s.h, P = s.pal;
    s.rect(0, 0, w, h, P.bg, { role: 'bg' });
    var x0 = S.l, cw = S.w, top = S.t;
    if (k === 'wide') {
      var split = w * 0.38;
      if (!photoLayer(s, c, { x: 0, y: 0, w: split, h: h }, 'right')) s.rect(0, 0, split, h, P.panel, { role: 'panel' });
      x0 = split + 64 * u; cw = S.r - x0;
    } else if (k === 'tall' && s.fmt.id === 'story' && c.photo) {
      photoLayer(s, c, { x: 0, y: 0, w: w, h: h * 0.28 }, 'bottom');
      top = h * 0.28 - 40 * u;
    }
    brandRow(s, c, x0, S.t, cw);
    var y = Math.max(top, S.t) + (top > S.t ? 0 : 130 * u);
    s.text({ role: 'kicker', text: c.kicker, x: x0, y: y, w: cw, h: 140 * u, family: 'display', size: 150 * u, minSize: 96 * u, color: P.accent, upper: true });
    y += 150 * u;
    s.text({ role: 'sub', text: c.sub, x: x0, y: y, w: cw, h: 46 * u, size: 30 * u, minSize: 22 * u, weight: 700, color: P.soft });
    y += 70 * u;
    var list = c.players || [];
    var subsH = c.subs ? 110 * u : 0;
    var availH = S.b - 80 * u - subsH - y;
    var cols = k === 'tall' ? 1 : 2;
    var rows = Math.ceil(Math.max(list.length, 1) / cols);
    var rh = Math.min(k === 'tall' ? 96 * u : 92 * u, availH / rows);
    var colW = (cw - (cols - 1) * 32 * u) / cols;
    var numbered = list.some(function (p) { return p.number != null && p.number !== '' && +p.number !== 0; });
    var nw = numbered ? 80 * u : 0;
    list.forEach(function (p, i) {
      var col = cols === 2 ? (i < rows ? 0 : 1) : 0, row = cols === 2 ? (i < rows ? i : i - rows) : i;
      var px = x0 + col * (colW + 32 * u), py = y + row * rh;
      s.rect(px, py + rh - 2 * u, colW, 2 * u, P.panel, { role: 'row-rule' });
      if (numbered) s.text({ role: 'number', text: p.number != null && p.number !== '' ? String(p.number) : '', x: px, y: py, w: 70 * u, h: rh, family: 'display', size: Math.min(56 * u, rh * 0.7), minSize: 26 * u, valign: 'middle', color: P.accent });
      s.text({ role: 'player', text: p.name + (p.captain ? ' (c)' : ''), x: px + nw, y: py, w: colW - nw, h: rh, size: Math.min(36 * u, rh * 0.42), minSize: 22 * u, weight: 700, valign: 'middle' });
    });
    if (c.subs) s.text({ role: 'subs', text: 'Subs: ' + c.subs, x: x0, y: S.b - 64 * u - subsH, w: cw, h: subsH - 10 * u, size: 26 * u, minSize: 20 * u, weight: 600, color: P.soft, maxLines: 3, lineHeight: 1.25 });
    footer(s, c, x0, S.b, cw);
  };

  ARCH.sponsor = function (s, c) {
    var u = s.u, S = s.S, k = s.fmt.kind, w = s.w, h = s.h, P = s.pal;
    s.rect(0, 0, w, h, P.bg, { role: 'bg' });
    brandRow(s, c, S.l, S.t, S.w);
    var plate, tx, ty, tw;
    if (k === 'wide') {
      plate = { x: S.l, y: S.t + 140 * u, w: S.w * 0.46, h: S.b - S.t - 260 * u };
      tx = S.l + S.w * 0.52; ty = S.t + 150 * u; tw = S.w * 0.48;
    } else {
      var ky = S.t + 140 * u;
      s.text({ role: 'kicker', text: c.kicker, x: S.l, y: ky, w: S.w, h: 150 * u, family: 'display', size: 150 * u, minSize: 90 * u, color: P.accent, upper: true, maxLines: 2 });
      // The plate takes whatever the words leave, so a long thank-you line
      // shrinks the plate rather than pushing text out of the safe area.
      var textBlock = 120 * u + (c.message ? 150 * u : 0) + (c.fixtureLine ? 90 * u : 0);
      var py = ky + 170 * u;
      var ph = Math.min(k === 'tall' ? h * 0.26 : h * 0.3, S.b - 80 * u - textBlock - 40 * u - py);
      plate = { x: S.l, y: py, w: S.w, h: ph };
      tx = S.l; ty = plate.y + plate.h + 40 * u; tw = S.w;
    }
    s.rect(plate.x, plate.y, plate.w, plate.h, plateFill(s, c.sponsor && c.sponsor.logo), { role: 'logo-plate', radius: 14 * u });
    if (c.sponsor && c.sponsor.logo) {
      var pad = Math.min(plate.w, plate.h) * 0.14;
      s.image({ role: 'logo', src: c.sponsor.logo.colour, x: plate.x + pad, y: plate.y + pad, w: plate.w - pad * 2, h: plate.h - pad * 2, name: 'sponsor-logo' });
    } else {
      s.text({ role: 'missing-logo', text: c.sponsor ? 'No approved logo on file' : 'Choose the sponsor', x: plate.x, y: plate.y, w: plate.w, h: plate.h, size: 34 * u, weight: 700, align: 'center', valign: 'middle', color: '#555555' });
    }
    if (k === 'wide') s.text({ role: 'kicker', text: c.kicker, x: tx, y: ty, w: tw, h: 150 * u, family: 'display', size: 130 * u, minSize: 80 * u, color: P.accent, upper: true, maxLines: 2 });
    var y = k === 'wide' ? ty + 170 * u : ty;
    s.text({ role: 'sponsor-name', text: c.sponsor ? c.sponsor.name : '', x: tx, y: y, w: tw, h: 110 * u, family: 'display', size: 84 * u, minSize: 50 * u, maxLines: 2, upper: true });
    y += 120 * u;
    if (c.message) { s.text({ role: 'message', text: c.message, x: tx, y: y, w: tw, h: 140 * u, size: 32 * u, minSize: 24 * u, weight: 600, maxLines: 4, lineHeight: 1.35 }); y += 150 * u; }
    if (c.fixtureLine) s.text({ role: 'fixture-line', text: c.fixtureLine, x: tx, y: y, w: tw, h: 90 * u, size: 30 * u, minSize: 22 * u, weight: 800, color: P.accent, maxLines: 2 });
    footer(s, { competition: null }, S.l, S.b, S.w);
  };

  ARCH.editorial = function (s, c) {
    var u = s.u, S = s.S, k = s.fmt.kind, w = s.w, h = s.h, P = s.pal;
    s.rect(0, 0, w, h, P.bg, { role: 'bg' });
    if (c.formal) {
      var cs = (k === 'tall' ? 200 : 150) * u;
      s.image({ role: 'crest', src: CLUB.crest, x: w / 2 - cs / 2, y: S.t, w: cs, h: cs, name: 'club-crest' });
      var y = S.t + cs + 30 * u;
      s.text({ role: 'kicker', text: c.kicker, x: S.l, y: y, w: S.w, h: 50 * u, size: 30 * u, weight: 800, align: 'center', color: P.accent, tracking: 0.06 });
      y += 70 * u;
      var hh = (k === 'wide' ? 150 : 220) * u;
      s.text({ role: 'headline', text: c.headline, x: S.l, y: y, w: S.w, h: hh, family: 'display', size: (k === 'tall' ? 110 : 90) * u, minSize: 56 * u, maxLines: 3, align: 'center', upper: true });
      y += hh + 20 * u;
      s.rect(w / 2 - 60 * u, y, 120 * u, 4 * u, P.accent, { role: 'rule' });
      y += 40 * u;
      var bh = S.b - 140 * u - y;
      s.text({ role: 'body', text: c.body, x: S.l + (k === 'wide' ? S.w * 0.12 : 0), y: y, w: k === 'wide' ? S.w * 0.76 : S.w, h: bh, size: (k === 'tall' ? 34 : 30) * u, minSize: 20 * u, weight: 500, maxLines: 40, lineHeight: 1.45, align: k === 'wide' ? 'center' : 'left' });
      s.text({ role: 'signoff', text: c.signoff, x: S.l, y: S.b - 120 * u, w: S.w, h: 56 * u, size: 26 * u, minSize: 20 * u, weight: 800, align: 'center', color: P.soft });
      s.text({ role: 'site', text: SITE, x: S.l, y: S.b - 60 * u, w: S.w, h: 50 * u, size: 22 * u, minSize: 18 * u, weight: 700, align: 'center', color: P.soft });
      return;
    }
    var x0 = S.l, cw = S.w, y0;
    if (k === 'wide') {
      var split = w * 0.5;
      if (photoLayer(s, c, { x: 0, y: 0, w: split, h: h }, 'right')) { x0 = split + 56 * u; cw = S.r - x0; }
      y0 = S.t + 150 * u;
    } else {
      var ph = h * (k === 'tall' ? 0.42 : (c.body ? 0.4 : 0.48));
      y0 = photoLayer(s, c, { x: 0, y: 0, w: w, h: ph }, 'bottom') ? ph - 60 * u : S.t + 170 * u;
    }
    brandRow(s, { competition: null }, x0, S.t, cw);
    var pillW = Math.min(cw, 420 * u);
    s.rect(x0, y0, pillW, 56 * u, P.accent, { role: 'kicker-pill', radius: 6 * u });
    s.text({ role: 'kicker', text: c.kicker, x: x0 + 18 * u, y: y0, w: pillW - 36 * u, h: 56 * u, size: 26 * u, minSize: 20 * u, weight: 800, valign: 'middle', color: P.onAccent });
    var y2 = y0 + 84 * u;
    var hh2 = (k === 'tall' ? 380 : k === 'wide' ? 330 : 300) * u;
    var hl = s.text({ role: 'headline', text: c.headline, x: x0, y: y2, w: cw, h: hh2, family: 'display', size: (k === 'tall' ? 130 : 110) * u, minSize: 60 * u, maxLines: 3, upper: true });
    y2 += Math.min(hh2, s.fitted(hl)) + 24 * u;
    var bodyH = S.b - 64 * u - (c.cta ? 70 * u : 0) - 30 * u - y2;
    if (c.body) s.text({ role: 'body', text: c.body, x: x0, y: y2, w: cw, h: Math.max(bodyH, 40 * u), size: (k === 'tall' ? 36 : 32) * u, minSize: 22 * u, weight: 500, maxLines: k === 'tall' ? 8 : 4, lineHeight: 1.4, color: P.text });
    if (c.cta) s.text({ role: 'cta', text: c.cta, x: x0, y: S.b - 64 * u - 70 * u, w: cw, h: 56 * u, size: 30 * u, minSize: 22 * u, weight: 800, color: P.accent });
    footer(s, { sponsor: c.sponsor }, x0, S.b, cw);
  };

  ARCH.cover = function (s, c) {
    var u = s.u, S = s.S, w = s.w, h = s.h, P = s.pal;
    s.rect(0, 0, w, h, P.bg, { role: 'bg' });
    photoLayer(s, c, { x: 0, y: 0, w: w, h: h }, 'full');
    s.text({ role: 'masthead', text: 'Matchday programme', x: S.l, y: S.t, w: S.w * 0.7, h: 120 * u, family: 'display', size: 120 * u, minSize: 80 * u, color: P.accent, upper: true });
    s.text({ role: 'season', text: [c.season, c.edition].filter(Boolean).join('  ·  '), x: S.l, y: S.t + 130 * u, w: S.w * 0.7, h: 50 * u, size: 30 * u, minSize: 22 * u, weight: 800, color: P.text });
    var cs = 170 * u;
    if (c.photo) s.image({ role: 'crest', src: CLUB.crest, x: S.r - cs, y: S.t, w: cs, h: cs, name: 'club-crest' });
    else {
      // No photograph good enough for print: the two crests carry the cover.
      var big = Math.min(300 * u, (S.w - 160 * u) / 2), cy = S.t + 300 * u;
      s.rect(0, cy - 60 * u, w, big + 120 * u, P.panel, { role: 'panel' });
      s.image({ role: 'crest', src: CLUB.crest, x: w / 2 - 80 * u - big, y: cy, w: big, h: big, name: 'club-crest' });
      s.text({ role: 'versus', text: 'v', x: w / 2 - 60 * u, y: cy, w: 120 * u, h: big, family: 'display', size: 110 * u, align: 'center', valign: 'middle', color: P.accent });
      if (c.away.crest) s.image({ role: 'crest', src: c.away.crest, x: w / 2 + 80 * u, y: cy, w: big, h: big, name: 'crest:away' });
    }
    var y = S.b - 760 * u;
    s.text({ role: 'team', text: c.home.name, x: S.l, y: y, w: S.w, h: 170 * u, family: 'display', size: 170 * u, minSize: 100 * u, upper: true });
    s.text({ role: 'versus', text: 'v', x: S.l, y: y + 170 * u, w: 200 * u, h: 90 * u, family: 'display', size: 90 * u, color: P.accent });
    s.text({ role: 'team', text: c.away.name, x: S.l, y: y + 260 * u, w: S.w - 220 * u, h: 170 * u, family: 'display', size: 170 * u, minSize: 90 * u, maxLines: 2, upper: true });
    if (c.away.crest && c.photo) s.image({ role: 'crest', src: c.away.crest, x: S.r - 190 * u, y: y + 250 * u, w: 190 * u, h: 190 * u, name: 'crest:away' });
    s.rect(S.l, y + 470 * u, S.w, 3 * u, P.accent, { role: 'rule' });
    s.text({ role: 'cover-meta', text: [c.date, c.time, c.competition].filter(Boolean).join('  ·  '), x: S.l, y: y + 500 * u, w: S.w, h: 110 * u, size: 38 * u, minSize: 26 * u, weight: 800, maxLines: 2 });
    var fy = S.b - 100 * u;
    s.text({ role: 'venue', text: c.venue, x: S.l, y: fy, w: S.w * 0.5, h: 100 * u, size: 28 * u, minSize: 20 * u, weight: 700, color: P.soft, maxLines: 2, valign: 'bottom' });
    if (c.price) s.text({ role: 'price', text: c.price, x: S.l + S.w * 0.5, y: fy, w: S.w * 0.5, h: 100 * u, family: 'display', size: 70 * u, minSize: 40 * u, align: 'right', valign: 'bottom', color: P.accent });
    else if (c.sponsor && c.sponsor.logo) sponsorMark(s, c.sponsor, S.l + S.w * 0.45, fy + 10 * u, S.w * 0.55, 90 * u, 'Programme sponsor');
  };

  ARCH.advert = function (s, c) {
    var u = s.u, S = s.S, w = s.w, h = s.h, P = s.pal;
    s.rect(0, 0, w, h, P.bg, { role: 'bg' });
    var plate = { x: S.l, y: S.t, w: S.w, h: S.h * 0.48 };
    s.rect(plate.x, plate.y, plate.w, plate.h, plateFill(s, c.sponsor && c.sponsor.logo), { role: 'logo-plate', radius: 14 * u });
    if (c.sponsor && c.sponsor.logo) {
      var pad = Math.min(plate.w, plate.h) * 0.12;
      s.image({ role: 'logo', src: c.sponsor.logo.colour, x: plate.x + pad, y: plate.y + pad, w: plate.w - pad * 2, h: plate.h - pad * 2, name: 'sponsor-logo' });
    } else {
      s.text({ role: 'missing-logo', text: c.sponsor ? 'No approved logo on file' : 'Choose the sponsor', x: plate.x, y: plate.y, w: plate.w, h: plate.h, size: 40 * u, weight: 700, align: 'center', valign: 'middle', color: '#555555' });
    }
    var y = plate.y + plate.h + 50 * u;
    s.text({ role: 'sponsor-name', text: c.sponsor ? c.sponsor.name : '', x: S.l, y: y, w: S.w, h: 200 * u, family: 'display', size: 120 * u, minSize: 64 * u, maxLines: 2, upper: true });
    y += 210 * u;
    if (c.message) { s.text({ role: 'message', text: c.message, x: S.l, y: y, w: S.w, h: 220 * u, size: 40 * u, minSize: 26 * u, weight: 600, maxLines: 5, lineHeight: 1.35 }); y += 240 * u; }
    if (c.contact) s.text({ role: 'contact', text: c.contact, x: S.l, y: y, w: S.w, h: 70 * u, size: 36 * u, minSize: 24 * u, weight: 800, color: P.accent });
    var cs = 120 * u;
    s.image({ role: 'crest', src: CLUB.crest, x: S.l, y: S.b - cs, w: cs, h: cs, name: 'club-crest' });
    s.text({ role: 'partner-line', text: 'Proud partner of Rayners Lane FC', x: S.l + cs + 24 * u, y: S.b - cs, w: S.w - cs - 24 * u, h: cs, size: 30 * u, minSize: 22 * u, weight: 800, valign: 'middle', color: P.soft });
  };

  // ── Templates ────────────────────────────────────────────────────────────
  var SOCIAL = ['square', 'portrait', 'story', 'landscape'];
  var F = {
    photo: function (cats, help) { return { id: 'photo', label: 'Photograph', kind: 'photo', optional: true, categories: cats, help: help || 'Approved club photography only.' }; },
    sponsor: function (req, label) { return { id: 'sponsor', label: label || 'Sponsor', kind: 'sponsor', optional: !req }; },
    text: function (id, label, max, def, o) { return Object.assign({ id: id, label: label, kind: 'text', max: max, default: def }, o || {}); },
    area: function (id, label, max, def, o) { return Object.assign({ id: id, label: label, kind: 'textarea', max: max, default: def }, o || {}); }
  };

  function fx(ctx, doc) { return (doc.facts && doc.facts.fixture) || null; }
  function teams(f) {
    var us = { name: CLUB.name, crest: CLUB.crest };
    var them = { name: f.opponent || 'Opponent to be confirmed', crest: f.opponentCrest || null };
    return f.isHome === false ? { home: them, away: us } : { home: us, away: them };
  }
  function venueOf(f) {
    if (f.venue) return f.venue;
    return f.isHome === false ? '' : 'Tithe Farm Social Club';
  }
  function fixtureContent(doc, ctx, kicker, extra) {
    var f = fx(ctx, doc) || {};
    var t = teams(f);
    return Object.assign({
      kicker: kicker, competition: f.competition || '', home: t.home, away: t.away,
      date: f.kickoffAt ? dateLine(f.kickoffAt) : '', time: f.kickoffAt ? londonParts(f.kickoffAt).time : '', venue: venueOf(f)
    }, extra || {});
  }
  function val(doc, t, id) {
    var v = doc.fields && doc.fields[id];
    if (v != null && v !== '') return v;
    var fd = (t.fields || []).filter(function (x) { return x.id === id; })[0];
    return fd ? (fd.default == null ? '' : fd.default) : '';
  }
  function scoreText(f) { return f && f.homeScore != null && f.awayScore != null ? f.homeScore + '–' + f.awayScore : ''; }

  var TEMPLATES = [
    // MATCHDAY
    { id: 'next-match', category: 'matchday', label: 'Next match', archetype: 'fixture', needs: 'fixture', fixturePick: 'upcoming', formats: SOCIAL.concat('a4'),
      fields: [F.text('kicker', 'Headline', 16, 'Next match'), F.photo(['ground', 'player', 'matchday']), F.sponsor(false, 'Presenting sponsor')],
      content: function (doc, ctx) { return fixtureContent(doc, ctx, val(doc, this, 'kicker')); } },
    { id: 'matchday', category: 'matchday', label: 'Matchday', archetype: 'fixture', needs: 'fixture', fixturePick: 'today', formats: SOCIAL.concat('a4'),
      fields: [F.text('kicker', 'Headline', 16, 'Matchday'), F.photo(['ground', 'player', 'matchday']), F.sponsor(false, 'Presenting sponsor')],
      content: function (doc, ctx) { return fixtureContent(doc, ctx, val(doc, this, 'kicker')); } },
    { id: 'starting-xi', category: 'matchday', label: 'Starting XI', archetype: 'lineup', needs: 'fixture', fixturePick: 'upcoming', needsLineup: true, formats: SOCIAL,
      fields: [F.text('kicker', 'Headline', 16, 'Starting XI'), F.photo(['player', 'ground'], 'Used in Story and Landscape only.')],
      content: function (doc, ctx) {
        var f = fx(ctx, doc) || {};
        var lu = (doc.facts && doc.facts.lineup) || {};
        var starters = lu.starters || [];
        return { kicker: val(doc, this, 'kicker'), competition: f.competition || '',
          sub: (f.isHome === false ? 'Away at ' : 'v ') + (f.opponent || '') + (f.kickoffAt ? '  ·  ' + shortDate(f.kickoffAt) + ', ' + londonParts(f.kickoffAt).time : ''),
          players: starters, subs: (lu.subs || []).map(function (p) { return p.name; }).join(', ') };
      } },
    { id: 'full-time', category: 'matchday', label: 'Full time', archetype: 'score', needs: 'fixture', fixturePick: 'played', formats: SOCIAL,
      fields: [F.text('kicker', 'Headline', 14, 'Full time'), F.photo(['ground', 'player', 'matchday'])],
      content: function (doc, ctx) {
        var f = fx(ctx, doc) || {}; var c = fixtureContent(doc, ctx, val(doc, this, 'kicker'));
        c.score = scoreText(f); c.meta = c.competition ? c.competition + (f.kickoffAt ? '  ·  ' + shortDate(f.kickoffAt) : '') : ''; return c;
      } },
    { id: 'result', category: 'matchday', label: 'Result', archetype: 'score', needs: 'fixture', fixturePick: 'played', formats: SOCIAL.concat('a4'),
      fields: [F.text('kicker', 'Headline', 14, 'Result'), F.photo(['ground', 'player', 'matchday'])],
      content: function (doc, ctx) {
        var f = fx(ctx, doc) || {}; var c = fixtureContent(doc, ctx, val(doc, this, 'kicker'));
        c.score = scoreText(f);
        var sc = (doc.facts && doc.facts.scorers) || [];
        c.scorers = sc.length ? 'Rayners Lane: ' + sc.map(function (g) { return g.player + ' ' + g.minute + '′' + (g.ownGoal ? ' (og)' : ''); }).join(', ') : '';
        c.meta = [c.competition, f.kickoffAt ? dateLine(f.kickoffAt) : '', venueOf(f)].filter(Boolean).join('  ·  ');
        return c;
      } },
    { id: 'postponed', category: 'matchday', label: 'Postponed', archetype: 'fixture', needs: 'fixture', fixturePick: 'postponed', formats: SOCIAL,
      fields: [F.text('kicker', 'Headline', 16, 'Match off'), F.text('note', 'Reason and next step', 90, 'New date to be confirmed.', { help: 'State only what the club has confirmed.' })],
      content: function (doc, ctx) { return fixtureContent(doc, ctx, val(doc, this, 'kicker'), { stamp: 'Postponed', note: val(doc, this, 'note'), timeLabel: 'Was due to kick off' }); } },
    // SPONSORS
    { id: 'match-sponsor', category: 'sponsors', label: 'Match sponsor', archetype: 'sponsor', needs: 'fixture+sponsor', fixturePick: 'upcoming', formats: SOCIAL,
      fields: [F.sponsor(true), F.text('kicker', 'Headline', 24, "Today's match sponsor"), F.area('message', 'Thank-you line', 120, 'Thank you for supporting your local club.')],
      content: function (doc, ctx) { return sponsorContent(doc, ctx, this, true); } },
    { id: 'matchball-sponsor', category: 'sponsors', label: 'Match-ball sponsor', archetype: 'sponsor', needs: 'fixture+sponsor', fixturePick: 'upcoming', formats: SOCIAL,
      fields: [F.sponsor(true), F.text('kicker', 'Headline', 24, 'Match-ball sponsor'), F.area('message', 'Thank-you line', 120, 'Thank you for sponsoring the match ball.')],
      content: function (doc, ctx) { return sponsorContent(doc, ctx, this, true); } },
    { id: 'new-sponsor', category: 'sponsors', label: 'New sponsor', archetype: 'sponsor', needs: 'sponsor', formats: SOCIAL,
      fields: [F.sponsor(true), F.text('kicker', 'Headline', 24, 'Welcome to the Lane'), F.area('message', 'Announcement line', 140, '')],
      content: function (doc, ctx) { return sponsorContent(doc, ctx, this, false); } },
    // CLUB
    { id: 'news', category: 'club', label: 'News', archetype: 'editorial', needs: null, formats: SOCIAL,
      fields: [F.text('kicker', 'Label', 20, 'Club news'), F.text('headline', 'Headline', 70, '', { required: true }), F.area('body', 'Standfirst', 220, ''),
        F.text('cta', 'Where to read more', 60, SITE + '/news'), F.photo(['ground', 'player', 'team', 'matchday'])],
      content: function (doc) { return editorialContent(doc, this); } },
    { id: 'volunteer', category: 'club', label: 'Volunteer opportunity', archetype: 'editorial', needs: null, formats: SOCIAL.concat('a4'),
      fields: [F.text('kicker', 'Label', 20, 'Volunteer with us'), F.text('headline', 'Role', 60, '', { required: true }), F.area('body', 'What it involves', 260, ''),
        F.text('cta', 'How to apply', 60, SITE + '/volunteer'), F.photo(['ground', 'matchday'])],
      content: function (doc) { return editorialContent(doc, this); } },
    { id: 'statement', category: 'club', label: 'Club statement', archetype: 'editorial', needs: null, formats: SOCIAL.concat('a4'), defaultVariant: 'paper', variants: ['paper', 'night'],
      fields: [F.text('headline', 'Title', 80, '', { required: true }), F.area('body', 'Statement', 1600, '', { required: true }), F.text('signoff', 'Signed', 60, 'Rayners Lane Football Club')],
      content: function (doc) { var c = editorialContent(doc, this); c.formal = true; c.kicker = 'Club statement'; c.signoff = val(doc, this, 'signoff') + (doc.issuedAt ? '  ·  ' + dateLine(doc.issuedAt) : ''); return c; } },
    // PROGRAMME
    { id: 'programme-cover', category: 'programme', label: 'Programme cover', archetype: 'cover', needs: 'fixture', fixturePick: 'programme', formats: ['a4'],
      fields: [F.text('edition', 'Issue', 20, ''), F.text('price', 'Cover price', 10, '', { help: 'Leave empty unless the club has set a price.' }), F.photo(['ground', 'player', 'matchday']), F.sponsor(false, 'Programme sponsor')],
      content: function (doc, ctx) {
        var c = fixtureContent(doc, ctx, '');
        var f = fx(ctx, doc) || {};
        c.season = f.season ? String(f.season).replace(/^(\d{4})-(\d{2})(\d{2})$/, '$1–$3').replace(/^(\d{4})-\d{2}(\d{2})$/, '$1–$2') : '';
        c.edition = val(doc, this, 'edition'); c.price = val(doc, this, 'price'); return c;
      } },
    { id: 'programme-advert', category: 'programme', label: 'Sponsor advert', archetype: 'advert', needs: 'sponsor', formats: ['a4', 'square'], defaultVariant: 'paper', variants: ['paper', 'night'],
      fields: [F.sponsor(true), F.area('message', 'Message', 200, ''), F.text('contact', 'Website or phone', 60, '')],
      content: function (doc, ctx) { var c = sponsorContent(doc, ctx, this, false); c.contact = val(doc, this, 'contact'); return c; } }
  ];
  function sponsorContent(doc, ctx, t, withFixture) {
    var sp = resolveSponsor(doc, ctx);
    var c = { kicker: val(doc, t, 'kicker'), message: val(doc, t, 'message'), sponsor: sp, competition: null };
    if (withFixture) {
      var f = fx(ctx, doc);
      if (f) c.fixtureLine = (f.isHome === false ? 'Away at ' : 'Rayners Lane v ') + (f.opponent || '') + (f.kickoffAt ? '  ·  ' + shortDate(f.kickoffAt) + ', ' + londonParts(f.kickoffAt).time : '');
    }
    return c;
  }
  function editorialContent(doc, t) {
    return { kicker: val(doc, t, 'kicker'), headline: val(doc, t, 'headline'), body: val(doc, t, 'body'), cta: val(doc, t, 'cta'), competition: null };
  }
  var BY_ID = {};
  TEMPLATES.forEach(function (t) { BY_ID[t.id] = t; });
  var CATEGORIES = [
    { id: 'matchday', label: 'Matchday' }, { id: 'sponsors', label: 'Sponsors' },
    { id: 'club', label: 'Club' }, { id: 'programme', label: 'Programme' }
  ];

  // ── Sponsor logo versions (scenario D) ───────────────────────────────────
  function logoVersions(ctx, key) { return (ctx.logos && ctx.logos[key]) || []; }
  function currentLogo(ctx, key) {
    var list = logoVersions(ctx, key).filter(function (v) { return v.approval === 'approved'; });
    var cur = list.filter(function (v) { return v.current; })[0];
    return cur || list.sort(function (a, b) { return b.version - a.version; })[0] || null;
  }
  /** The sponsor as THIS revision recorded it — its pinned logo version, not whatever is newest. */
  function resolveSponsor(doc, ctx) {
    var key = doc.refs && doc.refs.sponsorKey;
    if (!key) return null;
    var sp = (ctx.sponsors || []).filter(function (s) { return s.key === key; })[0];
    if (!sp) return null;
    var pinned = doc.refs.logoVersion;
    var v = pinned != null ? logoVersions(ctx, key).filter(function (x) { return x.version === pinned; })[0] : currentLogo(ctx, key);
    return { key: key, name: sp.name, role: sp.role, url: sp.url, logo: v || null };
  }

  // ── Compose ──────────────────────────────────────────────────────────────
  function variantFor(t, doc) {
    var allowed = t.variants || ['night', 'green', 'paper'];
    var v = doc.variant && allowed.indexOf(doc.variant) > -1 ? doc.variant : (t.defaultVariant || allowed[0]);
    return VARIANTS[v];
  }
  function compose(doc, formatId, ctx, measure) {
    var t = BY_ID[doc.template];
    if (!t) throw new Error('Unknown template: ' + doc.template);
    var fmt = FORMATS[formatId];
    if (!fmt || t.formats.indexOf(formatId) === -1) throw new Error(t.label + ' is not made in ' + (fmt ? fmt.label : formatId));
    measure = measure || approxMeasure;
    var s = new Scene(fmt, variantFor(t, doc), ctx, measure);
    var c = t.content.call(t, doc, ctx);
    var photoId = doc.fields && doc.fields.photo;
    var photoUsed = !(t.id === 'starting-xi' && ['square', 'portrait', 'a4'].indexOf(formatId) > -1);
    if (photoId && photoUsed) {
      var asset = (ctx.assets || []).filter(function (a) { return a.id === photoId; })[0];
      if (asset) c.photo = asset;
    }
    c.crop = (doc.formats && doc.formats[formatId]) || {};
    if (!c.sponsor && doc.refs && doc.refs.sponsorKey && t.fields.some(function (f) { return f.kind === 'sponsor'; })) c.sponsor = resolveSponsor(doc, ctx);
    ARCH[t.archetype](s, c);
    s.layers.forEach(function (L) {
      if (L.type !== 'text') return;
      var r = fitText(L, measure);
      L.fit = r;
    });
    return { template: t.id, format: fmt.id, w: fmt.w, h: fmt.h, safe: s.S, variant: s.pal.id, palette: s.pal, layers: s.layers, photoUsed: !!c.photo, content: c };
  }

  // ── Quality control ──────────────────────────────────────────────────────
  // block = cannot be approved or exported as final; warn = a person must look; info = noted.
  var DECORATIVE = { bg: 1, panel: 1, photo: 1, 'stamp-band': 1, rule: 1, 'row-rule': 1, 'logo-plate': 1, 'kicker-pill': 1 };
  function qc(scene, doc, ctx, nowMs) {
    var out = [];
    var t = BY_ID[doc.template];
    function add(sev, code, msg, layer) { out.push({ severity: sev, code: code, message: msg, role: layer && layer.role }); }
    var S = scene.safe;
    scene.layers.forEach(function (L) {
      if (L.type === 'text') {
        var txt = String(L.text || '').trim();
        if (L.fit && L.fit.overflow && txt) add('block', 'text-overflow', 'Text does not fit: "' + txt.slice(0, 40) + (txt.length > 40 ? '…' : '') + '". Shorten it.', L);
        var scale = Math.min(scene.w, scene.h) / 1080;
        if (txt && L.fit && L.fit.size < 18 * scale) add('warn', 'small-text', 'Text below a readable size: "' + txt.slice(0, 30) + '".', L);
      }
      if (!DECORATIVE[L.role] && L.type !== 'grad') {
        var box = L.draw ? { x: L.draw.dx, y: L.draw.dy, w: L.draw.dw, h: L.draw.dh } : L;
        if (L.type === 'text' && L.fit) {
          var lines = L.fit.lines.length;
          var th = lines * L.fit.lh;
          var ty = L.valign === 'middle' ? L.y + (L.h - th) / 2 : L.valign === 'bottom' ? L.y + L.h - th : L.y;
          box = { x: L.x, y: ty, w: L.fit.widest, h: th };
          if (L.align === 'center') box.x = L.x + (L.w - L.fit.widest) / 2;
          if (L.align === 'right') box.x = L.x + L.w - L.fit.widest;
          if (!String(L.text || '').trim()) return;
        }
        if (box.x < S.l - 1 || box.y < S.t - 1 || box.x + box.w > S.r + 1 || box.y + box.h > S.b + 1) {
          add('block', 'safe-area', 'Outside the safe area: ' + (L.role || L.type) + '.', L);
        }
      }
      if (L.type === 'image') {
        if (L.missing) { add(L.role === 'photo' ? 'block' : 'warn', 'image-missing', 'Image not available: ' + (L.name || L.src), L); return; }
        var d = L.draw, n = L.natural;
        if (L.role === 'crest' || L.role === 'logo') {
          var drawnAr = d.dw / d.dh, realAr = n.w / n.h;
          if (Math.abs(drawnAr / realAr - 1) > 0.01) add('block', 'distorted', 'A ' + L.role + ' would be stretched.', L);
        }
        var up = L.role === 'photo' ? d.dw / d.sw : d.dw / n.w;
        if (up > 2.5 && L.role === 'photo') add('block', 'low-resolution', 'Photograph is ' + up.toFixed(1) + '× enlarged — too soft for ' + FORMATS[scene.format].label + '. Choose a larger original or another format.', L);
        else if (up > 1.5) add('warn', 'low-resolution', (L.role === 'photo' ? 'Photograph' : 'The ' + L.role) + ' is enlarged ' + up.toFixed(1) + '× — check it is sharp.', L);
      }
    });
    // Text over the subject of a photograph.
    var photo = scene.layers.filter(function (L) { return L.role === 'photo' && L.draw && L.subject; })[0];
    if (photo) {
      var sb = photo.subject, d2 = photo.draw, n2 = photo.natural;
      var sx = d2.dx + ((sb.x * n2.w - d2.sx) / d2.sw) * d2.dw, sy = d2.dy + ((sb.y * n2.h - d2.sy) / d2.sh) * d2.dh;
      var sbox = { x: sx, y: sy, w: (sb.w * n2.w / d2.sw) * d2.dw, h: (sb.h * n2.h / d2.sh) * d2.dh };
      var hit = scene.layers.filter(function (L) { return L.type === 'text' && (L.role === 'kicker' || L.role === 'headline' || L.role === 'team' || L.role === 'score') && String(L.text || '').trim() && intersects(L, sbox); });
      if (hit.length) add('warn', 'text-over-subject', 'Text crosses the subject of the photograph — move the focal point or choose another crop.');
    }
    out = out.concat(factChecks(doc, ctx, nowMs, scene.photoUsed));
    return dedupe(out);
  }

  /**
   * The checks that need no pixels: rights, approvals, sponsor logo versions,
   * registry facts, required fields. The server runs exactly these before it
   * accepts a move to review or approval, so a tampered client cannot approve
   * an unlicensed photograph or a graphic with no fixture.
   */
  function factChecks(doc, ctx, nowMs, photoUsed) {
    var out = [];
    var t = BY_ID[doc.template];
    if (!t) return [{ severity: 'block', code: 'template-unknown', message: 'Unknown template.' }];
    var scene = { photoUsed: photoUsed == null ? t.id !== 'starting-xi' : photoUsed };
    function add(sev, code, msg) { out.push({ severity: sev, code: code, message: msg }); }
    // Asset governance.
    if (doc.fields && doc.fields.photo && scene.photoUsed) {
      var a = (ctx.assets || []).filter(function (x) { return x.id === doc.fields.photo; })[0];
      if (!a) add('block', 'photo-unknown', 'The chosen photograph is not in the library.');
      else {
        if (a.approval !== 'approved') add('block', 'photo-unapproved', '"' + a.title + '" is not approved for use' + (a.usage ? ': ' + a.usage : '.'));
        if (!a.rights_holder || !a.licence) add('block', 'photo-rights', '"' + a.title + '" has no recorded rights holder or licence.');
        else if (/not recorded/i.test(a.licence)) add('info', 'photo-credit', '"' + a.title + '": ' + a.licence + '.');
        if (a.expires_at && Date.parse(a.expires_at) < (nowMs || Date.now())) add('block', 'photo-expired', '"' + a.title + '" usage permission expired.');
      }
    }
    if (doc.fields && doc.fields.photo && !scene.photoUsed && t.id === 'starting-xi') add('info', 'photo-unused', 'The photograph is used in Story and Landscape only.');
    // Sponsor governance.
    var sf = t.fields.filter(function (f) { return f.kind === 'sponsor'; })[0];
    if (sf) {
      var key = doc.refs && doc.refs.sponsorKey;
      if (!key && !sf.optional) add('block', 'sponsor-missing', 'Choose the sponsor.');
      if (key) {
        var sp = resolveSponsor(doc, ctx);
        if (!sp) add('block', 'sponsor-unknown', 'That sponsor is not in the sponsor list.');
        else if (!sp.logo) add('block', 'sponsor-logo-missing', sp.name + ' has no approved logo on file. Upload one in the library first.');
        else {
          var cur = currentLogo(ctx, key);
          if (cur && cur.version !== sp.logo.version) add('warn', 'sponsor-logo-outdated', sp.name + ' has a newer approved logo (v' + cur.version + '). This graphic uses v' + sp.logo.version + '.');
        }
      }
    }
    // Facts.
    var f = doc.facts && doc.facts.fixture;
    if (t.needs && /fixture/.test(t.needs)) {
      if (!f) add('block', 'fixture-missing', 'Choose the fixture from the registry.');
      else {
        if (!f.competition) add('warn', 'competition-missing', 'The registry has no competition name for this fixture.');
        if (!f.opponentCrest && t.archetype !== 'sponsor') add('warn', 'crest-missing', 'No crest on file for ' + f.opponent + '. The name is shown on its own.');
        if (t.fixturePick === 'played' && (f.homeScore == null || f.awayScore == null)) add('block', 'score-missing', 'The registry has no final score for this fixture yet.');
        if (t.id === 'matchday' && f.kickoffAt && dayRelation(f.kickoffAt, nowMs) !== 'today') add('warn', 'not-today', 'This fixture is on ' + dateLine(f.kickoffAt) + ', not today. "Matchday" graphics are for the day itself.');
        if (t.id === 'postponed' && String(f.status || '').toLowerCase() !== 'postponed') add('warn', 'not-postponed', 'The registry still lists this fixture as ' + (f.status || 'scheduled') + '. Publish only once the postponement is confirmed.');
        if (t.fixturePick === 'upcoming' && f.kickoffAt && dayRelation(f.kickoffAt, nowMs) === 'past') add('warn', 'fixture-past', 'This fixture has already been played.');
        if (!venueOf(f) && t.archetype === 'fixture') add('warn', 'venue-missing', 'The registry has no venue for this away fixture.');
      }
    }
    if (t.needsLineup) {
      var lu = doc.facts && doc.facts.lineup;
      var n3 = lu && lu.starters ? lu.starters.length : 0;
      if (n3 !== 11) add('block', 'lineup-incomplete', 'A starting XI needs eleven players (' + n3 + ' chosen).');
      if (lu && lu.source === 'squad') add('info', 'lineup-source', 'Line-up chosen from the squad list; the registry has not confirmed it yet.');
    }
    (t.fields || []).forEach(function (fd) {
      if (fd.required && !String((doc.fields || {})[fd.id] || '').trim()) add('block', 'field-required', fd.label + ' is required.');
      var v = (doc.fields || {})[fd.id];
      if (fd.max && typeof v === 'string' && v.length > fd.max) add('block', 'field-too-long', fd.label + ' is longer than ' + fd.max + ' characters.');
    });
    return dedupe(out);
  }
  function dedupe(list) {
    var seen = {};
    return list.filter(function (i) { var k = i.severity + i.code + i.message; if (seen[k]) return false; seen[k] = 1; return true; });
  }
  function blocking(issues) { return issues.filter(function (i) { return i.severity === 'block'; }); }

  /** Repository versions (seed) + uploaded versions (database). A current uploaded version supersedes the seed's. */
  function mergeLogos(seed, rows) {
    var out = {};
    Object.keys(seed || {}).forEach(function (k) { out[k] = (seed[k] || []).map(function (v) { return Object.assign({}, v); }); });
    (rows || []).forEach(function (r) {
      var k = r.sponsor_key;
      out[k] = (out[k] || []).filter(function (v) { return v.version !== r.version; });
      out[k].push({ version: r.version, colour: r.colour, white: r.white || null, ground: r.ground === 'dark' ? 'dark' : 'light', w: r.w, h: r.h, ar: +r.ar || (r.w && r.h ? r.w / r.h : null),
        source: 'upload', approval: r.approval, current: !!r.current, approved_at: r.approved_at || null, approved_by: r.approved_by || null,
        created_by: r.created_by || null, created_at: r.created_at || null, note: r.note || null, retired_at: r.retired_at || null });
    });
    Object.keys(out).forEach(function (k) {
      if (out[k].some(function (v) { return v.source === 'upload' && v.current; })) {
        out[k].forEach(function (v) { if (v.source !== 'upload') v.current = false; });
      }
      out[k].sort(function (a, b) { return a.version - b.version; });
    });
    return out;
  }

  // ── Workflow ─────────────────────────────────────────────────────────────
  // Export is not publication: a file on someone's phone is not a post on
  // Instagram. "published" is recorded by a person, with where it went.
  var STATES = {
    draft:     { label: 'Draft' },
    review:    { label: 'Ready for review' },
    approved:  { label: 'Approved' },
    exported:  { label: 'Exported' },
    published: { label: 'Published' },
    archived:  { label: 'Archived' }
  };
  var FLOW = {
    draft: ['review', 'archived'],
    review: ['approved', 'draft', 'archived'],
    approved: ['exported', 'draft', 'archived'],
    exported: ['published', 'exported', 'draft', 'archived'],
    published: ['draft', 'archived'],
    archived: ['draft']
  };
  /** Why a move is refused, or null. */
  function guardMove(comp, to, opts) {
    opts = opts || {};
    var from = comp.state || 'draft';
    if ((FLOW[from] || []).indexOf(to) === -1) return 'A ' + STATES[from].label.toLowerCase() + ' graphic cannot go to ' + (STATES[to] ? STATES[to].label.toLowerCase() : to) + '.';
    if (!opts.actor || !String(opts.actor).trim()) return 'Say who you are first.';
    if (to === 'review' || to === 'approved') {
      if (opts.blocking && opts.blocking.length) return 'Fix the ' + opts.blocking.length + ' blocking check' + (opts.blocking.length > 1 ? 's' : '') + ' first.';
    }
    if (to === 'published') {
      if (!opts.channel) return 'Say where it was published.';
      if (!opts.url || !/^https?:\/\//.test(opts.url)) return 'Paste the link to the live post — publication is only recorded with evidence.';
    }
    if (to === 'exported' && !opts.exportId) return 'Exported is recorded by a real export.';
    return null;
  }
  /** Saving changes to an approved, exported or published graphic opens a new revision; the approved one is kept. */
  function saveOutcome(comp) {
    var s = comp.state || 'draft';
    if (s === 'draft' || s === 'review') return { newRevision: true, state: 'draft', keepApproved: comp.approved_rev || null };
    return { newRevision: true, state: 'draft', keepApproved: comp.approved_rev || comp.head_rev || null };
  }

  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function fileName(doc, formatId, ext) {
    var t = BY_ID[doc.template];
    var fmt = FORMATS[formatId];
    var f = doc.facts && doc.facts.fixture;
    var bits = ['rlfc', t ? t.id : doc.template];
    if (f && f.opponent) bits.push(slug(f.opponent));
    if (f && f.kickoffAt) bits.push(londonParts(f.kickoffAt).ymd);
    if (doc.refs && doc.refs.sponsorKey && !(f && f.opponent)) bits.push(slug(doc.refs.sponsorKey));
    bits.push(fmt.id, fmt.w + 'x' + fmt.h);
    return bits.join('-') + '.' + ext;
  }

  /** What changed between the snapshot a graphic was made from and the registry now. */
  function factDiff(snap, live) {
    if (!snap || !live) return [];
    var keys = [['kickoffAt', 'Kick-off'], ['venue', 'Venue'], ['competition', 'Competition'], ['opponent', 'Opponent'], ['status', 'Status'], ['homeScore', 'Home score'], ['awayScore', 'Away score']];
    var out = [];
    keys.forEach(function (k) {
      var a = snap[k[0]], b = live[k[0]];
      if ((a == null ? '' : String(a)) !== (b == null ? '' : String(b))) {
        out.push({ key: k[0], label: k[1], was: k[0] === 'kickoffAt' && a ? dateLine(a) + ', ' + londonParts(a).time : a, now: k[0] === 'kickoffAt' && b ? dateLine(b) + ', ' + londonParts(b).time : b });
      }
    });
    return out;
  }

  return {
    TZ: TZ, SITE: SITE, CLUB: CLUB, FORMATS: FORMATS, FORMAT_ORDER: FORMAT_ORDER, VARIANTS: VARIANTS,
    TEMPLATES: TEMPLATES, CATEGORIES: CATEGORIES, template: function (id) { return BY_ID[id] || null; },
    londonParts: londonParts, dateLine: dateLine, shortDate: shortDate, dayRelation: dayRelation, londonYmd: londonYmd,
    contain: contain, cover: cover, wrap: wrap, fitText: fitText, approxMeasure: approxMeasure, FAMILY: FAMILY,
    compose: compose, qc: qc, factChecks: factChecks, mergeLogos: mergeLogos, blocking: blocking, variantFor: variantFor,
    logoVersions: logoVersions, currentLogo: currentLogo, resolveSponsor: resolveSponsor,
    STATES: STATES, FLOW: FLOW, guardMove: guardMove, saveOutcome: saveOutcome,
    fileName: fileName, factDiff: factDiff, slug: slug
  };
}));
