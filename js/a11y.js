/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — ACCESSIBILITY TOGGLE (vanilla, no dependencies)

   Built-in alternative to the paid overlay widgets (accessiBe / UserWay / …),
   which are widely criticised for breaking real assistive tech. This is small,
   honest, keyboard-operable, aria-labelled, and free.

   Features (persisted in localStorage → stick across pages & visits):
     • Text size   — A / A+ / A++  (scales the root font; type tokens reflow)
     • High contrast — maximum-contrast palette (pure white text, strong borders)
     • Reduce motion — stops animations for users whose OS setting isn't on

   Injected on every public page by js/components.js.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__laneA11y) return; window.__laneA11y = true;

  var KEY = 'rlfc_a11y';
  var state = { text: 0, contrast: false, motion: false };
  try { var s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (s && typeof s === 'object') {
    state.text = Math.max(0, Math.min(2, s.text | 0));
    state.contrast = !!s.contrast; state.motion = !!s.motion;
  } } catch (e) {}

  var root = document.documentElement;
  function apply() {
    root.classList.remove('a11y-text-2', 'a11y-text-3');
    if (state.text === 1) root.classList.add('a11y-text-2');
    if (state.text === 2) root.classList.add('a11y-text-3');
    root.classList.toggle('a11y-contrast', state.contrast);
    root.classList.toggle('a11y-reduce-motion', state.motion);
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  // Apply saved preferences immediately (before the UI is built) to limit any flash.
  apply();

  // Wait for <body> before injecting the control.
  function ready(fn) {
    if (document.body) return fn();
    document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    if (document.querySelector('.a11y-fab')) return;

    var A11Y_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none"/>' +
      '<path d="M4.5 8.2c2.4.9 4.9 1.3 7.5 1.3s5.1-.4 7.5-1.3"/>' +
      '<path d="M12 9.5V15"/><path d="M9 21l3-6 3 6"/></svg>';

    // ── the floating button ──
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'a11y-fab';
    fab.id = 'a11y-fab';
    fab.setAttribute('aria-label', 'Accessibility options');
    fab.setAttribute('aria-haspopup', 'dialog');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'a11y-panel');
    fab.innerHTML = A11Y_ICON;
    if (window.LANE_WHATSAPP) fab.classList.add('a11y-fab--raised');

    // ── the panel ──
    var panel = document.createElement('div');
    panel.className = 'a11y-panel';
    panel.id = 'a11y-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'a11y-panel-title');
    panel.hidden = true;
    panel.innerHTML = '' +
      '<div class="a11y-panel__head">' +
        '<span class="a11y-panel__title" id="a11y-panel-title">Accessibility</span>' +
        '<button type="button" class="a11y-panel__close" id="a11y-close" aria-label="Close accessibility options">&#10005;</button>' +
      '</div>' +
      '<p class="a11y-panel__sub">Make The Lane easier to read and use. Your choices are saved on this device.</p>' +

      '<div class="a11y-group">' +
        '<span class="a11y-group__label" id="a11y-text-label">Text size</span>' +
        '<div class="a11y-seg" role="group" aria-labelledby="a11y-text-label">' +
          '<button type="button" data-size="0" aria-pressed="false" aria-label="Default text size">A</button>' +
          '<button type="button" data-size="1" aria-pressed="false" aria-label="Large text size">A+</button>' +
          '<button type="button" data-size="2" aria-pressed="false" aria-label="Largest text size">A++</button>' +
        '</div>' +
      '</div>' +

      '<div class="a11y-group">' +
        '<span class="a11y-group__label">Display</span>' +
        '<button type="button" class="a11y-switch" id="a11y-contrast" role="switch" aria-checked="false">' +
          '<span>High contrast</span><span class="a11y-switch__track" aria-hidden="true"></span>' +
        '</button>' +
        '<button type="button" class="a11y-switch" id="a11y-motion" role="switch" aria-checked="false">' +
          '<span>Reduce motion</span><span class="a11y-switch__track" aria-hidden="true"></span>' +
        '</button>' +
      '</div>' +

      '<button type="button" class="a11y-reset" id="a11y-reset">Reset to default</button>';

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var segBtns = panel.querySelectorAll('.a11y-seg button');
    var contrastBtn = panel.querySelector('#a11y-contrast');
    var motionBtn = panel.querySelector('#a11y-motion');

    function syncUI() {
      segBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', (+b.dataset.size === state.text) ? 'true' : 'false');
      });
      contrastBtn.setAttribute('aria-checked', state.contrast ? 'true' : 'false');
      motionBtn.setAttribute('aria-checked', state.motion ? 'true' : 'false');
    }
    syncUI();

    // ── open / close ──
    var isOpen = false;
    function open() {
      isOpen = true; panel.hidden = false; panel.classList.add('open');
      fab.setAttribute('aria-expanded', 'true');
      var first = panel.querySelector('.a11y-panel__close');
      if (first) first.focus();
      document.addEventListener('keydown', onKey);
      setTimeout(function () { document.addEventListener('click', onOutside); }, 0);
    }
    function close(returnFocus) {
      isOpen = false; panel.classList.remove('open'); panel.hidden = true;
      fab.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onOutside);
      if (returnFocus !== false) fab.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Tab') {                                   // simple focus trap
        var f = panel.querySelectorAll('button');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function onOutside(e) { if (!panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) close(false); }

    fab.addEventListener('click', function () { isOpen ? close() : open(); });
    panel.querySelector('#a11y-close').addEventListener('click', function () { close(); });

    // ── controls ──
    segBtns.forEach(function (b) {
      b.addEventListener('click', function () { state.text = +b.dataset.size; apply(); save(); syncUI(); });
    });
    contrastBtn.addEventListener('click', function () { state.contrast = !state.contrast; apply(); save(); syncUI(); });
    motionBtn.addEventListener('click', function () { state.motion = !state.motion; apply(); save(); syncUI(); });
    panel.querySelector('#a11y-reset').addEventListener('click', function () {
      state = { text: 0, contrast: false, motion: false }; apply(); save(); syncUI();
    });
  });
})();
