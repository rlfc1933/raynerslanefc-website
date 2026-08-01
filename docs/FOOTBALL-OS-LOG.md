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
