/* ════════════════════════════════════════════════════════════════════════
   THE FAN ZONE BOOTSTRAP — one tag, all of its dependencies.

   WHY THIS FILE EXISTS
   --------------------
   The previous release shipped a correct server-side programme gate and a
   client that could never open it. Six pages carried `fan-session.js`; only
   ONE of them also carried the Supabase library and the config that file
   needs. On the other five the client was silently null, no token was ever
   attached, and every member looked like a stranger. Nothing threw. Nothing
   logged. The programme simply stayed shut, which is exactly what a working
   gate looks like from the outside.

   The fix is not five more script tags — that is the same mistake with a
   longer memory. A page cannot load this file WITHOUT its dependencies,
   because this file fetches them itself. The failure is now unavailable.

   WHAT A PAGE NEEDS
   -----------------
       <script src="js/fan-boot.js"></script>

   That is the whole contract. Everything below — config, the Supabase
   library, session restore, the member API, the account control in the
   navigation — comes with it, in order, once.

   WHAT IT NEVER DOES
   ------------------
   It does not decide entitlement. `state.entitled` is an answer the server
   gave, cached for the UI to read. A client-side boolean is not access
   control, and the programme endpoint would ignore it anyway.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CONFIG_SRC = '/js/supabase-config.js';
  var REDIRECT_SRC = '/js/fan-redirect.js';
  var LIBRARY_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  var ACCOUNT_SRC = '/js/fan-account.js';

  var TERMS_VERSION = 'fanzone-terms-2026-08';
  var PRIVACY_VERSION = 'privacy-2026-08';

  /* The state every consumer reads. `loaded` starts false so a page can show
     a neutral placeholder rather than flashing "Join free" at a member. */
  var state = {
    user: null,
    member: null,
    entitled: false,
    marketing: { email: false },
    mobile: { status: 'not_provided' },
    whatsapp: { optedIn: false },
    interests: [],
    programmeHistory: [],
    loaded: false,
    available: false,
  };

  var client = null;
  var listeners = [];
  var lastRedirectFault = null;

  /* Did this page load carrying an auth response?
     Captured SYNCHRONOUSLY, at parse time, because the Supabase client has
     detectSessionInUrl on and removes the fragment as soon as it starts. By
     the time any of our own code runs the evidence may already be gone. */
  var arrivedWithAuth = (function () {
    try {
      return /(^|[#&?])(access_token|refresh_token|provider_token|code|error_description|error_code)=/
        .test(location.hash + '&' + location.search);
    } catch (e) { return false; }
  })();

  function announce() {
    try {
      document.dispatchEvent(new CustomEvent('lane:fan', { detail: state }));
    } catch (e) { /* older browsers: the direct listeners below still run */ }
    listeners.slice().forEach(function (fn) {
      try { fn(state); } catch (e) {}
    });
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    if (state.loaded) { try { fn(state); } catch (e) {} }
    return function () {
      var i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  }

  /* ── Dependency loading ──────────────────────────────────────────────── */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      // Already on the page (fan-zone.html carries them statically): reuse it.
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.dataset.laneLoaded === '1') return resolve();
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error(src)); });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = false;                       // order matters; keep it
      s.dataset.laneLoaded = '0';
      s.onload = function () { s.dataset.laneLoaded = '1'; resolve(); };
      s.onerror = function () { reject(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function dependencies() {
    if (!global.RLFC_SUPABASE) await loadScript(CONFIG_SRC);
    // The redirect rules travel WITH the bootstrap, for the same reason the
    // Supabase client does: a page that can start a sign-in must not be able
    // to do it without the rules about where a sign-in may land.
    if (!global.LaneRedirect) await loadScript(REDIRECT_SRC);
    if (!(global.supabase && global.supabase.createClient)) await loadScript(LIBRARY_SRC);
  }

  /* ── Session ─────────────────────────────────────────────────────────── */

  async function accessToken() {
    if (!client) return null;
    try {
      var s = await client.auth.getSession();
      return (s && s.data && s.data.session) ? s.data.session.access_token : null;
    } catch (e) { return null; }
  }

  /**
   * Ask the server who we are.
   *
   * `action: 'me'` both reads AND completes membership: a supporter who has
   * verified their email but has no membership row yet gets one here, which
   * is why signing in anywhere on the site is now enough. The server decides;
   * this only carries the token and stores the answer.
   */
  async function refresh() {
    var t = await accessToken();
    if (!t) {
      state.user = null; state.member = null; state.entitled = false;
      state.marketing = { email: false }; state.programmeHistory = [];
      state.loaded = true;
      announce();
      return state;
    }
    try {
      var r = await fetch('/.netlify/functions/fan-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ action: 'me' }),
      });
      var j = await r.json();
      if (j && j.ok && j.member) {
        state.user = { signedIn: true };
        state.member = j.member;
        state.entitled = !!j.member.entitled;
        state.marketing = j.marketing || { email: false };
        state.mobile = j.mobile || { status: 'not_provided' };
        state.whatsapp = j.whatsapp || { optedIn: false };
        state.interests = j.interests || [];
        state.programmeHistory = j.programmeHistory || [];
      } else {
        // Signed in, but the server would not confirm a membership. Never
        // guess in the supporter's favour — the programme endpoint won't.
        state.user = { signedIn: true };
        state.member = null; state.entitled = false;
      }
    } catch (e) {
      state.user = { signedIn: true }; state.member = null; state.entitled = false;
    }
    state.loaded = true;
    announce();
    return state;
  }

  /* ── Return paths ────────────────────────────────────────────────────── */

  var RETURN_KEY = 'rlfc_return_to';

  /**
   * Is this a path on this site that we are willing to send somebody to?
   *
   * A magic link that can be aimed at another host is a phishing tool wearing
   * the club's badge. Everything that is not plainly a local path is refused,
   * including the encoded and double-encoded shapes that are meant to slip
   * past exactly this kind of check.
   */
  function safePath(v) {
    if (!v || typeof v !== 'string') return false;
    if (v.length > 512) return false;
    var s = v;
    // Decode up to twice, then judge the result. "%2f%2fevil.com" is "//evil.com".
    for (var i = 0; i < 2; i++) {
      try { var d = decodeURIComponent(s); if (d === s) break; s = d; }
      catch (e) { return false; }                       // malformed encoding
    }
    if (/[\n\r\t\0]/.test(s)) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return false;   // http:, javascript:, data:
    if (s.charAt(0) !== '/') return false;              // must be site-relative
    if (s.charAt(1) === '/' || s.charAt(1) === '\\') return false; // protocol-relative
    if (s.indexOf('\\') > -1) return false;
    return true;
  }

  function rememberReturn(path) {
    try { if (safePath(path)) sessionStorage.setItem(RETURN_KEY, path); } catch (e) {}
  }
  function takeReturn() {
    try {
      var v = sessionStorage.getItem(RETURN_KEY);
      sessionStorage.removeItem(RETURN_KEY);
      return safePath(v) ? v : null;
    } catch (e) { return null; }
  }

  /* ── Joining ─────────────────────────────────────────────────────────── */

  /**
   * Start the passwordless journey.
   *
   * What the supporter typed is stored SERVER-side against an opaque nonce,
   * not carried in the link. A return URL is readable, shareable and
   * editable; a nonce the server holds is none of those. Nothing about the
   * supporter travels in the email.
   */
  async function sendMagicLink(details) {
    var d = details || {};
    var email = String(d.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { error: 'Please enter a valid email address.' };
    }
    if (!client) return { error: 'Fan Zone is still starting up. Please try again in a moment.' };

    // Park the details where only the server can read them.
    try {
      await fetch('/.netlify/functions/fan-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          returnPath: safePath(d.returnPath) ? d.returnPath : null,
          source: d.source || 'fan-zone',
          fixtureId: d.fixtureId || null,
          programmeId: d.programmeId || null,
          marketing: typeof d.marketing === 'boolean' ? d.marketing : null,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
        }),
      });
    } catch (e) { /* the link still works; they will be asked for a name */ }

    if (safePath(d.returnPath)) rememberReturn(d.returnPath);

    /* THE GUARD.
       A real supporter was sent to localhost:3000 because the redirect we
       asked for was silently discarded by Supabase and replaced with its
       Site URL. We now check our own redirect before asking for the email —
       and if it is wrong we send NOTHING. "Please try again shortly" is
       recoverable; a link to a machine that does not exist is not. */
    var R = global.LaneRedirect;
    var target = R ? R.authRedirect() : null;
    var verdict = R ? R.checkRedirect(target) : { ok: false, reason: 'redirect rules did not load' };
    if (!verdict.ok) {
      lastRedirectFault = verdict.reason;
      return { error: 'We couldn\u2019t prepare your secure sign-in link. Please try again shortly.' };
    }

    try {
      var r = await client.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: verdict.url },
      });
      if (r.error) return { error: R ? R.redact(r.error.message) : 'Could not send that link.' };
      return { ok: true, redirect: verdict.url };
    } catch (err) {
      return { error: R ? R.redact(String((err && err.message) || err)) : 'Could not send that link.' };
    }
  }

  /** Finish the journey once the email is verified. Idempotent by design. */
  async function complete(extra) {
    var t = await accessToken();
    if (!t) return { error: 'Not signed in yet.' };
    try {
      var r = await fetch('/.netlify/functions/fan-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify(Object.assign({ action: 'complete' }, extra || {})),
      });
      var j = await r.json();
      if (j && j.ok) { await refresh(); return j; }
      return { error: (j && j.error) || 'Could not complete your membership.' };
    } catch (e) { return { error: String(e.message || e) }; }
  }

  async function setMarketing(wanted, source) {
    var t = await accessToken();
    if (!t) return { error: 'Not signed in.' };
    var r = await fetch('/.netlify/functions/fan-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ action: 'marketing', email: !!wanted, source: source || 'account' }),
    });
    var j = await r.json();
    if (j && j.ok) { state.marketing = j.marketing; announce(); }
    return j;
  }

  async function updateProfile(fields) {
    var t = await accessToken();
    if (!t) return { error: 'Not signed in.' };
    var r = await fetch('/.netlify/functions/fan-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify(Object.assign({ action: 'profile' }, fields || {})),
    });
    var j = await r.json();
    if (j && j.ok) await refresh();
    return j;
  }

  /** Optional mobile, and the SEPARATE WhatsApp permission. */
  async function setContact(fields) {
    var t = await accessToken();
    if (!t) return { error: 'Not signed in.' };
    var r = await fetch('/.netlify/functions/fan-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify(Object.assign({ action: 'contact' }, fields || {})),
    });
    var j = await r.json();
    if (j && j.ok) await refresh();
    return j;
  }

  async function setInterests(list) {
    var t = await accessToken();
    if (!t) return { error: 'Not signed in.' };
    var r = await fetch('/.netlify/functions/fan-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ action: 'interests', interests: list || [] }),
    });
    var j = await r.json();
    if (j && j.ok) await refresh();
    return j;
  }

  async function signOut() {
    if (client) { try { await client.auth.signOut(); } catch (e) {} }
    state.user = null; state.member = null; state.entitled = false;
    state.marketing = { email: false }; state.programmeHistory = [];
    state.loaded = true;
    announce();
  }

  /** An authenticated fetch. The token goes with the request whenever there is one. */
  async function authedFetch(url, opts) {
    var t = await accessToken();
    var o = opts || {};
    o.headers = Object.assign({}, o.headers || {});
    if (t) o.headers.Authorization = 'Bearer ' + t;
    return fetch(url, o);
  }

  /* ── Boot ────────────────────────────────────────────────────────────── */

  var ready = (async function boot() {
    try {
      await dependencies();
    } catch (e) {
      // Offline, or the CDN is unreachable. Public pages carry on unchanged;
      // the programme simply stays locked, which is the safe direction.
      state.loaded = true;
      announce();
      return state;
    }

    var cfg = global.RLFC_SUPABASE || {};
    if (cfg.url && cfg.anonKey && global.supabase && global.supabase.createClient) {
      // ONE client per page, shared through a single global. fan-zone.js used
      // to build a second one on the same page, which meant two GoTrue
      // instances reading and writing the same stored session and racing over
      // token refresh. Whichever file gets here first creates it; the other
      // reuses it.
      client = global.__laneSupabaseClient
        || global.supabase.createClient(cfg.url, cfg.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
      global.__laneSupabaseClient = client;
      global.LaneFan.client = client;
      state.available = true;
      global.LaneFan.available = true;

      // Sign-in, sign-out and token refresh all re-ask the server.
      try {
        client.auth.onAuthStateChange(function (evt) {
          if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' ||
              evt === 'TOKEN_REFRESHED' || evt === 'USER_UPDATED') {
            refresh();
          }
        });
      } catch (e) {}
    }

    await refresh();

    /* CREDENTIAL CLEANUP.
       The session now lives in storage; the token in the address bar is spent.
       Leaving it there puts it in browser history, in the referer of the next
       request, and in any screenshot the supporter sends us asking for help. */
    if (arrivedWithAuth && global.LaneRedirect) {
      try {
        var clean = global.LaneRedirect.cleanUrl(location.href);
        history.replaceState({}, document.title, clean);
      } catch (e) {}
    }

    loadScript(ACCOUNT_SRC).catch(function () {});   // the navigation control
    return state;
  })();

  global.LaneFan = {
    ready: ready,
    client: null,
    available: false,
    state: state,
    onChange: onChange,
    refresh: refresh,
    accessToken: accessToken,
    authedFetch: authedFetch,
    sendMagicLink: sendMagicLink,
    complete: complete,
    setMarketing: setMarketing,
    setContact: setContact,
    setInterests: setInterests,
    updateProfile: updateProfile,
    signOut: signOut,
    rememberReturn: rememberReturn,
    takeReturn: takeReturn,
    safePath: safePath,
    TERMS_VERSION: TERMS_VERSION,
    PRIVACY_VERSION: PRIVACY_VERSION,
    // True when this page load carried a Supabase auth response. The callback
    // uses it instead of a ?welcome=1 flag, because the redirect that Supabase
    // allow-lists is now a bare path with no query string.
    arrivedWithAuth: function () { return arrivedWithAuth; },
    redirectFault: function () { return lastRedirectFault; },
  };
})(window);
