/* ─────────────────────────────────────────────────────────────────────────
   Rayners Lane FC — Phase 1 image pipeline (progressive enhancement).

   Rewrites local /img/ raster images through the built-in **Netlify Image CDN**
   (`/.netlify/images?url=…&w=…&fm=avif|webp`) at a device-appropriate width and
   a modern format, adds responsive srcset + lazy/async, and keeps doing it for
   images added later (news cards, players, gallery) via a MutationObserver.

   It is loaded only by js/components.js, i.e. on PUBLIC pages — never on
   admin.html — so Post Studio's html2canvas exports are untouched. It also
   skips SVGs (vector), data: URLs, external hosts, and any crossorigin image
   (canvas-tainting), and anything tagged data-no-opt. Fully reversible: it only
   swaps src/srcset; removing this file restores the originals on next deploy.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  if (window.__laneImg) return; window.__laneImg = true;

  var BUCKETS = [64, 96, 140, 200, 320, 480, 640, 800, 1080, 1440, 1920];
  function bucket(w) { for (var i = 0; i < BUCKETS.length; i++) if (w <= BUCKETS[i]) return BUCKETS[i]; return 1920; }
  var FMT = 'webp'; // safe default (~98% support); upgraded to avif once detected

  function toPath(src) {
    if (/^https?:\/\//i.test(src)) { try { return new URL(src).pathname; } catch (e) { return null; } }
    return src.charAt(0) === '/' ? src : '/' + src;
  }
  function optimizable(img, src) {
    if (!src || /^data:/i.test(src)) return false;
    if (/\.svg([?#]|$)/i.test(src)) return false;                 // vector — leave as-is
    if (src.indexOf('/.netlify/images') > -1) return false;       // already done
    if (img.hasAttribute('crossorigin')) return false;            // canvas-tainting — leave
    if (img.hasAttribute('data-no-opt')) return false;            // explicit opt-out
    if (/^https?:\/\//i.test(src) && !/raynerslanefc\.co\.uk/i.test(src)) return false; // external host
    var p = toPath(src);
    return !!p && /^\/img\//i.test(p);                            // only our own /img/ assets
  }
  function cdn(src, w) { return '/.netlify/images?url=' + encodeURIComponent(toPath(src)) + '&w=' + w + '&fm=' + FMT + '&q=72'; }

  function optimize(img) {
    if (img.getAttribute('data-lane-img')) return;
    var raw = img.getAttribute('src');
    if (!optimizable(img, raw)) return;
    img.setAttribute('data-lane-img', '1');

    var r = img.getBoundingClientRect();
    // eager (no lazy) for anything at/above the fold so we never lazy-load the LCP hero
    if (r.top > (window.innerHeight || 800) + 120) img.loading = 'lazy';
    img.decoding = 'async';

    var cssW = Math.round(r.width) || parseInt(img.getAttribute('width'), 10) || 0;
    var w = Math.round(cssW * (window.devicePixelRatio || 1));
    if (!w || w < 40) w = 800; // sensible cap when size isn't known yet — still far smaller than the raw file
    var bw = bucket(w);
    // Safety net: if the CDN version ever fails to load, silently revert THIS image
    // to its original source — so a CDN hiccup can never leave a broken image.
    img.setAttribute('data-orig', raw);
    img.addEventListener('error', function onerr() {
      img.removeEventListener('error', onerr);
      img.removeAttribute('srcset');
      img.setAttribute('src', img.getAttribute('data-orig'));
    }, { once: true });
    img.setAttribute('srcset', cdn(raw, bw) + ' 1x, ' + cdn(raw, bucket(Math.min(bw * 2, 1920))) + ' 2x');
    img.setAttribute('src', cdn(raw, bw)); // set src last so srcset is honoured
  }

  function run() { var a = document.querySelectorAll('img'); for (var i = 0; i < a.length; i++) optimize(a[i]); }

  function detectAvifThen(next) {
    var t = new Image();
    t.onload = function () { if (t.width === 1) FMT = 'avif'; next(); };
    t.onerror = next;
    // 1×1 AVIF
    t.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=';
  }

  function init() {
    detectAvifThen(function () {
      run();
      if (window.MutationObserver) {
        new MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i++) {
            var n = muts[i].addedNodes;
            for (var j = 0; j < n.length; j++) {
              var el = n[j];
              if (el.tagName === 'IMG') optimize(el);
              else if (el.querySelectorAll) { var g = el.querySelectorAll('img'); for (var k = 0; k < g.length; k++) optimize(g[k]); }
            }
          }
        }).observe(document.documentElement, { childList: true, subtree: true });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
