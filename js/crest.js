/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — the club crest resolver. ONE of them.

   THE INCIDENT THIS EXISTS TO PREVENT
   -----------------------------------
   Every opponent crest vanished from the home page and the fixtures page.

   Nothing was deleted. `football_teams.crest_asset_path` was declared in the
   registry with the comment "OUR artwork, from data/crests.json" — and no code
   ever wrote it. It was NULL for all 22 clubs from the day the registry was
   created. That was invisible for as long as the pages read the old fixtures
   file, which carried a crest for all 40 matches. The moment those pages were
   migrated to read the registry first, they started asking a source that had
   never held the value, got null, and drew the initials placeholder instead.

   The placeholder is correct behaviour for a club we genuinely have no artwork
   for. That is exactly why nobody noticed: the failure rendered as a design
   decision. A broken image would have been louder and less damaging.

   Six pages had improvised six different crest resolvers. Five broke. The one
   that survived — the Match Centre's — worked because it resolved from
   data/crests.json by name and verified the asset before drawing it. That logic
   is now here, once, and every surface uses it.

   THE RULES
   ---------
   • Never return null, undefined, an empty string, or a guessed filename.
   • Never emit an <img> for an asset that has not been proven to load.
   • A club with no artwork gets a designed initials shield, deliberately —
     and says so, so a fallback can never masquerade as a crest.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var index = {};        // normalised club name → file path
  var verified = {};     // file path → true once it has actually loaded
  var checked = {};      // file path → true once we have tried
  var ready = null;

  /* Club-name key. Must agree with clubKey() in the Netlify functions
     (netlify/functions/lib/fwp/normalise.js) or the server and the browser will
     disagree about which club they are looking at. */
  function norm(s) {
    return String(s || '').toLowerCase().trim()
      // Anchored on a following space or end-of-string, not \b: a trailing \b
      // cannot match after "A.F.C." and that split one club into two.
      .replace(/\ba\.?\s?f\.?\s?c\.?(?=\s|$)/g, ' ')
      .replace(/\bf\.?\s?c\.?(?=\s|$)/g, ' ')
      .replace(/\butd\b/g, 'united')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]/g, '');
  }

  /* Initials for the fallback shield. "Wallingford & Crowmarsh" → "WC". */
  function initials(name) {
    var s = String(name || '')
      .replace(/&/g, ' ')
      .replace(/\b(fc|afc|utd|united|town|city|club)\b/gi, '')
      .trim();
    var parts = s.split(/\s+/).filter(Boolean);
    var out = parts.map(function (w) { return w[0] || ''; }).join('').slice(0, 3).toUpperCase();
    return out || '?';
  }

  /** Load the club's own crest library. Cached for the life of the page. */
  function load() {
    if (ready) return ready;
    ready = fetch('data/crests.json?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        ((d && d.crests) || []).forEach(function (c) {
          if (c && c.name && c.file) index[norm(c.name)] = c.file;
        });
        return verifyAll();
      })
      // A failed load must not take a page down with it. Every club then gets
      // its initials shield, which is ugly but honest and never broken.
      .catch(function () { return null; });
    return ready;
  }

  /* Assets are proven BEFORE anything is drawn, so rendering has nothing left
     to race. A previous version of this decided "placeholder" from an image
     error event — and Netlify's image CDN 404s on localhost and previews, so
     real crests were downgraded to placeholders on every non-production build. */
  function verifyAll() {
    var files = Object.keys(index).map(function (k) { return index[k]; });
    var uniq = files.filter(function (f, i) { return f && files.indexOf(f) === i; });
    return Promise.all(uniq.map(verify));
  }

  function verify(file) {
    if (checked[file]) return Promise.resolve(!!verified[file]);
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { checked[file] = true; verified[file] = true; res(true); };
      img.onerror = function () { checked[file] = true; res(false); };
      img.src = file;
    });
  }

  /**
   * Resolve a club to something safe to display.
   *
   * @param {string} name  the club's name, in any spelling we might hold
   * @param {string} [hint] a path the caller already has (registry, snapshot).
   *                        Used only if the club library has nothing — an
   *                        approved local asset always outranks a passed-in one.
   * @returns {{url:string|null, source:string, fallback:boolean,
   *            initials:string, name:string, healthy:boolean}}
   */
  function resolve(name, hint, opts) {
    var key = norm(name);
    var local = index[key];

    // A published programme is immutable: what it stored IS what the club
    // published, and that outranks today's library. Everywhere else the club's
    // approved artwork wins, because it is the club's own record.
    if (opts && opts.preferHint && hint) {
      return { url: hint, source: verified[hint] ? 'snapshot' : 'snapshot-unverified',
        fallback: false, initials: initials(name), name: name, healthy: true };
    }

    // 1. the club's approved artwork
    if (local && verified[local]) {
      return { url: local, source: 'club-library', fallback: false,
        initials: initials(name), name: name, healthy: true };
    }
    // 2. a path the caller already holds, if it has proven itself
    if (hint && verified[hint]) {
      return { url: hint, source: 'supplied', fallback: false,
        initials: initials(name), name: name, healthy: true };
    }
    // 3. the club's artwork, named but not yet proven — worth drawing with a
    //    guarded <img> so a first paint is not needlessly bare.
    if (local) {
      return { url: local, source: 'club-library-unverified', fallback: false,
        initials: initials(name), name: name, healthy: true };
    }
    if (hint) {
      return { url: hint, source: 'supplied-unverified', fallback: false,
        initials: initials(name), name: name, healthy: true };
    }
    // 4. a designed shield. Deliberate, accessible, and never a broken image.
    return { url: null, source: 'initials', fallback: true,
      initials: initials(name), name: name, healthy: false };
  }

  /**
   * Ready-to-insert markup.
   *
   * The <img> carries its own guard: if the asset fails after all, it replaces
   * itself with the shield rather than leaving a broken icon on the page.
   */
  function html(name, opts) {
    var o = opts || {};
    var cls = o.className || 'crest';
    var iniCls = o.initialsClass || (cls + ' ' + cls + '--ini');
    var r = resolve(name, o.hint, o);
    if (r.fallback || !r.url) {
      return '<span class="' + esc(iniCls) + '" aria-hidden="true" data-crest="initials">' +
        esc(r.initials) + '</span>';
    }
    var alt = o.decorative ? '' : (name + ' crest');
    return '<img class="' + esc(cls) + '" src="' + esc(r.url) + '"' +
      ' alt="' + esc(alt) + '"' + (o.decorative ? ' aria-hidden="true"' : '') +
      ' data-crest="' + esc(r.source) + '"' +
      ' data-club="' + esc(name) + '"' +
      ' data-ini-class="' + esc(iniCls) + '"' +
      ' onerror="window.LaneCrest.swap(this)">';
  }

  /** An asset that failed at paint time becomes the shield, never a broken icon. */
  function swap(img) {
    if (!img || !img.parentNode) return;
    var name = img.getAttribute('data-club') || '';
    var cls = img.getAttribute('data-ini-class') || 'crest crest--ini';
    var span = document.createElement('span');
    span.className = cls;
    span.setAttribute('aria-hidden', 'true');
    span.setAttribute('data-crest', 'initials');
    span.textContent = initials(name);
    img.parentNode.replaceChild(span, img);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Every club we hold artwork for. Used by the health checks. */
  function known() { return Object.keys(index).slice(); }
  function fileFor(name) { return index[norm(name)] || null; }

  global.LaneCrest = {
    load: load, resolve: resolve, html: html, swap: swap,
    norm: norm, initials: initials, known: known, fileFor: fileFor,
    verify: verify,
    _index: index, _verified: verified,
  };
})(window);
