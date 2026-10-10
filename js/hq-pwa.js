/* ════════════════════════════════════════════════════════════════════════
   LANE HQ — install and update, honestly.

   WHAT WAS WRONG
   · "A new version of Lane HQ is ready / Update now" was raised by polling
     admin.html with HEAD and comparing content-length, falling back to the
     etag. Netlify serves compressed HTML without a content-length, and every
     Save rebuilds the site with a fresh etag — so the bar appeared after
     every save, on every device, and clicking it reloaded mid-edit.
   · An INSTALL button sat permanently in the header, enabled even where the
     browser cannot install anything (it then showed an alert).

   WHAT HAPPENS NOW
   · The only update signal is the service-worker lifecycle: a NEW worker
     (sw.js changed — its VERSION/CACHE are bumped when HQ code ships) is
     installed and waiting, or another tab has already let it take over.
   · One bar, once per version per session, with "Later". Nothing reloads by
     itself. If there is unsaved work (window.hqUnsavedWork), the bar says so
     and asks before reloading.
   · Install is offered only from the account menu, only where the browser
     handed us its prompt (or iPhone Safari's Share menu), never once
     installed, and never as a banner.

   Chrome's own "New Chrome available" notice is the browser updating
   itself; it is not this page and nothing here can or should touch it.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var S = { reg: null, waiting: null, version: '', shown: false, requested: false, takenOver: false,
    prompt: null, installed: false, listeners: [] };
  var LATER_KEY = 'hq_update_later';

  function $(id) { return document.getElementById(id); }
  function dirty() {
    try { return typeof global.hqUnsavedWork === 'function' ? global.hqUnsavedWork() : null; } catch (e) { return null; }
  }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }

  function askVersion(worker) {
    return new Promise(function (res) {
      try {
        var ch = new MessageChannel();
        var t = setTimeout(function () { res(''); }, 1500);
        ch.port1.onmessage = function (e) { clearTimeout(t); res((e.data && e.data.version) || ''); };
        worker.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
      } catch (e) { res(''); }
    });
  }

  // ── the bar ─────────────────────────────────────────────────────────────
  function bar() {
    var b = $('hq-update');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'hq-update';
    b.className = 'hq-update';
    b.setAttribute('role', 'status');
    b.setAttribute('aria-live', 'polite');
    document.body.appendChild(b);
    return b;
  }
  function paint(mode) {
    var b = bar();
    var v = S.version ? ' <span class="hq-update__v">' + S.version.replace(/[<>&"]/g, '') + '</span>' : '';
    if (mode === 'dirty') {
      var where = (dirty() || {}).where || 'this screen';
      b.innerHTML = '<p class="hq-update__msg"><b>You have unsaved changes in ' + String(where).replace(/[<>&"]/g, '') + '.</b> ' +
        'Save them first — reloading now would lose them.</p>' +
        '<div class="hq-update__acts"><button type="button" class="hq-btn" data-hq-upd="keep">Keep editing</button>' +
        '<button type="button" class="hq-btn hq-btn--ghost" data-hq-upd="force">Reload and discard</button></div>';
    } else {
      b.innerHTML = '<p class="hq-update__msg"><b>An update to Lane HQ is ready.</b>' + v +
        ' Reload when you have finished what you are doing.</p>' +
        '<div class="hq-update__acts"><button type="button" class="hq-btn hq-btn--primary" data-hq-upd="apply">Reload now</button>' +
        '<button type="button" class="hq-btn hq-btn--ghost" data-hq-upd="later">Later</button></div>';
    }
    b.classList.add('on');
    b.onclick = function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute('data-hq-upd');
      if (a === 'apply') apply(false);
      else if (a === 'force') apply(true);
      else if (a === 'keep') paint('ready');
      else if (a === 'later') later();
    };
  }
  function hide() { var b = $('hq-update'); if (b) { b.classList.remove('on'); b.innerHTML = ''; } }

  function offer(worker) {
    if (S.shown) return;                       // one bar, however many events fire
    var p = worker ? askVersion(worker) : Promise.resolve(S.version);
    p.then(function (v) {
      S.version = v || S.version;
      var key = S.version || 'unknown';
      if (ss(LATER_KEY) === key) return;       // "Later" holds for this version, this session
      if (S.shown) return;
      S.shown = true;
      paint('ready');
      emit('update', { version: S.version });
    });
  }
  function later() {
    ss(LATER_KEY, S.version || 'unknown');
    hide();
    S.shown = false;
  }

  /** Reload onto the new version — never over unsaved work unless told to. */
  function apply(force) {
    var d = dirty();
    if (d && d.dirty && !force) { paint('dirty'); return false; }
    try {
      var open = document.querySelector('.panel.on');
      if (open && open.id && open.id.indexOf('panel-') === 0) ss('rlfc_return_panel', open.id.slice(6));
    } catch (e) {}
    ss(LATER_KEY, null);
    S.requested = true;
    if (S.waiting && !S.takenOver) {
      S.waiting.postMessage({ type: 'SKIP_WAITING' });
      // controllerchange reloads; if the worker is already gone, reload anyway.
      setTimeout(function () { if (S.requested) location.reload(); }, 3000);
    } else {
      location.reload();
    }
    return true;
  }

  function watch(reg) {
    S.reg = reg;
    if (reg.waiting && navigator.serviceWorker.controller) { S.waiting = reg.waiting; offer(reg.waiting); }
    reg.addEventListener('updatefound', function () {
      var w = reg.installing; if (!w) return;
      w.addEventListener('statechange', function () {
        // "installed" with an existing controller = a genuinely new version is
        // waiting. With no controller this is the very first install: nothing
        // to update FROM, so nothing to say.
        if (w.state === 'installed' && navigator.serviceWorker.controller) { S.waiting = w; offer(w); }
      });
    });
  }

  function init() {
    if (S.inited) return; S.inited = true;
    S.installed = !!((global.matchMedia && matchMedia('(display-mode: standalone)').matches) || global.navigator.standalone);
    global.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.prompt = e; emit('install'); });
    global.addEventListener('appinstalled', function () { S.installed = true; S.prompt = null; emit('install'); });
    if (!('serviceWorker' in navigator)) return;
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (S.requested) { S.requested = false; location.reload(); return; }
      // Another tab let the new version in. This page is still running the
      // old code: say so, once, and let the person choose the moment.
      if (hadController) { S.takenOver = true; S.waiting = null; offer(null); }
      hadController = true;
    });
    navigator.serviceWorker.register('/sw.js').then(watch).catch(function () {});
    function check() { if (S.reg && !document.hidden) S.reg.update().catch(function () {}); }
    document.addEventListener('visibilitychange', check);
    setInterval(check, 30 * 60000);
  }

  // ── install ─────────────────────────────────────────────────────────────
  var IOS_SAFARI = /iphone|ipad|ipod/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
  /** 'prompt' | 'ios' | null — null means do not offer installation at all. */
  function installMode() {
    if (S.installed) return null;
    if (S.prompt) return 'prompt';
    if (IOS_SAFARI) return 'ios';
    return null;
  }
  function install() {
    if (S.prompt) {
      var p = S.prompt; S.prompt = null;
      p.prompt();
      return p.userChoice.then(function (c) { if (c && c.outcome === 'accepted') S.installed = true; emit('install'); return c; });
    }
    return Promise.resolve(null);
  }

  function on(fn) { S.listeners.push(fn); }
  function emit(kind, d) { S.listeners.forEach(function (fn) { try { fn(kind, d); } catch (e) {} }); }

  global.HQPwa = {
    init: init, apply: apply, later: later, install: install, installMode: installMode, on: on,
    checkNow: function () { return S.reg ? S.reg.update() : Promise.resolve(); },
    _state: S
  };
}(window));
