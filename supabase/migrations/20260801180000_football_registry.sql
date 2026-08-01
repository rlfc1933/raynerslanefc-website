-- ════════════════════════════════════════════════════════════════════════════
-- GATE 1 — THE FOOTBALL REGISTRY
--
-- The identity layer the live scoreboard never had: teams, competitions,
-- fixtures, players, line-ups and league tables, each with a stable internal id
-- and the provider's id kept alongside it.
--
-- ADDITIVE ONLY. Nothing here touches match_state or match_events, which are
-- carrying live production traffic and are proven through a real match. Those
-- two keep their job; this migration builds the registry AROUND them and they
-- are joined to it in a later gate, after shadow comparison. Creating a second
-- match_state now would mean two competing truths on a Saturday afternoon,
-- which is the exact failure this whole architecture exists to end.
--
-- Every table is provider-neutral: external_provider is a column, not an
-- assumption. Football Web Pages supplies the facts today.
--
-- ROLLBACK: drop the tables created here, in reverse dependency order. No
-- existing table is altered, so rollback cannot affect the live scoreboard.
-- ════════════════════════════════════════════════════════════════════════════

-- ── TEAMS ───────────────────────────────────────────────────────────────────
create table if not exists public.football_teams (
  id                bigint generated always as identity primary key,
  canonical_name    text not null,
  display_name      text,
  slug              text unique,
  short_name        text,
  external_provider text not null default 'fwp',
  external_team_id  text,
  provider_name     text,
  crest_asset_path  text,                    -- OUR artwork, from data/crests.json
  provider_crest_url text,                   -- provider's, kept only as a hint
  colours           text,
  home_ground       text,
  team_type         text not null default 'club'
    check (team_type in ('club','reserve','youth','women','other')),
  is_rayners_lane   bool not null default false,
  active            bool not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (external_provider, external_team_id)
);

-- Aliases as rows, not an array: each one records WHERE the spelling came from,
-- which is what lets a bad match be traced later. "Wallingford & Crowmarsh" and
-- "Wallingford and Crowmarsh" are the same club; "Hayes AFC" and "AFC Hayes"
-- are the same club; a reserve side is NOT.
create table if not exists public.football_team_aliases (
  id            bigint generated always as identity primary key,
  team_id       bigint not null references public.football_teams(id) on delete cascade,
  alias         text not null,
  normalised    text not null,               -- lowercase, punctuation stripped
  source        text not null default 'fwp'
    check (source in ('fwp','club','manual','import')),
  confidence    text not null default 'confirmed'
    check (confidence in ('confirmed','probable','needs_review')),
  created_at    timestamptz not null default now(),
  unique (normalised)
);
create index if not exists football_team_aliases_team_idx on public.football_team_aliases (team_id);

-- ── COMPETITIONS ────────────────────────────────────────────────────────────
create table if not exists public.football_competitions (
  id                     bigint generated always as identity primary key,
  external_provider      text not null default 'fwp',
  external_competition_id text,
  canonical_name         text not null,
  provider_name          text,
  display_name           text,
  slug                   text,
  season                 text not null,
  competition_type       text not null default 'league'
    check (competition_type in ('league','league_cup','county_cup','fa_competition','friendly','other')),
  division               text,
  official_logo_asset    text,
  -- Deliberately defaults to unverified: a league or FA mark may not be
  -- reproduced just because a logo file exists.
  logo_permission_status text not null default 'unverified'
    check (logo_permission_status in ('unverified','permitted','prohibited')),
  active                 bool not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (external_provider, external_competition_id, season)
);

