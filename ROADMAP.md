# Rayners Lane FC — Development Plan

**v2.0 · 27 July 2026 · supersedes v1.0 entirely**
Governed by `VISION.md`. Any item that fails the constitution has been cut, and
the cuts are documented rather than hidden.

---

## How this plan is organised

Not by page. Not by feature. **By the six lifecycles that information actually
travels through in a football club.**

```
1. THE FIXTURE      announced → briefed → published → played → captured → archived
2. THE PLAYER       trialled → signed → profiled → connected → celebrated → remembered
3. THE SPONSOR      found → convinced → activated → proven → renewed
4. THE SUPPORTER    arrives → belongs → attends → commits → advocates
5. THE VOLUNTEER    recruited → onboarded → owns something → hands it on
6. THE SEASON       set up → run → closed → archived
```

Every item below serves one of those flows. If it serves none, it isn't here.

**Four sections:** Foundation (memory, trust, sustainability) · Experience
(people) · Intelligence (one input, many outputs) · Future (not yet).

**Every item declares whether it adds or removes complexity.** Additions must
justify themselves. This plan removes more than it adds, on purpose.

---

# FOUNDATION
*Protect the memory, the trust and the club's ability to survive its people.*

Nothing in Experience or Intelligence is safe until this section is done.

---

## F1 · The Archive Ritual
**Flow:** Fixture → captured → archived · **Non-technical**

**Why it exists.** The club's history ends in 2026. Nine of twelve gallery items
are cartoon SVGs. The manager writes match storylines that are printed once for
forty people and lost. Every Saturday not recorded is permanently gone — this is
the only item on this plan whose cost *increases* with delay.

**Principle:** 7 (the archive outranks the interface), 6 (content is
infrastructure).

**What it is — a standing club process, not software:**
- A named photographer per home fixture. 10 usable frames minimum. Credited.
- The match brief written before every game (see I1).
- Score, scorers and three sentences within 2 hours of full time.
- One team photograph per season, everyone in it.

**Who benefits.** Supporters, players, sponsors, the club in 2029.
**Effort.** Zero engineering. One rota and one standard.
**Dependencies.** None. **Starts this week.**
**Success.** ≥10 credited photographs per home fixture; zero fixtures without a
result 48h after kick-off; zero SVG placeholders in the gallery by May.
**Complexity:** ➖ Removes — it retires the placeholder system entirely.

---

## F2 · Player Content Round
**Flow:** Player → profiled · **Non-technical**

**Why it exists.** 0 of 24 players have a bio. 0 have a nickname. **All 24 carry
squad number `0`.** 6 of 24 have no photograph. The edge function fills the gap
with a generated sentence, so all 24 player pages currently serve search engines
and AI the same line with a name swapped in. The machinery to display a person
exists and is idle.

**Principle:** 6 (content is infrastructure), 8 (specificity over polish).

**What it is.** One training session. Two questions per player:
> *"Three words your team-mates would use about you."*
> *"The game you'll never forget."*
Plus a photograph of the six who are missing, and real squad numbers.

**Who benefits.** Supporters (connection), players (dignity — six men currently
have a cartoon where their team-mates have a face), sponsors (a reason to pick a
player), the club (24 distinct pages instead of 24 duplicates).
**Effort.** One evening. **No code. No deploy.**
**Dependencies.** None. **Success.** 24/24 bios, numbers and photographs.
**Complexity:** ➖ Removes — retires the cartoon-avatar fallback.

---

## F3 · Honest Status
**Flow:** All · **Engineering**

**Why it exists.** The club's deepest competitive advantage is that it refuses to
state what it doesn't know — `venues.json` verified-or-empty, fixtures that fail
a whole import on one season mismatch, `llms.txt` listing what AI must *not*
claim. **The interface does not yet hold that standard.** Four paths report
success they haven't verified:

- Save reports *"live in ~30 seconds"* on an HTTP 200 from GitHub alone. The
  purge result is returned by the server and never read.
