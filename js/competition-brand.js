/* ════════════════════════════════════════════════════════════════════════
   COMPETITION IDENTITY — one resolver, every match card.

   A fixture card should say which competition it belongs to the way football
   says it: the competition's own mark, not the words "FA VASE" in a grey pill.
   This is the single place that decides what that identity is, so the homepage,
   the fixtures list, the results and anything built later cannot disagree — and
   so a sponsorship change is one edit to data/competitions.json rather than a
   hunt through the markup.

   IT RESOLVES FROM THE COMPETITION, NEVER THE OPPONENT.
   `competitionId` is already on every fixture ('fa-vase', 'fa-cup',
   'ccl-prem-north'). Where a feed sends only a label — "FA Vase 1Q", "FA Cup
   EP" — the label is normalised and matched against the registry's name, short
   name and aliases. Nothing anywhere keys off who we happen to be playing, so
   every future Vase tie is branded automatically and next season's draw needs
   no code.

   WHY MOST COMPETITIONS HAVE NO LOGO HERE, DELIBERATELY.
   The FA does not publish its competition wordmarks for download. Rule 3 of the
   FA Challenge Vase competition rules is explicit: "The Association shall from
   time to time issue a FA Vase Logo", and 3(f) — a club "shall use the image
   issued by The Association and will follow any directions issued by The
   Association in relation to the use of such image."

   So the mark is ISSUED to competing clubs, and taking one off a logo site
   would breach the rule it is meant to satisfy. Until The FA issues ours, these
   competitions carry their text identity, which is honest and correct. Adding
   the artwork later is a file and one `logo` line — no code change.

   FALLBACK IS THE NORMAL CASE, NOT AN ERROR PATH.
   Every caller gets a usable identity whether or not a logo exists: a label
   always, a logo only when one is registered and real.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CompetitionBrand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var registry = [];

  /** "The Emirates FA Cup" and "emirates-fa-cup" compare equal. */
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Round suffixes the feed appends to a competition label — "FA Vase 1Q",
   * "FA Cup EP". Stripped so the competition still resolves, and returned
   * separately so a card can print the round beneath the mark.
   */
  // ORDER MATTERS. "Semi-Final" contains "Final", so the more specific rounds
  // are tested first — otherwise a semi-final is announced as the final, which
  // is the sort of mistake a supporter notices immediately.
  var ROUNDS = [
    [/\bextra preliminary( round)?\b|\bep\b/i, 'Extra Preliminary Round'],
    [/\bpreliminary( round)?\b|\bpr\b/i, 'Preliminary Round'],
    [/\bsemi[- ]?finals?\b|\bsf\b/i, 'Semi-Final'],
    [/\bquarter[- ]?finals?\b|\bqf\b/i, 'Quarter-Final'],
    [/\bfinal\b/i, 'Final'],
  ];
  var ORDINAL = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'];

  function roundFrom(label) {
    var s = String(label || '');
    var q = s.match(/\b([1-9])q\b/i);
    if (q) return ORDINAL[+q[1]] + ' Qualifying Round';
    var named = s.match(/\b([1-9])(st|nd|rd|th) qualifying( round)?\b/i);
    if (named) return ORDINAL[+named[1]] + ' Qualifying Round';
    for (var i = 0; i < ROUNDS.length; i++) {
      if (ROUNDS[i][1] && ROUNDS[i][0].test(s)) return ROUNDS[i][1];
    }
    var rn = s.match(/\bround (\d+)\b/i);
    if (rn) return 'Round ' + rn[1];
    return '';
  }

  /** Strip the round so "FA Vase 1Q" still matches the "FA Vase" short name. */
  function withoutRound(label) {
    return String(label || '')
      .replace(/\b[1-9](st|nd|rd|th)? ?q(ualifying)?( round)?\b/gi, '')
      .replace(/\bextra preliminary( round)?\b|\bpreliminary( round)?\b|\bep\b|\bpr\b/gi, '')
      .replace(/\b(semi|quarter)[- ]?finals?\b|\bsf\b|\bqf\b|\bfinal\b/gi, '')
      .replace(/\bround \d+\b/gi, '')
      .trim();
  }

  function setRegistry(list) { registry = Array.isArray(list) ? list : []; }

  /** The registry entry for an id or a label, or null. */
  function find(fixtureOrId, label) {
    var id = '', lbl = label;
    if (fixtureOrId && typeof fixtureOrId === 'object') {
      id = fixtureOrId.competitionId || '';
      lbl = lbl || fixtureOrId.competition || '';
    } else {
      id = fixtureOrId || '';
    }
    var i;
    // 1. the canonical id, which every registry-sourced fixture already carries
    if (id) {
      for (i = 0; i < registry.length; i++) if (registry[i].id === id) return registry[i];
    }
    if (!lbl) return null;
    // 2. the label, against name / short / id / declared aliases
    var n = norm(lbl), bare = norm(withoutRound(lbl));
    for (i = 0; i < registry.length; i++) {
      var c = registry[i];
      var names = [c.name, c.short, c.id].concat(c.aliases || []);
      for (var j = 0; j < names.length; j++) {
        var cn = norm(names[j]);
        if (cn && (cn === n || cn === bare)) return c;
      }
    }
    return null;
  }

  /**
   * What a match card should show for this fixture.
   *
   * Always returns something printable. `logo` is present only when the
   * registry holds a real, approved asset — callers render the mark when it is
   * there and the label when it is not, which is the normal case today.
   */
  function identity(fixtureOrId, label) {
    var c = find(fixtureOrId, label);
    var raw = (fixtureOrId && typeof fixtureOrId === 'object')
      ? (fixtureOrId.competition || '') : (label || '');
    var round = roundFrom(raw);

    if (!c) {
      // Unknown competition: never blank, never "undefined" — print what the
      // feed gave us, minus any round we have pulled out to show separately.
      var txt = withoutRound(raw) || raw || '';
      return { id: '', label: txt, formal: txt, short: txt, round: round, logo: null, alt: txt, known: false };
    }
    return {
      id: c.id,
      // What a card prints. `cardName` is the sponsored identity a supporter
      // recognises — "Isuzu FA Vase" rather than the feed's "FA Vase 1Q" or the
      // formal "The FA Challenge Vase".
      label: c.cardName || c.name || c.short || '',
      formal: c.name || '',
      short: c.short || c.name || '',
      round: round,
      logo: c.logo || null,
      alt: c.logoAlt || (c.name ? c.name + ' logo' : ''),
      known: true,
    };
  }

  return {
    setRegistry: setRegistry,
    identity: identity,
    find: find,
    roundFrom: roundFrom,
    withoutRound: withoutRound,
    _norm: norm,
  };
});
