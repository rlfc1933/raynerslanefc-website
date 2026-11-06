/* Progressive enhancement: content, links and photography remain visible without GSAP. */
(function () {
  'use strict';
  var media = matchMedia('(prefers-reduced-motion: reduce)');
  var context, timer, attempts = 0;
  function reduced() { return media.matches || document.documentElement.classList.contains('a11y-reduce-motion'); }
  function sync() {
    clearTimeout(timer);
    if (reduced()) { if (context) { context.revert(); context = null; } return; }
    if (context) return;
    if (!window.gsap || !window.ScrollTrigger) { if (++attempts < 100) timer = setTimeout(sync, 150); return; }
    context = window.gsap.context(function () {
      var g = window.gsap;
      g.to('.lane-campaign__fabric img', {yPercent:6, scale:1.08, ease:'none', scrollTrigger:{trigger:'.lane-campaign',start:'top top',end:'bottom top',scrub:.6}});
      g.to('.lane-campaign__ground', {rotation:-2,yPercent:5,ease:'none',scrollTrigger:{trigger:'.lane-campaign',start:'top top',end:'bottom top',scrub:.6}});
      g.fromTo('.lane-ground__image img',{scale:1.08},{scale:1,ease:'none',scrollTrigger:{trigger:'.lane-ground',start:'top bottom',end:'bottom top',scrub:.6}});
    });
  }
  media.addEventListener('change',sync);
  new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  if (document.readyState === 'complete') sync(); else window.addEventListener('load',sync,{once:true});
})();
