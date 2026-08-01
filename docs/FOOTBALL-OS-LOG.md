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
