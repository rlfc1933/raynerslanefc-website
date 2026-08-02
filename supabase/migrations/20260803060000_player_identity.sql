-- GATE 7 — player identity.
--
-- A name on a team sheet is not a person.
--
-- The provider gives us strings. Two players share a name; one player is
-- spelled six ways across a season; a Rayners Lane shirt and an opposition
-- shirt can carry the same surname on the same afternoon. If the system
-- guesses, the club's permanent record of who played and who scored becomes
-- quietly, confidently wrong — and nobody notices until a player is told he
-- has fewer appearances than he does.
--
-- So identity has states, and only a human moves a record into the one that
-- earns a public page.
--
--   confirmed              a person on the club's roster. Gets a player page.
--   provisional            a provider string we are carrying honestly.
--   unresolved             not usable — no key could be formed from it.
--   name_at_another_club   this exact name already belongs to someone else.
--   duplicate_candidate    two records that may be one person.
--   rejected               a mapping a human has ruled out. Never re-offered.
--
-- Nothing here promotes itself. The pipeline can only ever propose.

-- ── the states ──────────────────────────────────────────────────────────────
alter table public.football_players
  drop constraint if exists football_players_identity_status_check;

-- Carry the old vocabulary across before the new constraint is applied,
-- otherwise rows written by Gate 3 would fail it.
update public.football_players set identity_status = 'duplicate_candidate'
  where identity_status = 'duplicate_suspect';
update public.football_players set identity_status = 'name_at_another_club'
  where identity_status = 'needs_review';

alter table public.football_players
  add constraint football_players_identity_status_check
  check (identity_status in ('confirmed','provisional','unresolved',
                             'name_at_another_club','duplicate_candidate','rejected'));

alter table public.football_players
  -- The club's own roster id from data/players.json. This is what makes a
  -- provider string into one of OUR players, and it is set by a human.
  add column if not exists club_player_id text,
  -- Set when a duplicate is resolved. The losing record is kept, not deleted:
  -- archived line-ups point at it and archives do not get rewritten.
  add column if not exists merged_into_id bigint references public.football_players(id),
  add column if not exists identity_decided_by text,
  add column if not exists identity_decided_at timestamptz,
  add column if not exists identity_note text,
  -- Only a confirmed identity is ever addressable in public.
  add column if not exists public_slug text;

create unique index if not exists football_players_club_id_idx
  on public.football_players (club_player_id) where club_player_id is not null;
create unique index if not exists football_players_public_slug_idx
  on public.football_players (public_slug) where public_slug is not null;
create index if not exists football_players_identity_idx
  on public.football_players (identity_status);

-- A record cannot be confirmed without a person to point at, and cannot be
-- publicly addressable without being confirmed. The database refuses rather
-- than trusting every future caller to remember.
alter table public.football_players
  drop constraint if exists football_players_public_requires_confirmed;
alter table public.football_players
  add constraint football_players_public_requires_confirmed
  check (public_slug is null or identity_status = 'confirmed');

-- ── the audit ───────────────────────────────────────────────────────────────
-- Every identity decision is a claim about a real person. Who made it, when,
-- and what it replaced, kept permanently.
create table if not exists public.football_identity_decisions (
  id            bigint generated always as identity primary key,
  player_id     bigint not null references public.football_players(id) on delete cascade,
  action        text not null
    check (action in ('confirm','link_club_player','reject','merge','unmerge',
                      'rename','correct_match','alias_added','alias_removed','reopen')),
  from_status   text,
  to_status     text,
  from_value    text,
  to_value      text,
  other_player_id bigint references public.football_players(id),
  decided_by    text not null,
  reason        text,
  created_at    timestamptz not null default now()
);
create index if not exists football_identity_decisions_player_idx
  on public.football_identity_decisions (player_id, created_at desc);

