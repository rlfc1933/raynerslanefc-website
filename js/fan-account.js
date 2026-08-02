/* ════════════════════════════════════════════════════════════════════════
   THE ACCOUNT CONTROL — the site recognising a supporter.

   Loaded by js/fan-boot.js, never on its own, so it can assume LaneFan exists.

   THREE STATES, AND THE MIDDLE ONE MATTERS MOST
   ---------------------------------------------
     unknown   the session has not been resolved yet  → render NOTHING
     signed out                                        → Join Free
     signed in                                         → Hi, [First name]

   Rendering "Join Free" before the answer arrives, then swapping it for a
   member's name a moment later, tells a supporter the club forgot them and
   then remembered. The slot stays empty until the server has answered. It is
   a fraction of a second of nothing instead of a flash of the wrong identity.

   RESTRAINT
   ---------
   A first name, a Lane number and two links. No email in the header — it is
   over somebody's shoulder on a train. No avatar, no activity count, no
   "you last visited" — none of that is welcoming, it is surveillance with a
   friendly font.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Just the first name, whatever shape the record is in. */
  function firstName(member) {
    if (!member) return '';
    var n = member.firstName || member.displayName || '';
    return String(n).trim().split(/\s+/)[0] || '';
  }

  function signedOutHtml() {
    return '<a class="fan-acct__join" href="fan-zone.html?join=1&amp;return=' +
      encodeURIComponent(location.pathname + location.search) + '">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
      '<span>Join Free</span></a>';
  }

  function signedInHtml(state) {
    var name = firstName(state.member);
    var num = state.member && state.member.membershipNumber;
    return '<button type="button" class="fan-acct__btn" aria-expanded="false" ' +
        'aria-controls="fan-acct-menu" data-fan-toggle>' +
        '<span class="fan-acct__badge" aria-hidden="true">' +
          esc((name.charAt(0) || 'L').toUpperCase()) + '</span>' +
        '<span class="fan-acct__name">Hi, ' + esc(name || 'there') + '</span>' +
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M6 9l6 6 6-6"/></svg>' +
      '</button>' +
      '<div class="fan-acct__menu" id="fan-acct-menu" hidden>' +
        '<div class="fan-acct__head">' +
          '<span class="fan-acct__hname">' + esc(state.member.displayName || name || 'Lane member') + '</span>' +
          (num ? '<span class="fan-acct__no">Lane No. ' + esc(num) + '</span>' : '') +
        '</div>' +
        '<a href="fan-zone.html">My Fan Zone</a>' +
        '<a href="fan-zone.html#lane-card">Lane Card</a>' +
        '<a href="programmes.html">Programmes</a>' +
        '<button type="button" data-fan-signout>Sign out</button>' +
      '</div>';
  }

  /** The menu-sheet version: plain links, no dropdown to trap focus inside. */
  function sheetHtml(state) {
    if (!state.member) {
      return '<a class="lane-menu__link" href="fan-zone.html?join=1&amp;return=' +
        encodeURIComponent(location.pathname + location.search) + '">Join Fan Zone — free</a>';
    }
    var num = state.member.membershipNumber;
    return '<div class="lane-menu__me">Hi, ' + esc(firstName(state.member) || 'there') +
        (num ? ' <span>· Lane No. ' + esc(num) + '</span>' : '') + '</div>' +
      '<a class="lane-menu__link" href="fan-zone.html">My Fan Zone</a>' +
      '<button type="button" class="lane-menu__link lane-menu__signout" data-fan-signout>Sign out</button>';
  }

  function closeMenu() {
    var m = document.getElementById('fan-acct-menu');
    var b = document.querySelector('[data-fan-toggle]');
    if (m) m.hidden = true;
    if (b) b.setAttribute('aria-expanded', 'false');
  }

  function wire(root) {
    var toggle = root.querySelector('[data-fan-toggle]');
    if (toggle) {
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var m = document.getElementById('fan-acct-menu');
        if (!m) return;
        var open = m.hidden;
        m.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    Array.prototype.forEach.call(root.querySelectorAll('[data-fan-signout]'), function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true;
        await global.LaneFan.signOut();
        // Back to a public page, so nothing personal is left on screen behind
        // a sign-out that only changed a variable.
        location.href = 'index.html';
      });
    });
  }

  function render(state) {
    var slot = document.getElementById('lane-account');
    var sheet = document.getElementById('lane-account-menu');

    // Not resolved yet: show nothing rather than the wrong thing.
    if (!state.loaded) {
      if (slot) { slot.hidden = true; slot.innerHTML = ''; }
      if (sheet) { sheet.hidden = true; sheet.innerHTML = ''; }
      return;
    }

    if (slot) {
      slot.innerHTML = state.member ? signedInHtml(state) : signedOutHtml();
      slot.hidden = false;
      slot.classList.toggle('nav__account--in', !!state.member);
      wire(slot);
    }
    if (sheet) {
      sheet.innerHTML = sheetHtml(state);
      sheet.hidden = false;
      wire(sheet);
    }

    // Let pages personalise themselves without each one re-deriving the state.
    document.documentElement.classList.toggle('is-fan-member', !!state.member);
    document.documentElement.classList.toggle('is-fan-known', !!state.loaded);
    Array.prototype.forEach.call(document.querySelectorAll('[data-fan-name]'), function (el) {
      el.textContent = firstName(state.member) || '';
    });
  }

  document.addEventListener('click', function (e) {
    var slot = document.getElementById('lane-account');
    if (slot && !slot.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  // The nav is injected asynchronously by components.js, so the slot may not
  // exist yet when the first state arrives. Render on both signals.
  if (global.LaneFan) {
    global.LaneFan.onChange(render);
    document.addEventListener('lane:nav-ready', function () { render(global.LaneFan.state); });
    // Belt and braces for pages that build their nav before this file lands.
    setTimeout(function () { render(global.LaneFan.state); }, 0);
  }

  global.LaneAccount = { render: render, firstName: firstName };
})(window);
