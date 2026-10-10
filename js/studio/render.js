/* ════════════════════════════════════════════════════════════════════════
   ASSET STUDIO — RENDERER

   Draws a composed scene (StudioCore.compose) onto a <canvas> of EXACTLY the
   format's pixel size, and turns it into real files: PNG, JPEG, A4 PDF, ZIP.

   One drawing path for the preview and the export. The preview is the same
   canvas scaled down with CSS, so what a person approves is what they get.

   The fonts are the club's own self-hosted files (fonts/*.woff2), loaded into
   the canvas explicitly — a canvas will otherwise silently draw in a fallback
   face before the web font arrives, and that is exactly the kind of export
   nobody notices until it is on Instagram.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var Core = global.StudioCore, Pack = global.StudioPack;

  var images = {};      // src → { img, w, h } | { error }
  var pending = {};
  var fontsReady = null;

  function loadFonts() {
    if (fontsReady) return fontsReady;
    var faces = [
      ['Bebas Neue', 'fonts/bebas-neue-latin.woff2', { weight: '400' }],
      ['Bebas Neue', 'fonts/bebas-neue-latinext.woff2', { weight: '400', unicodeRange: 'U+0100-02BA, U+1E00-1E9F' }],
      ['Manrope', 'fonts/manrope-latin.woff2', { weight: '400 800' }],
      ['Manrope', 'fonts/manrope-latinext.woff2', { weight: '400 800', unicodeRange: 'U+0100-02BA, U+1E00-1E9F' }]
    ];
    fontsReady = Promise.all(faces.map(function (f) {
      try {
        var ff = new FontFace(f[0], 'url(' + f[1] + ')', f[2]);
        document.fonts.add(ff);
        return ff.load().catch(function () { return null; });
      } catch (e) { return null; }
    })).then(function () {
      return Promise.all(['400 100px "Bebas Neue"', '500 40px Manrope', '700 40px Manrope', '800 40px Manrope'].map(function (s) {
        return document.fonts.load(s).catch(function () {});
      }));
    });
    return fontsReady;
  }

  function loadImage(src) {
    if (images[src]) return Promise.resolve(images[src]);
    if (pending[src]) return pending[src];
    pending[src] = new Promise(function (resolve) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        images[src] = { img: img, w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
        delete pending[src]; resolve(images[src]);
      };
      img.onerror = function () { images[src] = { error: true }; delete pending[src]; resolve(images[src]); };
      img.src = src;
    });
    return pending[src];
  }
  function meta(src) { var m = images[src]; return m && !m.error ? { w: m.w, h: m.h } : null; }

  var mctx = null;
  function fontString(f) {
    return (f.family === 'display' ? '400 ' : (f.weight || 600) + ' ') + Math.max(1, f.size) + 'px ' + Core.FAMILY[f.family === 'display' ? 'display' : 'body'];
  }
  function measure(text, f) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = fontString(f);
    var w = mctx.measureText(text).width;
    return w + Math.max(0, String(text).length - 1) * (f.tracking || 0) * f.size;
  }

  /**
   * Compose with every image the scene needs actually loaded, so contain/cover
   * maths runs on real pixel sizes. Two passes: find what is needed, load it,
   * compose again.
   */
  function prepare(doc, formatId, ctx) {
    var c = Object.assign({}, ctx, { meta: meta });
    return loadFonts().then(function () {
      var first = Core.compose(doc, formatId, c, measure);
      var need = first.layers.filter(function (L) { return L.type === 'image' && L.src && !images[L.src]; }).map(function (L) { return L.src; });
      return Promise.all(need.map(loadImage)).then(function () { return Core.compose(doc, formatId, c, measure); });
    });
  }

  function roundRect(g, x, y, w, h, r) {
    if (!r) { g.rect(x, y, w, h); return; }
    if (g.roundRect) { g.roundRect(x, y, w, h, r); return; }
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /** Draw the scene. Returns the canvas. */
  function draw(scene, canvas, opts) {
    opts = opts || {};
    canvas = canvas || document.createElement('canvas');
    canvas.width = scene.w; canvas.height = scene.h;
    var g = canvas.getContext('2d');
    g.textBaseline = 'alphabetic';
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    scene.layers.forEach(function (L) {
      g.save();
      if (L.alpha != null) g.globalAlpha = L.alpha;
      if (L.type === 'rect') {
        g.fillStyle = L.fill; g.beginPath(); roundRect(g, L.x, L.y, L.w, L.h, L.radius || 0); g.fill();
      } else if (L.type === 'grad') {
        var gr = L.dir === 'h' ? g.createLinearGradient(L.x, 0, L.x + L.w, 0) : g.createLinearGradient(0, L.y, 0, L.y + L.h);
        L.stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
        g.fillStyle = gr; g.fillRect(L.x, L.y, L.w, L.h);
      } else if (L.type === 'image' && L.draw) {
        var im = images[L.src];
        if (im && im.img) {
          var d = L.draw;
          if (L.role === 'photo') { g.beginPath(); g.rect(L.x, L.y, L.w, L.h); g.clip(); }
          g.drawImage(im.img, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw, d.dh);
        }
      } else if (L.type === 'text' && L.fit) {
        var f = L.fit;
        g.fillStyle = L.color;
        g.font = fontString({ family: L.family, weight: L.weight, size: f.size });
        if ('letterSpacing' in g) g.letterSpacing = ((L.tracking || 0) * f.size) + 'px';
        var total = f.lines.length * f.lh;
        var y0 = L.valign === 'middle' ? L.y + (L.h - total) / 2 : L.valign === 'bottom' ? L.y + L.h - total : L.y;
        // Baseline sits ~0.8 of the line box for Bebas (all caps), ~0.75 for Manrope.
        var base = L.family === 'display' ? 0.84 : 0.76;
        f.lines.forEach(function (ln, i) {
          var w = measure(ln, { family: L.family, weight: L.weight, size: f.size, tracking: L.tracking });
          var x = L.align === 'center' ? L.x + (L.w - w) / 2 : L.align === 'right' ? L.x + L.w - w : L.x;
          var lineTop = y0 + i * f.lh;
          g.fillText(ln, x, lineTop + (f.lh - f.size) / 2 + f.size * base);
        });
      }
      g.restore();
    });
    if (opts.proof) {
      var bh = Math.round(Math.min(scene.w, scene.h) * 0.06);
      g.fillStyle = 'rgba(229,52,31,0.92)'; g.fillRect(0, scene.h - bh, scene.w, bh);
      g.fillStyle = '#FFFFFF'; g.font = '800 ' + Math.round(bh * 0.42) + 'px Manrope';
      var label = 'PROOF — NOT APPROVED FOR PUBLICATION';
      g.fillText(label, (scene.w - g.measureText(label).width) / 2, scene.h - bh * 0.34);
    }
    if (opts.guides) {
      var S = scene.safe;
      g.setLineDash([12, 10]); g.lineWidth = Math.max(2, scene.w / 540);
      g.strokeStyle = 'rgba(34,197,94,0.9)'; g.strokeRect(S.l, S.t, S.r - S.l, S.b - S.t);
    }
    return canvas;
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('The browser could not encode the image.')); }, type, quality);
    });
  }
  function bytes(blob) { return blob.arrayBuffer().then(function (ab) { return new Uint8Array(ab); }); }
  function sha256(u8) {
    if (!global.crypto || !crypto.subtle) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', u8).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    });
  }

  /**
   * Produce one real file and VERIFY it before handing it over: the bytes are
   * parsed back and the pixel size must equal the format, or it is refused.
   * kind: 'png' | 'jpeg' | 'pdf'
   */
  function exportFile(doc, formatId, ctx, kind, opts) {
    opts = opts || {};
    var fmt = Core.FORMATS[formatId];
    return prepare(doc, formatId, ctx).then(function (scene) {
      var canvas = draw(scene, null, { proof: !!opts.proof });
      var type = kind === 'png' ? 'image/png' : 'image/jpeg';
      return toBlob(canvas, type, kind === 'png' ? undefined : 0.92).then(bytes).then(function (u8) {
        var size = Pack.imageSize(u8);
        if (!size || size.w !== fmt.w || size.h !== fmt.h) throw new Error('Export check failed: expected ' + fmt.w + '×' + fmt.h + ', got ' + (size ? size.w + '×' + size.h : 'unreadable'));
        var out = u8, mime = type, ext = kind === 'png' ? 'png' : 'jpg';
        if (kind === 'pdf') {
          if (!fmt.pdf) throw new Error(fmt.label + ' has no PDF page size.');
          out = Pack.pdf([{ jpeg: u8, pxW: fmt.w, pxH: fmt.h, wPt: fmt.pdf.wPt, hPt: fmt.pdf.hPt }], { title: Core.fileName(doc, formatId, 'pdf') });
          mime = 'application/pdf'; ext = 'pdf';
        }
        var name = Core.fileName(doc, formatId, ext);
        if (opts.proof) name = name.replace(/\.(\w+)$/, '-PROOF.$1');
        return sha256(out).then(function (hash) {
          return { name: name, bytes: out, mime: mime, w: fmt.w, h: fmt.h, format: formatId, kind: kind, sha256: hash, canvas: canvas, scene: scene };
        });
      });
    });
  }

  /** A small JPEG of a canvas for the library record (≈ 360px on the long edge). */
  function thumbnail(canvas, max) {
    max = max || 360;
    var s = Math.min(1, max / Math.max(canvas.width, canvas.height));
    var c = document.createElement('canvas');
    c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
    var g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.78);
  }

  function download(name, u8, mime) {
    var blob = new Blob([u8], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  global.StudioRender = {
    loadFonts: loadFonts, loadImage: loadImage, meta: meta, measure: measure,
    prepare: prepare, draw: draw, exportFile: exportFile, thumbnail: thumbnail, download: download,
    toBlob: toBlob, bytes: bytes, sha256: sha256
  };
}(typeof window !== 'undefined' ? window : globalThis));
