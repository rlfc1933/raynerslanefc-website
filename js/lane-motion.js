/* ════════════════════════════════════════════════════════════════════════
   LANE MOTION — the site's scroll-driven storytelling (GSAP + ScrollTrigger).
   DESIGN.md §5 and impeccable/animate: motion explains; it never decorates
   and never hides information. Everything here:
     · is skipped entirely under prefers-reduced-motion or the a11y panel's
       reduce-motion switch (GSAP is not even downloaded);
     · starts from content that is already visible — if this file fails,
       nothing is missing;
     · loads GSAP after first paint, only on a page that has something for it.

   Motion thesis (Kit Launch, 2026/27):
     FOCAL   Home: the title card pushes in as you leave it, and "The run"
             glides through the results you have just scrolled past to land
             on the next match — the season, in one gesture.
     FLOW    Between pages: cross-document View Transitions (css/kl.css). The
             nav holds still; only the page changes.
     CARRY   Inside pages: the title card's photograph pushes in the same way,
             so every page opens like the homepage does.
     READ    The chairman's line inks in at reading pace (scrubbed to scroll).
     HAND    The Lane Card turns square to you as its section arrives — the
             card being handed over.
     TALLY   Big statistics marked data-kl-count tally up once, from zero, the
             first time they are seen. The real number is in the HTML.
     HISTORY A yellow line fills the timeline's spine; each year lights as
             you reach it — "where am I in the club's story".
     BOARD   The partner board settles once as it arrives.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var reduce = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    document.documentElement.classList.contains('a11y-reduce-motion');
  if (reduce) return;
  var hasTimeline = !!document.getElementById('tl-list');
  var hasBoard = !!document.querySelector('.ptr-grid');
  var hasHero = !!document.querySelector('.kl-hero');
  var hasPh = !!document.querySelector('.kl-ph .kl-ph__media');
  var hasRun = !!document.getElementById('kl-run');
  var hasVoice = !!document.querySelector('.kl-voice__q');
  var hasCard = !!document.getElementById('kl-lanecard');
  var hasCount = !!document.querySelector('[data-kl-count]');
  if (!hasTimeline && !hasBoard && !hasHero && !hasPh && !hasRun && !hasVoice && !hasCard && !hasCount) return;

  function load(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  // After first paint: GSAP must never compete with the page or match info.
  function afterPaint(fn) {
    if (document.readyState === 'complete') return setTimeout(fn, 0);
    window.addEventListener('load', function () { setTimeout(fn, 0); }, { once: true });
  }
  afterPaint(function () {
    load('js/vendor/gsap-3.15.0.min.js')
      .then(function () { return load('js/vendor/ScrollTrigger-3.15.0.min.js'); })
      .then(function () {
        var gsap = window.gsap; if (!gsap || !window.ScrollTrigger) return;
        gsap.registerPlugin(window.ScrollTrigger);
        // The a11y panel can switch motion off after load — honour it live.
        new MutationObserver(function () {
          if (document.documentElement.classList.contains('a11y-reduce-motion')) {
            window.ScrollTrigger.getAll().forEach(function (t) { t.kill(true); }); gsap.globalTimeline.progress(1);
          }
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        if (hasTimeline) timeline(gsap);
        if (hasBoard) board(gsap);
        if (hasHero) hero(gsap);
        if (hasPh) pageTitle(gsap);
        if (hasRun) runRail(gsap);
        if (hasVoice) voice(gsap);
        if (hasCard) laneCard(gsap);
        if (hasCount) tally(gsap);
      })
      .catch(function () { /* no motion is a fine outcome */ });
  });

  function timeline(gsap) {
    var list = document.getElementById('tl-list');
    function build() {
      var items = list.querySelectorAll('.tl-item'); if (!items.length) return false;
      var host = list.closest('.timeline') || list;
      host.style.position = 'relative';
      var line = document.createElement('div');
      line.className = 'tl-progress'; line.setAttribute('aria-hidden', 'true');
      host.appendChild(line);
      gsap.fromTo(line, { scaleY: 0 }, { scaleY: 1, ease: 'none', transformOrigin: 'top center',
        scrollTrigger: { trigger: list, start: 'top 60%', end: 'bottom 60%', scrub: 0.4 } });
      items.forEach(function (it) {
        window.ScrollTrigger.create({ trigger: it, start: 'top 60%', toggleClass: { targets: it, className: 'is-reached' } });
      });
      return true;
    }
    if (!build()) {
      var mo = new MutationObserver(function () { if (build()) mo.disconnect(); });
      mo.observe(list, { childList: true });
    }
  }

  function hero(gsap) {
    var sec = document.querySelector('.kl-hero');
    var media = sec.querySelector('.kl-hero__media'), word = sec.querySelector('.kl-hero__word');
    var tl = gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom top', scrub: 0.4 } });
    if (media) tl.fromTo(media, { scale: 1 }, { scale: 1.12, ease: 'none' }, 0);
    if (word) tl.fromTo(word, { yPercent: 0 }, { yPercent: -18, ease: 'none' }, 0);
  }

  // CARRY — every inside page's photograph pushes in as you leave its title.
  function pageTitle(gsap) {
    gsap.utils.toArray('.kl-ph').forEach(function (sec) {
      var media = sec.querySelector('.kl-ph__media'); if (!media) return;
      var title = sec.querySelector('.kl-ph__title');
      var tl = gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom top', scrub: 0.4 } });
      tl.fromTo(media, { scale: 1 }, { scale: 1.1, ease: 'none' }, 0);
      if (title) tl.fromTo(title, { yPercent: 0 }, { yPercent: -14, ease: 'none' }, 0);
    });
  }

  // FOCAL — the run: arrive at the start of the results and glide to "Next".
  // js/home.js has already parked the rail on the next match (that is the
  // no-motion end state); this replays the journey once, the first time the
  // rail comes into view, and stops the instant the visitor touches it.
  function runRail(gsap) {
    var rail = document.getElementById('kl-run');
    var done = false;
    function arm() {
      if (done || !rail.querySelector('.is-next')) return false;
      done = true;
      var target = rail.scrollLeft;
      if (target < 40) return true;              // nothing behind us to travel through
      var st = { x: 0 }, tween = null;
      window.ScrollTrigger.create({ trigger: rail, start: 'top 80%', once: true, onEnter: function () {
        rail.scrollLeft = 0;
        tween = gsap.to(st, { x: target, duration: 1.1, ease: 'power3.inOut', delay: 0.15,
          onUpdate: function () { rail.scrollLeft = st.x; } });
      } });
      ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(function (ev) {
        rail.addEventListener(ev, function () { if (tween) { tween.kill(); tween = null; } }, { passive: true, once: true });
      });
      return true;
    }
    if (!arm()) {
      var mo = new MutationObserver(function () { requestAnimationFrame(function () { if (arm()) mo.disconnect(); }); });
      mo.observe(rail, { childList: true });
    }
  }

  // READ — the chairman's line inks in as you read it. Words stay real text;
  // only their opacity is scrubbed, from legible-dim to full.
  function voice(gsap) {
    var q = document.querySelector('.kl-voice__q');
    var words = [];
    (function wrap(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
            var sp = document.createElement('span'); sp.className = 'kl-w'; sp.textContent = w; words.push(sp); frag.appendChild(sp);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) wrap(n);
      });
    })(q);
    if (!words.length) return;
    gsap.fromTo(words, { opacity: 0.22 }, { opacity: 1, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: q, start: 'top 82%', end: 'bottom 45%', scrub: 0.3 } });
  }

  // HAND — the Lane Card squares up to you as its section arrives.
  function laneCard(gsap) {
    var card = document.getElementById('kl-lanecard');
    gsap.fromTo(card, { rotate: -7, yPercent: 10 }, { rotate: -2, yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: card.closest('section') || card, start: 'top 85%', end: 'center 55%', scrub: 0.5 } });
  }

  // TALLY — numbers that were counted, counted once.
  function tally(gsap) {
    gsap.utils.toArray('[data-kl-count]').forEach(function (el) {
      var end = parseFloat(el.getAttribute('data-kl-count'));
      if (!isFinite(end) || end <= 0) return;
      var final = el.textContent, dec = (String(end).split('.')[1] || '').length, o = { v: 0 };
      window.ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: function () {
        gsap.to(o, { v: end, duration: Math.min(1.2, 0.5 + end / 400), ease: 'power2.out',
          onUpdate: function () { el.textContent = final.replace(String(end), o.v.toFixed(dec)); },
          onComplete: function () { el.textContent = final; } });
      } });
    });
  }

  function board(gsap) {
    var cards = gsap.utils.toArray('.ptr-grid .ptr-card');
    if (!cards.length) return;
    gsap.from(cards, { opacity: 0.001, y: 10, duration: 0.42, ease: 'power3.out', stagger: 0.05,
      scrollTrigger: { trigger: '.ptr-grid', start: 'top 85%', once: true },
      clearProps: 'opacity,transform' });
  }
})();
