/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — LIVE EVENT ADAPTER

   Normalises the club's authoritative live match events into one shape the
   Live Content Desk and Studio can both consume.

   WHERE THE TRUTH COMES FROM, AND WHERE IT DOES NOT
   Events come from public.match_events via RLFCLive.eventsFor(fixtureId) —
   the same table the sync writes and Match Centre reads. This file adds no
   second source, polls no provider directly, and writes nothing back. If it
   disagrees with match_events, match_events is right.

   DEDUPLICATION IS ALREADY SOLVED, UPSTREAM
   The table carries `dedupe_key` with `unique (fixture_id, dedupe_key)`, and
   the column comment explains it deliberately excludes the provider's free
   text so tidying "Beau  Pryce" to "Beau Pryce" is not read as a second red
   card. That is a better guarantee than anything a browser could reconstruct,
   so this file trusts it rather than re-deriving one. What it DOES do is guard
   the render path: a feed that re-sends the same row must not produce a second
   card in the timeline, so events are keyed by id and merged, not appended.

   CORRECTIONS AND RETRACTIONS ARE NOT DELETIONS
   `retracted_at` means the provider withdrew an event — it is dropped from the
   timeline but never treated as "never happened" in a way that silently
   changes a score already posted. `corrected_at` marks an event that changed
   after the fact; the desk shows it as corrected rather than quietly swapping
   the text under a graphic someone may already have published.

   UNKNOWN TYPES DEGRADE, THEY DO NOT CRASH
   The table's CHECK constraint lists the types the club records today. If the
   sync ever starts writing a new one, it renders as an informational line with
   no content action rather than throwing. Adding real support later is a
   single entry in TYPES.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiveContentEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Every event type the club's own table can hold, with how the desk should
   * treat it. `post` is the Studio content state the CREATE button opens;
   * null means the event is worth showing but has no graphic of its own.
   */
  var TYPES = {
    goal:           { label: 'Goal',            post: 'goal',        weight: 3, tone: 'peak' },
    own_goal:       { label: 'Own goal',        post: 'goal',        weight: 3, tone: 'peak' },
    penalty_goal:   { label: 'Penalty scored',  post: 'goal',        weight: 3, tone: 'peak' },
    penalty_missed: { label: 'Penalty missed',  post: null,          weight: 2, tone: 'neutral' },
    yellow_card:    { label: 'Yellow card',     post: 'yellow',      weight: 1, tone: 'neutral' },
    red_card:       { label: 'Red card',        post: 'red',         weight: 3, tone: 'urgent' },
    substitution:   { label: 'Substitution',    post: 'substitution', weight: 1, tone: 'neutral' },
    kickoff:        { label: 'Kick off',        post: 'kickoff',     weight: 2, tone: 'energy' },
    half_time:      { label: 'Half time',       post: 'halftime',    weight: 2, tone: 'neutral' },
    second_half:    { label: 'Second half',     post: null,          weight: 1, tone: 'neutral' },
    full_time:      { label: 'Full time',       post: 'fulltime',    weight: 3, tone: 'result' },
    delayed:        { label: 'Delayed',         post: 'offstate',    weight: 2, tone: 'urgent' },
    postponed:      { label: 'Postponed',       post: 'offstate',    weight: 3, tone: 'urgent' },
    abandoned:      { label: 'Abandoned',       post: 'offstate',    weight: 3, tone: 'urgent' },
    correction:     { label: 'Correction',      post: null,          weight: 1, tone: 'neutral' },
    info:           { label: 'Update',          post: null,          weight: 0, tone: 'neutral' }
  };

  function typeOf(t) {
    return TYPES[t] || { label: 'Update', post: null, weight: 0, tone: 'neutral', unknown: true };
  }

  /** "68'" or "45+3'" — the provider gives stoppage separately, so respect it. */
  function minuteLabel(row) {
    if (row.minute == null) return '';
    var m = String(row.minute);
    if (row.stoppage_minute) m += '+' + row.stoppage_minute;
    return m + "'";
  }

  /**
   * Normalise one row.
   * Nothing is invented: a field the provider did not send stays null, and the
   * desk renders around the gap rather than filling it with a plausible guess.
   */
  function normalise(row, ctx) {
    if (!row) return null;
    var meta = typeOf(row.event_type);
    var isUs = ctx && ctx.ourSide ? row.side === ctx.ourSide : null;

    return {
      id: String(row.id),
      dedupeKey: row.dedupe_key || null,
      type: row.event_type,
      known: !meta.unknown,
      label: meta.label,
      post: meta.post,
      weight: meta.weight,
      tone: meta.tone,

      minute: row.minute == null ? null : row.minute,
      stoppage: row.stoppage_minute || null,
      minuteLabel: minuteLabel(row),

      side: row.side || null,
      team: row.team || null,
      isUs: isUs,
      // For an own goal the scorer is on the other side from the team it counts
      // for; player_side is what tells them apart, so it is carried through.
      player: row.player || null,
      playerSide: row.player_side || null,
      assistant: row.assistant || null,
      cardColour: row.card_colour || null,
      ownGoal: !!row.own_goal,
      penalty: !!row.penalty,

      scoreHome: row.score_home_after == null ? null : row.score_home_after,
      scoreAway: row.score_away_after == null ? null : row.score_away_after,

      corrected: !!row.corrected_at,
      retracted: !!row.retracted_at,
      source: row.source || 'fwp',
      at: row.occurred_at || row.received_at || null
    };
  }

  /**
   * Fold a fresh fetch into what the desk already has.
   *
   * Keyed by id so a re-send updates in place instead of appending. Returns
   * both the merged list and which ids are genuinely NEW, so the UI can
   * highlight an arrival without re-announcing the whole timeline every poll.
   */
  function merge(existing, rows, ctx) {
    var byId = {};
    (existing || []).forEach(function (e) { byId[e.id] = e; });

    var fresh = [], changed = [];
    (rows || []).forEach(function (row) {
      var e = normalise(row, ctx);
      if (!e) return;
      if (e.retracted) { delete byId[e.id]; return; }   // withdrawn upstream
      var prev = byId[e.id];
      if (!prev) { fresh.push(e.id); }
      else if (prev.corrected !== e.corrected || prev.scoreHome !== e.scoreHome ||
               prev.player !== e.player || prev.minute !== e.minute) { changed.push(e.id); }
      byId[e.id] = e;
    });

    var list = Object.keys(byId).map(function (k) { return byId[k]; });
    // Newest first. Minute is the football ordering; received time only breaks
    // ties, because two events can share a minute.
    list.sort(function (a, b) {
      var am = (a.minute == null ? -1 : a.minute) + (a.stoppage || 0) / 100;
      var bm = (b.minute == null ? -1 : b.minute) + (b.stoppage || 0) / 100;
      if (bm !== am) return bm - am;
      return String(b.at || '').localeCompare(String(a.at || ''));
    });
    return { events: list, newIds: fresh, changedIds: changed };
  }

  /** A one-line human description, used in the timeline and the button. */
  function describe(e) {
    if (!e) return '';
    if (e.type === 'substitution') {
      if (e.player && e.assistant) return e.assistant + ' off, ' + e.player + ' on';
      return e.player ? (e.player + ' on') : 'Substitution';
    }
    if (e.post === 'goal') {
      var who = e.player || 'Goal';
      if (e.ownGoal) who += ' (own goal)';
      else if (e.penalty) who += ' (pen)';
      return who;
    }
    if (e.type === 'yellow_card' || e.type === 'red_card') return e.player || e.label;
    if (e.scoreHome != null && e.scoreAway != null) return e.scoreHome + '–' + e.scoreAway;
    return e.label;
  }

  /**
   * Everything Studio needs to open pre-filled from this event.
   * Anything the provider did not give stays absent so Studio asks for it
   * rather than publishing a blank where a scorer should be.
   */
  function studioPrefill(e, campaign) {
    if (!e || !e.post) return null;
    var d = { type: e.post, fixtureId: campaign && campaign.fixtureId, campaignId: campaign && campaign.id, eventId: e.id };
    if (e.minute != null) d.minute = e.minuteLabel;
    if (e.player) d.player = e.player;
    if (e.assistant) d.playerOff = e.assistant;
    if (e.scoreHome != null && e.scoreAway != null) { d.scoreHome = e.scoreHome; d.scoreAway = e.scoreAway; }
    if (e.cardColour) d.card = e.cardColour;
    return d;
  }

  /** Story for the fast, in-the-moment events; a post for the settled ones. */
  function recommendedFormat(e) {
    if (!e) return 'story';
    if (e.type === 'half_time' || e.type === 'full_time') return 'square';
    return 'story';
  }

  return {
    TYPES: TYPES, typeOf: typeOf, normalise: normalise, merge: merge,
    describe: describe, studioPrefill: studioPrefill,
    recommendedFormat: recommendedFormat, minuteLabel: minuteLabel
  };
});