- The live score toasts *"Score pushed live 2–1"* before either request
  resolves, and the Supabase write swallows its own failure.
- The staff profile form declares *"Profile saved privately ✓"* from inside a
  `.catch()`.
- 29 empty catch blocks across 25 functions. Silence is the platform's default
  failure mode.

**Principle:** 1 (publish what is true or nothing), 9 (fail visibly).

**What it is.** Staged receipts — *Saved → Cache cleared → Publishing → Live* —
with the last one verified by re-reading the file. Every matchday-critical action
waits for its response. No empty catch on any path a volunteer depends on.

**Who benefits.** Every volunteer, and therefore every supporter.
**Effort.** 1 week. **Dependencies.** None.
**Success.** Zero user-facing success messages that aren't verified. A volunteer
can always answer "did that work?"
**Complexity:** ➕ Adds slightly — justified because Principle 1 *is* the club's
advantage, and an interface that lies corrodes it from the inside.

---

## F4 · Institutional Memory
**Flow:** Volunteer → onboarded → owns → hands on · **Documentation + process**

**Why it exists.** This is the risk that ends the platform. It is understood in
depth by very few people, possibly one. The inline comments are genuinely
excellent — `lib/pin.js`, `import-fixtures.js` and `netlify.toml` explain *why*,
including past incidents — and **almost none of it ships**: `.gitignore` excludes
`*.md`, so a new contributor gets a 97-line README that claims "No build tools.
No dependencies" while `package.json` declares two and the browser loads seven
CDN libraries.

**Principle:** 5 (every feature must survive its author leaving).

**What it is:**
1. **One `docs/` that ships.** Architecture, publishing flow, data shapes, how to
   run locally, what breaks and why. Replaces four competing surfaces —
   `The-Lane-Portal-Guide.html` (2.5 MB), `staff-guide.html`, the Site Guide
   panel, the Lane Lowdown panel.
2. **A named owner per subsystem**, written down: fixtures, matchday, studio,
   commercial, squad, app.
3. **Six one-page runbooks** in club language: *Run a matchday · Publish news ·
   Add a fixture · Add a sponsor · Add a player · Fix a bad save.*
4. **A true README.**

**Who benefits.** The club, in the year the current maintainer stops.
**Effort.** 1 week of writing. **Dependencies.** None.
**Success.** A volunteer who has never seen the portal runs a matchday from the
runbook alone. A new engineer is productive in a day.
**Complexity:** ➖ Removes — four documentation surfaces become one.

---

## F5 · One Source of Truth Per Fact
**Flow:** All · **Engineering (mostly deletion)**

**Why it exists.** The same fact lives in two places in three systems, and the
portal reports success on edits that may never reach the public site:
- `js/squad.js` reads a **published Google Sheet**; the portal edits
  `squad.json`. Same 24 people, two sources. They agree today. Nothing keeps
  them agreeing.
- `js/programme.js` reads two more Sheets while `data/programme.json` exists.
- `js/main.js` and `js/club-now.js` **both** implement a live scoreboard and a
  countdown, both loaded on the homepage, each polling every 12 seconds.
- A static `sitemap.xml` is committed and permanently shadowed by the dynamic
  one — and already disagrees with it.

**Principle:** 2 (never type the same fact twice), 1 (truth).

**What it is.** Retire the Sheets read paths. Delete the superseded engine. Delete
the dead sitemap. **Verify the JSON is current before switching each read path** —
if a Sheet is ahead, migrate the data first.

**Who benefits.** Volunteers (saves actually take effect), supporters (one truth).
**Effort.** 1 week including verification. **Dependencies.** None.
**Success.** Every public fact has exactly one writable home.
**Complexity:** ➖➖ Removes substantially.

---

## F6 · Retire What Nobody Uses
**Flow:** Volunteer · **Removal**

