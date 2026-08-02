/* The footer mailing list, wired to the club's own supporter records.
   Progressive enhancement: with JavaScript off the form still posts to Netlify
   exactly as it always did, so nobody loses the ability to sign up. */
(function (global) {
  'use strict';

  function msgFor(form) {
    var wrap = form.parentElement;
    return wrap ? wrap.querySelector('[data-lane-newsletter-msg]') : null;
  }

  function say(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? '#b7e8c6' : '#f0bcbc';
  }

  function wire(form) {
    if (form.dataset.laneWired === '1') return;
    form.dataset.laneWired = '1';

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type=email]');
      var btn = form.querySelector('button[type=submit]');
      var out = msgFor(form);
      var email = input ? input.value : '';
      if (!email) return;

      btn.disabled = true;
      var was = btn.textContent;
      btn.textContent = 'Sending…';
      say(out, '', true);

      try {
        // authedFetch when a member is signed in, so the server can treat this
        // as their marketing preference rather than a second, unlinked record.
        var doFetch = (global.LaneFan && global.LaneFan.authedFetch) || fetch;
        var r = await doFetch('/.netlify/functions/fan-newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, source: 'footer' }),
        });
        var j = await r.json();
        if (j && j.ok) {
          form.reset();
          say(out, j.message + (j.invite ? ' ' + j.invite : ''), true);
        } else {
          say(out, (j && j.error) || 'Sorry — that did not send.', false);
        }
      } catch (err) {
        say(out, 'Sorry — that did not send. Please try again.', false);
      }
      btn.disabled = false;
      btn.textContent = was;
    });
  }

  function scan() {
    Array.prototype.forEach.call(
      document.querySelectorAll('form[data-lane-newsletter]'), wire);
  }

  // The footer is injected by components.js, so scan on load AND after.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(scan, 0); });
  } else { setTimeout(scan, 0); }
  document.addEventListener('lane:nav-ready', function () { setTimeout(scan, 0); });

  global.LaneNewsletter = { scan: scan };
})(window);
