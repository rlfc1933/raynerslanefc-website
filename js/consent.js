/* ════════════════════════════════════════════════════════════════════════
   COOKIE CONSENT THAT ACTUALLY DOES SOMETHING.

   Before this, Google Analytics loaded unconditionally on every page — the
   script tag ran at parse time — and the banner's Decline button set a
   localStorage flag and removed the banner. Nothing else. A supporter who
   pressed Decline was measured exactly as much as one who pressed Accept.

   That is the worst kind of consent control: it looks like a choice, records
   a choice, and honours nothing. Better to have had no button at all, because
   then nobody would have believed they had opted out.

   HOW IT WORKS NOW
   ----------------
   Nothing analytics-related is fetched until the supporter says yes. There is
   no gtag on the page, no googletagmanager request, no dataLayer, no _ga
   cookie. Accept loads it once. Withdrawing stops it and clears the cookies
   this origin can clear.

   Consent Mode is set to denied BEFORE any Google code could run, so that even
   if a tag were added later by someone else, it starts denied rather than
   starting on and being switched off a moment too late.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var KEY = 'rlfc_consent_v2';
  var GA_ID = 'G-F79MK3P0SR';
  var loaded = false;

  /* Consent Mode defaults, set before anything Google could execute.
     dataLayer exists only to hold this — no measurement flows through it. */
  global.dataLayer = global.dataLayer || [];
  function gtagStub() { global.dataLayer.push(arguments); }
  if (!global.gtag) global.gtag = gtagStub;
  global.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',   // session, login, consent itself
    security_storage: 'granted',
    wait_for_update: 500,
  });

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function write(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  /** Has the supporter answered at all? */
  function decided() { var s = read(); return !!(s && s.decidedAt); }
  /** Have they said yes to analytics? */
  function analyticsAllowed() { var s = read(); return !!(s && s.analytics === true); }

  /* Load Google Analytics — once, and only once. Called on accept, and on
     later page loads if analytics is already allowed. */
  function loadAnalytics() {
    if (loaded || !analyticsAllowed()) return;
    loaded = true;
    var s1 = document.createElement('script');
    s1.async = true;
    s1.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s1);
    global.gtag('js', new Date());
    global.gtag('config', GA_ID);
  }

  /* Remove what this origin can remove. A cookie set on the exact host can be
     expired from here; anything set for a wider domain by Google cannot, and
     saying otherwise would be a false promise. Consent Mode is what actually
     stops the measurement. */
  function clearAnalyticsCookies() {
    var names = document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); })
      .filter(function (n) { return /^_ga($|_)|^_gid$|^_gat/.test(n); });
    var host = location.hostname;
    var domains = [host, '.' + host];
    var parts = host.split('.');
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    names.forEach(function (n) {
      domains.forEach(function (d) {
        document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + d;
      });
      document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    });
    return names;
  }

  /**
   * Record a decision and act on it immediately.
   * @param {boolean} allowAnalytics
   * @param {string} source  where the decision was made
   */
  function set(allowAnalytics, source) {
    var was = analyticsAllowed();
    write({
      analytics: !!allowAnalytics,
      essential: true,
      decidedAt: new Date().toISOString(),
      source: source || 'banner',
      version: 2,
    });
    global.gtag('consent', 'update', {
      analytics_storage: allowAnalytics ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    if (allowAnalytics) loadAnalytics();
    else if (was) clearAnalyticsCookies();   // withdrawal: stop and tidy up
    document.dispatchEvent(new CustomEvent('lane:consent', { detail: { analytics: !!allowAnalytics } }));
    return read();
  }

  // On every load: if they already said yes, honour it. If they said no, or
  // have not answered, nothing loads.
  if (analyticsAllowed()) loadAnalytics();

  global.LaneConsent = {
    read: read, set: set, decided: decided,
    analyticsAllowed: analyticsAllowed,
    clearAnalyticsCookies: clearAnalyticsCookies,
    isLoaded: function () { return loaded; },
    GA_ID: GA_ID,
  };
})(window);
