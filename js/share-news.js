/* Rayners Lane FC — the PUBLIC share button on news stories.
 *
 * A supporter taps Share on an article. We draw a branded card for that story
 * on a canvas, then hand it to their phone's share sheet so it goes straight
 * into WhatsApp, Messages, Instagram — whatever they use — with the article
 * link attached. Every share is a branded card pulling people back to the site.
 *
 * No login, no design step, no backend. Tap and it works.
 *
 * Native canvas rather than html2canvas: no library to load on a public page,
 * and nothing to go wrong with fonts or tainting.
 *
 * ⛔ TAINT: a canvas that has drawn a cross-origin image cannot be exported —
 *    toBlob throws and the share silently dies. Every image drawn here is from
 *    our own origin and loaded with crossOrigin='anonymous'. Do not draw a
 *    remote image onto this canvas.
 *
 * ⛔ Only ever draws the REAL article title and image. Nothing invented.
 */
(function () {
  'use strict';

  var Y = '#FFD100', G = '#1A5C32', BK = '#080808', W_ = '#F5F3ED';

  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var i = new Image();
      i.crossOrigin = 'anonymous';       // keeps the canvas exportable
      i.onload = function () { res(i); };
      i.onerror = function () { res(null); };
      // Bypass the image CDN: it can answer cross-origin and taint the canvas.
      i.src = src.indexOf('/.netlify/images') > -1 ? decodeURIComponent((src.split('url=')[1] || '').split('&')[0]) : src;
    });
  }

  // Wrap to a real measured width — guessing characters-per-line breaks on
  // "Welcome to You-Nique Training — Inclusive Fitness for All Abilities".
  function wrap(x, text, max, maxLines) {
    var words = String(text || '').split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (x.measureText(t).width > max && cur) { lines.push(cur); cur = words[i]; }
      else cur = t;
      if (lines.length === maxLines) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length + 2) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s,;:]+\S*$/, '') + '…';
    }
    return lines;
  }

  async function cardPng(a) {
    // Wait for Bebas — draw too early and the card renders in Times.
    try { if (document.fonts) { await document.fonts.load('400 72px "Bebas Neue"'); await document.fonts.load('600 26px "Barlow"'); await document.fonts.ready; } } catch (e) {}

    var W = 1080, H = 1080;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');

    // base + the club's green glow
    x.fillStyle = BK; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W * 0.75, -120, 0, W * 0.75, -120, H * 1.1);
    g.addColorStop(0, '#1e3a24'); g.addColorStop(1, BK);
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    // the article's own image, bled across the top, faded into the card
    var hero = await loadImg(a.image);
    if (hero && hero.naturalWidth) {
      var hh = 460;
      var r = Math.max(W / hero.naturalWidth, hh / hero.naturalHeight);
      var dw = hero.naturalWidth * r, dh = hero.naturalHeight * r;
      x.save(); x.beginPath(); x.rect(0, 0, W, hh); x.clip();
      x.drawImage(hero, (W - dw) / 2, (hh - dh) / 2, dw, dh);
      var f = x.createLinearGradient(0, hh - 240, 0, hh);
      f.addColorStop(0, 'rgba(8,8,8,0)'); f.addColorStop(1, BK);
      x.fillStyle = f; x.fillRect(0, hh - 240, W, 240);
      x.restore();
    }

    // skewed brand band — the club's signature, same as the fixture cards
    x.save(); x.translate(0, 560); x.transform(1, 0, -0.12, 1, 0, 0);
    x.fillStyle = 'rgba(26,92,50,.45)'; x.fillRect(-120, -120, W + 240, 240);
    x.fillStyle = 'rgba(255,209,0,.9)'; x.fillRect(-120, -122, W + 240, 4);
    x.restore();

    // crest + lockup
    var badge = await loadImg('img/badge.png');
    if (badge && badge.naturalWidth) x.drawImage(badge, 64, 522, 96, 96);
    x.textAlign = 'left';
    x.fillStyle = Y; x.font = '700 22px "Barlow Condensed", sans-serif';
    x.fillText('RAYNERS LANE FC', 180, 560);
    x.fillStyle = 'rgba(245,243,237,.62)'; x.font = '400 19px "Barlow", sans-serif';
    x.fillText('Est. 1933 · Harrow', 180, 592);

    // category chip
    if (a.category) {
      x.font = '700 20px "Barlow Condensed", sans-serif';
      var cw = x.measureText(a.category.toUpperCase()).width + 30;
      x.fillStyle = Y; x.fillRect(64, 660, cw, 38);
      x.fillStyle = '#0d0d0d'; x.fillText(a.category.toUpperCase(), 79, 686);
    }

    // the headline — the reason anyone taps
    x.fillStyle = W_;
    var size = 76;
    x.font = '400 ' + size + 'px "Bebas Neue", sans-serif';
    var lines = wrap(x, a.title, W - 128, 4);
    // long headlines get smaller rather than clipped
    while (lines.length > 3 && size > 50) {
      size -= 6; x.font = '400 ' + size + 'px "Bebas Neue", sans-serif';
      lines = wrap(x, a.title, W - 128, 4);
    }
    var ty = 740 + size;
    lines.forEach(function (l) { x.fillText(l, 64, ty); ty += size * 0.94; });

    // footer — the whole point: send them to the site
    x.fillStyle = 'rgba(255,209,0,.16)'; x.fillRect(0, H - 92, W, 4);
    x.fillStyle = Y; x.font = '700 26px "Barlow Condensed", sans-serif';
    x.fillText('raynerslanefc.co.uk', 64, H - 36);
    x.textAlign = 'right';
    x.fillStyle = 'rgba(245,243,237,.5)'; x.font = '400 22px "Barlow", sans-serif';
    x.fillText('Read the full story', W - 64, H - 36);

    return new Promise(function (res) { c.toBlob(res, 'image/png'); });
  }

  function toast(msg, extra) {
    var t = document.getElementById('rl-share-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'rl-share-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;' +
        'background:#111;border:1px solid #2a2a2a;border-left:3px solid ' + Y + ';border-radius:10px;' +
        'padding:13px 16px;font-family:Barlow,sans-serif;font-size:14px;color:#F5F3ED;max-width:90vw;' +
        'box-shadow:0 18px 50px rgba(0,0,0,.6)';
      document.body.appendChild(t);
    }
    t.innerHTML = msg + (extra || '');
    t.style.display = 'block';
    clearTimeout(t._t); t._t = setTimeout(function () { t.style.display = 'none'; }, extra ? 9000 : 3200);
  }

  // The public entry point. article = {id,title,image,category}
  window.rlShareArticle = async function (a, btn) {
    var url = location.origin + '/news-article.html?id=' + encodeURIComponent(a.id);
    var text = a.title + ' — Rayners Lane FC';
    var full = text + '\n' + url;
    var wa = 'https://wa.me/?text=' + encodeURIComponent(full);
    var tw = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
    var fb = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
    var old = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Building card…'; }

    var blob = null;
    try { blob = await cardPng(a); } catch (e) { blob = null; }
    if (btn) { btn.disabled = false; btn.innerHTML = old; }

    if (blob) {
      var file = new File([blob], 'rayners-lane-' + a.id + '.png', { type: 'image/png' });
      // PHONE: the card + the link straight into WhatsApp / Messages / Instagram.
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Rayners Lane FC', text: text, url: url }); } catch (e) {}
        return;
      }
      // DESKTOP: save the card, copy the caption, offer the direct links.
      var dl = document.createElement('a');
      dl.href = URL.createObjectURL(blob); dl.download = 'rayners-lane-' + a.id + '.png';
      document.body.appendChild(dl); dl.click(); dl.remove();
      setTimeout(function () { URL.revokeObjectURL(dl.href); }, 5000);
      if (navigator.clipboard) { try { await navigator.clipboard.writeText(full); } catch (e) {} }
      toast('<b style="color:' + Y + '">Card saved & link copied.</b><br><span style="color:#888;font-size:12.5px">Post it anywhere, or:</span>',
        '<div style="display:flex;gap:8px;margin-top:9px">' +
        ['<a href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a>',
         '<a href="' + tw + '" target="_blank" rel="noopener">X</a>',
         '<a href="' + fb + '" target="_blank" rel="noopener">Facebook</a>']
          .join('').replace(/<a /g, '<a style="color:' + Y + ';text-decoration:none;border:1px solid ' + Y + ';border-radius:6px;padding:6px 11px;font-size:12px" ') +
        '</div>');
      return;
    }
    // Canvas failed — still let them share the link.
    if (navigator.share) { navigator.share({ title: 'Rayners Lane FC', text: text, url: url }).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(full).catch(function () {});
    toast('Link copied.', '<div style="display:flex;gap:8px;margin-top:9px"><a style="color:' + Y + '" href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a></div>');
  };
})();
