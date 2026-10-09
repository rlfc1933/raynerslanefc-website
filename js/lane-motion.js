/* ════════════════════════════════════════════════════════════════════════
   LANE MOTION — the site's only scroll-driven storytelling (GSAP).
   DESIGN.md §5: motion explains; it never decorates and never hides
   information. Everything here:
     · is skipped entirely under prefers-reduced-motion or the a11y panel's
       reduce-motion switch (GSAP is not even downloaded);
     · starts from content that is already visible — if this file fails,
       nothing is missing;
     · loads GSAP only on a page that has something for it to do.
   Moments:
     1. History: a yellow line fills the timeline's spine as you read down
        90+ years, and each year's marker lights when you reach it —
        "where am I in the club's story".
     2. Home: the partner board settles into place once as it arrives —
        sponsors are acknowledged, not flashed.
     3. Home hero: as you scroll away from the title card the photograph
        pushes in and the name lifts off — the broadcast "cut" from the
        opening shot into the match centre. Scrubbed to the scrollbar, so
        it is exactly as fast as the reader.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var reduce = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    document.documentElement.classList.contains('a11y-reduce-motion');
  if (reduce) return;
  var hasTimeline = !!document.getElementById('tl-list');
  var hasBoard = !!document.querySelector('.ptr-grid');
  var hasHero = !!document.querySelector('.kl-hero');
  if (!hasTimeline && !hasBoard && !hasHero) return;

  function load(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  ready(function () {
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

  function board(gsap) {
    var cards = gsap.utils.toArray('.ptr-grid .ptr-card');
    if (!cards.length) return;
    gsap.from(cards, { opacity: 0.001, y: 10, duration: 0.42, ease: 'power3.out', stagger: 0.05,
      scrollTrigger: { trigger: '.ptr-grid', start: 'top 85%', once: true },
      clearProps: 'opacity,transform' });
  }
})();
