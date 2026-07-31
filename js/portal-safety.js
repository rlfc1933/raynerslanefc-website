/**
 * PORTAL SAFETY AND ACCESSIBILITY — shared behaviour, applied once.
 *
 * Three jobs, all of which were previously repeated (or missing) panel by panel:
 *
 *  1. NAME EVERY FORM FIELD. The portal has 273 <label class="fl"> elements and
 *     not one of them carried a `for` attribute, so they were visual captions
 *     only. A screen reader announced "edit text, blank" on every field in the
 *     portal. Rather than hand-edit 273 markup sites — churn, and easy to get
 *     wrong — each label is paired with the control it captions at load.
 *
 *  2. ASK BEFORE DESTROYING, AND SAY WHAT WILL HAPPEN. Removal prompts said
 *     things like "Remove this?" — they never said where it would disappear
 *     from, whether supporters would notice, or whether it could be undone.
 *     One shared builder now writes that sentence consistently.
 *
 *  3. MAKE HIGH-RISK ACTIONS DELIBERATE. The pattern proven on Emergency
 *     Controls — type the word — is available to any action that genuinely
 *     warrants it, rather than being a one-off.
 *
 * Deliberately NOT done here: replacing every confirm() with a custom modal.
 * That would mean converting twenty synchronous call sites to async in a
 * release with no second deployment window. The honest trade is better wording
 * and a real typed gate where the risk justifies it.
 */
(function (global) {
  'use strict';

  // ── 1 · ACCESSIBLE NAMES ────────────────────────────────────────────────
  var seq = 0;
  function linkLabels(root) {
    var scope = root || document;
    var labels = scope.querySelectorAll('label.fl:not([for]), label.nm-lbl:not([for])');
    Array.prototype.forEach.call(labels, function (lab) {
      if (lab.querySelector('input, select, textarea')) return;   // already wrapping
      // The control this label captions: the next form control in the same field.
      var field = lab.parentElement;
      var ctrl = field && field.querySelector('input:not([type=hidden]), select, textarea');
      if (!ctrl) {
        var n = lab.nextElementSibling;
        while (n && !/^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName)) n = n.nextElementSibling;
        ctrl = n;
      }
      if (!ctrl || ctrl.type === 'hidden') return;
      if (!ctrl.id) ctrl.id = 'pf-' + (++seq);
      lab.setAttribute('for', ctrl.id);
    });
    // Anything still unnamed gets its visible caption as an aria-label, so no
    // control is ever announced as blank.
    var ctrls = scope.querySelectorAll('input:not([type=hidden]):not([aria-label]), select:not([aria-label]), textarea:not([aria-label])');
    Array.prototype.forEach.call(ctrls, function (c) {
      if (c.id && scope.querySelector('label[for="' + CSS.escape(c.id) + '"]')) return;
      var lab = c.closest('.field, .nm-field');
      var cap = lab && lab.querySelector('label, .fl, .nm-lbl');
      var txt = cap ? cap.textContent.trim() : (c.placeholder || '').trim();
      if (txt) c.setAttribute('aria-label', txt.replace(/\s+/g, ' ').slice(0, 80));
    });
  }

  // ── 2 · HONEST REMOVAL PROMPTS ──────────────────────────────────────────
  /**
   * One sentence pattern for every removal in the portal:
   *   what is going · where it disappears from · whether it can be undone.
   *
   * @param what      "this fixture", "Joe Bloggs" — the thing itself
   * @param where     'public'  removed from the website supporters see
   *                  'portal'  removed from the club portal only
   *                  'device'  only affects this browser on this device
   * @param recovery  'undo'    genuinely recoverable (Emergency Controls)
   *                  'retype'  can be added again by hand
   *                  'none'    gone for good
   */
  function confirmRemove(what, where, recovery) {
    var placeTxt = {
      public: 'It will disappear from the public website within about 30 seconds.',
      portal: 'It will be removed from the club portal. Supporters will not see any change.',
      device: 'This only affects this browser on this device. Nobody else is affected.'
    }[where] || 'It will be removed from the club portal.';
    var backTxt = {
      undo:   'You can put it back from Emergency Controls if this was a mistake.',
      retype: 'To get it back you would have to add it again by hand.',
      none:   'This cannot be undone.'
    }[recovery] || 'To get it back you would have to add it again by hand.';
    return global.confirm('Remove ' + what + '?\n\n' + placeTxt + '\n\n' + backTxt);
  }

  /**
   * For actions that are genuinely hard to come back from. The volunteer types
   * the word, so it cannot happen by tapping through.
   */
  function confirmTyped(word, title, consequence) {
    var typed = global.prompt(title + '\n\n' + consequence + '\n\nType ' + word + ' to continue:');
    return String(typed || '').trim().toUpperCase() === word.toUpperCase();
  }

  // ── 3 · HONEST EMPTY STATES ─────────────────────────────────────────────
  /**
   * A blank region reads as "broken" to a volunteer. Every list that can be
   * empty says so, and says what to do about it.
   */
  function emptyState(title, help, actionLabel, actionJs) {
    return '<div class="ph-empty">' +
      '<b>' + title + '</b>' + help +
      (actionLabel ? '<div style="margin-top:12px"><button class="save sec" style="margin:0" onclick="' +
        actionJs + '">' + actionLabel + '</button></div>' : '') +
      '</div>';
  }

  function init() {
    linkLabels(document);
    // Panels render their lists on open, so re-pair after each one.
    if (typeof global.openPanel === 'function' && !global.__pfWrapped) {
      var orig = global.openPanel;
      global.openPanel = function (name) {
        var r = orig.apply(this, arguments);
        try { setTimeout(function () { linkLabels(document.getElementById('panel-' + name) || document); }, 60); } catch (e) {}
        return r;
      };
      global.__pfWrapped = true;
    }
  }

  global.PortalSafety = {
    init: init, linkLabels: linkLabels,
    confirmRemove: confirmRemove, confirmTyped: confirmTyped, emptyState: emptyState
  };
}(window));
