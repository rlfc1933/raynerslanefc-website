/* ════════════════════════════════════════════════════════════════════════
   WHERE A SIGN-IN LINK IS ALLOWED TO LAND.

   THE INCIDENT THIS FILE EXISTS TO PREVENT
   ----------------------------------------
   A real supporter completed the Fan Zone form on 2 August 2026. The site
   said "check your email", Supabase sent the email, they pressed Sign in —
   and Chrome opened:

       localhost:3000/#access_token=…      ERR_CONNECTION_REFUSED

   There was no `localhost:3000` anywhere in this repository. The application
   sent `https://raynerslanefc.co.uk/fan-zone.html?welcome=1`, which was
   correct. What went wrong was in Supabase:

       Site URL      http://localhost:3000     (the project default, never changed)
       Redirect URLs (empty — "No Redirect URLs")

   GoTrue accepts a redirect ONLY if it matches the allow-list. The allow-list
   was empty, so it silently discarded ours and fell back to the Site URL.
   Supabase's own help text says exactly this: "the default redirect URL used
   when a redirect URL is not specified OR DOESN'T MATCH ONE FROM THE ALLOW
   LIST."

   Nothing failed loudly. The email arrived, the button worked, and the
   supporter was sent to a machine that does not exist.

   THE LESSON, AND WHY THIS IS CODE AND NOT A DASHBOARD NOTE
   --------------------------------------------------------
   The configuration is now correct. It could be wrong again — projects get
   restored, settings get edited, someone adds a staging URL. So the rule is
   enforced here as well: on a production hostname this file will not produce
   a development redirect, and fan-boot refuses to send the email at all if
   the redirect fails its own check. A supporter seeing "please try again
   shortly" is recoverable. A supporter sent to localhost is not.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // The one origin a Rayners Lane session belongs to. `www` resolves too, and
  // does NOT redirect here — so without this normalisation a supporter who
  // started on www would get a session on a different origin (localStorage is
  // per-origin) and appear logged out on the apex.
  var CANONICAL = 'https://raynerslanefc.co.uk';

  // Hostnames that mean "this is the real club website".
  var PRODUCTION_HOSTS = ['raynerslanefc.co.uk', 'www.raynerslanefc.co.uk'];

  // Development hostnames. Never selected on a production host.
  var DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'];

  // ONE stable callback. Not a per-programme URL: allow-listing an entry for
  // every fixture id is unmaintainable and would be wrong the first time a
  // new programme published. Where the supporter actually goes afterwards is
  // decided by the signup intent the SERVER stored, which is also why nothing
  // about them needs to travel in this URL.
  var CALLBACK_PATH = '/fan-zone.html';

  /** Anything that would send a supporter to a machine that isn't the club's. */
  var FORBIDDEN_IN_PRODUCTION = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|:\d{2,5}(?![0-9])/i;

  function isProduction(host) {
    return PRODUCTION_HOSTS.indexOf(String(host || '').toLowerCase()) > -1;
  }
  function isDevelopment(host) {
    return DEV_HOSTS.indexOf(String(host || '').toLowerCase()) > -1;
  }

  /**
   * The URL Supabase should send the supporter back to.
   *
   * @returns {string|null} null means "refuse to send an email at all".
   */
  function authRedirect(loc) {
    var l = loc || global.location;
    var host = String(l.hostname || '').toLowerCase();
    var proto = String(l.protocol || '').toLowerCase();

    if (isProduction(host)) {
      // Always the canonical origin, whichever host they arrived on, and
      // never anything derived from location — so a production page cannot
      // produce a development redirect however it was reached.
      return CANONICAL + CALLBACK_PATH;
    }

    if (isDevelopment(host)) {
      // Only here, and only over http/https on the machine itself.
      if (proto !== 'http:' && proto !== 'https:') return null;
      return l.origin + CALLBACK_PATH;
    }

    // A Netlify deploy preview, a staging host, anything unrecognised: refuse
    // rather than guess. An unknown origin in an auth email is how a link
    // ends up somewhere nobody meant it to go.
    return null;
  }

  /**
   * The guard. Runs immediately before the email is requested.
   *
   * Returns { ok: true, url } or { ok: false, reason }. `reason` is for the
   * club's health panel; the supporter sees a plain sentence.
   */
  function checkRedirect(url, loc) {
    var l = loc || global.location;
    var host = String(l.hostname || '').toLowerCase();

    if (!url || typeof url !== 'string') {
      return { ok: false, reason: 'no redirect could be built for host "' + host + '"' };
    }
    if (url.indexOf('https://') !== 0 && !isDevelopment(host)) {
      return { ok: false, reason: 'redirect is not HTTPS: ' + url };
    }
    if (isProduction(host) && FORBIDDEN_IN_PRODUCTION.test(url)) {
      // The incident, caught before it reaches a supporter's inbox.
      return { ok: false, reason: 'production would have sent a development redirect: ' + url };
    }
    if (isProduction(host) && url.indexOf(CANONICAL + '/') !== 0) {
      return { ok: false, reason: 'production redirect is not the canonical origin: ' + url };
    }
    return { ok: true, url: url };
  }

  /** Does this URL look like Supabase handing back an auth response? */
  var AUTH_RESPONSE = /(^|[#&?])(access_token|refresh_token|provider_token|code|error_description|error_code)=/;

  function looksLikeAuthResponse(hash, search) {
    return AUTH_RESPONSE.test(String(hash || '')) || AUTH_RESPONSE.test(String(search || ''));
  }

  /**
   * Strip every credential and auth parameter from a URL.
   *
   * A token in the address bar is a token in browser history, in a screenshot,
   * in a URL somebody pastes into a chat to ask for help, and in the referer
   * of the next request. It has done its job by the time the session exists.
   */
  var AUTH_PARAMS = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
    'expires_in', 'expires_at', 'token_type', 'type', 'code', 'error', 'error_code',
    'error_description', 'welcome', 'i'];

  function cleanUrl(href) {
    var u;
    try { u = new URL(href); } catch (e) { return href; }
    AUTH_PARAMS.forEach(function (k) { u.searchParams.delete(k); });
    var hash = String(u.hash || '').replace(/^#/, '');
    if (hash && AUTH_RESPONSE.test('#' + hash)) {
      // The whole fragment is an auth response; there is nothing in it to keep.
      hash = '';
    }
    var qs = u.searchParams.toString();
    return u.pathname + (qs ? '?' + qs : '') + (hash ? '#' + hash : '');
  }

  /**
   * Redact anything token-shaped before it can reach a log.
   *
   * Applied to every error message this system prints. A JWT in an error
   * string is still a JWT.
   */
  function redact(text) {
    return String(text == null ? '' : text)
      .replace(/eyJ[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}\.[A-Za-z0-9_\-]{6,}/g, '[token redacted]')
      .replace(/((?:access|refresh|provider)_token|code|apikey|token)=[^&\s#]+/gi, '$1=[redacted]');
  }

  global.LaneRedirect = {
    CANONICAL: CANONICAL,
    CALLBACK_PATH: CALLBACK_PATH,
    PRODUCTION_HOSTS: PRODUCTION_HOSTS,
    DEV_HOSTS: DEV_HOSTS,
    isProduction: isProduction,
    isDevelopment: isDevelopment,
    authRedirect: authRedirect,
    checkRedirect: checkRedirect,
    looksLikeAuthResponse: looksLikeAuthResponse,
    cleanUrl: cleanUrl,
    redact: redact,
  };

  // Also available to Node for the test suite, without a browser.
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LaneRedirect;
})(typeof window !== 'undefined' ? window : globalThis);
