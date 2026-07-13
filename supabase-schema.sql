-- Rayners Lane FC — Supabase schema for the live scoreboard + match-day check-in.
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT). Nothing else is affected.

-- ── 1. LIVE SCOREBOARD (single row, id = 1) ──────────────────────────────
create table if not exists public.live_match (
  id          int primary key default 1,
  opponent    text,
  is_home     bool,
  home_score  int  default 0,
  away_score  int  default 0,
  status      text,
  scorers     text,
  is_live     bool default false,
  updated_at  timestamptz default now()
);
insert into public.live_match (id) values (1) on conflict (id) do nothing;

-- Writes happen server-side (live-score.js, service key). The homepage reads
-- the row with the public anon key, so allow public SELECT only.
alter table public.live_match enable row level security;
drop policy if exists "live_match public read" on public.live_match;
create policy "live_match public read" on public.live_match for select using (true);

-- ── 2. MATCH-DAY ATTENDANCE (hearts) ─────────────────────────────────────
create table if not exists public.attendance (
  id          bigint generated always as identity primary key,
  lane_no     text not null,
  match_date  date not null,
  home        bool default true,
  scanned_at  timestamptz default now(),
  unique (lane_no, match_date)        -- a fan can't double-count a single match
);

-- Inserts happen server-side (check-in.js, service key). The fan card reads its
-- own lane's rows with the public anon key (lane numbers + dates only, no PII).
alter table public.attendance enable row level security;
drop policy if exists "attendance public read" on public.attendance;
create policy "attendance public read" on public.attendance for select using (true);

-- ── 3. MATCH FINANCES (PRIVATE — takings/attendance, chairman-only) ──────
-- Single row of match records. RLS ON with NO policy → the public anon key has
-- ZERO access; only the service key (via the PIN-gated analytics-data function)
-- can read/write. Keeps takings off the public repo AND out of anon reach.
create table if not exists public.match_finances (
  id          int primary key default 1,
  matches     jsonb default '[]'::jsonb,
  updated_at  timestamptz default now()
);
insert into public.match_finances (id) values (1) on conflict (id) do nothing;
alter table public.match_finances enable row level security;
-- (intentionally no policies — anon cannot see this table at all)


-- ═════════════════════════════════════════════════════════════════════════
--  THE LANE APP — player + manager PWA  (playermanager1933.html)
--  Additive. Safe to re-run. Integrity is enforced HERE (constraints + RLS),
--  not in the client — a bad/lost write is impossible at the DB layer.
--
--  SECURITY MODEL (matches the rest of this site):
--    • ALL writes go through Netlify functions using the SERVICE key, which
--      bypasses RLS. Those functions authenticate the caller (player session
--      token / staff-login) and enforce identity + idempotency.
--    • The browser anon key is READ-ONLY and only ever sees public-safe data
--      (published events, venues, the players_public view). Every table below
--      has RLS ON; tables with no SELECT policy are invisible to anon entirely
--      (phone/email/pin_hash/notes/feedback can never leak to the client).
--  → No anon INSERT/UPDATE/DELETE policy exists anywhere on purpose.
-- ═════════════════════════════════════════════════════════════════════════

-- ── SEASONS ── every event/appearance/stat carries a season so 26-27 and
-- 27-28 never conflate.
create table if not exists public.la_seasons (
  id         text primary key,                     -- '2026-27'
  label      text not null,
  is_current bool default false
);
insert into public.la_seasons (id,label,is_current) values ('2026-27','2026/27',true) on conflict (id) do nothing;

-- ── TEAMS ── team-scoped everything, so youth teams are purely additive.
create table if not exists public.la_teams (
  id       bigint generated always as identity primary key,
  name     text not null,
  is_youth bool default false,
  unique (name)
);
insert into public.la_teams (name,is_youth) values ('First Team',false) on conflict (name) do nothing;

-- ── PLAYERS ── master record. Supabase is the source of truth; players.json
-- is generated FROM this (one-way publish), never edited independently.
create table if not exists public.la_players (
  id                bigint generated always as identity primary key,
  team_id           bigint references public.la_teams(id),
  season            text   references public.la_seasons(id),
  name              text not null,
  squad_no          int,
  position          text,
  photo_url         text,
  photo_cutout_url  text,
  bio               text,
  email             text,
  phone             text,
  username          text,
  pin_hash          text,                           -- bcrypt/argon2 of the 6-digit code — NEVER the code
  status            text default 'pending' check (status in ('pending','active','injured','released','left')),
  sponsor_name      text,
  sponsor_logo      text,
  photo_consent     bool default false,             -- headshot appears on a public site
  -- dormant youth fields (special-category handling deferred; see safeguarding note)
  date_of_birth     date,
  is_minor          bool default false,
  guardian_name     text,
  guardian_email    text,
  consent_at        timestamptz,
  created_at        timestamptz default now(),
  unique (username),
  unique (email),                                   -- re-signing a former player REACTIVATES, never duplicates
  unique (team_id, season, squad_no)                -- squad numbers unique per team per season (nulls allowed)
);

