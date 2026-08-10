/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — LIVE EVENT → STUDIO

   THE MISSING HALF OF THE LIVE CONTENT DESK. The desk could read the club's
   authoritative match events and offer "Create update"; pressing it opened
   Studio and then stopped, because psApplyLivePrefill() did not exist. The
   operator still typed the scorer, the minute and the score by hand — the
   three things the feed had already told us — while the game carried on.

   WHAT THIS DOES. Takes the prefill object the desk builds and puts it into
   Studio's own state: the content type, the fixture, and every fact the
   provider actually sent. Then renders. That is the whole job.

   WHAT IT REFUSES TO DO.
   It never invents a fact. If the provider did not send a scorer, the scorer
   field is left for a human, because a graphic that names the wrong player is
   worse than one that names nobody. It writes no football truth back, and it
   cannot publish — Studio previews, a human downloads.

   SEPARATE FILE, ON PURPOSE. admin.html is already 900KB and holds live score
   authority and squad selection. This is the bridge between two existing
   systems and belongs in neither of them.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /**
   * Event content-state → Studio template.
   *
   * The desk speaks in the vocabulary of the match_events table; Studio speaks
   * in template keys. Most line up exactly. Substitution does not: Studio has
   * no substitution template today, so it routes to the announcement template
   * with the line already written, which is a real usable graphic rather than
   * a dead button. Adding a proper one later is a single entry here.
   */
  var TYPE = {
    goal:         'goal',
    yellow:       'yellow',
    red:          'red',
    kickoff:      'kickoff',
    halftime:     'halftime',
    fulltime:     'fulltime',
    offstate:     'offstate',
    lineup:       'lineup',
    substitution: 'announce'
  };

  /** Studio's size keys, from the desk's format recommendation. */
  var SIZE = { story: 'story', square: 'ig', portrait: 'pt', x: 'x' };

  function subLine(pre) {
    if (pre.playerOff && pre.player) return pre.playerOff + ' off, ' + pre.player + ' on';
    if (pre.player) return pre.player + ' comes on';
    return 'Substitution';
  }

  /**
   * Apply a live event to Studio.
   * Returns the resolved template key, or null if the event has no graphic —
   * which is a legitimate outcome, not a failure.
   */
  function apply(pre) {
    if (!pre || !pre.type) return null;
    var key = TYPE[pre.type];
    if (!key) return null;

    var PS = global.PS;
    if (!PS || typeof global.psSetType !== 'function') return null;

    // psSetType resets PS.data and seeds the NEXT fixture, so it has to run
    // first — otherwise it would wipe everything written below it.
    global.psSetType(key);

    // The live fixture, not "the next fixture". During a match those are the
    // same; at full time, when the recap is made, they are not.
    if (pre.fixtureId != null && typeof global.psApplyFixture === 'function') {
      try { global.psApplyFixture(pre.fixtureId); } catch (e) {}
    }

    var d = PS.data || (PS.data = {});
    // Only what the provider actually sent. Anything absent stays absent so
    // Studio asks a human rather than printing a confident blank.
    if (pre.minute)                     d.minute = pre.minute;
    if (pre.player)                     d.player = d.name = pre.player;
    if (pre.playerOff)                  d.playerOff = pre.playerOff;
    if (pre.scoreHome != null)          d.scoreHome = pre.scoreHome;
    if (pre.scoreAway != null)          d.scoreAway = pre.scoreAway;
    if (pre.scoreHome != null && pre.scoreAway != null) {
      d.score = pre.scoreHome + '–' + pre.scoreAway;
    }
    if (pre.card)                       d.card = pre.card;
    if (key === 'announce' && pre.type === 'substitution') {
      d.headline = 'Substitution';
      d.body = subLine(pre);
    }

    // Where the event came from, so a later correction can be traced to the
    // graphic it affected rather than guessed at.
    PS._liveEventId = pre.eventId || null;
    PS._liveFixtureId = pre.fixtureId || null;

    if (pre.format && SIZE[pre.format]) {
      PS.size = SIZE[pre.format];
      try { if (typeof global.psSetSize === 'function') global.psSetSize(PS.size); } catch (e) {}
    }

    try { if (typeof global.psFields === 'function') global.psFields(); } catch (e) {}
    try { if (typeof global.psRender === 'function') global.psRender(); } catch (e) {}
    return key;
  }

  global.psApplyLivePrefill = apply;
  global.LivePrefill = { apply: apply, TYPE: TYPE, SIZE: SIZE, _subLine: subLine };
}(typeof window !== 'undefined' ? window : globalThis));
