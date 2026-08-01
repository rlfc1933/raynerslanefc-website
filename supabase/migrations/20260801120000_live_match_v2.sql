-- ════════════════════════════════════════════════════════════════════════════
-- LIVE MATCH v2 — fixture-scoped state, structured events, honest freshness.
--
-- Replaces the single `live_match` row pinned to id=1. That row was the whole
-- club's scoreboard: two Rayners Lane teams could never both be live, there was
-- no version column so two staff devices silently overwrote each other, and a
-- score carried no link to the fixture it belonged to.
--
-- The old table is deliberately NOT dropped here. It stays until the new path
-- has been proven in production — see the rollback note in the release report.
--
-- Provider-neutral on purpose. `external_provider` is a column, not an
-- assumption: Football Web Pages supplies the data today, and swapping provider
-- must not mean another migration.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. MATCH STATE ─────────────────────────────────────────────────────────
create table if not exists public.match_state (
  id                bigint generated always as identity primary key,

  -- Identity. fixture_id is OUR id from data/fixtures.json (e.g. 'fwp-578225').
  -- unique: one live state per fixture, which is what kills the id=1 problem.
  fixture_id            text not null unique,
  external_provider     text not null default 'fwp',
  external_fixture_id   text,

  -- Teams as the provider states them, in home/away order. Storing both names
  -- rather than "opponent + is_home" means the score can never be shown against
  -- the wrong side if is_home is ever wrong.
  home_team         text,
  away_team         text,
  home_score        int,
  away_score        int,
  is_home           bool,                      -- are WE the home team

  -- Clock. Nullable on purpose: null means "not known", and the public site
  -- renders nothing rather than 0'. A frozen 0' looks broken and lies.
  period            text not null default 'unknown'
    check (period in ('unknown','pre_match','first_half','half_time','second_half',
                      'extra_time','penalties','in_play','full_time',
                      'delayed','postponed','cancelled','abandoned')),
  match_minute      int,
  stoppage_minute   int,

  scheduled_kickoff timestamptz,
  actual_kickoff    timestamptz,
  competition       text,
  venue             text,
  referee           text,

  -- Lifecycle flags kept explicit rather than derived in three places.
  is_live           bool not null default false,
  is_final          bool not null default false,

  -- Freshness. source_updated_at is when the PROVIDER last changed;
  -- last_synced_at is when we last successfully talked to it. The public site
  -- needs both to say "updates delayed" honestly instead of implying live.
  source_updated_at timestamptz,
  last_synced_at    timestamptz,
  sync_status       text not null default 'idle'
    check (sync_status in ('idle','ready','syncing','ok','stale','failing','disabled','overridden')),
  sync_error        text,
  sync_cursor       text,                      -- provider's `loaded` cursor
  payload_hash      text,                      -- skip writes when nothing changed

  -- Manual emergency override. While manual_override is true the sync records
  -- what the provider said but MUST NOT apply it — a deliberate human
  -- correction is never silently overwritten by a poll.
  manual_override           bool not null default false,
  manual_override_reason    text,
  manual_override_by        text,
  manual_override_at        timestamptz,
  manual_override_expires_at timestamptz,

  version           int not null default 1,    -- optimistic locking
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists match_state_live_idx    on public.match_state (is_live) where is_live;
create index if not exists match_state_ext_idx     on public.match_state (external_provider, external_fixture_id);
create index if not exists match_state_kickoff_idx on public.match_state (scheduled_kickoff desc);

-- ── 2. MATCH EVENTS ────────────────────────────────────────────────────────
-- Append-mostly. The provider re-sends its whole timeline on every poll, so
-- dedupe_key is what stops six polls becoming thirty-six goals.
create table if not exists public.match_events (
  id                bigint generated always as identity primary key,
  fixture_id        text not null references public.match_state(fixture_id) on delete cascade,
  external_provider text not null default 'fwp',
  external_event_id text,

  event_type text not null
    check (event_type in ('goal','own_goal','penalty_goal','penalty_missed',
                          'yellow_card','red_card','substitution',
                          'kickoff','half_time','second_half','full_time',
                          'delayed','postponed','abandoned','correction','info')),

  side       text check (side in ('home','away')),   -- which team it COUNTS for
  team       text,
  player     text,
  player_side text check (player_side in ('home','away')),  -- who DID it (differs for an og)
  assistant  text,
  external_player_id text,

  minute            int,
  stoppage_minute   int,
  card_colour       text check (card_colour in ('yellow','red')),
  own_goal          bool not null default false,
  penalty           bool not null default false,

  score_home_after  int,
  score_away_after  int,

  -- Identity for deduplication. Deliberately excludes the provider's free text
  -- so tidying "Beau  Pryce" to "Beau Pryce" is not read as a second red card.
  dedupe_key        text not null,
  source_payload_hash text,

  source            text not null default 'fwp' check (source in ('fwp','manual')),
  occurred_at       timestamptz,
  received_at       timestamptz not null default now(),
  corrected_at      timestamptz,
  retracted_at      timestamptz,               -- provider withdrew it; never hard-deleted
  created_at        timestamptz not null default now(),

  unique (fixture_id, dedupe_key)
);

create index if not exists match_events_fixture_idx on public.match_events (fixture_id, minute, stoppage_minute);
create index if not exists match_events_live_idx    on public.match_events (fixture_id) where retracted_at is null;

-- ── 3. SYNC LOG ────────────────────────────────────────────────────────────
-- Every decision the sync made, including the ones where it chose to do
-- nothing. Without this, "the score was wrong at 4pm" is unanswerable.
create table if not exists public.match_sync_log (
  id           bigint generated always as identity primary key,
  fixture_id   text,
  outcome      text not null,     -- ok | no_change | not_found | rejected | error | skipped_override | disabled
  http_status  int,
  detail       text,
  parsed_score text,
  parsed_period text,
  duration_ms  int,
  created_at   timestamptz not null default now()
);
create index if not exists match_sync_log_recent_idx on public.match_sync_log (created_at desc);

-- ── 4. updated_at + version, enforced in the database ──────────────────────
-- Doing this in the function would mean every future writer has to remember.
create or replace function public.match_state_touch() returns trigger as $$
begin
  new.updated_at := now();
  if new.version is not distinct from old.version then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists match_state_touch_trg on public.match_state;
create trigger match_state_touch_trg before update on public.match_state
  for each row execute function public.match_state_touch();

-- ── 5. ROW LEVEL SECURITY ──────────────────────────────────────────────────
-- Public READ only. Every write goes through the Netlify function with the
-- service key, exactly as live_match does today. The sync log stays private —
-- it carries error text that is nobody's business but the club's.
alter table public.match_state  enable row level security;
alter table public.match_events enable row level security;
alter table public.match_sync_log enable row level security;

drop policy if exists "match_state public read"  on public.match_state;
create policy "match_state public read"  on public.match_state  for select using (true);

drop policy if exists "match_events public read" on public.match_events;
create policy "match_events public read" on public.match_events for select using (true);

-- No policy on match_sync_log = no anon access at all. Intentional.

-- Realtime: the public scoreboard subscribes to these two tables.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.match_state';  exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.match_events'; exception when duplicate_object then null; end;
  end if;
end $$;
