# The football system — maintainer's notes

For whoever works on this next. It assumes you can read the code; what it gives
you is the reasoning that the code cannot, and the traps that cost real time.

---

## Shape

```
Football Web Pages  ──►  netlify/functions/lib/fwp/*        parse, validate
                              │
                              ▼
                    football_*  registry tables             one place facts live
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        football-data    programme-sync   football-players
        (public read)    (matchday)       (identity, portal)
              │
              ▼
        js/football-data.js  ──►  every public page
```

**One writer per fact. One reader per surface.** Both are enforced by
`tests/one-system.test.js`, which will fail if a second writer of `match_state`
appears or a page reaches a legacy endpoint before the registry.

## The timers

| Function | Cadence | Companion for humans |
|---|---|---|
| `fwp-sync` | `* * * * *` | `fwp-sync-now` |
| `football-registry-sync` | `*/20 * * * *` | `football-registry-sync-now` |
| `programme-sync` | `7 * * * *` | `programme-sync-now` |

**Netlify returns 403 to any direct HTTP request for a scheduled function.**
This project shipped a button wired to one twice. Both times it responded, a
toast appeared, and nothing ran. `tests/scheduled-functions.test.js` now
requires every scheduled function to have a `-now` companion and forbids browser
code from naming a scheduled function. Add a timer, add its companion.

## Things that are not obvious and cost time

**`class="playing"` means "on the pitch right now".** It is dropped when a
player is substituted *and* when he is sent off. Reading it alone gives a
starting eleven of ten and files a withdrawn starter as an unused substitute.
Roles come from the timeline — see `roleFor()` in `lib/football/match-ingest.js`.

**At full time the provider deletes the status span** and writes "Today's
Result" in the heading. Detecting full time from the span alone loses the final
score at exactly the moment it matters.

**`save-data`'s `mergeArray` is a whole-record upsert**, not a field merge. A
partial write destroys every field you did not send. This deleted a fixture
once. Send complete records.

**A finished match returns HTTP 204 to a cursored poll.** Ask for the whole page
when you need to parse a completed match.

**Env var changes need a redeploy** before functions see them.

**PostgREST silently ignores unknown columns.** A write that "succeeds" may have
dropped half its fields. If a value is not appearing, check the column exists
before you check the code.

## Identity — the part to be careful with

`lib/football/identity.js` may **propose**. It may never **decide**.

- An exact name inside the **same club** is a match. Nothing else is.
- Nothing crosses a club boundary, ever.
- Initials and middle names produce suggestions, never resolutions.
- A rejected suggestion is remembered and never offered again.
- The database refuses `public_slug` on anything not `confirmed`.

The reason for all of this is that a wrong merge is **silent**. No error, no
log, no symptom — until a player notices his appearance count is short, by
which time seasons have been built on it.

A merge keeps the losing record and points it at the survivor. It is never
deleted, because archived line-ups reference it and archives are not rewritten
to tidy up the present. `canonicalId()` follows the chain.

## Statistics

Everything in `lib/football/participation.js` and `lib/football/player-stats.js`
is **recomputed, never incremented**. A counter cannot follow a correction: when
a scorer is re-attributed, an incremented total keeps the old number forever and
nothing in the data says it is stale.

The consequence is that `recompute()` must be safe to run repeatedly. It is —
same inputs, same rows — with one exception that is deliberate: rows flagged
`manually_corrected` are skipped and reported. A committee member's correction
outranks the machine.

Three rules the club's records depend on, each with a test named after it:

- An unused substitute has not played.
- An own goal is not a goal for the scorer, nor for anyone.
- A starter who leaves the pitch still started.

Minutes are **withheld** rather than estimated. `minutes_played = null` means
not known and is rendered as not known — never as zero. One uncertain match
withholds the season total rather than quietly understating it.

## Time

`js/match-time.js` is the only place that turns a fixture into an instant. It is
shared by the browser and the functions. There used to be five parsers,
including a private copy on a page that did not load `main.js`, and a supporter
in Los Angeles was shown a countdown to a match already in its 89th minute.

- `kickoffAt` (registry, absolute) wins.
- A date string and a time string are **Europe/London**, always.
- To display a day, derive it in Europe/London. Slicing the front off an ISO
  string gives the UTC date, which is the wrong day after 11pm BST.

## Tests

`npm test` — `node --test "tests/*.test.js"`.

Worth knowing what the unusual ones are for:

- `tests/season-simulation.test.js` — forty matches from a fixed seed. Asserts
  what has to survive a whole season: appearances that are a start or a
  substitution and never neither, goals landing on exactly one player, scopes
  that partition the season exactly, and two identical runs.
- `tests/scheduled-functions.test.js` — runs the timers with `global.fetch`
  stubbed to throw, proving the flag-off path makes no request. A source-order
  check would have been a guess about runtime.
- `tests/rls-review.test.js` — reads the migrations and fails if a table has no
  row level security or if the identity decision log gains a public policy.
- `tests/one-system.test.js` — one writer, one reader, no browser request to the
  provider.

## Row level security

The anon key ships in the page. Anything readable with it is public.

**Public:** fixtures, results, league table, line-ups, match state and events,
season totals, published and archived programmes.

**Not public:** `football_identity_decisions` and `football_identity_rejections`
(committee members' names and their judgements about real people),
`football_sync_runs`, `football_source_conflicts`, `match_sync_log`,
`md_records` / `md_audit` / `md_price_lists` (takings — also explicitly revoked
from the API roles), and any programme that is not published or archived.

`football_players` is publicly readable and that is intentional: the names in it
are already on published team sheets. What is *not* reachable is a page for an
unconfirmed identity — `public_slug` cannot exist without `identity_status =
'confirmed'`, enforced by a check constraint rather than by every endpoint
remembering.

## Deliberately not done

**The programme's legal footer is empty.** `legal_version` exists and carries
`'v1'`; there is no rule-book wording behind it. The current FA Handbook and
Combined Counties competition rules have not been read from their primary
sources, and inventing plausible-sounding compliance text is worse than an
absence — an absence is visible and a fabrication is not. Read the primary
documents, then fill it.

**No PDF export.** The programme is a web page; a print stylesheet exists
(`programme-print.html`).

**No assists.** The provider does not supply them. The column is `null`, not 0.

**`fetch-fixtures` and `fetch-table` remain** as cold-start fallbacks behind the
registry. `fetch-table` reads Wikipedia. Both were compared against the registry
and agreed exactly before the registry became primary — but an encyclopaedia
anyone may edit is not the competition's own record, which is why it is second.