**Why it exists.** Principle 3: volunteer attention is the scarcest resource, and
a tool nobody opens is not neutral — it's a tax. Every tile competes with the one
a volunteer actually needs at 2:45 on a Saturday.

| System | Evidence | Decision |
|---|---|---|
| **Boardroom** — Meetings, Wins Board, Income Planning, SWOT & Risk | `meetings.json`, `committee-wins.json`, `committee-plan.json` **all empty, blank `updatedAt`.** Never used once. 7 dashboard tiles | **Remove from the dashboard.** Run one real meeting through them. If it isn't logged, retire. This is a process mismatch — committees run on WhatsApp and paper, and software you must remember to open *after* the meeting loses |
| **Business Playbook** | Hero tile, badged START HERE, above the live scoreboard | **Merge** into the reading surface (F4). Good content, wrong place |
| **Sponsor Radar** | Excellent engineering. Discovery was never the bottleneck — follow-up is | **Freeze.** Keep it working, stop extending it, build E2 instead |
| **Stats engine** | `la_appearances`, `la_goals`, `la_cards`, `la_motm` — 4 tables, **no code touches them.** All 24 players show 0/0/0 | **Stop displaying zeros now.** Build properly in I4 or not at all |
| **`lane-social-cards.html`** (723 KB) | Superseded by Post Studio | **Delete** |
| **`shots.js`** | Requires `puppeteer-core`, not installed — cannot run | **Delete** |
| **`The-Lane-Portal-Guide.html`** (2.5 MB) | Fourth documentation surface | **Delete**, content into F4 |
| **`const PAGES`** (`components.js:223`) | Dead second nav definition | **Delete** |

**Effort.** 3 days. **Dependencies.** F4 for the docs merge.
**Success.** Dashboard tiles down from 38 to ~24; nothing a volunteer relies on
is lost.
**Complexity:** ➖➖➖ The largest single reduction in the plan.

---

# EXPERIENCE
*Supporters, players, volunteers, sponsors.*

---

## X1 · Players first
**Flow:** Player → connected · **Design**

**Why it exists.** At 1512px the squad page shows a masthead, a watermark, **four
committee cards**, then a trials advert. **No player above the fold.** The read is
*"run by a committee, short of players"* — and a recruitment ad above the current
squad is disloyal to the men in it. Committee is already on `about.html`; this is
a duplicate.

**Principle:** 8 (specificity), 6 (content is infrastructure).
**What it is.** Players by position, each linking to their profile. Committee
removed. Trials below the squad.
**Who benefits.** Supporters, players, sponsors — it creates the **only public
entry point to player sponsorship**, a live revenue line with no page today.
**Effort.** 3 days. **Dependencies.** F2. **Success.** Player profile views;
first player sponsorship sold.
**Complexity:** ➖ Removes a duplicate block.

---

## X2 · One ask at a time
**Flow:** Supporter → arrives · **Design**

**Why it exists.** A first-time phone visitor meets five simultaneous
interruptions before any football: PWA banner, INSTALL APP button, membership
modal (`z-index:10050`), cookie banner (`z-index:10000`), and the accessibility
toggle physically covering the banner's own word *"Cookies"*. The modal sits
above the banner, so the consent choice cannot be reached.

