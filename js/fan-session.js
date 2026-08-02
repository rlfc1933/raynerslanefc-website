/* ════════════════════════════════════════════════════════════════════════
   THE FAN ZONE SESSION — one account, used everywhere.

   Fan Zone is the account. There is no separate "programme login": the
   programme is a member benefit, and a supporter who joins to read one
   already has their Lane Card, their check-ins and their history.

   This is the ONLY place the site asks "who is this and are they a member".
   It never decides entitlement itself — it carries the token and lets the
   server answer, because a client-side boolean is not access control.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CFG = global.RLFC_SUPABASE || {};
  var SB = (CFG.url && CFG.anonKey && global.supabase && global.supabase.createClient)
    ? global.supabase.createClient(CFG.url, CFG.anonKey) : null;

  var state = { user: null, member: null, entitled: false, loaded: false };

  function token() {
    try {
      var raw = SB && SB.auth && SB.auth.session ? SB.auth.session() : null;
      return raw && raw.access_token ? raw.access_token : null;
    } catch (e) { return null; }
  }

  async function accessToken() {
    if (!SB) return null;
    try {
      var s = await SB.auth.getSession();
      return (s.data && s.data.session) ? s.data.session.access_token : null;
    } catch (e) { return null; }
  }

  /** Ask the server who we are. The answer is the server's, not ours. */
  async function refresh() {
    state.loaded = true;
    var t = await accessToken();
    if (!t) { state.user = null; state.member = null; state.entitled = false; return state; }
    try {
      var r = await fetch('/.netlify/functions/fan-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ action: 'me' }),
      });
      var j = await r.json();
      if (j && j.ok) {
        state.member = j.member || null;
        state.entitled = !!(j.member && j.member.entitled);
        state.marketing = j.marketing || { email: false };
        state.programmeHistory = j.programmeHistory || [];
      } else {
        state.member = null; state.entitled = false;
      }
    } catch (e) { state.member = null; state.entitled = false; }
    return state;
  }

  /**
   * Where to come back to after signing in.
   *
   * Stored locally and sanitised on the way back out. A magic link that can be
   * pointed at another site is a phishing tool wearing the club's badge.
   */
  var RETURN_KEY = 'rlfc_return_to';
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
  function safePath(v) {
    if (!v || typeof v !== 'string') return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false;   // any scheme
    if (v.indexOf('//') === 0 || v.charAt(0) === '\\') return false;
    if (v.charAt(0) !== '/') return false;
    return !/[\n\r]/.test(v);
  }

  /** Send a magic link. No password, no wizard. */
  async function sendMagicLink(email, returnTo) {
    if (!SB) return { error: 'Fan Zone is not configured yet.' };
    var e = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { error: 'Please enter a valid email address.' };
    rememberReturn(returnTo || (location.pathname + location.search));
    try {
      var r = await SB.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: location.origin + '/fan-zone.html?welcome=1' },
      });
      if (r.error) return { error: r.error.message };
      return { ok: true };
    } catch (err) { return { error: String(err.message || err) }; }
  }

  /**
   * Complete membership after the link is followed.
   * Reconciles rather than duplicates — the server keys on the email.
   */
  async function join(details) {
    var t = await accessToken();
    if (!t) return { error: 'Not signed in yet.' };
    var r = await fetch('/.netlify/functions/fan-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify(Object.assign({ action: 'join' }, details || {})),
    });
    var j = await r.json();
    if (j && j.ok) { await refresh(); return { ok: true, member: j.member }; }
    return { error: (j && j.error) || 'Could not complete your membership.' };
  }

  async function setMarketing(wanted, source) {
    var t = await accessToken();
    if (!t) return { error: 'Not signed in.' };
    var r = await fetch('/.netlify/functions/fan-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ action: 'marketing', email: !!wanted, source: source || 'account' }),
    });
    return await r.json();
  }

  async function signOut() {
    if (SB) { try { await SB.auth.signOut(); } catch (e) {} }
    state.user = null; state.member = null; state.entitled = false;
  }

  /** An authenticated fetch — the token goes with the request, always. */
  async function authedFetch(url, opts) {
    var t = await accessToken();
    var o = opts || {};
    o.headers = Object.assign({}, o.headers || {});
    if (t) o.headers.Authorization = 'Bearer ' + t;
    return fetch(url, o);
  }

  global.LaneFan = {
    available: !!SB,
    state: state,
    refresh: refresh,
    accessToken: accessToken,
    authedFetch: authedFetch,
    sendMagicLink: sendMagicLink,
    join: join,
    setMarketing: setMarketing,
    signOut: signOut,
    rememberReturn: rememberReturn,
    takeReturn: takeReturn,
    safePath: safePath,
  };
})(window);