-- ── APP USERS ── binds an authenticated identity 1:1 to a player_id, and
-- carries the role. A player can never collide with another's profile.
create table if not exists public.la_app_users (
  id         bigint generated always as identity primary key,
  auth_uid   text,                                  -- server-issued session subject (custom auth, not Supabase Auth)
  player_id  bigint references public.la_players(id),
  role       text not null default 'player' check (role in ('chairman','manager','coach','staff','player')),
  team_id    bigint references public.la_teams(id),
  status     text default 'active' check (status in ('active','suspended')),
  created_at timestamptz default now(),
  unique (auth_uid),
  unique (player_id)
);

-- ── PERMISSIONS ── a MATRIX, not hardcoded roles. Grant a coach selection
-- rights with a row, no code change.
create table if not exists public.la_permissions (
  id         bigint generated always as identity primary key,
  role       text,                                  -- applies to a whole role…
  user_id    bigint references public.la_app_users(id),  -- …or one specific user
  capability text not null,                         -- e.g. 'can_select_squad','can_approve','can_release','can_broadcast'
  granted    bool default true,
  unique (role, capability),
  unique (user_id, capability)
);
insert into public.la_permissions (role,capability) values
  ('chairman','can_select_squad'),('chairman','can_approve'),('chairman','can_release'),('chairman','can_broadcast'),('chairman','can_manage_users'),
  ('manager','can_select_squad'),('manager','can_approve'),('manager','can_release'),('manager','can_broadcast'),
  ('coach','can_broadcast')
  on conflict (role,capability) do nothing;

-- ── VENUES ── lat/lng matter: sports-ground postcodes route to the wrong
-- place. One-time per opponent, correct forever. Powers the map deep-links.
create table if not exists public.la_venues (
  id         bigint generated always as identity primary key,
  club_name  text not null,
  ground     text,
  address    text,
  lat        double precision,
  lng        double precision,
  unique (club_name)
);

-- ── EVENTS ── THE CORE MODEL. A match is only ONE kind of event. Timestamps
-- are UTC timestamptz — never a display string.
create table if not exists public.la_events (
  id          bigint generated always as identity primary key,
  team_id     bigint references public.la_teams(id),
  season      text   references public.la_seasons(id),
  type        text not null check (type in ('league','cup','charity','friendly','training','photoshoot','club_event')),
  opponent    text,
  is_home     bool,
  competition text,
  starts_at   timestamptz not null,
  meet_at     timestamptz,
  kit         text,
  venue_id    bigint references public.la_venues(id),
  source      text default 'staff' check (source in ('fwp_import','staff')),
  published   bool default false,
  created_by  bigint references public.la_app_users(id),
  created_at  timestamptz default now()
);
-- Only league/cup/charity/friendly have a squad selection; ALL types have
-- availability + check-in + notifications. (Enforced in app logic + selection
-- writes are simply never made for non-match types.)

-- ── AVAILABILITY ── one row per player per event. Upsert target.
create table if not exists public.la_availability (
  id           bigint generated always as identity primary key,
  event_id     bigint references public.la_events(id) on delete cascade,
  player_id    bigint references public.la_players(id) on delete cascade,
  status       text check (status in ('available','unavailable')),
  note         text,
  responded_at timestamptz default now(),
  unique (event_id, player_id)
);

-- ── SELECTIONS ── one row per player per event. Upsert target.
create table if not exists public.la_selections (
  id          bigint generated always as identity primary key,
  event_id    bigint references public.la_events(id) on delete cascade,
  player_id   bigint references public.la_players(id) on delete cascade,
  role        text check (role in ('starting','sub','not_selected')),
  selected_by bigint references public.la_app_users(id),
  selected_at timestamptz default now(),
  unique (event_id, player_id)
);

-- ── CHECK-INS ── idempotency_key makes a retried/offline check-in safe: the
-- unique (event_id,player_id) means a double-tap can only ever be one row.
create table if not exists public.la_checkins (
  id              bigint generated always as identity primary key,
  event_id        bigint references public.la_events(id) on delete cascade,
  player_id       bigint references public.la_players(id) on delete cascade,
  checked_in_at   timestamptz default now(),
  source          text default 'self' check (source in ('self','staff')),
  idempotency_key text,
  unique (event_id, player_id)
);

-- ── ANNOUNCEMENTS ── broadcast only (there is NO private staff↔player DM
-- anywhere in this app — that is the safeguarding line).
create table if not exists public.la_announcements (
  id         bigint generated always as identity primary key,
  team_id    bigint references public.la_teams(id),
  author_id  bigint references public.la_app_users(id),
  title      text,
  body       text,
  created_at timestamptz default now()
);

-- ── FEEDBACK ── ONE-WAY staff → player. The player may acknowledge, NOT reply.
create table if not exists public.la_feedback (
  id              bigint generated always as identity primary key,
  player_id       bigint references public.la_players(id) on delete cascade,
  author_id       bigint references public.la_app_users(id),
  body            text,
  event_id        bigint references public.la_events(id),
  acknowledged_at timestamptz,
  created_at      timestamptz default now()
);

