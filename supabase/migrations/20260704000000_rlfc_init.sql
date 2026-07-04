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
