/* ════════════════════════════════════════════════════════════════════════
   PROGRAMME STUDIO — PDF.
   Draws the SAME page HTML the preview shows into a real PDF:
     · text as text — embedded Manrope / Bebas Neue (the site's own fonts),
       selectable and sharp at any zoom; each word placed where the browser
       laid it out, so the PDF matches the preview;
     · colours, rules and circles as vector shapes;
     · photographs resampled to 300 ppi at their printed size (never upscaled);
     · TrimBox / BleedBox on every page, so a printer's software knows where to cut.
   It does NOT make CMYK or PDF/X: a browser cannot. The Studio labels the
   output accordingly (see the printer profile).
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var FONTS = [['Manrope-Regular.ttf', 'Manrope', 'normal'], ['Manrope-SemiBold.ttf', 'Manrope', 'semibold'],
    ['Manrope-ExtraBold.ttf', 'Manrope', 'extrabold'], ['BebasNeue-Regular.ttf', 'BebasNeue', 'normal']];
  var fontCache = null;
  function loadFonts() {
    if (fontCache) return fontCache;
    fontCache = Promise.all(FONTS.map(function (f) {
      return fetch('fonts/pdf/' + f[0]).then(function (r) { if (!r.ok) throw new Error('font ' + f[0]); return r.arrayBuffer(); })
        .then(function (buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return [f, btoa(s)]; });
    })).catch(function (e) { fontCache = null; throw e; });
    return fontCache;
  }

  function rgba(c) {
    var m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
    var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function fontFor(cs) {
    if (/bebas/i.test(cs.fontFamily)) return ['BebasNeue', 'normal'];
    var w = parseInt(cs.fontWeight, 10) || 400;
    return ['Manrope', w >= 700 ? 'extrabold' : (w >= 550 ? 'semibold' : 'normal')];
  }

  var measureCtx = document.createElement('canvas').getContext('2d');
  function metrics(cs) {
    measureCtx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var m = measureCtx.measureText('Hg');
    return { asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent };
  }

  /** A picture cropped/fitted exactly as the browser shows it, at ≤300 ppi. */
  function rasterise(src, box, fit, pos, mmW, mmH, round, fill, overlay) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        var targetW = Math.max(1, Math.round(mmW / 25.4 * 300)), targetH = Math.max(1, Math.round(mmH / 25.4 * 300));
        // Never more pixels than the picture really has across the printed area.
        var scaleCap = Math.min(1, Math.max(im.naturalWidth / targetW, im.naturalHeight / targetH));
        var W = Math.max(1, Math.round(targetW * scaleCap)), H = Math.max(1, Math.round(targetH * scaleCap));
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var c = cv.getContext('2d');
        c.fillStyle = fill || '#ffffff'; c.fillRect(0, 0, W, H);
        if (round) { c.beginPath(); c.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2); c.clip(); }
        var s, dw, dh;
        if (fit === 'contain') s = Math.min(W / im.naturalWidth, H / im.naturalHeight);
        else if (fit === 'fill') s = null;
        else s = Math.max(W / im.naturalWidth, H / im.naturalHeight);   // cover
        if (s === null) { c.drawImage(im, 0, 0, W, H); }
        else {
          dw = im.naturalWidth * s; dh = im.naturalHeight * s;
          var px = (pos && pos[0] != null ? pos[0] : 0.5), py = (pos && pos[1] != null ? pos[1] : 0.5);
          c.drawImage(im, (W - dw) * px, (H - dh) * py, dw, dh);
        }
        if (overlay) {
          var g = c.createLinearGradient(0, 0, 0, H);
          overlay.forEach(function (stop, i) { g.addColorStop(overlay.length === 1 ? 0 : i / (overlay.length - 1), stop); });
          c.fillStyle = g; c.fillRect(0, 0, W, H);
        }
        resolve({ data: cv.toDataURL('image/jpeg', 0.9), ppi: Math.round(W / (mmW / 25.4)) });
      };
      im.onerror = function () { resolve(null); };
      im.src = src;
    });
  }
  function bgUrl(v) { var m = /url\(["']?([^"')]+)["']?\)/.exec(v || ''); return m ? m[1] : null; }
  function gradientStops(v) {
    var m = /linear-gradient\((.*)\)\s*,\s*url\(/.exec(v || ''); if (!m) return null;
    return (m[1].match(/rgba?\([^)]+\)/g) || []);
  }
  function posOf(cs) {
    var p = String(cs.objectPosition || cs.backgroundPosition || '50% 50%').split(/\s+/).map(function (x) { return /%$/.test(x) ? parseFloat(x) / 100 : (x === 'left' || x === 'top' ? 0 : x === 'right' || x === 'bottom' ? 1 : 0.5); });
    return [p[0], p.length > 1 ? p[1] : 0.5];
  }

  async function drawPage(doc, sheet, Wmm, Hmm, report) {
    var origin = sheet.getBoundingClientRect();
    var k = origin.width / Wmm;                    // CSS px per mm on this stage
    var X = function (px) { return (px - origin.left) / k; }, Y = function (px) { return (px - origin.top) / k; };
    var lowRes = [];

    async function walk(el, clipped) {
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      var r = el.getBoundingClientRect();
      var x = X(r.left), y = Y(r.top), w = r.width / k, h = r.height / k;
      var radius = parseFloat(cs.borderTopLeftRadius) || 0;
      var round = radius > 0 && radius >= Math.min(r.width, r.height) / 2 - 0.5;
      var bg = rgba(cs.backgroundColor);
      var url = bgUrl(cs.backgroundImage);

      if (url) {
        var img = await rasterise(url, r, cs.backgroundSize === 'contain' ? 'contain' : 'cover', posOf(cs), w, h, round,
          bg && bg.a > 0 ? cs.backgroundColor : '#ffffff', gradientStops(cs.backgroundImage));
        if (img) { doc.addImage(img.data, 'JPEG', x, y, w, h, undefined, 'FAST'); if (img.ppi < 200 && w * h > 400) lowRes.push(img.ppi); }
      } else if (bg && bg.a > 0) {
        doc.setFillColor(bg.r, bg.g, bg.b);
        if (round) doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 'F'); else doc.rect(x, y, w, h, 'F');
      }

      if (el.tagName === 'IMG' && el.currentSrc) {
        var fit = cs.objectFit === 'contain' ? 'contain' : (cs.objectFit === 'fill' ? 'fill' : 'cover');
        if (fit === 'contain' || fit === 'fill') {
          // A contained picture: place it at its true box, keeping its proportions.
          var nw = el.naturalWidth, nh = el.naturalHeight;
          if (nw && nh && fit === 'contain') { var s = Math.min(w / nw, h / nh); var iw = nw * s, ih = nh * s; var p = posOf(cs);
            var im2 = await rasterise(el.currentSrc, r, 'fill', null, iw, ih, false, '#ffffff', null);
            if (im2) { doc.addImage(im2.data, 'JPEG', x + (w - iw) * p[0], y + (h - ih) * p[1], iw, ih, undefined, 'FAST'); if (im2.ppi < 200) lowRes.push(im2.ppi); }
          } else { var im3 = await rasterise(el.currentSrc, r, 'fill', null, w, h, round, '#ffffff', null); if (im3) doc.addImage(im3.data, 'JPEG', x, y, w, h, undefined, 'FAST'); }
        } else {
          var im4 = await rasterise(el.currentSrc, r, 'cover', posOf(cs), w, h, round, '#ffffff', null);
          if (im4) { doc.addImage(im4.data, 'JPEG', x, y, w, h, undefined, 'FAST'); if (im4.ppi < 200 && w * h > 400) lowRes.push(im4.ppi); }
        }
      }

      // Borders (the Studio's pages use one colour and width per box).
      var bw = parseFloat(cs.borderTopWidth) || 0, bc = rgba(cs.borderTopColor);
      if (bw > 0 && cs.borderTopStyle !== 'none' && bc && bc.a > 0) {
        doc.setDrawColor(bc.r, bc.g, bc.b); doc.setLineWidth(bw / k);
        if (cs.borderTopStyle === 'dashed') doc.setLineDashPattern([1.5, 1], 0); else doc.setLineDashPattern([], 0);
        var allSides = ['Right', 'Bottom', 'Left'].every(function (sd) { return (parseFloat(cs['border' + sd + 'Width']) || 0) > 0; });
        if (round) doc.ellipse(x + w / 2, y + h / 2, w / 2 - bw / k / 2, h / 2 - bw / k / 2, 'S');
        else if (allSides) doc.rect(x + bw / k / 2, y + bw / k / 2, w - bw / k, h - bw / k, 'S');
        else doc.line(x, y + bw / k / 2, x + w, y + bw / k / 2);
        doc.setLineDashPattern([], 0);
      }
      var bbw = parseFloat(cs.borderBottomWidth) || 0, bbc = rgba(cs.borderBottomColor);
      if (bbw > 0 && !(parseFloat(cs.borderTopWidth) > 0) && cs.borderBottomStyle !== 'none' && bbc && bbc.a > 0) {
        doc.setDrawColor(bbc.r, bbc.g, bbc.b); doc.setLineWidth(bbw / k); doc.line(x, y + h - bbw / k / 2, x + w, y + h - bbw / k / 2);
      }

      // Overflow hidden: everything inside is clipped to this box, as on screen.
      var clip = cs.overflow === 'hidden' && el !== sheet;
      if (clip) { doc.saveGraphicsState(); doc.rect(x, y, w, h, null); doc.clip(); doc.discardPath(); }

      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1) await walk(n, clipped || clip);
        else if (n.nodeType === 3 && n.nodeValue.trim()) drawText(n, cs);
      }
      if (clip) doc.restoreGraphicsState();
    }

    function drawText(node, cs) {
      var col = rgba(cs.color) || { r: 0, g: 0, b: 0 };
      var f = fontFor(cs);
      doc.setFont(f[0], f[1]);
      var sizePx = parseFloat(cs.fontSize);
      doc.setFontSize(sizePx / k * 72 / 25.4);
      doc.setTextColor(col.r, col.g, col.b);
      var ls = parseFloat(cs.letterSpacing); ls = isFinite(ls) ? ls / k : 0;
      var m = metrics(cs);
      var upper = cs.textTransform === 'uppercase';
      var text = node.nodeValue, re = /\S+/g, mt, range = document.createRange();
      while ((mt = re.exec(text))) {
        range.setStart(node, mt.index); range.setEnd(node, mt.index + mt[0].length);
        var rects = range.getClientRects();
        if (!rects.length) continue;
        var rr = rects[0];
        var baseline = rr.top + (rr.height - (m.asc + m.desc)) / 2 + m.asc;
        // A trailing space (invisible) keeps words apart when text is copied out of the PDF.
        var word = (upper ? mt[0].toUpperCase() : mt[0]) + (/\s/.test(text.charAt(mt.index + mt[0].length)) ? ' ' : '');
        doc.text(word, X(rr.left), Y(baseline), { baseline: 'alphabetic', charSpace: ls });
      }
      range.detach && range.detach();
    }

    await walk(sheet, false);
    if (lowRes.length) report.lowRes.push(Math.min.apply(null, lowRes));
    else report.lowRes.push(null);
  }

  /**
   * @param pages  array of functions returning a .pg-sheet element already in the DOM (bleed size)
   * @returns {Promise<{blob, sha256, pageCount, lowRes:[]}>}
   */
  async function render(opts) {
    var jsPDF = window.jspdf.jsPDF;
    var Wmm = opts.trimW + 2 * opts.bleed, Hmm = opts.trimH + 2 * opts.bleed;
    var doc = new jsPDF({ unit: 'mm', format: [Wmm, Hmm], orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
    var fonts = await loadFonts();
    fonts.forEach(function (x) { doc.addFileToVFS(x[0][0], x[1]); doc.addFont(x[0][0], x[0][1], x[0][2]); });
    var report = { lowRes: [] };
    for (var i = 0; i < opts.count; i++) {
      if (opts.progress) opts.progress(i + 1, opts.count);
      if (i) doc.addPage([Wmm, Hmm], 'portrait');
      var sheet = await opts.page(i);
      await drawPage(doc, sheet, Wmm, Hmm, report);
      // Where to cut (TrimBox) and how far artwork runs (BleedBox), in points.
      var pt = 72 / 25.4, ctx = doc.internal.getPageInfo(i + 1).pageContext;
      ctx.trimBox = { bottomLeftX: opts.bleed * pt, bottomLeftY: opts.bleed * pt, topRightX: (Wmm - opts.bleed) * pt, topRightY: (Hmm - opts.bleed) * pt };
      ctx.bleedBox = { bottomLeftX: 0, bottomLeftY: 0, topRightX: Wmm * pt, topRightY: Hmm * pt };
    }
    doc.setProperties(opts.meta || {});
    var blob = doc.output('blob');
    var sha = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    var hex = Array.prototype.map.call(new Uint8Array(sha), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return { blob: blob, sha256: hex, pageCount: opts.count, lowRes: report.lowRes };
  }

  window.StudioPDF = { render: render, loadFonts: loadFonts };
})();
