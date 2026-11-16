/* ════════════════════════════════════════════════════════════════════════
   PROGRAMME EDITION — the pure decisions behind the print edition.

   Kept out of programme-print.html so they can be tested without a browser:
     · issueNumber()  which issue of the season this programme is
     · bookletPlan()  how many designed completion pages a folded booklet
                      needs, and which ones
     · assemble()     where they go (before the back cover, never after it)
     · coverPhoto()   which real, approved club photograph the cover uses

   Nothing here invents data. No fixture list → no issue number (the line is
   left off the cover). No real fixtures → no fixtures page.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProgrammeEdition = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEAD = /postpon|cancel|void|superseded/i;
  function key(f) { return String(f.date || '').slice(0, 10) + 'T' + String(f.kickoff || '00:00'); }
  function isHome(f) { return f && f.isHome !== false; }

  /**
   * Issue No. = home fixtures in the same season, up to and including this
   * one, in kick-off order. Postponed, cancelled and void fixtures are not
   * counted (no programme was produced for them).
   * Returns null when it cannot be known honestly: no fixtures, the fixture
   * is not in the list, or it is an away match (the club does not issue a
   * programme for those).
   */
  function issueNumber(fixtures, doc) {
    if (!doc || !Array.isArray(fixtures) || !fixtures.length) return null;
    var me = doc.fixtureId ? fixtures.filter(function (f) { return f.id === doc.fixtureId; })[0] : null;
    if (!me && doc.date) {
      me = fixtures.filter(function (f) {
        return String(f.date || '').slice(0, 10) === String(doc.date).slice(0, 10) &&
          String(f.opponent || '').toLowerCase() === String(doc.opponent || '').toLowerCase();
      })[0] || null;
    }
    if (!me || !isHome(me) || DEAD.test(String(me.status || ''))) return null;
    var season = me.season || doc.season || '';
    var mine = key(me);
    var n = fixtures.filter(function (f) {
      if (!isHome(f) || DEAD.test(String(f.status || ''))) return false;
      if (season && f.season && f.season !== season) return false;
      return key(f) <= mine;
    }).length;
    return n || null;
  }

  /* The completion pages, in the order the club wants them used. Each is a
     real page with real content, never a blank sheet. `fixtures` is only
     available when there are real fixtures to list; `autographs` is the
     designed last resort when it is not. The membership promotion is NOT a
     completion page — it already lives on the back cover. */
  var PRIORITY = ['credits', 'notes', 'fixtures', 'autographs'];

  /**
   * @param {number} n          pages in the reading edition (front + back covers included)
   * @param {object} available  { fixtures: boolean } — which optional pages can be made
   * @returns {{ pages:number, add:string[] }}
   */
  function bookletPlan(n, available) {
    n = Math.max(0, n | 0);
    var need = (4 - (n % 4)) % 4;
    var can = PRIORITY.filter(function (k) { return k !== 'fixtures' || !!(available && available.fixtures); });
    var add = can.slice(0, need);
    return { pages: n + add.length, add: add };
  }

  /** Insert completion items before the last (back cover). First stays first. */
  function assemble(pages, extras) {
    pages = (pages || []).slice(); extras = (extras || []).slice();
    if (pages.length < 2 || !extras.length) return pages.concat(pages.length < 2 ? extras : []);
    var back = pages.pop();
    return pages.concat(extras, [back]);
  }

  /**
   * The cover photograph. A photo path the editor set wins; then an approved
   * asset id from the club's Asset Studio library; then the club's approved
   * ground photograph. Only `approved` assets in a photographic category are
   * ever used — never a crest, never generated artwork.
   */
  var PHOTO_CATS = ['ground', 'player', 'matchday', 'team', 'action'];
  var DEFAULT_COVER = 'repo:img/ground/tithe-farm-goalmouth-1600.jpg';
  function coverPhoto(doc, assets) {
    doc = doc || {};
    var list = (assets || []).filter(function (a) {
      return a && a.approval === 'approved' && PHOTO_CATS.indexOf(a.category) > -1 && a.src;
    });
    function byId(id) { return list.filter(function (a) { return a.id === id; })[0] || null; }
    if (doc.coverPhoto && typeof doc.coverPhoto === 'string') {
      var hit = list.filter(function (a) { return a.src === doc.coverPhoto; })[0];
      return { src: doc.coverPhoto, credit: hit ? hit.rights_holder : '', id: hit ? hit.id : '' };
    }
    var a = (doc.coverAsset && byId(doc.coverAsset)) || byId(DEFAULT_COVER);
    if (a) return { src: a.src, credit: a.rights_holder || '', id: a.id };
    // Library unreadable: the default is the club's own approved ground photo.
    return list.length ? null : { src: DEFAULT_COVER.replace(/^repo:/, ''), credit: 'Rayners Lane FC (club photography)', id: DEFAULT_COVER };
  }

  return { issueNumber: issueNumber, bookletPlan: bookletPlan, assemble: assemble, coverPhoto: coverPhoto,
    PRIORITY: PRIORITY, DEFAULT_COVER: DEFAULT_COVER };
});
