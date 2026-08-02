/* ════════════════════════════════════════════════════════════════════════
   THE FAN ZONE MEMBER HOME — joining, returning, and what a supporter sees.

   This sits ALONGSIDE the existing Lane Card page rather than replacing it.
   The Lane Card, the rewards ladder, the streak and the wall are what Fan
   Zone already is to the people who use it; a supporter who joined to read a
   programme should arrive at the club's supporter page, not at an account
   product wearing the same badge.

   WHAT THIS FILE OWNS
   -------------------
     · the join / sign-in panel (passwordless)
     · the query parameters the previous release discarded
     · returning the supporter to the exact programme they came from
     · the welcome, programme history and preferences blocks

   THE PARAMETERS
   --------------
     ?join=1         open the panel on Join
     ?signin=1       open the panel on Sign in
     ?return=/path   where to go afterwards — SAME-ORIGIN PATHS ONLY
     ?programme=id   which edition prompted it (attribution)
     ?source=…       how they got here
     ?welcome=1      they have just followed a magic link

   The programme gate has been linking here with ?join= and ?return= since the
   last release. Nothing read them, so every supporter who clicked "Join Fan
   Zone — free" landed on a page that had already forgotten why.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Q = new URLSearchParams(location.search);
  var LaneFan = global.LaneFan;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Where we were asked to go afterwards. Judged by the SAME function the
     server uses, so the browser cannot be the lax one. */
  function wantedReturn() {
    var raw = Q.get('return');
    return (LaneFan && LaneFan.safePath(raw)) ? raw : null;
  }

  function fixtureFromReturn(path) {
    var m = /[?&]id=([^&]+)/.exec(path || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* Clean the address bar. The parameters have done their job, and a URL a
     supporter might copy and send to a friend should not carry their journey. */
  function tidyUrl() {
    try {
      var keep = new URLSearchParams(location.search);
      ['join', 'signin', 'return', 'welcome', 'source', 'programme'].forEach(function (k) {
        keep.delete(k);
      });
      var qs = keep.toString();
      history.replaceState({}, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } catch (e) {}
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric',
      }).format(new Date(iso));
    } catch (e) { return String(iso).slice(0, 10); }
  }

  /* ── The join panel ──────────────────────────────────────────────────── */

  var panelMode = 'join';

  function panelHtml() {
    var ret = wantedReturn();
    var joining = panelMode === 'join';
    return '<div class="fz-join">' +
      '<p class="fz-join__eyebrow">' + (joining ? 'Free — always' : 'Welcome back') + '</p>' +
      '<h2 class="fz-join__h">' + (joining
        ? 'Join Fan Zone.<br>Every programme, your Lane Card, one account.'
        : 'Sign in to Fan Zone') + '</h2>' +
      '<p class="fz-join__p">' + (joining
        ? 'We will email you a link to sign in. No password to invent, and nothing to pay — Fan Zone is free and always will be.'
        : 'Enter your email and we will send you a sign-in link.') + '</p>' +
      (ret ? '<p class="fz-join__p" style="color:var(--yellow)">We will take you straight back to the programme afterwards.</p>' : '') +
      '<form id="fz-join-form" novalidate>' +
        (joining ? '<div class="fz-join__row">' +
          '<div class="fz-join__field"><label for="fzj-first">First name</label>' +
            '<input type="text" id="fzj-first" name="firstName" autocomplete="given-name" required></div>' +
          '<div class="fz-join__field"><label for="fzj-last">Last name</label>' +
            '<input type="text" id="fzj-last" name="lastName" autocomplete="family-name"></div>' +
        '</div>' : '') +
        '<div class="fz-join__field"><label for="fzj-email">Email address</label>' +
          '<input type="email" id="fzj-email" name="email" autocomplete="email" required></div>' +
        (joining ? '<label class="fz-join__check">' +
          '<input type="checkbox" id="fzj-marketing" name="marketing">' +
          '<span>Email me occasional club news and matchday updates. Optional — your programme access does not depend on it, and you can change your mind any time.</span>' +
        '</label>' : '') +
        '<button type="submit" class="btn btn-primary" id="fzj-submit">' +
          (joining ? 'Email me my sign-in link' : 'Send me a sign-in link') + '</button>' +
      '</form>' +
      (joining ? '<p class="fz-join__legal">By joining you agree to our ' +
        '<a href="policies.html#fan-zone-terms">Fan Zone terms</a> and ' +
        '<a href="policies.html#privacy">privacy notice</a>. ' +
        'Rayners Lane Football Club Limited, Company No. 17110511.</p>' : '') +
      '<div id="fzj-msg"></div>' +
      '<p class="fz-join__alt">' + (joining
        ? 'Already a member? <button type="button" data-fz-mode="signin">Sign in</button>'
        : 'New to Fan Zone? <button type="button" data-fz-mode="join">Join free</button>') + '</p>' +
    '</div>';
  }

  function msg(kind, text) {
    var el = document.getElementById('fzj-msg');
    if (!el) return;
    el.innerHTML = '<p class="fz-join__msg fz-join__msg--' + kind + '">' + text + '</p>';
  }

  async function submitJoin(e) {
    e.preventDefault();
    var btn = document.getElementById('fzj-submit');
    var email = (document.getElementById('fzj-email') || {}).value || '';
    var first = (document.getElementById('fzj-first') || {}).value || '';
    var last = (document.getElementById('fzj-last') || {}).value || '';
    var mk = document.getElementById('fzj-marketing');
    var ret = wantedReturn();

    if (panelMode === 'join' && !String(first).trim()) {
      return msg('err', 'Please tell us your first name so we know who to welcome.');
    }
    btn.disabled = true;
    var was = btn.textContent;
    btn.textContent = 'Sending…';

    var out = await LaneFan.sendMagicLink({
      email: email,
      firstName: first,
      lastName: last,
      returnPath: ret,
      // Attribution: how they came to us, and which edition did it.
      source: Q.get('source') || (ret ? 'programme:' + (fixtureFromReturn(ret) || 'unknown') : 'fan-zone'),
      fixtureId: fixtureFromReturn(ret),
      // Marketing is only ever sent when the box was on the form at all.
      // A sign-in has no marketing question, so it makes no marketing claim.
      marketing: (panelMode === 'join' && mk) ? !!mk.checked : null,
    });

    btn.disabled = false;
    btn.textContent = was;

    if (out && out.error) return msg('err', esc(out.error));
    msg('ok', 'Check your inbox — we have sent a sign-in link to <b>' + esc(email.trim()) +
      '</b>. It works once and lasts an hour. If it is not there in a minute, check your spam folder.');
  }

  function mountPanel(host) {
    host.innerHTML = panelHtml();
    var form = document.getElementById('fz-join-form');
    if (form) form.addEventListener('submit', submitJoin);
    Array.prototype.forEach.call(host.querySelectorAll('[data-fz-mode]'), function (b) {
      b.addEventListener('click', function () {
        panelMode = b.getAttribute('data-fz-mode');
        mountPanel(host);
        var f = document.getElementById('fzj-email');
        if (f) f.focus();
      });
    });
  }

  /* ── Asked for the minimum, and only when it is genuinely missing ─────── */

  function nameFormHtml() {
    return '<div class="fz-join">' +
      '<p class="fz-join__eyebrow">Nearly there</p>' +
      '<h2 class="fz-join__h">What should we call you?</h2>' +
      '<p class="fz-join__p">Your email is verified. We just need a name for your Lane Card — ' +
        'this happens when the link is opened on a different device to the one you started on.</p>' +
      '<form id="fz-name-form" novalidate>' +
        '<div class="fz-join__row">' +
          '<div class="fz-join__field"><label for="fzn-first">First name</label>' +
            '<input type="text" id="fzn-first" autocomplete="given-name" required></div>' +
          '<div class="fz-join__field"><label for="fzn-last">Last name</label>' +
            '<input type="text" id="fzn-last" autocomplete="family-name"></div>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary" id="fzn-submit">Finish and open Fan Zone</button>' +
      '</form><div id="fzj-msg"></div></div>';
  }

  /* ── The member home ─────────────────────────────────────────────────── */

  function welcomeHtml(state) {
    var m = state.member || {};
    var first = (m.firstName || m.displayName || '').split(/\s+/)[0];
    return '<div class="fz-welcome">' +
      '<h2 class="fz-welcome__h">Welcome back' + (first ? ', ' + esc(first) : '') + '.</h2>' +
      '<p class="fz-welcome__sub">Lane No. <b>' + esc(m.membershipNumber || '—') + '</b>' +
        (m.joinedAt ? ' · member since ' + esc(fmtDate(m.joinedAt)) : '') + '</p>' +
    '</div>';
  }

  function historyHtml(state) {
    var h = state.programmeHistory || [];
    if (!h.length) {
      return '<div class="fz-card"><h3 class="fz-card__h">Your programme history</h3>' +
        '<p class="fz-empty">Nothing here yet. Every programme you open is saved so you can read it again — ' +
        'they do not disappear after the match.</p>' +
        '<p><a href="programmes.html" class="btn">Browse programmes</a></p></div>';
    }
    return '<div class="fz-card"><h3 class="fz-card__h">Your programme history</h3><ul class="fz-hist">' +
      h.slice(0, 12).map(function (x) {
        return '<li><div class="fz-hist__body">' +
          '<span class="fz-hist__t">' + esc(x.fixtureId || 'Programme') + '</span>' +
          '<span class="fz-hist__d">Opened ' + esc(fmtDate(x.openedAt)) + '</span></div>' +
          '<a href="programme.html?id=' + encodeURIComponent(x.fixtureId || '') + '">Read again</a></li>';
      }).join('') + '</ul></div>';
  }

  function prefsHtml(state) {
    var m = state.member || {};
    var wants = !!(state.marketing && state.marketing.email);
    return '<div class="fz-card fz-prefs"><h3 class="fz-card__h">Your details and preferences</h3>' +
      '<div class="fz-prefs__row">' +
        '<div><label for="fzp-first" style="display:block;font-size:12.5px;color:#cfcfcf;margin-bottom:5px">First name</label>' +
          '<input type="text" id="fzp-first" value="' + esc(m.firstName || '') + '"></div>' +
        '<div><label for="fzp-last" style="display:block;font-size:12.5px;color:#cfcfcf;margin-bottom:5px">Last name</label>' +
          '<input type="text" id="fzp-last" value="' + esc(m.lastName || '') + '"></div>' +
      '</div>' +
      '<p class="fz-note">Your Lane number stays the same — it is how the club knows you.</p>' +
      '<p class="fz-prefs__save"><button type="button" class="btn" id="fzp-save">Save my details</button></p>' +
      '<hr style="border:0;border-top:1px solid #242424;margin:18px 0">' +
      '<label><input type="checkbox" id="fzp-marketing"' + (wants ? ' checked' : '') + '>' +
        '<span>Email me occasional club news and matchday updates. ' +
        'Turning this off never affects your programme access.</span></label>' +
      '<p class="fz-note">' +
        '<a href="policies.html#privacy">Privacy notice</a> · ' +
        '<a href="#" id="fzp-cookies">Cookie settings</a> · ' +
        '<a href="mailto:info@raynerslanefc.co.uk">Account help</a></p>' +
      '<p class="fz-prefs__save"><button type="button" class="btn" id="fzp-signout">Sign out</button></p>' +
      '<div id="fzp-msg"></div></div>';
  }

  function wireMemberHome(state) {
    var save = document.getElementById('fzp-save');
    if (save) save.addEventListener('click', async function () {
      save.disabled = true;
      var out = await LaneFan.updateProfile({
        firstName: (document.getElementById('fzp-first') || {}).value,
        lastName: (document.getElementById('fzp-last') || {}).value,
      });
      save.disabled = false;
      var el = document.getElementById('fzp-msg');
      if (el) el.innerHTML = '<p class="fz-join__msg fz-join__msg--' +
        (out && out.ok ? 'ok">Saved.' : 'err">' + esc((out && out.error) || 'Could not save that.')) + '</p>';
    });

    var mk = document.getElementById('fzp-marketing');
    if (mk) mk.addEventListener('change', async function () {
      mk.disabled = true;
      await LaneFan.setMarketing(mk.checked, 'account');
      mk.disabled = false;
      var el = document.getElementById('fzp-msg');
      if (el) el.innerHTML = '<p class="fz-join__msg fz-join__msg--ok">' +
        (mk.checked ? 'You are on the list. Thank you.' : 'You will not receive club emails.') + '</p>';
    });

    var ck = document.getElementById('fzp-cookies');
    if (ck) ck.addEventListener('click', function (e) {
      e.preventDefault();
      if (global.laneCookieSettings) global.laneCookieSettings();
      else location.href = 'policies.html#cookies';
    });

    var so = document.getElementById('fzp-signout');
    if (so) so.addEventListener('click', async function () {
      so.disabled = true;
      await LaneFan.signOut();
      location.href = 'index.html';
    });
    void state;
  }

  /* ── What the page shows, decided once the server has answered ───────── */

  async function render(state) {
    var host = document.getElementById('fz-member');
    if (!host) return;

    // Not resolved yet — show nothing rather than the wrong identity.
    if (!state.loaded) { host.innerHTML = ''; return; }

    if (!state.member) {
      // Signed out, or signed in with no membership the server would confirm.
      panelMode = Q.get('signin') ? 'signin' : 'join';
      mountPanel(host);
      return;
    }

    // A magic link opened somewhere with no name to carry across.
    if (state.member && !state.member.firstName) {
      host.innerHTML = nameFormHtml();
      var f = document.getElementById('fz-name-form');
      if (f) f.addEventListener('submit', async function (e) {
        e.preventDefault();
        var b = document.getElementById('fzn-submit');
        b.disabled = true;
        var out = await LaneFan.updateProfile({
          firstName: (document.getElementById('fzn-first') || {}).value,
          lastName: (document.getElementById('fzn-last') || {}).value,
        });
        b.disabled = false;
        if (out && out.error) return msg('err', esc(out.error));
        await afterSignIn();
      });
      return;
    }

    host.innerHTML = welcomeHtml(state) +
      '<div class="fz-grid">' + historyHtml(state) + prefsHtml(state) + '</div>';
    wireMemberHome(state);
  }

  /**
   * The moment after a magic link is followed.
   *
   * The return path comes from the SERVER — it was stored against the intent
   * before the email went out — so it survives the link being opened on a
   * different device, where sessionStorage would be empty. The local copy is
   * the fallback, not the source.
   */
  async function afterSignIn() {
    var out = await LaneFan.complete({ returnTo: wantedReturn() });
    if (out && out.error) return;

    var target = (out && out.returnTo) || LaneFan.takeReturn() || wantedReturn();
    if (out && out.needsName) { tidyUrl(); return render(LaneFan.state); }

    if (target && LaneFan.safePath(target)) {
      // Straight back to the programme they wanted. No extra click, and the
      // welcome is a single line there rather than a page they must leave.
      var sep = target.indexOf('?') > -1 ? '&' : '?';
      location.replace(target + sep + 'joined=1');
      return;
    }
    tidyUrl();
    render(LaneFan.state);
  }

  /* ── Start ───────────────────────────────────────────────────────────── */

  if (!LaneFan) return;

  LaneFan.onChange(render);

  LaneFan.ready.then(async function (state) {
    /* The supporter has just followed a sign-in link.
       Detected from the auth response itself rather than a ?welcome=1 flag:
       the redirect Supabase allow-lists is now a bare path, because
       allow-listing a URL per programme is unmaintainable and the destination
       is decided by the intent the SERVER stored anyway. ?welcome=1 is still
       honoured so an older link in somebody's inbox still works. */
    var justSignedIn = (LaneFan.arrivedWithAuth && LaneFan.arrivedWithAuth()) || Q.get('welcome');
    if (justSignedIn && state.user) {
      await afterSignIn();
      return;
    }
    // Keep the join intent visible in the panel, then take it out of the URL.
    if (Q.get('join') || Q.get('signin')) {
      var host = document.getElementById('fz-member');
      if (host && !state.member) {
        panelMode = Q.get('signin') ? 'signin' : 'join';
        mountPanel(host);
        try { host.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      }
    }
    render(state);
  });

  global.LaneFanZone = { render: render, afterSignIn: afterSignIn, _wantedReturn: wantedReturn };
})(window);
