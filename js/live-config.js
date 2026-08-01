/* ════════════════════════════════════════════════════════════════════════
   RAYNERS LANE FC — live scoreboard rollout switch

   ONE boolean decides which system the public site believes.

     useV2 = false  → the existing path (data/matchday.json + live_match),
                      exactly as it behaves today. Nothing changes for anyone.
     useV2 = true   → the automatic Football Web Pages feed, via the club's own
                      Supabase (js/live-match.js).

   It is a plain file rather than an environment variable on purpose: switching
   it is a one-line edit any future maintainer can find, and rolling back is the
   same edit in reverse. No build, no function redeploy, no database change.

   Switched TRUE on 1 August 2026: Football Web Pages confirmed the club may
   use their feed and actively encouraged it. Set this back to false to return
   the whole site to the manual scoreboard — no build, no function change, no
   database change.
   ════════════════════════════════════════════════════════════════════════ */
window.RLFC_LIVE = {
  useV2: true,
  pollSeconds: 15,        // how often the browser asks OUR database (not the provider)
  staleAfterSeconds: 180,
  // How long a finished match keeps the hero after full time. The result is
  // the news for the rest of the day; the next fixture takes over afterwards.
  resultHoldHours: 24, // after this, a live score is labelled "Updates delayed"
  attribution: 'Match data supplied by Football Web Pages'
};
