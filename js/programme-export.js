/* ════════════════════════════════════════════════════════════════════════
   PROGRAMME EXPORT — the toolbar on programme-print.html.

   WHAT WAS WRONG
   · The page opened the print dialog on a timer (900 ms after load, and again
     at 1400 ms). On a slow phone that was before the crests and fonts had
     arrived, so the club printed blank or half-built sheets.
   · The only "download" was the browser's print dialog, which on an iPhone
     does not save a file at all without several hidden steps.
   · The sheet is a fixed A4 width, so a phone showed the left two thirds of
     every page.

   WHAT THIS DOES
   · Nothing can be exported until the pages exist, fonts have loaded and
     every image has either loaded or been reported as missing. No timers.
   · "Download PDF" builds a real PDF one page at a time — one canvas alive at
     once, released before the next — so a 24-page edition does not exhaust a
     phone's memory. The finished file stays available as a link, and can be
     shared / saved to Files where the device supports it.
   · The on-screen preview is scaled to fit; print and PDF dimensions are not
     touched (the scale is removed for the duration of the export).
   · It says plainly that this PDF is for reading, sharing and home printing.
     It is RGB with no bleed: not a press-ready file.

   TWO OUTPUTS (2026-11)
   · Reading PDF — the pages exactly as designed, in order.
   · Booklet PDF — the same, padded to a multiple of four with designed
     completion pages inserted BEFORE the back cover (ProgrammeEdition.
     bookletPlan). Still in reading order: the printer or print dialogue does
     the imposition (2-up, saddle stitch). This file does not impose.

   SELECTABLE TEXT
   · Each page is a rendered image (so every graphic matches the screen) with
     an invisible text layer on top, placed from the real positions of the
     words on the page and set in an embedded Manrope (fonts/pdf). The text
     can be searched, selected and copied; it is not visible vector type.
     If the font cannot be loaded the PDF is image-only and says so.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var A4 = { w: 210, h: 297 };
  var state = { building: false, url: null, file: null, missing: [], textLayer: false };

  function $(id) { return document.getElementById(id); }
  function say(msg, kind) {
    var el = $('px-status'); if (!el) return;
    el.textContent = msg; el.className = 'px-status' + (kind ? ' px-status--' + kind : '');
  }
  function pages() { return Array.prototype.slice.call(document.querySelectorAll('#pages > .page')); }

  /* ── fit the A4 sheets to the screen (screen only) ─────────────────── */
  function fit() {
    var host = $('pages'); if (!host) return;
    var sheet = 210 / 25.4 * 96;                       // 794 px
    var avail = document.documentElement.clientWidth - 16;
    var s = Math.min(1, avail / sheet);
    host.style.setProperty('--px-scale', s.toFixed(4));
    host.classList.toggle('px-scaled', s < 0.999);
  }

  /* ── readiness: real content, fonts, every image settled ───────────── */
  function imageSettled(img) {
    if (img.complete) return Promise.resolve(img.naturalWidth > 0);
    return new Promise(function (ok) {
      img.addEventListener('load', function () { ok(true); }, { once: true });
      img.addEventListener('error', function () { ok(false); }, { once: true });
    });
  }
  function whenReady() {
    var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return fonts.then(function () {
      var imgs = Array.prototype.slice.call(document.querySelectorAll('#pages img, #px-extra img'));
      return Promise.all(imgs.map(function (img) {
        return imageSettled(img).then(function (ok) {
          if (!ok) {
            var where = img.closest('.page'); var n = where ? pages().indexOf(where) + 1 : 0;
            state.missing.push({ src: img.getAttribute('src') || '', page: n });
          }
        });
      }));
    });
  }

  function fileName(doc, booklet) {
    var opp = String((doc && doc.opponent) || 'programme').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'rayners-lane-v-' + opp + '-' + ((doc && doc.date) || 'undated') + (doc && doc.published ? '' : '-draft') + (booklet ? '-booklet' : '') + '.pdf';
  }

  function vendor(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function libs() {
    var p = Promise.resolve();
    if (!window.html2canvas) p = p.then(function () { return vendor('js/vendor/html2canvas-1.4.1.min.js'); });
    if (!(window.jspdf && window.jspdf.jsPDF)) p = p.then(function () { return vendor('js/vendor/jspdf-4.2.1.umd.min.js'); });
    return p;
  }

  /* html2canvas 1.4.1 predates CSS Color 4 and aborts the whole page on a
     color()/color-mix()/oklch() value (the tinted cover uses color-mix). In
     the throwaway clone it renders from, rewrite each such computed value to
     plain rgba(). The visible page is never touched. */
  var probe = null;
  function toRgba(c) {
    var m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/.exec(c);
    if (m) { var a = m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return 'rgba(' + Math.round(m[1] * 255) + ',' + Math.round(m[2] * 255) + ',' + Math.round(m[3] * 255) + ',' + a + ')'; }
    try {                                                  // anything else: let the browser paint one pixel and read it back
      if (!probe) { probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); probe.canvas.width = probe.canvas.height = 1; }
      probe.clearRect(0, 0, 1, 1); probe.fillStyle = c; probe.fillRect(0, 0, 1, 1);
      var d = probe.getImageData(0, 0, 1, 1).data; return 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (d[3] / 255).toFixed(3) + ')';
    } catch (e) { return 'rgba(0,0,0,0)'; }
  }
  var MODERN = /(color\(|color-mix\(|oklch\(|oklab\(|lab\(|lch\()[^()]*(\([^()]*\)[^()]*)*\)/g;
  var PROPS = ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'boxShadow', 'outlineColor', 'textDecorationColor', 'fill', 'stroke'];
  function flattenColours(doc) {
    var win = doc.defaultView;
    Array.prototype.forEach.call(doc.querySelectorAll('*'), function (el) {
      var cs = win.getComputedStyle(el);
      PROPS.forEach(function (p) {
        var v = cs[p]; if (!v || !/(color\(|color-mix|oklch|oklab|lab\(|lch\()/.test(v)) return;
        el.style[p] = v.replace(MODERN, function (tok) { return toRgba(tok); });
      });
    });
  }

  /* One page at a time. Scale 2 on desktop (≈190 dpi on A4), 1.5 on phones to
     keep each canvas near 12 MP and well inside iOS Safari's canvas limit. */
  /* ── the selectable text layer ─────────────────────────────────────── */
  var fontB64 = null;
  function loadFont() {
    if (fontB64) return Promise.resolve(fontB64);
    return fetch('fonts/pdf/Manrope-Regular.ttf').then(function (r) {
      if (!r.ok) throw new Error('font ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var b = new Uint8Array(buf), s = '', CH = 0x8000;
      for (var i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
      fontB64 = btoa(s); return fontB64;
    });
  }
  function shown(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      if (e.classList.contains('page')) break;
    }
    return true;
  }
  /** Words of one page as lines: [{ text, x, y, w, h }] in mm from the page's top-left. */
  function pageLines(pg) {
    var box = pg.getBoundingClientRect(), k = 210 / box.width, out = [];
    var walk = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT, null);
    var range = document.createRange(), node;
    while ((node = walk.nextNode())) {
      var txt = node.nodeValue; if (!/\S/.test(txt)) continue;
      var el = node.parentElement; if (!el || !shown(el)) continue;
      var tt = getComputedStyle(el).textTransform;
      var cur = null, m, re = /\S+/g;
      while ((m = re.exec(txt))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        var r = range.getClientRects()[0]; if (!r || r.width < 0.5) continue;
        var w = tt === 'uppercase' ? m[0].toUpperCase() : m[0];
        if (cur && Math.abs(r.top - cur.t) < r.height * 0.5 && r.left >= cur.r - 2) {
          cur.s += ' ' + w; cur.r = r.right; cur.b = Math.max(cur.b, r.bottom);
        } else {
          if (cur) out.push(cur);
          cur = { s: w, l: r.left, r: r.right, t: r.top, b: r.bottom };
        }
      }
      if (cur) out.push(cur);
    }
    return out.map(function (c) {
      return { text: c.s, x: (c.l - box.left) * k, y: (c.t - box.top) * k, w: (c.r - c.l) * k, h: (c.b - c.t) * k };
    });
  }
  function writeText(pdf, lines) {
    lines.forEach(function (ln) {
      if (ln.y > A4.h || ln.x > A4.w || ln.h <= 0) return;
      var pt = ln.h * 0.78 / 0.3528;                      // glyph box (mm) → point size
      pdf.setFontSize(pt);
      var nat = pdf.getTextWidth(ln.text);
      var hs = nat > 0 ? ln.w / nat : 1;
      pdf.text(ln.text, ln.x, ln.y + ln.h * 0.8, { renderingMode: 'invisible', horizontalScale: hs, baseline: 'alphabetic' });
    });
  }

  /* ── booklet: completion pages in, before the back cover ──────────── */
  function insertCompletion() {
    var host = $('pages'), hold = $('px-extra');
    var list = pages(), avail = (window.__pxExtra && window.__pxExtra.available) || {};
    if (!window.ProgrammeEdition || !hold || list.length < 2) return { moved: [], plan: { pages: list.length, add: [] } };
    var plan = window.ProgrammeEdition.bookletPlan(list.length, avail);
    var back = list[list.length - 1], moved = [];
    plan.add.forEach(function (k) {
      var el = hold.querySelector('[data-x="' + k + '"]'); if (!el) return;
      host.insertBefore(el, back); moved.push(el);
    });
    // Same numbering as the pages around them (the cover is unnumbered).
    pages().forEach(function (p, i) { var pgn = p.querySelector('[data-pg]'); if (pgn) pgn.textContent = String(i); });
    return { moved: moved, plan: plan };
  }
  function restoreCompletion(moved) {
    var hold = $('px-extra'); (moved || []).forEach(function (el) { hold.appendChild(el); });
  }

  function build(doc, mode) {
    if (state.building) return Promise.resolve(null);   // a second click does nothing
    state.building = true;
    var booklet = mode === 'booklet';
    var btns = [$('px-pdf'), $('px-booklet')];
    btns.forEach(function (b) { if (b) { b.disabled = true; b.setAttribute('aria-busy', 'true'); } });
    var ins = booklet ? insertCompletion() : { moved: [] };
    var list = pages();
    var host = $('pages'); var wasScaled = host.classList.contains('px-scaled');
    host.classList.remove('px-scaled');                 // export at true size
    document.documentElement.classList.add('px-exporting');   // exactly one A4 sheet per page, as in print
    var small = Math.min(screen.width, screen.height) < 700;
    var scale = small ? 1.5 : 2.5;
    var pdf;
    state.textLayer = false;
    return libs().then(function () {
      pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      return loadFont().then(function (b64) {
        pdf.addFileToVFS('Manrope-Regular.ttf', b64);
        pdf.addFont('Manrope-Regular.ttf', 'Manrope', 'normal');
        pdf.setFont('Manrope', 'normal');
        state.textLayer = true;
      }).catch(function () { state.textLayer = false; });   // image-only, and the result says so
    }).then(function () {
      var chain = Promise.resolve();
      list.forEach(function (pg, i) {
        chain = chain.then(function () {
          say('Making the PDF: page ' + (i + 1) + ' of ' + list.length + '…');
          return window.html2canvas(pg, { scale: scale, useCORS: true, backgroundColor: '#ffffff', logging: false,
            width: pg.offsetWidth, height: pg.offsetHeight, windowWidth: 1200,
            onclone: function (cdoc) { flattenColours(cdoc); } });
        }).then(function (cv) {
          if (i > 0) pdf.addPage('a4', 'portrait');
          pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4.w, A4.h, undefined, 'FAST');
          cv.width = 0; cv.height = 0;                    // release the pixels now, not at GC time
          if (state.textLayer) { try { writeText(pdf, pageLines(list[i])); } catch (e) { /* this page stays image-only */ } }
        });
      });
      return chain;
    }).then(function () {
      pdf.setProperties({ title: 'Rayners Lane v ' + ((doc && doc.opponent) || '') + ' — matchday programme', creator: 'Rayners Lane FC' });
      var blob = pdf.output('blob');
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = URL.createObjectURL(blob);
      var name = fileName(doc, booklet);
      try { state.file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { state.file = null; }
      showResult(name, list.length, blob.size, booklet);
      return blob;
    }).catch(function (err) {
      say('The PDF could not be made: ' + (err && err.message || err) + '. Nothing was saved. Try again, or use Print.', 'err');
      return null;
    }).then(function (r) {
      document.documentElement.classList.remove('px-exporting');
      restoreCompletion(ins.moved);
      if (wasScaled) fit();
      state.building = false;
      btns.forEach(function (b) { if (b) { b.disabled = false; b.removeAttribute('aria-busy'); } });
      return r;
    });
  }

  function showResult(name, n, bytes, booklet) {
    var box = $('px-result'); if (!box) return;
    var mb = (bytes / 1048576).toFixed(1);
    box.hidden = false;
    box.innerHTML = '';
    var a = document.createElement('a');
    a.href = state.url; a.download = name; a.className = 'px-btn px-btn--main';
    a.textContent = 'Save ' + (booklet ? 'Booklet' : 'Reading') + ' PDF (' + n + ' pages, ' + mb + ' MB)';
    box.appendChild(a);
    var canShare = state.file && navigator.canShare && navigator.canShare({ files: [state.file] });
    if (canShare) {
      var sh = document.createElement('button'); sh.type = 'button'; sh.className = 'px-btn';
      sh.textContent = 'Share / Save to Files';
      sh.addEventListener('click', function () {
        navigator.share({ files: [state.file], title: name }).catch(function (e) {
          if (e && e.name !== 'AbortError') say('Sharing did not work on this device. Use “Save PDF” instead.', 'err');
        });
      });
      box.appendChild(sh);
    }
    a.click();                                           // desktop: downloads straight away
    say('PDF ready: ' + name + ' — ' + n + ' A4 pages, ' +
      (state.textLayer ? 'page images with selectable text' : 'page images only (the text font did not load, so text cannot be selected)') +
      ', RGB, no bleed. If it did not download by itself, press “Save PDF”' +
      (canShare ? ' or “Share / Save to Files”.' : '.'), state.textLayer ? 'ok' : 'warn');
  }

  /* Called by programme-print.html once render() has finished. */
  function ready(doc) {
    fit();
    if (window.__pxBlocked) { say(window.__pxBlocked + ' — export is switched off.', 'err'); return; }
    window.addEventListener('resize', fit);
    say('Checking every page has finished loading…');
    whenReady().then(function () {
      var n = pages().length;
      var pdf = $('px-pdf'), bk = $('px-booklet'), pr = $('px-print');
      var plan = window.ProgrammeEdition ? window.ProgrammeEdition.bookletPlan(n, (window.__pxExtra && window.__pxExtra.available) || {}) : { pages: n };
      if (pdf) { pdf.disabled = false; pdf.onclick = function () { build(doc, 'reading'); }; pdf.textContent = 'Reading PDF (' + n + ' pages)'; }
      if (bk) { bk.disabled = false; bk.onclick = function () { build(doc, 'booklet'); }; bk.textContent = 'Booklet PDF (' + plan.pages + ' pages)'; }
      var bl = $('px-booklet-note');
      if (bl) bl.textContent = 'Booklet PDF — ' + plan.pages + ' pages in reading order; your printer or print dialogue does the booklet imposition (2-up, saddle stitch).';
      if (pr) { pr.disabled = false; pr.onclick = function () { window.print(); }; }
      var warn = state.missing.length
        ? ' ' + state.missing.length + ' picture' + (state.missing.length === 1 ? '' : 's') + ' could not be loaded (page ' +
          state.missing.map(function (m) { return m.page; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') +
          '). Check before printing.'
        : '';
      var four = n % 4 ? ' ' + n + ' pages is not a multiple of four: use Booklet PDF (' + plan.pages + ' pages) for a folded booklet.' : '';
      say(n + ' pages ready.' + warn + four, (warn || four) ? 'warn' : 'ok');
      document.documentElement.setAttribute('data-px-ready', '1');
    });
  }

  window.ProgrammeExport = { ready: ready, build: build, fit: fit, _state: state, fileName: fileName };
})();
