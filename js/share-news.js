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
    try { if (document.fonts) { await document.fonts.load('400 96px "Bebas Neue"'); await document.fonts.load('600 26px "Manrope"'); await document.fonts.ready; } } catch (e) {}

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
    x.fillStyle = Y; x.font = '700 22px "Manrope", sans-serif';
    x.fillText('RAYNERS LANE FC', 176, 494);
    x.fillStyle = 'rgba(245,243,237,.62)'; x.font = '400 19px "Manrope", sans-serif';
    x.fillText('Est. 1933 · Harrow', 176, 526);

    // category chip
    if (a.category) {
      x.font = '700 20px "Manrope", sans-serif';
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
      x.font = '600 25px "Manrope", sans-serif';
      x.fillText(strap, 64, H - 132);
    }

    // footer — the whole point: send them to the site
    x.fillStyle = 'rgba(255,209,0,.16)'; x.fillRect(0, H - 92, W, 4);
    x.fillStyle = Y; x.font = '700 26px "Manrope", sans-serif';
    x.fillText('raynerslanefc.co.uk', 64, H - 36);
    x.textAlign = 'right';
    x.fillStyle = 'rgba(245,243,237,.5)'; x.font = '400 22px "Manrope", sans-serif';
    x.fillText(a.cta || 'Read the full story', W - 64, H - 36);

    return new Promise(function (res) { c.toBlob(res, 'image/png'); });
  }

  function toast(msg, extra) {
    var t = document.getElementById('rl-share-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'rl-share-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;' +
        'background:#111;border:1px solid #2a2a2a;border-left:3px solid ' + Y + ';border-radius:10px;' +
        'padding:13px 16px;font-family:Manrope,sans-serif;font-size:14px;color:#F5F3ED;max-width:90vw;' +
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

  // ══════════════════════════════════════════════════════════════════════════
  //  MATCH CARD — a matchday graphic with BOTH crests (home left, away right),
  //  the date, kick-off and venue, in the club's two brand themes. Separate from
  //  the headline share card above; opened by the "Match Card" button on a
  //  fixture. On brand, with raynerslanefc.co.uk and #UpTheLane in the footer.
  // ══════════════════════════════════════════════════════════════════════════
  var MC_THEMES = {
    dark: {
      label: 'Dark', ink: W_, sub: 'rgba(245,243,237,.72)', accent: Y, vs: Y,
      tagBg: Y, tagInk: '#0d0d0d', panel: 'rgba(255,255,255,.05)', rule: Y, url: Y, tag: W_,
      bg: function (x, W, H) {
        x.fillStyle = BK; x.fillRect(0, 0, W, H);
        var g = x.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, H * 0.95);
        g.addColorStop(0, '#1e3a24'); g.addColorStop(1, BK); x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
    },
    yellow: {
      label: 'Yellow', ink: '#0d0d0d', sub: 'rgba(13,13,13,.68)', accent: G, vs: G,
      tagBg: '#0d0d0d', tagInk: Y, panel: 'rgba(0,0,0,.06)', rule: G, url: '#0d0d0d', tag: G,
      bg: function (x, W, H) {
        var g = x.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#FFDE42'); g.addColorStop(1, '#EFC200'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
    }
  };

  function fitFont(x, text, maxW, start, family) {
    var s = start;
    do { x.font = '400 ' + s + 'px ' + family; if (x.measureText(text).width <= maxW || s <= 24) break; s -= 2; } while (s > 24);
    return s;
  }

  function mcDetails(f) {
    var home = f.isHome !== false;
    var d = '';
    try { d = new Date(f.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' }); } catch (e) { d = f.date || ''; }
    var p = String(f.kickoff || '15:00').split(':'), Hh = +p[0], mm = p[1] || '00';
    var ko = (Hh % 12 || 12) + ':' + (mm.length === 1 ? '0' + mm : mm) + (Hh >= 12 ? ' PM' : ' AM');
    var venue = home ? 'Tithe Farm, Harrow' : (f.venue || 'Away');
    return { dateLine: (d + ' · ' + ko).toUpperCase(), venue: venue, home: home };
  }

  async function matchCardPng(f, themeKey) {
    var t = MC_THEMES[themeKey] || MC_THEMES.dark;
    try { if (document.fonts) { await document.fonts.load('400 96px "Bebas Neue"'); await document.fonts.load('600 26px "Manrope"'); await document.fonts.load('700 26px "Manrope"'); await document.fonts.ready; } } catch (e) {}

    var W = 1080, H = 1080, c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    t.bg(x, W, H);

    var home = f.isHome !== false, opp = (f.opponent || 'TBC').toUpperCase();
    var RL = 'img/badge.png', OPP = f.oppCrest || f.image || 'img/badge.png';
    var leftCrest = home ? RL : OPP, rightCrest = home ? OPP : RL;
    var leftName = home ? 'RAYNERS LANE' : opp, rightName = home ? opp : 'RAYNERS LANE';
    var leftHA = home ? 'HOME' : 'AWAY', rightHA = home ? 'AWAY' : 'HOME';

    // header lockup
    var badge = await loadImg('img/badge.png');
    if (badge && badge.naturalWidth) x.drawImage(badge, 60, 52, 86, 86);
    x.textAlign = 'left';
    x.fillStyle = t.ink; x.font = "700 27px 'Manrope', sans-serif";
    x.fillText('RAYNERS LANE FC', 160, 90);
    x.fillStyle = t.sub; x.font = "400 18px 'Manrope', sans-serif";
    x.fillText('EST. 1933 · HARROW', 160, 118);
    // competition tag, top-right
    var comp = /friendly/i.test(f.competition || '') ? 'PRE-SEASON' : /vase/i.test(f.competition || '') ? 'FA VASE' : /fa cup/i.test(f.competition || '') ? 'FA CUP' : 'MATCHDAY';
    x.font = "700 20px 'Manrope', sans-serif";
    var tw = x.measureText(comp).width + 32;
    x.fillStyle = t.tagBg; x.fillRect(W - 60 - tw, 60, tw, 42);
    x.fillStyle = t.tagInk; x.fillText(comp, W - 60 - tw + 16, 88);

    // crests + VS
    var cy = 400, lx = 300, rx = 780;
    async function crest(src, cx) {
      var img = await loadImg(src);
      x.fillStyle = t.panel; x.beginPath(); x.arc(cx, cy, 156, 0, Math.PI * 2); x.fill();
      if (img && img.naturalWidth) {
        var ar = img.naturalWidth / img.naturalHeight, S = 250, w = ar >= 1 ? S : S * ar, h = ar >= 1 ? S / ar : S;
        x.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      }
    }
    await crest(leftCrest, lx); await crest(rightCrest, rx);
    x.textAlign = 'center'; x.fillStyle = t.vs; x.font = "400 104px 'Bebas Neue', sans-serif";
    x.fillText('VS', W / 2, cy + 36);

    // names + HOME/AWAY
    x.fillStyle = t.ink;
    [[leftName, lx], [rightName, rx]].forEach(function (n) {
      var s = fitFont(x, n[0], 430, 56, "'Bebas Neue', sans-serif");
      x.fillText(n[0], n[1], cy + 250);
    });
    x.fillStyle = t.sub; x.font = "700 19px 'Manrope', sans-serif";
    x.fillText(leftHA, lx, cy + 288); x.fillText(rightHA, rx, cy + 288);

    // detail band — date · kick-off, then venue
    var by = 762, det = mcDetails(f);
    x.fillStyle = t.panel; x.fillRect(60, by, W - 120, 148);
    x.fillStyle = t.rule; x.fillRect(60, by, 6, 148);
    x.textAlign = 'center';
    x.fillStyle = t.accent; x.font = "400 46px 'Bebas Neue', sans-serif";
    x.fillText(det.dateLine, W / 2, by + 68);
    x.fillStyle = t.ink; var vs = fitFont(x, det.venue, W - 200, 30, "'Manrope', sans-serif");
    x.font = "600 " + vs + "px 'Manrope', sans-serif";
    x.fillText(det.venue, W / 2, by + 116);

    // footer — site + #UpTheLane
    x.fillStyle = t.rule; x.globalAlpha = .9; x.fillRect(0, H - 92, W, 4); x.globalAlpha = 1;
    x.textAlign = 'left'; x.fillStyle = t.url; x.font = "700 27px 'Manrope', sans-serif";
    x.fillText('raynerslanefc.co.uk', 64, H - 34);
    x.textAlign = 'right'; x.fillStyle = t.tag; x.font = "400 40px 'Bebas Neue', sans-serif";
    x.fillText('#UPTHELANE', W - 64, H - 30);

    return new Promise(function (res) { c.toBlob(res, 'image/png'); });
  }

  // files-only share (keeps AirDrop/Save-Image working), with a save fallback.
  function mcSave(blob, fname) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function mcShare(blob, fname) {
    var file = (typeof File !== 'undefined') ? new File([blob], fname, { type: 'image/png' }) : null;
    var payload = { files: [file], title: 'Rayners Lane FC' };
    if (file && navigator.canShare && navigator.canShare(payload)) {
      try { navigator.share(payload).then(function () {}).catch(function (err) { if (err && err.name === 'AbortError') return; mcSave(blob, fname); }); return; } catch (e) {}
    }
    mcSave(blob, fname);
  }

  // The overlay: preview + theme toggle + Share/Save. Blob for the current theme
  // is always pre-built, so the Share tap stays inside the user gesture (iOS).
  window.rlMatchCard = function (f) {
    var st = { theme: 'dark', blobs: {}, urls: {} };
    var ov = document.getElementById('rl-mc-ov');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'rl-mc-ov';
      ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(6,6,6,.975);display:flex;align-items:center;justify-content:center;padding:18px;opacity:1;transition:opacity .18s';
      ov.innerHTML = '<div id="rl-mc-box" style="background:#111;border:1px solid #2a2a2a;border-radius:16px;max-width:420px;width:100%;max-height:94vh;overflow:auto;padding:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
          '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:24px;letter-spacing:1px;color:#F5F3ED">MATCH CARD</div>' +
          '<button id="rl-mc-x" style="background:#1e1e1e;border:1px solid #2a2a2a;color:#fff;width:34px;height:34px;border-radius:8px;font-size:16px;cursor:pointer">×</button>' +
        '</div>' +
        '<div id="rl-mc-prev" style="width:100%;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#0a0a0a;display:flex;align-items:center;justify-content:center;color:#666;font-family:Arial;font-size:13px">Building…</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button class="rl-mc-th" data-t="dark" style="flex:1">Dark</button>' +
          '<button class="rl-mc-th" data-t="yellow" style="flex:1">Yellow</button>' +
        '</div>' +
        '<button id="rl-mc-share" style="width:100%;margin-top:10px;background:#FFD100;color:#0d0d0d;border:none;border-radius:10px;padding:13px;font-family:\'Manrope\',sans-serif;font-weight:800;font-size:15px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer">Share / Save card</button>' +
        '<div style="font-family:Arial;font-size:11px;color:#888;text-align:center;margin-top:8px">Pick a theme, then share to WhatsApp / Instagram or save to your device.</div>' +
      '</div>';
      document.body.appendChild(ov);
    }
    var box = ov.querySelector('#rl-mc-box'), prev = ov.querySelector('#rl-mc-prev'), shareBtn = ov.querySelector('#rl-mc-share');
    function close() { ov.style.opacity = '0'; setTimeout(function () { ov.style.display = 'none'; }, 200); Object.keys(st.urls).forEach(function (k) { URL.revokeObjectURL(st.urls[k]); }); }
    ov.style.display = 'flex'; ov.style.opacity = '1';
    ov.querySelector('#rl-mc-x').onclick = close;
    ov.onclick = function (e) { if (e.target === ov) close(); };
    function paintTheme() {
      ov.querySelectorAll('.rl-mc-th').forEach(function (b) {
        var on = b.dataset.t === st.theme;
        b.style.cssText = 'flex:1;padding:10px;border-radius:9px;font-family:\'Manrope\',sans-serif;font-weight:700;font-size:13px;letter-spacing:.04em;cursor:pointer;text-transform:uppercase;' +
          (on ? 'background:#FFD100;color:#0d0d0d;border:1px solid #FFD100' : 'background:#1a1a1a;color:#aaa;border:1px solid #2a2a2a');
      });
    }
    function render() {
      paintTheme();
      if (st.blobs[st.theme]) { prev.innerHTML = '<img src="' + st.urls[st.theme] + '" style="width:100%;display:block">'; return; }
      prev.innerHTML = '<span>Building…</span>';
      matchCardPng(f, st.theme).then(function (blob) {
        if (!blob) { prev.innerHTML = '<span>Could not build card</span>'; return; }
        st.blobs[st.theme] = blob; st.urls[st.theme] = URL.createObjectURL(blob);
        if (st.theme) prev.innerHTML = '<img src="' + st.urls[st.theme] + '" style="width:100%;display:block">';
      });
    }
    ov.querySelectorAll('.rl-mc-th').forEach(function (b) { b.onclick = function () { st.theme = b.dataset.t; render(); }; });
    shareBtn.onclick = function () {
      var blob = st.blobs[st.theme];
      var fname = 'rayners-lane-match-' + (f.id || f.date || 'card') + '-' + st.theme + '.png';
      if (blob) mcShare(blob, fname);
      else matchCardPng(f, st.theme).then(function (bl) { if (bl) mcShare(bl, fname); });
    };
    render();
  };

})();
