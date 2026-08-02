# Football Operating System — implementation log

Rolling record of each release gate: what changed, what was proven, how to undo it.

**Rollback point for the whole build:** tag `fos-rollback-gate0` = `066b795`.

---

## Gate 0 — production safety

**SHA in / out:** `066b795` → `066b795` (no code change)

Established the baseline and cut the rollback tag before touching anything.

**Protected — proven in production through a real match (3-3 v Wallingford &
Crowmarsh, 1 Aug 2026) and not to be refactored for tidiness:**

- `js/match-time.js` — the single timezone utility
- `js/live-match.js`, `js/live-config.js` — public live data + rollout switch
- `js/main.js`, `js/club-now.js`, `js/match-centre.js` — public rendering
- `netlify/functions/fwp-sync.js`, `fwp-sync-now.js`, `match-override.js`
- `netlify/functions/lib/fwp-adapter.js`, `fwp-client.js`, `match-store.js`
- Supabase `match_state`, `match_events`, `match_sync_log`
- `data/fixtures.json` (restored after the partial-upsert incident, below)

**Existing migrations:** `20260704000000_rlfc_init`, `20260730000000_matchday_ops`,
`20260801120000_live_match_v2`.

**Environment (names only):** `FWP_SYNC_ENABLED`, `FWP_TEAM_SLUG`, `FWP_SEASON`,
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PIN`, `GITHUB_TOKEN`, `SITE_ORIGIN`.

**Incident fixed before the gate.** The full-time result write-back had reduced
the Wallingford fixture to five fields. `save-data`'s `mergeArray` does
`map[it[idField]] = it` — a whole-record upsert, not a field merge. Every prior
caller was the admin panel, which always posts complete records, so a partial
upsert had never been exercised. Restored from `91d3a30`; the write-back now
sends `Object.assign({}, fixture, {…result})` and refuses any record missing id,
date or opponent. Three regression tests cover it.

---

## Gate 1 — schema and adapter foundation

**SHA in / out:** `066b795` → this commit
**Public behaviour:** unchanged. No `js/`, `css/` or `*.html` file was touched.

### Database — 13 additive tables, nothing altered

`football_teams`, `football_team_aliases`, `football_competitions`,
`football_fixtures`, `football_players`, `football_player_aliases`,
`football_lineups`, `football_lineup_players`, `football_player_match_stats`,
`football_league_tables`, `football_league_table_rows`, `football_sync_runs`,
`football_source_conflicts`.

Deliberate decisions:

- **`match_state` and `match_events` were NOT duplicated.** They are carrying
  live traffic and are proven. A second match-state table would mean two
  competing truths on a Saturday. The registry is built around them; they are
  joined to it in a later gate after shadow comparison.
- **Aliases are rows, not an array**, so each spelling records where it came
  from and how confident we are. That is what makes a bad team match traceable.
- **League tables are snapshots**, so an archived programme shows the standings
  as they were that day rather than as they are now.
- **`source_confidence` on fixtures** — anything below `strong` must never
  silently drive the public site.
- RLS on all 13. Public read on the 9 the website renders; **no policy at all**
  on aliases, sync runs and conflicts, which carry provider URLs and error text.

### Adapter — `netlify/functions/lib/fwp/`

| File | Responsibility |
|---|---|
| `index.js` | the only surface other code may import |
| `normalise.js` | club and player identity keys |
| `parse-fixtures.js` | season fixture list |
| `parse-table.js` | league table |

The proven match parser and HTTP client are **re-exported, not forked** — a test
asserts they are the same function objects.

Two parsing decisions worth keeping:

- The league table is read **from the right-hand end** (`… P W D L, F, A, +/-,
  Pts`). Counting from the left would silently shift every number the first time
  the provider adds a leading column. The tests assert `W+D+L = P` and
  `GF-GA = GD` on every row, which is what actually proves the mapping.
- A **played** fixture reports `kickoff: null`, because the provider reuses that
  cell for the score. Defaulting to 15:00 would overwrite a real 19:45 midweek
  kick-off.

### Proven against real data

- 40 season fixtures parsed, every one with a provider id, no duplicates
- league table: 20 teams, Rayners Lane 10th (P1 D1 Pts1 — today's draw already
  reflected), arithmetic valid on every row
- full-time match: 3-3, 21 events

**Tests:** 14 new in `tests/fwp-layer.test.js`; full suite green.

**Rollback:** drop the 13 `football_*` tables (no existing table is altered, so
this cannot affect the live scoreboard) and delete
`netlify/functions/lib/fwp/`. Nothing imports it yet.

### Known, carried into Gate 2

The FA Cup tie against London Lions is `facup-ep-london-lions-20260808`
internally but `571321` at the provider. Reconciliation must match on more than
the id prefix.

---

## Gate 2 — season registry and reconciliation (shadow)

**SHA in / out:** `8b38fad` → `8df3efa`
**Public behaviour:** unchanged. No `js/`, `css/` or `*.html` touched;
`data/fixtures.json` not written; the live scoreboard untouched.

### Result, verified in production

| | |
|---|---|
| Provider fixtures | 40 |
| Club fixtures | 40 |
| Matched | **40** — 38 on the provider's id, 2 by strong agreement |
| Unmatched either side | 0 |
| Critical conflicts | 0 |
| Registry rows | 22 teams · 3 competitions · 40 fixtures |
| Runtime | 2.3s (was 26.1s) |

The two `strong` matches are the FA Cup and FA Vase ties, whose internal ids
(`facup-ep-london-lions-20260808`) predate the provider import and carry no
provider id. They matched on date + opponent + venue together.

Kick-offs are stored as absolute instants: `2026-08-01T14:00Z` = 15:00 BST,
`2026-08-04T18:45Z` = 19:45 BST.

### The rule

An external id is an identity; everything else is a guess. `strong` requires
date **and** opponent **and** venue to agree — three independent facts. Refused
outright: home/away disagreement (accepting it inverts the scoreline), two
fixtures on one day against the same club, a different opponent on the same
date, and one internal fixture claimed twice.

Nothing overwrites a fact. Disagreements become rows in
`football_source_conflicts` for a human.

### Two defects found and fixed inside this gate

**A completed match hides its score in brackets.** The provider rewrites the
cell a second time at the end: `"3 - 1"` while playing becomes `"(2) 3 - 3 (1)"`
once final — full time, with each side's half-time score bracketed. The regex
required a bare score, so a finished fixture parsed as *not played* and its
result was dropped. That also made the first "zero conflicts" report hollow: it
compared nothing, because it had no score to compare. Now handled, and the
half-time score is captured as a by-product.

**26.1 seconds against a 26-second ceiling.** Two team lookups, a competition
lookup and a write per fixture — ~160 sequential round-trips. Now three parallel
reads, one batch per entity type, one batched fixture write.

### Tests

28 new across `tests/fwp-layer.test.js` and `tests/football-reconcile.test.js`,
run against the real 40-fixture season. Full suite: **234 pass, 0 fail.**

A mid-match capture (2-1) is kept deliberately as a fixture so conflict
detection is *proved* rather than asserted — it raises both score fields against
the final 3-3 while still matching the fixture.

**Rollback:** truncate the `football_*` tables and delete
`netlify/functions/football-sync-season.js` + `lib/football/`. Nothing public
reads any of it.

**Next:** Gate 3 — match state, events and line-ups into the registry, in
shadow, compared against the live `match_state` that is already working.

---

## Gate 3 — match state, events and line-ups (shadow)

**SHA in / out:** `0ee9fc8` → `5e6369d`
**Public behaviour:** unchanged.

### Two jobs, treated differently

**Line-ups and players are written for real** — nothing in production stores
them, so there is nothing to conflict with.

**Match state and events are NOT written a second time.** `match_state` and
`match_events` already work and carried a live match. This gate builds the rows
it *would* have written and reports the difference. Two systems writing a score
on a Saturday is the failure the architecture exists to prevent.

### Parity, verified in production

| | |
|---|---|
| Match state | **identical** |
| Events | 21 live vs 21 shadow — **identical** |
| Line-ups | 16 + 16 written, 0 unresolved |
| Players | 32 created, all `provisional` |

### Three defects found inside the gate

**Rayners Lane fielded ten men.** `class="playing"` means *on the pitch right
now*, not *started* — the provider drops it when a player is withdrawn **and**
when one is sent off. So Le'Kai Chevannes (started, booked 45+3, off on 70) was
filed as a substitute, and Beau Pryce (started, dismissed on 30) as an unused
substitute. The timeline settles both: whoever is named as REPLACED was on the
pitch, whoever came ON was not in the eleven, and anyone who scored, was booked
or was dismissed was plainly playing. Now **22 starters (11 each), 9 used
substitutes, 1 unused**.

This matters well beyond the line-up page — appearances and minutes are built on
these roles, so a withdrawn captain would have gone down as never having started
all season.

**Minutes were computed and thrown away.** `entered_minute` / `exited_minute`
were derived, attached to the row and silently dropped: the columns did not
exist and PostgREST ignores fields it has no column for. No error. Columns added;
18 players now carry the minute they came on or off.

**A wait-loop that invoked what it was waiting for.** Polling the sync endpoint
until it returned 200 *ran the sync*, so the measured call was the second run and
reported "0 players created" on what looked like a first run.

### Player identity

A provider name is not a person. A name resolves only on an exact key within the
**same club**. A matching name at another club returns
`name_used_at_another_club` and creates nothing; a similar name is a new person,
never a fuzzy merge. Everything new lands `provisional` or `needs_review` — never
`confirmed` from a provider string.

**Tests:** 17 new. Full suite **251 pass, 0 fail**.

**Rollback:** truncate `football_lineups`, `football_lineup_players`,
`football_players`, `football_player_aliases`; delete
`netlify/functions/football-sync-match.js` and `lib/football/match-ingest.js`.
No public consumer reads any of it.

**Next:** Gate 4 — migrate the fixtures, results and league-table consumers onto
the registry, after parity proof.

---

## Gate 4 — fixtures, results and league table migrated

**SHA in / out:** `d9c29e4` → `7a31585`
**Public behaviour:** changed, deliberately and verified — see below.

### Consumer inventory (before)

| Consumer | Was reading | Now |
|---|---|---|
| homepage next/previous | `data/fixtures.json` via `rlfcFixturesShape` | registry via `football-data` |
| homepage league position | `window._rlfcTable` — **never assigned by anything** | registry |
| fixtures page table | **Wikipedia** (`fetch-table.js`) | registry snapshot, Wikipedia as fallback |
| fixtures page schedule | `data/fixtures.json` | unchanged this gate (rollback source) |
| programme | `data/fixtures.json` + Wikipedia | Gate 6 |
| Match Centre | `match_state` | Gate 5 |

### Two things that were quietly broken

**The league-position tile has never worked.** `js/club-now.js` reads
`window._rlfcTable`; nothing in the codebase has ever assigned it. Because the
tile hides itself rather than showing a fake zero, the failure looked like a
design decision. It now reads the registry — and still hides if that answers
with nothing. **Live: "10th POSITION".**

**The league table came from Wikipedia.** Accurate today — both sources were
compared before switching and agreed exactly (Rayners Lane 10th, P1 D1 GF3 GA3
Pts1 after the 3-3) — but a page anyone may edit is not the competition's own
record, and nothing validated season or division.

### New

- `netlify/functions/football-sync-table.js` — validates, maps rows to real
  teams, stores a **snapshot** so an archived programme keeps its own matchday
  standings. Refuses to replace a good table with a bad one; an identical table
  does not stack a duplicate.
- `netlify/functions/lib/football/read.js` — the one place that answers next /
  current / previous / form / table.
- `netlify/functions/football-data.js` — one public URL for every surface.
- `js/football-data.js` — the public client. A failed read returns null and the
  caller keeps what it had; it never looks like "no fixtures".

### "Next" and "now" were the same function

They shared a 150-minute grace window, so a match **in progress** was still
offered as the next match — the same class of error that had the hero counting
down to a fixture that had finished. `nextFrom()` is now strictly future;
`currentFrom()` owns the in-play window. A test asserts the handover has no gap
and no overlap: a gap blanks the hero, an overlap shows a countdown beside a
live score.

### Verified in production, in America/Los_Angeles

```
next      2026-08-04T18:45Z  Broadfields United v Rayners Lane (away)
previous  2026-08-01T14:00Z  Rayners Lane 3-3 Wallingford & Crowmarsh
programme 2026-08-11         v Hilltop   ← skips the away league game AND the away cup tie
form      D 3-3
table     10th of 20, P1, Pts1
counts    40 fixtures, 1 played
hero      NEXT MATCH · Broadfields away · 02 Days 14 Hrs
strip     10th POSITION | D 3–3 LAST v WALLINGFORD | D LAST 1
```

**Checked, not assumed:** the Broadfields away fixture shows Tithe Farm as its
venue. That is correct — Broadfields United groundshare there. Both entries are
`verified` in `data/venues.json`.

### Tests

15 new in `tests/football-read.test.js`, covering the failures this site has
actually had. Full suite **266 pass, 0 fail**.

**Rollback:** revert `7a31585` — the homepage tile returns to hidden and the
fixtures table to Wikipedia. `data/fixtures.json`, `fetch-table.js` and every
legacy reader remain in place and untouched.

**Next:** Gate 5 — Match Centre, homepage live/current/next lifecycle, full-time
hold and archived match navigation.

---

## Gate 5 — one permanent page per fixture

**SHA in / out:** `a69ed31` → `6d42d71`
**Public behaviour:** changed and verified.

`match-centre.html?id=fwp-578225` is that match's page forever. Upcoming, live
and finished are three **states of one page**, not three pages — a link shared
before kick-off is the same link that shows the live score and the same link
that is still the club's record of the game next season.

With no id it shows whatever is happening now, then the most recent result, then
the next fixture.

### Verified in production

**Finished match** (`fwp-578225`): FULL TIME, 3–3, 21 events, both line-ups
(16 and 15 rows — XI plus used substitutes, unused correctly excluded),
referee, navigation to Broadfields. Zero provider markup, zero iframes.

**Upcoming match** (`fwp-578227`): UPCOMING, Tue 4 Aug 19:45 UK, Broadfields
home with the AWAY badge on us, live countdown, navigation both ways.

### Honest states

Kicked off with nothing reported says **"Awaiting live update"** rather than
inventing a match or running a countdown past zero. A live match unheard from
for three minutes says **"Updates delayed"**. Postponed, cancelled and abandoned
each say so. Polling continues only while a match is live or stalled — a
finished match is finished.

The programme block is a **sentence, not a button**, before publication:
*"Digital programme available once today's official teams are confirmed."* A
control that leads nowhere is worse than an explanation.

### One defect, found by looking

The countdown rendered as a vertical list. It reused the homepage's
`cn__countdown` classes, whose CSS lives in `css/club-now.css` — a stylesheet
this page does not load. The markup was correct and completely unstyled. Now
owned by the page that renders it.

Worth noting for future gates: `/css/*` is served
`stale-while-revalidate=86400`, so a CSS change needs one revalidation cycle
before a returning browser sees it. The fix looked broken for one load.

**Tests:** full suite 266 pass, 0 fail.

**Rollback:** revert `78175df..6d42d71`. The homepage, live bar and the
scoreboard pipeline are untouched by this gate.

**Next:** Gate 6 — the automatic home-match programme, its publication gate on
confirmed line-ups, and the permanent archive.

---

## Gate 6 — matchday programme (part 1 of 2: engine)

**SHA in / out:** `8b2603f` → `900d603`
**Public behaviour:** unchanged. Nothing publishes until a home matchday with
two confirmed elevens, and the next home fixture is 11 August.

### Built and proven

| Piece | State |
|---|---|
| `programme_editions` + `programme_versions` | live in Supabase, RLS restricted |
| `lib/programme/publish-rules.js` | the one publication decision |
| `lib/programme/generate.js` | assembles a full programme from club data |
| `programme-sync.js` | scheduled hourly, generates and publishes |
| `programme-sync-now.js` | PIN-gated button version |
| `programme-data.js` | public read, published editions only |
| Match Centre link | wired to real publication state |

### The two rules that carry the feature

**Home only, from the registry.** Our canonical team id must equal
`home_team_id`. Never venue text — Broadfields groundshare at Tithe Farm, so
"the venue is Tithe Farm" does not mean we are at home. A test asserts exactly
that. The override for a neutral-venue final is off by default and still checks
the line-ups are the right way round.

**Both elevens or nothing.** It publishes when the provider confirms two
elevens for THIS fixture — minutes before kick-off if that is when teams are
released, and immediately after kick-off if they arrive late.

Matchday is the **club's** day: 22:00 Pacific on Friday is already Saturday in
Harrow.

The line-up gate refuses ten or twelve starters, duplicates, someone listed as
both starter and substitute, an unconfirmed line-up, two line-ups for the same
team, and a line-up carried over from the previous match. It protects the Gate 3
correction — a substituted or dismissed player is still a starter.

### What the generator will not do

Attribute generated copy to a real person (the Chairman's name on words he did
not write devalues every genuine word in the edition), invent opposition history,
show a league table for a cup tie, or invent a sponsorship package or price.

**What it does block on:** an empty staff page or an empty sponsors page.

### Immutability

Publication writes a **version** holding the payload, line-ups, table, sponsors
and staff exactly as they were. The edition does not point at current club data;
it owns a frozen copy, so next season's committee cannot appear in this
season's programme.

### Repeated mistake, caught earlier this time

`programme-sync` is scheduled, and Netlify returns **403** to any direct HTTP
call on a scheduled function. I hit this with `fwp-sync` earlier in the build
and only found it by curling the deployed endpoint. This time the companion was
written at the same time — but I still deployed the scheduled function first and
got the 403, which is why it is worth recording.

**Tests:** 43 new (28 publication, 15 generation). Suite **309 pass, 0 fail**.

### Remaining in Gate 6 (part 2)

The reader page, the cover-led archive library, and the portal programme panel.
The engine is complete and scheduled; these are the surfaces that display it.

**Rollback:** revert `e42f2ed..900d603` and drop `programme_editions` /
`programme_versions`. No public surface reads them yet.

---

## Gate 6 — matchday programme (complete)

**SHA in / out:** `2dbe208` → see below
**Public behaviour:** the programme library and reader routes are live. **No
edition has published** — the next eligible home fixture is 11 August v Hilltop.

### Surfaces

| Route | Purpose |
|---|---|
| `programmes.html` | the collection — featured edition, seasons, filters |
| `programme.html?id=…` | the reader, one published edition |
| `match-centre.html?id=…` | sentence before publication, button after |
| portal Match Day panel | monitoring, plain words only |

### Verified against real data, privately

A **private design preview** built from the stored Wallingford match — never
published, and deleted after inspection, because claiming a programme existed
that day would be a lie about the club's own history.

```
10 sections    welcome · opposition · staff · sponsors · table ·
               fixtures · join · history · squads · full time
table          20 teams, Rayners Lane and the opposition both highlighted,
               8 scoped column headers
squads         11 starters per side, both crests
headings       one h1, ten h2 — correct hierarchy
overflow       none
```

### Decisions worth keeping

**Covers are composed in CSS, not rendered as images.** Crests stay sharp at any
size, the text stays selectable and readable by a screen reader, and a 200px
thumbnail is legible without a second pipeline. Container queries size the type,
so one cover works as a card and as a hero.

**The reader makes exactly one request** — the immutable stored version — and a
test asserts it. An archived programme that reached for current sponsors or the
current table would quietly rewrite the past.

**The empty library is honest.** "The collection starts soon", with a real
explanation. No fake editions, no lorem, and no backfilling a historical
programme to make the shelf look full.

**Nothing costs anything.** No prices, no locks, no carts — with a test
enforcing it.

### Two things caught while building

The Match Centre said *"today's official teams"* days before the match, which
reads as though the programme is late rather than not due yet. Now matchday-aware,
decided in Europe/London.

My own Release 3 SEO test caught `programme.html` shipping with **no `<h1>`** —
I had removed the page header. Restored as real served HTML rather than a
heading written by JavaScript.

### Cache

Handled up front this time. Versioned asset references on both pages, service
worker bumped `rlfc-v9` → `rlfc-v10`, and a test asserting both. Gate 5 lost a
cycle to a stale stylesheet.

### Access control

Two locks. RLS restricts `programme_editions` and `programme_versions` to
published and archived states; the endpoint filters again. A draft returns
**404 with no hint it exists** — verified in production against the Hilltop
draft.

**Tests:** 323 pass, 0 fail.

**Rollback:** revert `2dbe208..HEAD`; drop `programme_editions` and
`programme_versions`. `programmes.html` and `programme.html` return to their
previous form.

### Remaining, deliberately deferred

Legal footer wording still needs verification against the current FA Handbook
and Combined Counties rules — the versioned footer mechanism exists and is
empty rather than carrying unverified claims. PDF export untouched.

---

## Gates 7 & 8 — players, and one system

### The problem Gate 7 exists for

The provider gives us names as text. Two players share a name; one player is
spelled six ways across a season; a Rayners Lane shirt and an opposition shirt
can carry the same surname on the same afternoon.

A pipeline that guesses fails **silently**. No error, no log, no symptom — until
a player notices his appearance count is short, and by then three seasons have
been built on it. That single property drove every decision here.

So identity has states and the pipeline may only propose:

- an exact name inside the **same club** is a match; nothing else is
- nothing crosses a club boundary, ever
- an initial is offered for review, never resolved
- a rejected suggestion is never offered again
- the **database** refuses a public slug on anything unconfirmed, rather than
  trusting every future endpoint to remember

Every decision is signed and kept in an audit the public key cannot read.

### Statistics: recomputed, never counted

A counter is the obvious way to build appearances and goals, and it is wrong for
a reason that only appears months later — a counter cannot follow a correction.

Everything is rebuilt from the match records each run. A committee member's
correction is the one thing that outranks the rebuild rather than being undone
by it.

Three rules, each now a test named after it:

```
AN UNUSED SUBSTITUTE HAS NOT PLAYED.
AN OWN GOAL IS NOT A GOAL FOR THE SCORER.
A STARTER WHO LEAVES THE PITCH STILL STARTED.
```

**Minutes are withheld rather than estimated.** On the squad card and the
profile the Minutes tile simply disappears. A season containing one match whose
substitutions were never recorded has no defensible total, and a squad page
reading "63 minutes" when it is guessing is worse than one saying nothing.

### Gate 8 — the things that had no owner

**The registry had no timer.** The season list, the table, the line-ups and the
player records only moved when somebody pressed a button — which works exactly
as long as somebody remembers. `football-registry-sync` now runs every twenty
minutes, four independent steps, each allowed to fail alone, inside a time
budget.

**Scheduled functions are now a rule, not a habit.** Netlify returns 403 to
direct HTTP, and this project has shipped a button wired to one twice — the
button responded, a toast appeared, nothing ran. `tests/scheduled-functions.js`
requires a companion for every timer, forbids browser code from naming one, and
proves the flag-off path by running the timers with `fetch` stubbed to throw
rather than by reading the source and hoping.

**The homepage and the fixtures page were still reading the legacy file.** Both
now ask the registry first. The countdown is anchored on the fixture's absolute
instant through `MatchTime` instead of being rebuilt from two strings — the
shape of the bug that showed Los Angeles a countdown to a match at 89 minutes.
Where a page needs the day rather than the instant it derives it in
Europe/London; slicing the front off an ISO string returns the UTC date, which
is the wrong day after 11pm BST.

**The hand-entered scoreboard is folded away in red.** It still works — it is
what the club used before the feed — but an open pair of + buttons beside a feed
already writing the score is an invitation to two writers on a Saturday. It now
tells the operator the one thing that makes it work: take manual control first,
or the next check overwrites you.

**A health view.** Everything else reports its own success, which cannot tell
you something has stopped: a timer that fails silently looks exactly like a
timer with nothing to do. One line, which part, how long, and the provider's own
error text rather than a paraphrase nobody can act on.

### A whole season, offline

`tests/season-simulation.test.js` plays forty matches from a fixed seed —
substitutions, dismissals, own goals, initials — and asserts what has to survive
all of it. Fixed seed on purpose: a failure in a random season is a coincidence,
and a coincidence cannot be debugged.

### Left undone, deliberately

The programme's legal footer is still empty. `legal_version` exists; there is no
wording behind it, because the current FA Handbook and Combined Counties rules
have not been read from their primary sources. An absence is visible; a
plausible fabrication is not.

### What production found that the tests did not

Three defects, all discovered by opening the deployed site rather than by
reading the code. All three were introduced or exposed by this release.

**The two pages disagreed about kick-off.** The home page read the registry and
said "Tue 4 Aug · 7.45pm" for Broadfields. The fixtures page read the same
registry and said "Tuesday 4 August · 15:00". My adapter carried the date across
but not the time, and the renderer fell through to `f.kickoff || '15:00'`.

That fallback is not a default. It is a claim, printed in the club's voice, and
for a Tuesday night game it was wrong. Both surfaces now derive the ground's own
clock from the absolute instant, and an unknown kick-off says "Kick-off TBC".
The club confirmed the pattern independently: Saturdays 15:00, Tuesdays 19:45 —
which is exactly what the page shows now and could not have shown before.

**A timer can erase what a button never got the chance to.** The season upsert
replaces whole rows. That was tolerable while somebody pressed it occasionally.
On a twenty-minute schedule, one provider response omitting a kick-off or a
venue would blank it — and the next run would blank it again, so nobody would
ever catch it happening, only notice the absence weeks later. The kick-off, the
venue and the club's own fixture id are now carried forward when the incoming
row is silent, and each run says how many facts it declined to erase.

**A failed step reported as green.** The underlying handlers answer HTTP 200
with `{ok:false}` rather than throwing — correct for an HTTP caller, wrong for
one that delegates to them. A run in which nothing worked would have shown four
successful steps. That is the precise false reassurance the health view exists
to remove, so it would have undermined the thing built alongside it.

### Verified in production

- Schema applied: 6 identity columns, 9 statistic columns, 3 new tables, the
  public-slug check constraint, one public policy on season totals and **zero**
  on the decision log.
- `?what=player&p=beau-pryce` → **404**. No confirmed identity, no page, even
  with the slug guessed correctly.
- Both portal endpoints refuse without a sign-in. `football-registry-sync` over
  HTTP → **403**, which is why the companion exists.
- Fixtures page: 40 fixtures from the registry, every one carrying a kick-off,
  Wallingford 3-3 correct.
- Match Centre `?id=fwp-578225`: 3–3, 31 line-up rows, Le'Kai Chevannes shown as
  a starter withdrawn on 70' — the case the provider's markup makes look like an
  unused substitute — and **zero linked names**, because nobody has been
  confirmed yet. Exactly the specified behaviour.

---

## Incident: every opponent crest disappeared

Reported by the club. Severity: visible on the two most-read pages.

### Root cause

`football_teams.crest_asset_path` was declared in the Gate 1 registry with the
comment *"OUR artwork, from data/crests.json"* — and **no code ever wrote it**.
It was null for all 22 clubs from the day the registry was created.

That was invisible for as long as the public pages read `data/fixtures.json`,
which carries `oppCrest` for all 40 matches. In Gate 8 the home page
(`d9cf65d`) and the fixtures page (`efae949`) were migrated to read the registry
**first**, and the adapters dropped the field: `fxFromRegistry` never set
`oppCrest` at all, and `club-now`'s `fromRegistry` read `f.awayCrest`, which was
null.

Both pages then drew their **initials placeholder** — which is correct behaviour
for a club we genuinely hold no artwork for.

**That is why nobody noticed. The failure rendered as a design decision.** A
broken image would have been louder and far less damaging.

### Why the tests did not catch it

422 were passing. Not one asserted that a club the site is about to draw has
something to draw. The tests checked that the resolver *had* a fallback; none
checked that the fallback was not being used for all 21 opponents at once.

### Why the health view did not catch it

It reported everything green. It could not see the problem because it never
looked at crests at all.

### Blast radius

| Surface | Affected | Why |
|---|---|---|
| Home page next match / last result | **Yes** | migrated to the registry |
| Fixtures page (80 crest slots) | **Yes** | migrated to the registry |
| Programme covers, reader, library cards | **Yes** | read `crest_asset_path` |
| Match Centre | **No** | had its own resolver, reading the club library by name |

The Match Centre surviving is the whole lesson: the one page that resolved from
the club's own artwork by club name, and verified the asset before drawing it,
was untouched. Six pages had improvised six resolvers; five broke.

### Fix

One resolver, `js/crest.js`, built from the Match Centre's surviving logic and
used by every surface. It never returns null, an empty string or a guessed
filename, and never emits an `<img>` for an asset it has not proven loads. A
club with no artwork gets a shield that **declares itself**, so a fallback can
never again pass as a crest.

Data path: the registry is populated from the club's library, a null can never
overwrite approved artwork, and the crest is kept out of the merge-duplicates
payload entirely — so a bad minute at the CDN cannot become permanent loss.

Health: crests are now a subsystem of their own, and the view names the clubs
that are missing one rather than reporting a count.

### Found while fixing it

**`A.F.C. Hayes` and `AFC Hayes` normalised differently.** A trailing `\b`
cannot match after a full stop, so one club would have become two teams with two
crest lookups. Fixed on both sides and verified against all 27 club names the
site holds: not one existing key moves. The `AFC`-stripping collision between
`AFC Hayes` and a bare `Hayes` is now a **documented, tested** latent trap
rather than a silent one.

**An edition could publish with a blank cover.** The reader is snapshot-only by
design, so whatever artwork an edition publishes with is what it shows for ever.
The registry backfill runs every twenty minutes and the programme sync hourly —
an edition could publish in the gap and carry two grey letters permanently. The
sync now settles artwork before it generates anything.

**The library called a played match "today".** A recovered edition is not
archived, so a state check labelled yesterday's programme *"Today at The Lane"*.
"Today" is now decided from the kick-off instant in Europe/London.

### Verified not damaged

40 fixtures: zero nulls across opponent, home/away, venue, competition, status,
kick-off, teams and ids. Zero mismatches against the club's own record. 20
league-table rows all mapped. 0 open conflicts. **The crest was the only
casualty** — nothing was erased, a reader moved to a source that had never held
one specific field.

---

## Incident: no programme for the Wallingford match

`decide()` could only publish ON matchday. Any fixture whose day passed without
publication fell into `WAITING_FOR_MATCHDAY` and stayed there for ever, waiting
for a date in the past.

That is the shape of every real failure — a deploy landing after the teams are
out, late line-ups, an outage across kick-off. The programme was not late; it
was **unreachable**.

### Recovery lifecycle

Inside 48 hours of full time the engine publishes it itself, dated honestly and
labelled as having come after the whistle. Outside that window nothing is
manufactured: the edition becomes a candidate a **named human** authorises,
because a timer producing programmes for matches played months ago would be
inventing a history the club never had.

`published_at` is **always the real moment**. A test asserts it can never be
derived from the fixture.

`isFinal` was hardcoded `false`, so no edition could ever be enriched with the
result it was published alongside. Full time is now captured **into** the
edition rather than read live — otherwise an archived programme would show the
current score the moment the next match kicked off.

### The programme incident had SIX causes, not one

Getting one edition published took six separate defects out of the way. Each was
invisible on its own, and every one of them presented as the same symptom —
"waiting for matchday" — which is why none had ever been found.

**1. Publication could only happen ON matchday.** Any fixture whose day passed
waited for a date in the past, for ever. Fixed by the recovery lifecycle.

**2. `loadJson('committee')` fetched `/data/committee` — no `.json`.** That
404s. So committee and sponsors were always null, `staffGroups` and
`sponsorTiers` always empty, and both are MANDATORY sections. **The engine had
never been able to publish anything since it was written.** My Gate 6 report
called it complete. It was not, and I had no evidence that it was.

**3. The decision used the PREVIOUS run's content validity.** `decide()` reads
`edition.mandatory_content_valid`, and `edition` is the row as it was before the
run. A programme that had just become complete was judged on a stale answer.
Publication was permanently one run behind.

**4. An automatic withhold latched the edition shut for ever.** `decide()`
treated `withheld_reason` as "a human said no" — the same field the sync writes
for ordinary technical reasons. Once written, every later run returned at the
first guard, wrote the reason back with another `withheld: ` in front, and never
re-evaluated. Four stacked prefixes is what gave it away.

**5. `publication_source = 'recovery'` violated a check constraint.** That
column has existed since Gate 6 and allows only
`automatic|emergency_teamsheet|manual`; the new values belong in
`publication_source_detail`. The whole run aborted with a Postgres 23514 and,
from a supporter's point of view, nothing happened at all.

**6. The public filter had never matched anything.** PostgREST's `in.()` takes
BARE values — single quotes become part of the value. So
`state=in.('archived', …)` looked for a state literally equal to the quoted
text. Nobody could tell, because no edition had ever published to exercise it.
The moment one did, the endpoint said *"no published programme for that
fixture"* about a programme sitting right there, published, with its version and
its full-time snapshot.

Two more found in verification: every edition shared one canonical URL, and the
library called a played match "Today at The Lane".

### The pattern

Every one of these failed **silently and legibly**. A 404 returning null looks
like an empty section. An initials shield looks like a design decision. "Waiting
for matchday" looks like patience. A filter that matches nothing looks like
nothing to show.

Not one of them raised an error, and 477 tests were green throughout, because
every test asserted that the code *had* a fallback and none asserted that the
fallback was not being used for everything at once.

The tests added by this incident assert the opposite thing: not "is there a
path" but "is the real path being taken" — every active club has a crest, the
publication filter matches a real published row, every column the sync writes
exists and accepts the value it is given.

---

## Closeout

### The site fitted no screen it was ever shown on

Fourteen navigation links, all `white-space: nowrap`, need 1384px of row on
their own. With the badge and the two action buttons that is about 1950px — so
the bar overflowed the page by **533px at 1440** and **293px even at 1920**. It
had been that way since the fourteenth link was added.

Nobody saw it because `body { overflow-x: hidden }` was **clipping** it. That is
not a fixed layout, it is an invisible one: the Fixtures button and part of the
menu were unreachable rather than merely off to one side.

Every overflow found was the same defect in four costumes — a child that cannot
shrink below its content width:

| Where | Why |
|---|---|
| `.nav__links` | flex child, `min-width: auto` → 1384px row |
| `.bnav__item` | flex child, `min-width: auto` → 506px bar in a 375px phone |
| `#cookie-banner` | text block pinned at `min-width: 200px` |
| `minmax(310px,1fr)` | a HARD grid floor → 310px track in a 272px container |

26 track floors across 16 files are now `minmax(min(Npx,100%),1fr)`: the same
layout wherever it fits, giving way only where it genuinely cannot.

### What measurement caught that reasoning did not

The first set of tier breakpoints was **estimated** and clipped "Fan Zone" to
"FA" at 1440. Measuring showed why: `.nav__i` was capped at 1340px, which capped
the link row at **728px** regardless of screen width — so tiers designed to
appear at 1650px could never fit. The container now uses `min(1600px, 100%)`,
the breakpoints are measured, and tier 5 never appears in the bar at all
because its four links need 1190px and the row tops out at 996px.

A link clipped mid-word reads as broken software. It is worse than the same link
living in the menu.

### Two things the screenshots caught

The **menu was `display: none` above 900px** — correct while it was mobile-only,
and a serious regression the moment nine routes moved into it. On a laptop the ☰
would have opened nothing.

The **accessibility launcher sat on top of the cookie Accept button**. A consent
control partly covered by another control is the one place on a site where that
must never happen.

### Legal footer — the actual answer

FA *27 — Standardised Rules* (FA Handbook 2025-26), checked 2 August 2026,
"mandatory … at Steps 1 to 6 inclusive". Rayners Lane are Step 5.

**Rule 2.15** requires the club's legal name, form and any identifier to appear
*"within the Club's official matchday programme"*. A real requirement, never met.

**Rule 8.14** requires the programme to exist, says a team sheet is not enough,
allows electronic-only **only with Board approval obtained before the season**,
requires the visiting club's squad details to be carried, and a copy to the
Competition Secretary within three days.

Two deliberate absences. **No disclaimer**, because Rule 8.14 states clubs are
responsible for their programme's comments *"notwithstanding any disclaimers to
the contrary"* — printing one would mislead rather than protect. **No legal
form**, because the club has never published one; "unincorporated association"
would very likely be right, and a very likely guess printed as a legal statement
is exactly what this project does not do.

### Smoke checks that test the outcome

Hundreds of tests were green while every crest was missing and the programme
engine had never published anything, because they asserted a fallback *existed*.
`tools/smoke.js` and `tools/viewport-check.js` check a running site and take a
URL, so they run against a preview before a release and not only after one.

---

## Supporter membership, programme access and cookie consent

### The cookie banner was theatre

Google Analytics loaded at parse time on every page. Decline set a localStorage
flag and removed the banner. **A supporter who pressed Decline was measured
exactly as much as one who pressed Accept.**

That is worse than having no button at all: it recorded a choice, and honoured
nothing, so a supporter who wanted out believed they were out.

Nothing analytics-related is now fetched before an explicit yes. Consent Mode
defaults to denied before anything Google could execute, Accept loads it once,
and withdrawal stops it and clears what this origin can clear. Proved with the
browser's own network log — `tools/consent-check.js`, 14 checks, in production —
not by reading the code and believing it.

Declining breaks nothing. Fan Zone, login and programme access never consult
analytics consent, and a test enforces that they never start.

### One supporter, one record

A supporter could exist three times over: a `fans` profile, a HubSpot lead fired
at signup, and the footer newsletter form. Nothing joined them, so the same
person joining twice became two people and their loyalty history split between
them.

Everything now keys on the **normalised email**. `fans` is untouched — it holds
the Lane Cards supporters already have, and rewriting it would put existing
membership numbers at risk. `fan_members` sits alongside it and carries what the
Lane Card was never designed to hold: consent, attribution, activity.

An existing record is **claimed, never duplicated**, and the Lane Card number
carries across so nobody's membership number changes underneath them.

### The gate is on the server

The complete programme is decided server-side, before the payload is assembled.
A logged-out request receives the cover, the fixture and the score — enough to
want it — and nothing of the edition.

The subtle half is the cache. `public, max-age` on a body that varies by
`Authorization` is how one member's entitled copy gets handed to the next
logged-out visitor by the CDN: the gate holds in the function and leaks at the
edge. Member responses are `private, no-store` with `Vary: Authorization`.

### Legal identity

The site said the club was *"a fully integrated members section of Tithe Farm
Sports & Social Club LTD"* — in the homepage meta description, the About page,
the footer, the ticker, the portal and the print programme. That is not the
operating entity.

Now, consistently: **Rayners Lane Football Club**, operated by **Rayners Lane
Football Club Limited, Company No. 17110511**. Tithe Farm remains where the club
plays and where its history is; only the legal claim changed.

That also completes FA Standardised Rule 2.15, which the previous release had to
leave incomplete because the club had not published a legal form.

### Copy that no longer promises what the club does not do

The shop advertised a printed programme *"available at every home game"* and
*"at Tithe Farm on match day"*. The club publishes a digital edition. Promising
print is a promise to a supporter who turns up expecting one.

---

## 2 August 2026 — Fan Zone completion: a correct gate in front of a door nobody could reach

The previous release was verified and the verification was worse than the report.
The programme gate was genuinely secure — logged-out requests got metadata and
nothing else, drafts 404'd for everybody, cookie decline genuinely blocked
analytics. And **no supporter could become entitled**, so the gate's correct
answer was always "no".

**Two independent blockers, either one sufficient.**

1. Five of the six pages that loaded `fan-session.js` did not load the Supabase
   library or the config that file needs. `SB` was silently `null`, no token was
   ever attached, and every member looked like a stranger.
2. `SUPABASE_ANON_KEY` was never set in Netlify, so token verification went out
   with `apikey: ''` and GoTrue answered `401 No API key found`. **Every** token
   was rejected, valid ones included. This was not in the verification report —
   it was found in Phase 0 of the fix, and fixing (1) alone would have opened
   nothing.

Both failed **closed**. That is why 550 tests passed while the feature did not
work: every test asserted that a fallback existed, none asserted the real path
was taken. Same shape as the crest incident and the `loadJson('committee')` 404
— silent, legible, and indistinguishable from working.

### What changed structurally, not just behaviourally

- **`js/fan-boot.js`** — one entry that fetches its own dependencies. A page
  cannot load the session API without them, because the file loads them itself.
  `tests/fan-dependencies.test.js` makes the old arrangement uncommittable;
  `fan-health.js` checks the *served* pages at runtime.
- **`fan_ensure_membership()`** — identity, Lane Card linkage, number, marketing,
  attribution, activity and the notification event in ONE transaction. There is
  no longer a sequence of writes in which to fail halfway.
- **Lane numbers from a sequence**, skipping anything already issued, plus the
  unique index the last release was missing. The old `1000 + random()*9000` with
  no constraint would have collided at a few dozen members.
- **A notification outbox**, not a `fetch()`. A mail failure cannot roll back a
  membership or make a supporter wait.
- **Health that refuses to call a closed gate healthy.** `fan-health.js` fails if
  a programme is published and nobody is an active member, and has a dedicated
  check for the missing-api-key fault.

### Proof

The membership transaction was run against the **real production schema** inside
`begin; … rollback;`. It linked the existing supporter (`linked_existing: true`),
**preserved their Lane number 4500** rather than issuing a new one, wrote the
`account_created` activity, and queued `member_linked` with dedupe key
`member_linked:2` to info@raynerslanefc.co.uk. Then it rolled back: members 0,
activity 0, outbox 0, marketing 0, sequence still at 1000. Production untouched.

### Still outstanding — and honestly outstanding

The final inbox click. Three owner actions gate it: a `RESEND_API_KEY` in
Netlify, a verified sender domain, and confirming Supabase's magic-link email
setting (`mailer_autoconfirm` is currently `true`). Until then the club's
notifications queue durably and send the moment the key exists — which is the
whole point of the outbox.

**The lesson, again, in one line:** a system that fails closed cannot be trusted
to tell you it is working. Something has to prove a supporter can get *in*.