-- A mapping a human has ruled out. The pipeline reads this before proposing,
-- so a rejected suggestion never comes back a week later looking new.
create table if not exists public.football_identity_rejections (
  id            bigint generated always as identity primary key,
  normalised    text not null,
  team_id       bigint references public.football_teams(id),
  club_player_id text,
  rejected_by   text not null,
  reason        text,
  created_at    timestamptz not null default now(),
  unique (normalised, team_id, club_player_id)
);

-- ── minutes told honestly ───────────────────────────────────────────────────
-- The old vocabulary had one bucket for everything the system worked out. It
-- could not distinguish "both ends of his match are known" from "we assumed
-- ninety because nothing said otherwise" from "we do not know".
alter table public.football_player_match_stats
  drop constraint if exists football_player_match_stats_confidence_check;
update public.football_player_match_stats set confidence = 'system_derived_partial'
  where confidence = 'system_derived';
alter table public.football_player_match_stats
  add constraint football_player_match_stats_confidence_check
  check (confidence in ('provider_confirmed','system_derived_high',
                        'system_derived_partial','unavailable','manually_corrected'));

alter table public.football_player_match_stats
  add column if not exists season text,
  add column if not exists competition_type text,
  add column if not exists unused_substitute bool not null default false,
  add column if not exists appearance bool not null default false,
  add column if not exists minutes_confidence text,
  -- A human correction outranks any recomputation. Without this the next sync
  -- would silently undo it.
  add column if not exists manually_corrected bool not null default false,
  add column if not exists corrected_by text,
  add column if not exists corrected_at timestamptz,
  add column if not exists correction_note text;

create index if not exists football_pms_player_season_idx
  on public.football_player_match_stats (player_id, season);
create index if not exists football_pms_fixture_idx
  on public.football_player_match_stats (fixture_id);

-- ── season totals ───────────────────────────────────────────────────────────
-- Derived, never accumulated. Every row here is rebuilt from the match records
-- it summarises, so a corrected scorer changes the total on the next run
-- instead of leaving the old figure standing forever.
create table if not exists public.football_player_season_stats (
  id              bigint generated always as identity primary key,
  player_id       bigint not null references public.football_players(id) on delete cascade,
  team_id         bigint references public.football_teams(id),
  season          text not null,
  scope           text not null default 'all'
    check (scope in ('all','league','cup','friendly')),
  appearances     int not null default 0,
  starts          int not null default 0,
  substitute_appearances int not null default 0,
  unused_substitute int not null default 0,
  goals           int not null default 0,
  own_goals       int not null default 0,
  yellow_cards    int not null default 0,
  red_cards       int not null default 0,
  -- null means "not known", and it is shown as not known. It never means zero.
  minutes_played  int,
  minutes_confidence text,
  computed_at     timestamptz not null default now(),
  source_run_id   bigint,
  unique (player_id, season, scope, team_id)
);
create index if not exists football_pss_season_idx
  on public.football_player_season_stats (season, scope);

-- ── touch triggers ──────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['football_player_season_stats'] loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function public.football_touch()', t, t);
  end loop;
end $$;

-- ── row level security ──────────────────────────────────────────────────────
alter table public.football_identity_decisions enable row level security;
alter table public.football_identity_rejections enable row level security;
alter table public.football_player_season_stats enable row level security;

-- Season totals are what the squad page renders, so they are public.
drop policy if exists football_pss_read on public.football_player_season_stats;
create policy football_pss_read on public.football_player_season_stats
  for select using (true);

-- The decision log is not. It carries the names of committee members and the
-- reasoning behind judgements about real people; it is the club's business.
-- No select policy is created, so RLS denies it to the public key entirely and
-- only the service key can read it.

comment on table public.football_identity_decisions is
  'Permanent audit of who decided that a provider name is a particular person.';
comment on column public.football_players.club_player_id is
  'data/players.json id. Set by a human. Its presence is what makes this one of ours.';
comment on column public.football_player_season_stats.minutes_played is
  'null means not known. It is rendered as not known, never as zero.';
