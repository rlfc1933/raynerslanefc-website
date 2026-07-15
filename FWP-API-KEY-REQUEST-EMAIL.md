# Football Web Pages — API key request

**Send to:** the contact address on https://www.footballwebpages.co.uk/api
**From:** a club email address (e.g. `info@raynerslanefc.co.uk` or `chairman@raynerslanefc.co.uk`) — sending from the club domain helps them verify you're a genuine club.

---

**Subject:** API key request — Rayners Lane FC (Step 5, Combined Counties Premier Division North)

Hello,

I'm writing on behalf of **Rayners Lane FC**, a non-league club founded in 1933 and based at Tithe Farm Sports & Social Club in Harrow. We compete at **Step 5 in the Combined Counties Football League, Premier Division North** for the 2026-27 season.

I understand you make the Football Web Pages API available to non-league clubs free of charge, and I'd like to request an API key.

We've recently rebuilt our official website (**raynerslanefc.co.uk**) and want to display accurate, up-to-date football data for our supporters. Specifically we'd use the API to power:

- **Fixtures and results** — on our fixtures page, home-page next-match countdown, and a subscribable calendar feed so supporters can add our games to their phones
- **The league table** — kept current automatically through the season
- **Our matchday programme**, which is generated from the same data

At present our fixtures have to be entered by hand by volunteers, which means the site and our supporters' calendars fall out of date. Your API would let us keep everything accurate without that manual work.

Our expected usage is modest — a scheduled refresh a few times a day, well within your ten-requests-per-minute limit, and we'll cache responses.

Could you let me know what you need from us, and confirm our **team ID** and the **competition ID** for Combined Counties Premier Division North 2026-27 so we can pin our requests correctly?

Happy to provide any verification you need.

Many thanks,

**[YOUR NAME]**
[Role], Rayners Lane FC
raynerslanefc.co.uk
[phone / club email]

---

## Once the key arrives — what to do with it
Add these in **Netlify → Site configuration → Environment variables** (never commit them):

- `FWP_API_KEY` — the key they issue
- `FWP_TEAM_ID` — Rayners Lane's Football Web Pages team ID (ask them to confirm)
- `FWP_COMP_ID` — Combined Counties Premier Division North, 2026-27 (ask them to confirm)

`netlify/functions/fetch-fixtures.js` **already has hooks for `FWP_API_KEY` and `FWP_TEAM_ID`** — the integration was anticipated in the original build; the key was just never obtained. Setting these plus the provider layer (see `CLAUDE-CODE-FIXTURES-SYNC-PROMPT.md`) turns the fixtures, results and league table on.

⚠️ **Pin the season and competition explicitly.** Football Web Pages' default Rayners Lane page returns **2024-25 Isthmian South Central** data — the wrong season and the wrong league. Always validate that what comes back is 2026-27 Combined Counties Premier Division North before writing it to the site.
