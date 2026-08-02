-- ════════════════════════════════════════════════════════════════════════════
-- GATE 6 — MATCHDAY PROGRAMME EDITIONS
--
-- One edition per eligible home fixture, plus immutable published versions.
--
-- The versions table is the point. An archived programme must show the sponsors,
-- the staff and the league table AS THEY WERE that day. If the edition simply
-- pointed at current club data, last season's programme would quietly rewrite
-- itself every time a sponsor changed — and a supporter opening the Wallingford
-- edition next year would see next year's committee.
--
-- Additive. Nothing existing is altered.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.programme_editions (
  id                  bigint generated always as identity primary key,
  fixture_id          bigint not null references public.football_fixtures(id) on delete cascade,
  internal_fixture_id text,
  external_fixture_id text,
  season              text not null,
  home_team_id        bigint references public.football_teams(id),
  away_team_id        bigint references public.football_teams(id),
  competition_id      bigint references public.football_competitions(id),
  scheduled_kickoff_at timestamptz,
  venue               text,
  slug                text unique,

  state text not null default 'draft_hidden'
    check (state in ('draft_hidden','waiting_for_matchday','waiting_for_lineups',
                     'ready_to_publish','published_matchday','published_late',
                     'full_time_current','archived','withheld')),

  -- Eligibility is read from the registry; the override is the authorised
  -- exception for a neutral-venue final or a special joint edition, and is off
  -- by default.
  programme_eligible_override bool not null default false,
  override_reason     text,
  override_by         text,

  mandatory_content_valid bool not null default false,
  lineup_gate_valid       bool not null default false,

  generated_at        timestamptz,
  ready_at            timestamptz,
  published_at        timestamptz,
  fulltime_enriched_at timestamptz,
  archived_at         timestamptz,

  current_version     int not null default 0,
  publication_source  text not null default 'automatic'
    check (publication_source in ('automatic','emergency_teamsheet','manual')),
  withheld_reason     text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id)
);
create index if not exists programme_editions_state_idx on public.programme_editions (state);
create index if not exists programme_editions_ko_idx    on public.programme_editions (scheduled_kickoff_at desc);

-- Immutable snapshots. A correction writes a NEW version; it never edits one.
create table if not exists public.programme_versions (
  id            bigint generated always as identity primary key,
  edition_id    bigint not null references public.programme_editions(id) on delete cascade,
  version       int not null,
  payload       jsonb not null,          -- the whole rendered edition, frozen
  lineup_snapshot   jsonb,
  table_snapshot    jsonb,
  sponsor_snapshot  jsonb,
  staff_snapshot    jsonb,
  final_match_snapshot jsonb,
  legal_version text,
  correction_reason text,
  created_by    text,
  generated_at  timestamptz not null default now(),
  published_at  timestamptz,
  unique (edition_id, version)
);
create index if not exists programme_versions_edition_idx on public.programme_versions (edition_id, version desc);

create or replace function public.programme_touch() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;
drop trigger if exists programme_editions_touch on public.programme_editions;
create trigger programme_editions_touch before update on public.programme_editions
  for each row execute function public.programme_touch();

alter table public.programme_editions enable row level security;
alter table public.programme_versions enable row level security;

-- The public may read PUBLISHED and ARCHIVED editions only. A draft sitting in
-- the database days before a match must not be reachable by guessing a URL.
drop policy if exists programme_editions_public_read on public.programme_editions;
create policy programme_editions_public_read on public.programme_editions
  for select using (state in ('published_matchday','published_late','full_time_current','archived'));

drop policy if exists programme_versions_public_read on public.programme_versions;
create policy programme_versions_public_read on public.programme_versions
  for select using (
    published_at is not null
    and exists (
      select 1 from public.programme_editions e
      where e.id = programme_versions.edition_id
        and e.state in ('published_matchday','published_late','full_time_current','archived')
    )
  );