-- ── FIXTURES ────────────────────────────────────────────────────────────────
create table if not exists public.football_fixtures (
  id                  bigint generated always as identity primary key,
  -- Our own id from data/fixtures.json ('fwp-578225'), so the registry and the
  -- committed JSON can be reconciled during migration.
  internal_fixture_id text unique,
  external_provider   text not null default 'fwp',
  external_fixture_id text,
  season              text not null,
  competition_id      bigint references public.football_competitions(id),
  home_team_id        bigint references public.football_teams(id),
  away_team_id        bigint references public.football_teams(id),

  -- The authoritative instant. NEVER only the ambiguous local text: an
  -- offset-less "2026-08-01T15:00:00" is what told Los Angeles the match
  -- started in seven hours. The provider's raw strings are kept beside it as
  -- audit evidence, not as the source of truth.
  scheduled_kickoff_at   timestamptz,
  club_timezone          text not null default 'Europe/London',
  original_provider_date text,
  original_provider_time text,

  venue           text,
  round           text,
  fixture_status  text not null default 'scheduled'
    check (fixture_status in ('scheduled','postponed','cancelled','abandoned',
                              'played','awaiting_result','unknown')),
  is_home_fixture bool,
  first_team      bool not null default true,
  programme_eligible bool not null default false,

  source_updated_at timestamptz,
  last_synced_at    timestamptz,
  sync_status       text not null default 'idle',
  sync_error        text,
  -- How sure we are that this provider match is this internal fixture. Anything
  -- below 'strong' must never silently drive the public site.
  source_confidence text not null default 'needs_review'
    check (source_confidence in ('exact_id','strong','needs_review','rejected')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_provider, external_fixture_id, season)
);
create index if not exists football_fixtures_kickoff_idx on public.football_fixtures (scheduled_kickoff_at);
create index if not exists football_fixtures_season_idx  on public.football_fixtures (season, fixture_status);

-- ── PLAYERS ─────────────────────────────────────────────────────────────────
create table if not exists public.football_players (
  id                bigint generated always as identity primary key,
  canonical_name    text not null,
  display_name      text,
  slug              text,
  external_provider text not null default 'fwp',
  external_player_id text,
  provider_name     text,
  current_team_id   bigint references public.football_teams(id),
  approved_portrait text,
  approved_bio      text,
  -- Two people can share a name and one person can be spelled six ways. A
  -- record starts unconfirmed and a human decides; nothing is auto-merged.
  identity_status   text not null default 'provisional'
    check (identity_status in ('confirmed','provisional','needs_review','duplicate_suspect')),
  active            bool not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (external_provider, external_player_id)
);
create table if not exists public.football_player_aliases (
  id          bigint generated always as identity primary key,
  player_id   bigint not null references public.football_players(id) on delete cascade,
  alias       text not null,
  normalised  text not null,
  team_id     bigint references public.football_teams(id),   -- same name, different club
  source      text not null default 'fwp',
  confidence  text not null default 'needs_review'
    check (confidence in ('confirmed','probable','needs_review')),
  created_at  timestamptz not null default now()
);
create index if not exists football_player_aliases_norm_idx on public.football_player_aliases (normalised);
create index if not exists football_player_aliases_player_idx on public.football_player_aliases (player_id);