-- ── STAFF NOTES ── PRIVATE. The player must NEVER be able to read this. RLS ON
-- + no SELECT policy → anon has zero access; only the service key (staff-gated
-- function) reads it.
create table if not exists public.la_staff_notes (
  id         bigint generated always as identity primary key,
  player_id  bigint references public.la_players(id) on delete cascade,
  author_id  bigint references public.la_app_users(id),
  body       text,
  updated_at timestamptz default now(),
  unique (player_id)
);

-- ── AUDIT LOG ── who selected / released / approved / wrote a note.
create table if not exists public.la_audit_log (
  id        bigint generated always as identity primary key,
  actor_id  bigint references public.la_app_users(id),
  action    text,
  entity    text,
  entity_id text,
  before    jsonb,
  after     jsonb,
  at        timestamptz default now()
);

-- ── AUTH GUARDRAILS ── failed-login lockout + signup rate-limit live in the DB
-- so they can't be bypassed by hitting the function directly.
create table if not exists public.la_login_attempts (
  id          bigint generated always as identity primary key,
  username    text,
  ip          text,
  ok          bool,
  at          timestamptz default now()
);
create index if not exists la_login_attempts_lookup on public.la_login_attempts (username, at desc);
create table if not exists public.la_sessions (
  token      text primary key,                      -- opaque, server-issued (store only a hash in production)
  user_id    bigint references public.la_app_users(id),
  created_at timestamptz default now(),
  expires_at timestamptz
);

-- ── STATS ENGINE (create now, populate in Phase 2) ── these MUST key on
-- player_id, never a free-text name. Player stats are then a SUM over events,
-- never a number anyone types.
create table if not exists public.la_appearances (
  id        bigint generated always as identity primary key,
  event_id  bigint references public.la_events(id),
  player_id bigint references public.la_players(id),
  minutes   int,
  started   bool,
  unique (event_id, player_id)
);
create table if not exists public.la_goals (
  id bigint generated always as identity primary key,
  event_id bigint references public.la_events(id), player_id bigint references public.la_players(id),
  minute int, assist_player_id bigint references public.la_players(id)
);
create table if not exists public.la_cards (
  id bigint generated always as identity primary key,
  event_id bigint references public.la_events(id), player_id bigint references public.la_players(id),
  minute int, colour text check (colour in ('yellow','red'))
);
create table if not exists public.la_motm (
  id bigint generated always as identity primary key,
  event_id bigint references public.la_events(id), player_id bigint references public.la_players(id),
  unique (event_id)
);

-- ── PUSH SUBSCRIPTIONS ── (also referenced by PUSH-SETUP.md; safe here too) ──
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text unique not null,
  subscription jsonb not null,
  player_id    bigint references public.la_players(id),
  created_at   timestamptz default now()
);

-- ── PUBLIC-SAFE VIEW ── the ONLY player data the browser anon key may read:
-- no phone/email/pin_hash/DOB/guardian. The base table stays anon-invisible.
create or replace view public.la_players_public as
  select id, team_id, season, name, squad_no, position, photo_url, photo_cutout_url,
         bio, status, sponsor_name, sponsor_logo
  from public.la_players
  where status in ('active','injured');

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────
-- Enable on every table. Add SELECT policies ONLY where public reads are safe.
-- No write policies anywhere → every write is service-key/server-side only.
alter table public.la_seasons        enable row level security;
alter table public.la_teams          enable row level security;
alter table public.la_players        enable row level security;
alter table public.la_app_users      enable row level security;
alter table public.la_permissions    enable row level security;
alter table public.la_venues         enable row level security;
alter table public.la_events         enable row level security;
alter table public.la_availability   enable row level security;
alter table public.la_selections     enable row level security;
alter table public.la_checkins       enable row level security;
alter table public.la_announcements  enable row level security;
alter table public.la_feedback       enable row level security;
alter table public.la_staff_notes    enable row level security;   -- NO select policy → private
alter table public.la_audit_log      enable row level security;   -- NO select policy → private
alter table public.la_login_attempts enable row level security;   -- NO select policy → private
alter table public.la_sessions       enable row level security;   -- NO select policy → private
alter table public.la_appearances    enable row level security;
alter table public.la_goals          enable row level security;
alter table public.la_cards          enable row level security;
alter table public.la_motm           enable row level security;
alter table public.push_subscriptions enable row level security;  -- NO select policy → private

-- Public-safe SELECT policies (reference data + published events + safe view).
drop policy if exists "la_seasons read" on public.la_seasons;
create policy "la_seasons read" on public.la_seasons for select using (true);
drop policy if exists "la_teams read" on public.la_teams;
create policy "la_teams read" on public.la_teams for select using (true);
drop policy if exists "la_venues read" on public.la_venues;
create policy "la_venues read" on public.la_venues for select using (true);
drop policy if exists "la_events read published" on public.la_events;
create policy "la_events read published" on public.la_events for select using (published = true);
drop policy if exists "la_announcements read" on public.la_announcements;
create policy "la_announcements read" on public.la_announcements for select using (true);

-- The public player view is exposed to anon; the base table is not.
grant select on public.la_players_public to anon, authenticated;
