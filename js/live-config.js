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

   Kept FALSE until (a) Football Web Pages have confirmed the club may poll
   their match embed, and (b) the sync has been watched through a full real
   fixture. See the release notes.
   ════════════════════════════════════════════════════════════════════════ */
window.RLFC_LIVE = {
  useV2: false,
  pollSeconds: 15,        // how often the browser asks OUR database (not the provider)
  staleAfterSeconds: 180, // after this, a live score is labelled "Updates delayed"
  attribution: 'Match data supplied by Football Web Pages'
};