-- ── LINE-UPS ────────────────────────────────────────────────────────────────
create table if not exists public.football_lineups (
  id            bigint generated always as identity primary key,
  fixture_id    bigint not null references public.football_fixtures(id) on delete cascade,
  team_id       bigint references public.football_teams(id),
  status        text not null default 'awaiting'
    check (status in ('awaiting','provisional','confirmed','corrected')),
  formation     text,                        -- only if the provider states it
  source_updated_at timestamptz,
  received_at   timestamptz not null default now(),
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (fixture_id, team_id)
);
create table if not exists public.football_lineup_players (
  id            bigint generated always as identity primary key,
  lineup_id     bigint not null references public.football_lineups(id) on delete cascade,
  player_id     bigint references public.football_players(id),
  provider_player_name text not null,        -- kept verbatim even when unresolved
  shirt_number  text,
  lineup_role   text not null default 'starter'
    check (lineup_role in ('starter','substitute','unused','manager','official')),
  position      text,
  is_captain    bool not null default false,
  is_goalkeeper bool not null default false,
  sort_order    int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists football_lineup_players_lineup_idx on public.football_lineup_players (lineup_id);

-- ── PLAYER MATCH STATISTICS ─────────────────────────────────────────────────
-- Only what the provider proves. `confidence` is what stops a derived number
-- being presented as a fact.
create table if not exists public.football_player_match_stats (
  id              bigint generated always as identity primary key,
  fixture_id      bigint not null references public.football_fixtures(id) on delete cascade,
  player_id       bigint references public.football_players(id),
  team_id         bigint references public.football_teams(id),
  started         bool,
  substitute      bool,
  entered_minute  int,
  exited_minute   int,
  minutes_played  int,
  goals           int not null default 0,
  own_goals       int not null default 0,
  assists         int,                        -- null: the provider does not supply these
  yellow_cards    int not null default 0,
  red_cards       int not null default 0,
  source          text not null default 'fwp',
  confidence      text not null default 'provider_confirmed'
    check (confidence in ('provider_confirmed','system_derived','manually_corrected')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (fixture_id, player_id)
);

-- ── LEAGUE TABLES (snapshotted) ─────────────────────────────────────────────
-- Snapshots, not a single mutable table: an archived programme must show the
-- standings as they were on that matchday, not as they are today.
create table if not exists public.football_league_tables (
  id              bigint generated always as identity primary key,
  competition_id  bigint references public.football_competitions(id),
  season          text not null,
  snapshot_type   text not null default 'current'
    check (snapshot_type in ('current','matchday','archive')),
  source_updated_at timestamptz,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now()
);
create table if not exists public.football_league_table_rows (
  id             bigint generated always as identity primary key,
  table_id       bigint not null references public.football_league_tables(id) on delete cascade,
  team_id        bigint references public.football_teams(id),
  provider_team_name text not null,
  position       int,
  played         int, won int, drawn int, lost int,
  goals_for      int, goals_against int, goal_difference int,
  points         int,
  form           text,
  created_at     timestamptz not null default now(),
  unique (table_id, provider_team_name)
);
create index if not exists football_league_table_rows_table_idx on public.football_league_table_rows (table_id, position);

-- ── OPERATIONS ──────────────────────────────────────────────────────────────
create table if not exists public.football_sync_runs (
  id           bigint generated always as identity primary key,
  provider     text not null default 'fwp',
  sync_type    text not null,               -- season | fixture | match | table | lineup
  fixture_ref  text,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  status       text not null default 'running'
    check (status in ('running','ok','partial','failed','skipped')),
  request_count           int not null default 0,
  changed_response_count  int not null default 0,
  no_change_response_count int not null default 0,
  records_created   int not null default 0,
  records_updated   int not null default 0,
  records_corrected int not null default 0,
  warning_count     int not null default 0,
  error_count       int not null default 0,
  final_error       text,
  cursor_before     text,
  cursor_after      text,
  -- Shadow runs write here but change nothing public. This is what lets the new
  -- system be compared against the working one before it replaces it.
  shadow            bool not null default true,
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists football_sync_runs_recent_idx on public.football_sync_runs (started_at desc);

-- Disagreements between what we hold and what the provider says. Surfaced to
-- staff rather than silently resolved — a scoreline or a player identity is not
-- something a machine should quietly overwrite.
create table if not exists public.football_source_conflicts (
  id             bigint generated always as identity primary key,
  entity_type    text not null,             -- fixture | team | player | table | match
  entity_ref     text not null,
  field_name     text not null,
  internal_value text,
  provider_value text,
  severity       text not null default 'review'
    check (severity in ('info','review','critical')),
  detected_at    timestamptz not null default now(),
  resolution_status text not null default 'open'
    check (resolution_status in ('open','accepted_provider','kept_internal','ignored','resolved')),
  resolved_by    text,
  resolved_at    timestamptz,
  resolution_note text
);
create index if not exists football_source_conflicts_open_idx
  on public.football_source_conflicts (resolution_status, detected_at desc);

-- ── updated_at, in the database rather than in every future writer ──────────
create or replace function public.football_touch() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['football_teams','football_competitions','football_fixtures',
                           'football_players','football_lineups','football_lineup_players',
                           'football_player_match_stats'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function public.football_touch()', t, t);
  end loop;
end $$;

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- Public read on what the website renders. Operational tables stay private:
-- sync runs and conflicts carry error text and provider URLs that are the
-- club's business, not the public's.
do $$
declare t text;
begin
  foreach t in array array['football_teams','football_team_aliases','football_competitions',
                           'football_fixtures','football_players','football_player_aliases',
                           'football_lineups','football_lineup_players',
                           'football_player_match_stats','football_league_tables',
                           'football_league_table_rows','football_sync_runs',
                           'football_source_conflicts'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  foreach t in array array['football_teams','football_competitions','football_fixtures',
                           'football_players','football_lineups','football_lineup_players',
                           'football_player_match_stats','football_league_tables',
                           'football_league_table_rows'] loop
    execute format('drop policy if exists %I_public_read on public.%I', t, t);
    execute format('create policy %I_public_read on public.%I for select using (true)', t, t);
  end loop;
end $$;
-- No policy on football_sync_runs, football_source_conflicts, or the alias
-- tables: no anonymous access at all. Intentional.
