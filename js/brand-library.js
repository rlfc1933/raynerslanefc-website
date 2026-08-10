/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — BRAND LIBRARY

   Every opponent's colours, and who says so.

   WHY IT EXISTS. data/club-brands.json decides whether a club's colour reaches
   a public graphic. Eighteen clubs are verified; four are deliberately not,
   because their crests are monochrome or the sample was too small to trust.
   Until now the only way to see or change any of that was to edit JSON.

   WHAT STAFF SEE. The crest, the club, the colours as COLOUR — not hex codes.
   Where a palette came from, and whether a human has confirmed it. Hex only
   appears when someone is actually editing, because nobody on the committee
   should have to read #A73666 to check that New Bradwell are claret.

   THE RULE THIS UI EXISTS TO SERVE. A machine suggestion and a confirmed
   palette are different kinds of thing, and only one of them reaches artwork.
   This screen is where a human turns the first into the second. It never
   promotes anything on its own.

   NEUTRAL IS NOT BROKEN. The four review-needed clubs render in the neutral
   fallback and that is a correct, honest outcome — the release is not blocked
   waiting for them.

   IT SAVES THROUGH THE EXISTING PATH. Confirming or locking a palette writes
   through the portal's own save function, which the server authorises exactly
   as it does every other data change. This file holds no credentials and
   grants no permission.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var S = { data: null, editing: null, filter: 'all' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }

  function clubs() { return (S.data && S.data.clubs) || []; }

  /** Verified, review-needed, and the club itself — counted, not asserted. */
  function counts() {
    var v = 0, r = 0;
    clubs().forEach(function (c) {
      if (c.id === 'rayners-lane') return;
      if (c.verified) v++; else r++;
    });
    return { verified: v, review: r };
  }

  function swatch(hex, label) {
    if (!hex) return '';
    return '<span class="bl__sw" title="' + esc(label || '') + '">' +
      '<i style="background:' + esc(hex) + '"></i>' +
      '<b>' + esc(label || '') + '</b></span>';
  }

  /** Colour as colour. Hex is deliberately absent unless editing. */
  function swatches(c) {
    if (!c.verified && c.suggestion) {
      return '<div class="bl__sws bl__sws--sug">' +
        swatch(c.suggestion.primary, 'Suggested') +
        (c.suggestion.secondary ? swatch(c.suggestion.secondary, 'Second') : '') +
      '</div>';
    }
    if (!c.primary) {
      return '<div class="bl__sws"><span class="bl__none">No confident colour — ' +
        'uses the neutral treatment</span></div>';
    }
    return '<div class="bl__sws">' +
      swatch(c.primary, 'Primary') +
      (c.secondary ? swatch(c.secondary, 'Second') : '') +
      (c.accent ? swatch(c.accent, 'Accent') : '') +
    '</div>';
  }

  function status(c) {
    if (c.locked)   return '<span class="bl__st bl__st--locked">Locked</span>';
    if (c.verified) return '<span class="bl__st bl__st--ok">Confirmed</span>';
    return '<span class="bl__st bl__st--todo">Needs a look</span>';
  }

  function crest(c) {
    if (c.crest) return '<img class="bl__crest" src="' + esc(c.crest) + '" alt="">';
    var ini = String(c.name || '?').replace(/\b(fc|afc|united|town|city)\b/gi, '')
      .trim().split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 3).toUpperCase();
    return '<span class="bl__crest bl__crest--ini">' + esc(ini) + '</span>';
  }

  /** Plain English, not the provenance string the sampler wrote for itself. */
  function why(c) {
    var p = String(c.provenance || '');
    if (/owner-supplied/i.test(p)) return 'Given by the club';
    if (/crest-sample/i.test(p))   return 'Read from their crest';
    if (!c.suggestion && !c.primary) return 'Their crest has no strong colour';
    if (c.suggestion && !c.verified) return 'Suggested from their crest — not confirmed';
    return p ? 'Recorded' : '';
  }

  function card(c) {
    var editing = S.editing === c.id;
    return '<article class="bl-card' + (c.verified ? '' : ' bl-card--todo') + '" data-id="' + esc(c.id) + '">' +
      '<div class="bl-card__hd">' + crest(c) +
        '<div class="bl-card__id"><h4>' + esc(c.name) + '</h4>' +
          '<span class="bl__why">' + esc(why(c)) + '</span></div>' +
        status(c) +
      '</div>' +
      swatches(c) +
      (editing ? editor(c) : actions(c)) +
    '</article>';
  }

  function actions(c) {
    var b = [];
    b.push('<button class="bl__b" onclick="BrandLibrary.edit(\'' + esc(c.id) + '\')">Edit</button>');
    if (!c.verified) {
      b.push('<button class="bl__b bl__b--go" onclick="BrandLibrary.confirm(\'' + esc(c.id) + '\')">Confirm</button>');
    } else if (!c.locked) {
      b.push('<button class="bl__b" onclick="BrandLibrary.lock(\'' + esc(c.id) + '\')">Lock</button>');
    }
    return '<div class="bl-card__acts">' + b.join('') + '</div>';
  }

  /** Hex appears HERE and nowhere else. */
  function editor(c) {
    var p = c.primary || (c.suggestion && c.suggestion.primary) || '#888888';
    var s = c.secondary || (c.suggestion && c.suggestion.secondary) || '#888888';
    return '<div class="bl-edit">' +
      '<label class="bl-edit__f"><span>Main colour</span>' +
        '<input type="color" id="bl-p-' + esc(c.id) + '" value="' + esc(p) + '">' +
        '<input type="text" class="bl-edit__hex" id="bl-ph-' + esc(c.id) + '" value="' + esc(p) + '" spellcheck="false"></label>' +
      '<label class="bl-edit__f"><span>Second colour</span>' +
        '<input type="color" id="bl-s-' + esc(c.id) + '" value="' + esc(s) + '">' +
        '<input type="text" class="bl-edit__hex" id="bl-sh-' + esc(c.id) + '" value="' + esc(s) + '" spellcheck="false"></label>' +
      '<div class="bl-card__acts">' +
        '<button class="bl__b" onclick="BrandLibrary.cancel()">Cancel</button>' +
        '<button class="bl__b bl__b--go" onclick="BrandLibrary.save(\'' + esc(c.id) + '\')">Save</button>' +
      '</div>' +
    '</div>';
  }

  function render() {
    var host = $('brand-library');
    if (!host) return;
    if (!S.data) { host.innerHTML = '<p class="bl__msg">Loading the club colours…</p>'; return; }

    var n = counts();
    var list = clubs().filter(function (c) {
      if (c.id === 'rayners-lane') return false;
      if (S.filter === 'review') return !c.verified;
      if (S.filter === 'verified') return !!c.verified;
      return true;
    }).sort(function (a, b) {
      if (!!a.verified !== !!b.verified) return a.verified ? 1 : -1;   // work first
      return String(a.name).localeCompare(String(b.name));
    });

    host.innerHTML =
      '<div class="bl">' +
        '<div class="bl__top">' +
          '<p class="bl__lede">Opponent colours used on match graphics. A colour is only ' +
            'used once someone has confirmed it — until then that club gets a neutral ' +
            'treatment, which is correct rather than broken.</p>' +
          '<div class="bl__tabs" role="tablist">' +
            tab('all', 'All (' + (n.verified + n.review) + ')') +
            tab('review', 'Needs a look (' + n.review + ')') +
            tab('verified', 'Confirmed (' + n.verified + ')') +
          '</div>' +
        '</div>' +
        '<div class="bl__grid">' + list.map(card).join('') + '</div>' +
      '</div>';

    // Keep the colour picker and the hex box in step while editing.
    if (S.editing) {
      var p = $('bl-p-' + S.editing), ph = $('bl-ph-' + S.editing);
      var s = $('bl-s-' + S.editing), sh = $('bl-sh-' + S.editing);
      if (p && ph) { p.addEventListener('input', function () { ph.value = p.value; });
                     ph.addEventListener('input', function () { if (/^#[0-9a-f]{6}$/i.test(ph.value)) p.value = ph.value; }); }
      if (s && sh) { s.addEventListener('input', function () { sh.value = s.value; });
                     sh.addEventListener('input', function () { if (/^#[0-9a-f]{6}$/i.test(sh.value)) s.value = sh.value; }); }
    }
  }

  function tab(key, label) {
    return '<button class="bl__tab' + (S.filter === key ? ' on' : '') + '" role="tab" ' +
      'aria-selected="' + (S.filter === key) + '" ' +
      'onclick="BrandLibrary.filter(\'' + key + '\')">' + esc(label) + '</button>';
  }

  // ── ACTIONS ──────────────────────────────────────────────────────────────

  function find(id) { return clubs().filter(function (c) { return c.id === id; })[0]; }

  function edit(id)  { S.editing = id; render(); }
  function cancel()  { S.editing = null; render(); }
  function filter(k) { S.filter = k; S.editing = null; render(); }

  /**
   * Confirm a suggestion, or a hand-typed pair, as the club's real colours.
   * This is the moment a machine guess becomes something publishable, so the
   * person and the time are recorded alongside it.
   */
  function confirm(id) {
    var c = find(id);
    if (!c) return;
    var sug = c.suggestion || {};
    if (!c.primary && !sug.primary) { edit(id); return; }   // nothing to confirm yet
    c.primary = c.primary || sug.primary;
    c.secondary = c.secondary || sug.secondary || null;
    c.verified = true;
    c.provenance = (c.provenance ? c.provenance + ' ' : '') + 'Confirmed in the Brand Library by ' + who() + '.';
    save(id, true);
  }

  function lock(id) {
    var c = find(id);
    if (!c) return;
    c.locked = true;
    save(id, true);
  }

  function who() {
    try {
      var s = JSON.parse(sessionStorage.getItem('rlfc_staff') || 'null');
      return (s && (s.name || s.email)) || 'a member of staff';
    } catch (e) { return 'a member of staff'; }
  }

  /**
   * Persist through the portal's own save path.
   * If that is not present — which is the case on any page that is not the
   * portal — nothing is written and the UI says so rather than pretending.
   */
  function save(id, skipRead) {
    var c = find(id);
    if (!c) return;
    if (!skipRead) {
      var p = $('bl-ph-' + id), s = $('bl-sh-' + id);
      if (p && /^#[0-9a-f]{6}$/i.test(p.value)) c.primary = p.value.toUpperCase();
      if (s && /^#[0-9a-f]{6}$/i.test(s.value)) c.secondary = s.value.toUpperCase();
      c.verified = true;
      c.provenance = 'Set by hand in the Brand Library by ' + who() + '.';
    }
    S.editing = null;
    render();
    if (typeof global.saveData === 'function') {
      try { global.saveData('club-brands', S.data, 'Brand Library: ' + c.name); return; } catch (e) {}
    }
    if (typeof global.toast === 'function') {
      global.toast('Saved on screen only — this page cannot write club data.', true);
    }
  }

  function load() {
    return fetch('data/club-brands.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { S.data = d; render(); return d; })
      .catch(function () {
        var host = $('brand-library');
        if (host) host.innerHTML = '<p class="bl__msg">The club colours could not be loaded ' +
          'just now. Nothing has been changed.</p>';
      });
  }

  function init() { if (!S.data) return load(); render(); return Promise.resolve(S.data); }

  global.BrandLibrary = {
    init: init, load: load, render: render, edit: edit, cancel: cancel,
    confirm: confirm, lock: lock, save: save, filter: filter,
    _state: S, _counts: counts, _why: why
  };
}(typeof window !== 'undefined' ? window : globalThis));