**Principle:** 4 (the voice is an asset — five requests is not the club's voice).
**What it is.** Consent alone on visit one. Install on a genuine visit two.
Membership on visit three. Toggle moved clear.
**Who benefits.** Every first-time visitor — where the margin is thinnest.
**Effort.** 2 days. **Dependencies.** None.
**Success.** Membership sign-ups per visitor hold or improve; first-visit bounce
falls. **Complexity:** ➖ Removes simultaneity.

---

## X3 · The sponsor's own page works
**Flow:** Sponsor → activated · **Content + engineering**

**Why it exists.** A sponsor doesn't audit code. They check how you treat the
sponsors you already have:
- `img/sponsors/acerbis-wordmark.png` **404s** — the Official Kit Partner, who
  supplies the playing kit free, referenced on the homepage and their own page.
- **"Download Pitch Deck" links to `investment.html` — itself.**
- **Hanlon Dry Lining, Home Shirt Sponsor, is absent from the homepage "SHIRT
  PARTNERS" strip**, while a training-kit sponsor appears in it as a
  white-boxed JPEG named `1781696501761-998412e9-….jpeg`.
- Higginson Stairs, a paying Programme Sponsor, has `logo: ""`.
- The sponsorship hero is **890×655px of empty gradient** — no crowd, no
  floodlights, no evidence. The homepage gets WebGL; the revenue page gets a
  gradient.

**Principle:** 1 (truth), 8 (specificity).
**What it is.** Fix the data, add the asset, put a real matchday photograph in
the hero, and make a missing logo render as a styled text lockup — **never a gap
or a white box.** Fail gracefully, always.
**Who benefits.** Every current sponsor, at renewal.
**Effort.** 3 days. **Dependencies.** F1 (photograph).
**Success.** Zero broken sponsor assets; renewal rate.
**Complexity:** Neutral.

---

## X4 · Speak football
**Flow:** Volunteer → onboarded · **Copy**

**Why it exists.** *"Records"* is where a parent's trial application for their
child arrives. *"FWP Images"*, *"Signoff"*, *"Lowdown"*, *"SWOT"*, *"Perks"*.
The dashboard greets everyone as *"GOOD MORNING, LANE"* despite the login having
captured a name.

**Principle:** 3 (volunteer attention), 4 (voice).
**What it is.** Records → **Enquiries**. FWP Images → **Result cards**. Signoff →
**Approve match posts**. Lowdown → **Club facts**. Match Day → **Live
scoreboard**. Greet people by name.
**Effort.** Hours. **Dependencies.** None. **Success.** A new committee member
finds trial applications unaided.
**Complexity:** Neutral. **Highest value-per-hour item in the plan.**

---

## X5 · Every page ends somewhere
**Flow:** Supporter → belongs · **Design + copy**

**Why it exists.** `history.html`, `news.html` and `gallery.html` have **zero
outbound links**. Whoever has just read ninety years of club history is the most
receptive season-ticket prospect the club will ever have, and there is nowhere
for them to go. Volunteer and trials confirmations never say what happens next.

**Principle:** 4 (voice), 8 (specificity).
**What it is.** One line per page, matched to the feeling — never a generic CTA.
History → *"Back the Lane in 2026/27."* Player → *"Sponsor this player."*
Volunteer → *"Emma will be in touch within a week."*
**Effort.** 2 days. **Dependencies.** X1. **Success.** Conversion from pages that
currently convert nothing. **Complexity:** Neutral.

---

## X6 · Capture every commercial conversation
**Flow:** Sponsor / Supporter → convinced · **Engineering**

**Why it exists.** The club built `laneSubmit` → Supabase → Enquiries with
honeypot, rate limiting, validation and a server-enforced guardian gate — then
routed its three highest-value CTAs around it. Season tickets: **0 forms, 3
mailto**. Shop: **0 forms, 11 mailto**. Sponsorship hero: mailto. Nobody knows
how many season tickets were asked about. On desktop without a mail client,
`mailto:` does nothing at all.

**Principle:** 2, 3 (a lead nobody recorded is a volunteer's time wasted twice).
**Effort.** 3 days. **Dependencies.** None.
**Success.** Every commercial enquiry lands in Enquiries with an owner.
**Complexity:** ➖ Removes a parallel unmanaged channel.

---

## X7 · The Lane App has a front door
**Flow:** Player → connected · **Design + process**

**Why it exists.** The best-engineered system in the platform — per-user logins,
scrypt-hashed codes, lockout, availability, selection, a capability matrix, an
audit trail — is **linked from nowhere on the public site**. A new signing cannot
find their own app.

**Principle:** 3, 5. **What it is.** A signing → app → profile onboarding path,
and a runbook for the manager.
**Effort.** 1 week. **Dependencies.** F2, F4.
**Success.** % of squad active in the app. **Complexity:** Neutral.

---

# INTELLIGENCE
*One input, many outputs. This is where the platform stops being a website.*

---

## I1 · The Match Brief
**Flow:** Fixture → briefed → published · **The structural bet**

**Why it exists.** The programme editor collects **44 editorial fields**. Eleven
of the richest — `storylines`, `keyPlayers`, `oppSummary`, `captainNotes`,
`clubHistory`, `academy`, `womens`, `groundInfo`, `potm`, `oppFounded`,
`oppOnesToWatch` — appear in exactly two files: `admin.html`, where a volunteer
types them, and `programme-print.html`, where they're printed. **Written once,
read by forty people, never seen again.**

And `data/opponents.json` holds 21 clubs with genuinely good football writing —
*"They share our ground at Tithe Farm, so this one is a derby in the truest
sense"* — consumed by one function and nothing else.

Meanwhile the same fixture is identified **five separate times** across **ten
panel changes** to prepare one match.

**Principle:** 2 (one input, many outputs), 3, 6.

**What it is.** One brief per fixture, keyed by `fixtureId`, retained across the
season, feeding:
```
MATCH BRIEF ─┬─► Fixtures page — "the angle" on the next fixture
             ├─► Preview article — auto-drafted, volunteer edits
             ├─► Post Studio — fixture pre-filled, cannot be wrong
             ├─► Programme — its current, only destination
             ├─► Lane App — squad broadcast
             └─► Event schema — genuinely specific
```
**Who benefits.** The media volunteer above all — five jobs become one.
**Effort.** 3 weeks. **Dependencies.** I2 (drafts), F5.
**Success.** Brief completed for ≥80% of fixtures; preview drafted in <10 min;
opponent name typed **once**.
**Complexity:** ➕ Adds a subsystem — **justified**: it is the only item that
makes every future piece of content cheaper rather than more expensive, and it
retires five separate re-entry points.

---

## I2 · Nothing is ever lost
**Flow:** All · **Engineering**

**Why it exists.** `psSetType()` executes `PS.data = {}` — switching template
silently destroys everything typed. No confirm, no draft, no undo. And undo
itself lives in `localStorage` **on one device**: if Pete saves from his phone,
Emma cannot roll it back from hers. The panel's own empty state admits it.

**Principle:** 9 (recover easily), 3.
**What it is.** Confirm on discard; persist the last card per template; surface
the real safety net — **every save is already a git commit** — as "restore a
previous version".
**Effort.** 1 week. **Dependencies.** None.
**Success.** Zero reported losses of in-progress work; a bad save recoverable
from any device. **Complexity:** ➕ Small addition, justified by Principle 9.

---

## I3 · The Matchday Capture
**Flow:** Fixture → played → captured → archived · **Engineering + process**

**Why it exists.** The loop never closes. The 4 July friendly is still
`status: "scheduled"` with no score, 23 days later. Two matches reported in the
news (Met Police, Aylesbury United) **do not exist in `fixtures.json` at all**.
Three live articles say *"This Saturday"* and mean three different Saturdays.

**Principle:** 1 (truth), 7 (the archive).
**What it is.** One post-match form → result · report draft · gallery ·
graphics · momentum · player stats. Plus: fixture-derived articles carry a
`fixtureId` and **retire themselves at kick-off**, so nobody has to remember.
**Who benefits.** Supporters (a fixture list that's true), the archive.
**Effort.** 3 weeks. **Dependencies.** I1, F1.
**Success.** Result published within 2h of full time, every fixture; zero stale
"this Saturday" articles at any point in the season.
**Complexity:** ➕ Adds — justified: it is the mechanism by which the archive
fills itself, and it removes three manual habits nobody currently keeps.

---

## I4 · Statistics that are earned
**Flow:** Player → celebrated · **Engineering**

**Why it exists.** Four tables exist for statistics and **no code touches them**.
The schema comment says "populate in Phase 2". Every player shows 0 apps, 0
goals, 0 assists — which is worse than showing nothing.
**Principle:** 1 (never state what isn't known).
**What it is.** Stats become a SUM over recorded match events, never a number
anyone types. **Until this ships, the zeros come off the page (F6).**
**Effort.** 3 weeks. **Dependencies.** I3. **Success.** Appearance and goal
totals correct with no manual entry; first player milestone surfaced
automatically. **Complexity:** ➕ Justified — it makes a promise already made in
the schema true, and it feeds milestones, graphics and the archive.

---

## I5 · The sponsor relationship
**Flow:** Sponsor → proven → renewed · **Engineering + process**

**Why it exists.** `data/sponsors.json` holds name, tier, role, logo, url, note.
It holds **no value, no term, no deliverables, no renewal date, no owner**.
Sponsor Radar finds prospects; nothing records whether anyone followed up. A
sponsor can go stale and nobody will know until they don't renew.
**Principle:** 3, 1.
**What it is.** Stage, value, term, what was promised, renewal date, owner — plus
a monthly *"here's what your sponsorship did"* note the club actually sends
(a ritual, not a feature).
**Effort.** 3 weeks. **Dependencies.** X6.
**Success.** Renewal rate; zero sponsors lost to being forgotten.
**Complexity:** ➕ Justified — it converts a list into revenue.

---

# FUTURE
*Not yet. Revisit when Foundation and Intelligence are complete.*

**U1 · Season rollover as a feature.** `fixtures.json` mixes 2026-27 with
pre-season; no `season` field, no archive path. Real pain, but **annual** — one
bad afternoon a year is survivable. Close season, after I3.

**U2 · The momentum surface.** Form, unbeaten runs, home record, told as a line
not a table. Genuinely wanted — but it presents data I3 doesn't yet capture
reliably. **Deliberately after, not before.**

**U3 · Academy · Women's · Community.** The programme already collects
`academy`, `womens` and `community` fields. **Do not build pages for teams that
don't exist.** Build the *record* so that the day a women's team is formed it
inherits fixtures, squad, profiles, graphics and a programme with no new code.
An empty section advertises a gap.

**U4 · Supporter identity with history.** Lane numbers, hearts and the loyalty
ladder exist. Over three years they become a real membership: matches attended,
seasons supported, recognition earned.

**U5 · Platform for other clubs.** **Off the plan until 2028 at the earliest.**
Principle 10. Pursuing it early makes the product generic, and specificity is the
entire advantage. Revisit at the end of 2027-28 and not before.

---

# Sequencing

| Phase | Contents | Deploys |
|---|---|---|
| **Now — no code** | F1 archive ritual · F2 player content · F4 documentation | 0 |
| **1** | F3 honest status · F6 removals · X4 language | 1 |
| **2** | F5 one truth · X2 interruptions · X3 sponsor page · X6 capture | 1 |
| **3** | X1 players first · X5 next steps · I2 drafts | 1 |
| **4** | I1 Match Brief | 1 |
| **5** | I3 Matchday Capture · X7 app front door | 1 |
| **6** | I4 statistics · I5 sponsor relationship | 1–2 |

**Seven deploys for three years of work.** The first phase isn't a deploy at all.

---

# If everything were cut in half

Three things survive, in this order:

1. **F1 + F2 — the archive ritual and player content.** No code. Starts the
   memory, makes the club human, unblocks the commercial case. If the club does
   nothing else for a year, do this.
2. **I1 — the Match Brief.** The one structural change that makes every future
   piece of content cheaper instead of more expensive.
3. **F3 — honest status.** Not because it's a defect, but because refusing to
   state what isn't known *is* the club's advantage, and an interface that lies
   corrodes it from the inside.

Everything else I would drop without much argument.

---

# The filter

Every future request faces three questions. All three must pass.

1. **Does it help the club remember, or help it tell its story?**
2. **Does it give a volunteer time back — or at minimum, take none?**
3. **Would it still be true and specific to Rayners Lane if another club copied
   it?**

If any answer is no, the honest response is *"not yet"* — and sometimes
*"never"*, which is a legitimate product decision this platform has not made
often enough.

---

*This plan removes more than it adds. That is the point.*

---

# Release log

## 2026-07-27 · Opening Season Readiness — **shipped and accepted**

`519515f..1bdb032` · Netlify deploy `6a67bebe148e900008755c9e` · published 13:25
BST, built in 10s · **one build, no previews** · production healthy, accepted.

**Delivered** (what actually shipped, not what was predicted):

- F1 archive tooling — `tools-archive-match.js`, browser-side upload resize,
  photographer credit required, `docs/matchday-photography.md`.
- Post Studio fixture integrity — one authoritative `psNextFixture()`, after-match
  templates seed from `psLastResult()`, fixture chip, export refused without a
  fixture. New **Called Off** template (postponed/cancelled/abandoned), a state
  that existed in `matchday.json` with no way to publish it.
- `data/competitions.json` — all five competitions with honest states. The two
  cups the season ticket covers now say "draw not yet published" instead of
  looking like missing data.
- Removed two unprovable commercial claims ("300+ Match Day Fans", "5K+ Social
  Followers"). The attendance figure contradicted `llms.txt`, which tells AI the
  club has never published one.
- No fabricated player statistics — zeros render as "–", or an honest sentence.
- Squad page: players above officials above trials.
- Newsroom lead slot refuses opposition crest artwork.
- Notification badge counts **work only**: 24 → 7, all real. 22 release notes
  moved out of the urgent count.
- Constitution tracked and served with `X-Robots-Tag: noindex`.

**Corrections to earlier claims in this document and the audit:**

- Dashboard reduction reached **38 → 30 visible**, not the 38 → 14 projected in
  `SIMPLIFICATION.md`. Only the safe, reversible part shipped: the Business
  Playbook hero demoted and the Boardroom set moved behind a remembered
  "All tools" disclosure. The six-graphics-tools merge did not ship.
- `fixtures.html` was **already** honest about past fixtures with no score —
  `fxCard` renders "Result to follow". The audit was wrong about that page.
- The Acerbis logo already degraded to a styled text lockup via `onerror` on both
  pages. The audit overstated it as a broken image. It needs artwork, not code.
- Early-bird auto-expiry already existed in `season-tickets.html`.
- Supabase RLS is enabled on **all 24 tables** with no write policies. An earlier
  draft claimed 19 were unprotected; that was a parsing error, not a finding.

**Content dependencies discovered — the club must supply these**
(collected in `docs/CLUB-INPUT-SHEET.md`):

1. Hayes & Yeading (4 Jul) result — public as "Result to follow" for 23 days.
2. Metropolitan Police (25 Jul) and Aylesbury fixtures + results — referenced in
   news, absent from `fixtures.json`.
3. Editorial decision on three articles still saying "this Saturday".
4. `matchday.json` still set to Cockfosters (18 Jul).
5. Squad numbers (0 of 24), photographs (6 missing), bios (0 of 24).
6. Acerbis artwork.

**Deployment lessons:**

- `[skip ci]` is evaluated against the **head commit of the push**, not per
  commit. The tag on `0af0b15` had no effect because it was not head. One push =
  one build regardless of how many commits it carries.
- Production HTML is **not** byte-identical to source — Netlify's Pretty URLs
  post-processing rewrites `href="x.html"` to `href='/x'` and normalises attribute
  quotes. Byte-comparison is not a valid verification method; functional checks
  are. It touches `href` attributes only, never script contents.
- Browser login is not git authentication. Pushing needed a collaborator with
  CLI credentials; a GitHub session in Chrome cannot authorise `git push`.
