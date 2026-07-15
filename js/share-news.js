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

  // Category accent. Brand palette only — a card that turns up in a colour the
  // club doesn't own looks like someone else's graphic.
  function accentFor(cat) {
    var c = String(cat || '').toLowerCase();
    if (/match|fixture|report|result|cup|vase/.test(c)) return { chip: Y, ink: '#0d0d0d', rule: Y };
    if (/sign|transfer|squad|player/.test(c))          return { chip: W_, ink: '#0d0d0d', rule: W_ };
    return { chip: Y, ink: '#0d0d0d', rule: Y };       // news + everything else
  }

  // Fit the hook to the box: big hooks go huge, long ones shrink rather than
  // clip. A back-page headline that's been cut off mid-word isn't a headline.
  function fitHook(x, text, maxW, maxH, startPx) {
    var size = startPx, lines;
    for (;;) {
      x.font = '400 ' + size + 'px "Bebas Neue", sans-serif';
      lines = wrap(x, text, maxW, 4);
      var h = lines.length * size * 0.92;
      if ((h <= maxH && lines.length <= 3) || size <= 44) break;
      size -= 4;
    }
    return { size: size, lines: lines };
  }

  async function cardPng(a) {
    // Wait for Bebas — draw too early and the card renders in Times.
    try { if (document.fonts) { await document.fonts.load('400 96px "Bebas Neue"'); await document.fonts.load('600 26px "Barlow"'); await document.fonts.ready; } } catch (e) {}

    var W = 1080, H = 1080;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    var acc = accentFor(a.category);

    // THE LINE. The stored hook if there is one, else the real title — never
    // generated here, never an AI call on a public page. See data/fixtures.json
    // shareHeadline and the staff sign-off panel.
    var head = String(a.shareHeadline || a.title || '').trim();

    // base + the club's green glow
    x.fillStyle = BK; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W * 0.72, -140, 0, W * 0.72, -140, H * 1.15);
    g.addColorStop(0, '#1e3a24'); g.addColorStop(1, BK);
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    // ── the image, treated ────────────────────────────────────────────────
    // A photo and a crest are not the same thing and must not be drawn the same
    // way: cover-cropping a square crest to fill the panel zooms it to
    // abstraction. Photos bleed; crests sit whole, centred, at badge size.
    var hero = await loadImg(a.image);
    var hh = 430;
    if (hero && hero.naturalWidth) {
      var ar = hero.naturalWidth / hero.naturalHeight;
      // No leading slash: article images are stored as "img/crests/x.svg", so a
      // /\/img\/crests\// test never matched and every crest got cover-cropped.
      var isBadge = /(^|\/)img\/crests\//i.test(a.image || '')
                 || /\.svg(\?|$)/i.test(a.image || '')
                 || (ar > 0.8 && ar < 1.25);
      if (isBadge) {
        var bg = x.createLinearGradient(0, 0, W, hh);
        bg.addColorStop(0, '#16311f'); bg.addColorStop(1, '#0b1a11');
        x.fillStyle = bg; x.fillRect(0, 0, W, hh);
        var bs = 330, bw = ar >= 1 ? bs : bs * ar, bh = ar >= 1 ? bs / ar : bs;
        x.drawImage(hero, (W - bw) / 2, (hh - bh) / 2, bw, bh);
      } else {
        var r = Math.max(W / hero.naturalWidth, hh / hero.naturalHeight);
        var dw = hero.naturalWidth * r, dh = hero.naturalHeight * r;
        x.save(); x.beginPath(); x.rect(0, 0, W, hh); x.clip();
        x.drawImage(hero, (W - dw) / 2, (hh - dh) / 2, dw, dh);
        // Darken the photo so white Bebas over it is always legible, whatever
        // the photo is. An untreated bright photo eats the headline.
        x.fillStyle = 'rgba(8,8,8,.30)'; x.fillRect(0, 0, W, hh);
        x.restore();
      }
      var f = x.createLinearGradient(0, hh - 220, 0, hh);
      f.addColorStop(0, 'rgba(8,8,8,0)'); f.addColorStop(1, BK);
      x.fillStyle = f; x.fillRect(0, hh - 220, W, 220);
      x.fillStyle = acc.rule; x.globalAlpha = .9; x.fillRect(0, hh - 4, W, 4); x.globalAlpha = 1;
    }

    // skewed brand band — the club's signature, same as the fixture cards
    x.save(); x.translate(0, 500); x.transform(1, 0, -0.12, 1, 0, 0);
    x.fillStyle = 'rgba(26,92,50,.45)'; x.fillRect(-120, -110, W + 240, 220);
    x.fillStyle = 'rgba(255,209,0,.9)'; x.fillRect(-120, -112, W + 240, 4);
    x.restore();

    // crest + lockup
    var badge = await loadImg('img/badge.png');
    if (badge && badge.naturalWidth) x.drawImage(badge, 64, 458, 92, 92);
    x.textAlign = 'left';
    x.fillStyle = Y; x.font = '700 22px "Barlow Condensed", sans-serif';
    x.fillText('RAYNERS LANE FC', 176, 494);
    x.fillStyle = 'rgba(245,243,237,.62)'; x.font = '400 19px "Barlow", sans-serif';
    x.fillText('Est. 1933 · Harrow', 176, 526);

    // category chip
    if (a.category) {
      x.font = '700 20px "Barlow Condensed", sans-serif';
      var label = String(a.category).toUpperCase();
      var cw = x.measureText(label).width + 30;
      x.fillStyle = acc.chip; x.fillRect(64, 590, cw, 38);
      x.fillStyle = acc.ink; x.fillText(label, 79, 616);
    }

    // ── THE HOOK — the reason anyone stops scrolling ──────────────────────
    // Given the room to be big. Everything above is context; this is the card.
    var strap = String(a.strap || '').trim();
    var hookBottom = strap ? H - 170 : H - 120;
    var hookTop = 656;
    var fit = fitHook(x, head, W - 128, hookBottom - hookTop, 112);
    x.fillStyle = W_;
    var ty = hookTop + fit.size;
    fit.lines.forEach(function (l) { x.fillText(l, 64, ty); ty += fit.size * 0.92; });

    // strap — fixture detail (date / KO / venue). Facts, small, under the drama.
    if (strap) {
      x.fillStyle = 'rgba(245,243,237,.72)';
      x.font = '600 25px "Barlow", sans-serif';
      x.fillText(strap, 64, H - 132);
    }

    // footer — the whole point: send them to the site
    x.fillStyle = 'rgba(255,209,0,.16)'; x.fillRect(0, H - 92, W, 4);
    x.fillStyle = Y; x.font = '700 26px "Barlow Condensed", sans-serif';
    x.fillText('raynerslanefc.co.uk', 64, H - 36);
    x.textAlign = 'right';
    x.fillStyle = 'rgba(245,243,237,.5)'; x.font = '400 22px "Barlow", sans-serif';
    x.fillText(a.cta || 'Read the full story', W - 64, H - 36);

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

  // ── Pre-build the card BEFORE anyone taps ───────────────────────────
  // navigator.share() must be called while the tap is still "active". Building
  // the card takes ~1.1s (fonts, image decode, 1080x1080 raster), and after that
  // await iOS Safari has expired the activation: share() throws NotAllowedError
  // and the AirDrop sheet never opens. That was this feature's headline bug.
  // So we render the card quietly on page load and keep the blob ready. The tap
  // then goes straight to share() with no await in front of it.
  var _cache = {};
  function cacheKey(a) { return a.id + '|' + a.title + '|' + (a.shareHeadline || ''); }
  window.rlPrebuildCard = function (a) {
    var k = cacheKey(a);
    if (_cache[k]) return _cache[k];
    _cache[k] = cardPng(a).catch(function () { return null; });
    return _cache[k];
  };

  // The public entry point. article = {id,title,image,category}
  window.rlShareArticle = async function (a, btn) {
    var url = a.link
      ? location.origin + a.link
      : location.origin + '/news-article.html?id=' + encodeURIComponent(a.id);
    var text = a.title + ' — Rayners Lane FC';
    var full = text + '\n' + url;
    var wa = 'https://wa.me/?text=' + encodeURIComponent(full);
    var tw = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
    var fb = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
    var old = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Building card…'; }

    // Already built? Then there's no await between the tap and share() and the
    // activation survives. Only a cold tap pays the render cost.
    var pending = _cache[cacheKey(a)];
    var blob = null;
    if (pending) { blob = await pending; }
    else {
      try { blob = await cardPng(a); } catch (e) { blob = null; }
      _cache[cacheKey(a)] = Promise.resolve(blob);
    }
    if (btn) { btn.disabled = false; btn.innerHTML = old; }

    if (blob) {
      var file = new File([blob], 'rayners-lane-' + a.id + '.png', { type: 'image/png' });
      // PHONE: the card into AirDrop / Save Image / WhatsApp / Messages.
      //
      // FILES ONLY — no text, no url. Sending {files, text, url} together makes
      // iOS treat it as a multi-item share, and AirDrop and "Save Image" then
      // take the LINK instead of the PNG: they fail, or they send the wrong
      // thing. That was the second half of this bug. The caption still travels —
      // it goes on the clipboard just below, so it's one paste away in whatever
      // app they land in.
      var payload = { files: [file], title: 'Rayners Lane FC' };
      if (navigator.canShare && navigator.canShare(payload)) {
        // Start the copy, but DON'T await it — an await here would spend the
        // user gesture before share() and put us straight back in the bug this
        // whole change exists to fix. Fire it off; share() follows in the same
        // task, so the activation is still live when it's called.
        if (navigator.clipboard) { try { navigator.clipboard.writeText(full).catch(function () {}); } catch (e) {} }
        try {
          await navigator.share(payload);
          toast('<b style="color:' + Y + '">Shared.</b><br><span style="color:#888;font-size:12.5px">Caption + link copied — paste it with the card.</span>');
          return;
        } catch (e) {
          // AbortError = they closed the sheet. That's not a failure; leave them be.
          if (e && e.name === 'AbortError') return;
          // Anything else (NotAllowedError from a spent gesture, an OS refusal)
          // MUST fall through to the save path. Swallowing it here is why the
          // button did nothing at all: no sheet, no download, no message.
        }
      }
      // SAVE PATH. Reached on desktop, and on a phone whose share sheet refused
      // — so the wording can't assume a Downloads folder and a mouse.
      var dl = document.createElement('a');
      dl.href = URL.createObjectURL(blob); dl.download = 'rayners-lane-' + a.id + '.png';
      document.body.appendChild(dl); dl.click(); dl.remove();
      setTimeout(function () { URL.revokeObjectURL(dl.href); }, 5000);
      if (navigator.clipboard) { try { await navigator.clipboard.writeText(full); } catch (e) {} }
      toast('<b style="color:' + Y + '">Card saved &amp; link copied.</b><br><span style="color:#888;font-size:12.5px">Post it anywhere, or send it straight to:</span>',
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
  // Fixtures: same card, same rules. The hook is the STORED fixtures.json
  // shareHeadline — baked by tools-bake-hooks.js, editable by staff. Falls back
  // to "Rayners Lane vs X" if a fixture somehow has none.
  window.rlShareFixture = function (f, btn) {
    var home = f.isHome !== false;
    var opp = f.opponent || '';
    var title = home ? 'Rayners Lane vs ' + opp : opp + ' vs Rayners Lane';
    var d = '';
    try {
      d = new Date(f.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' });
    } catch (e) { d = f.date || ''; }
    var p = String(f.kickoff || '15:00').split(':'), Hh = +p[0], mm = p[1] || '00';
    var koTxt = (Hh % 12 || 12) + (mm === '00' ? '' : '.' + mm) + (Hh >= 12 ? 'pm' : 'am');
    var venue = home ? 'Tithe Farm' : (f.venue || 'Away');
    return window.rlShareArticle({
      id: 'fixture-' + (f.id || f.date),
      title: title,
      shareHeadline: f.shareHeadline || title,
      // The field is oppCrest, not crest — reading the wrong name shipped every
      // fixture card with an empty panel. Two clubs (Hayes & Yeading, Punjab)
      // have no crest on file; our own badge beats a blank green box.
      image: f.oppCrest || f.image || 'img/badge.png',
      category: /friendly/i.test(f.competition || '') ? 'PRE-SEASON'
              : /vase|cup/i.test(f.competition || '') ? 'CUP' : 'MATCH',
      strap: d + ' · ' + koTxt + ' · ' + venue,
      cta: 'Fixtures & directions',
      link: '/fixtures.html'
    }, btn);
  };
})();
