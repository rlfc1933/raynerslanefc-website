-- ════════════════════════════════════════════════════════════════════════
--  THE LANE 100 — founding supporters (participation & recognition only)
--
--  Not ownership, not investment, no payment. A person signs up on
--  lane-100.html → netlify/functions/submit-form.js (type 'lane100') → one
--  row here. Their supporter number is assigned HERE, by the database, at the
--  moment of a real sign-up: 1, 2, 3 … in join order, never reused, never
--  more than 100. The public page shows only the live count and, for members
--  who opted in, "first name + initial" on the recognition wall — served by
--  netlify/functions/lane-100.js. Emails never leave the service role.
--
--  RLS on, no policies → only the service role (Netlify functions) can read
--  or write. Idempotent: safe to run twice.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create table if not exists public.lane100_members (
  id              uuid primary key default gen_random_uuid(),
  supporter_no    int not null,
  name            text not null check (length(trim(name)) between 1 and 200),
  email           text not null check (length(email) between 3 and 200),
  email_key       text generated always as (lower(trim(email))) stored,
  town            text check (town is null or length(town) <= 80),
  show_on_wall    boolean not null default false,   -- public recognition: opt-in only
  updates_opt_in  boolean not null default false,   -- club updates by email: separate, opt-in only
  consent         boolean not null check (consent),  -- agreed to the club storing these details
  status          text not null default 'active' check (status in ('active','withdrawn')),
  source_page     text,
  created_at      timestamptz not null default now()
);

create unique index if not exists lane100_members_no_uq    on public.lane100_members (supporter_no);
create unique index if not exists lane100_members_email_uq on public.lane100_members (email_key);

-- Numbering: serialised with a transaction-scoped advisory lock so two people
-- joining at the same instant can never get the same number, and computed as
-- max + 1 so a rejected sign-up (duplicate email) never leaves a gap.
-- A withdrawn member keeps their number; it is never handed to anyone else.
create or replace function public.lane100_assign_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('lane100_members'));
  if exists (select 1 from public.lane100_members where email_key = lower(trim(new.email))) then
    raise exception 'lane100_duplicate' using errcode = '23505';
  end if;
  select coalesce(max(supporter_no), 0) + 1 into new.supporter_no from public.lane100_members;
  if new.supporter_no > 100 then
    raise exception 'lane100_full' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger lane100_assign_no before insert on public.lane100_members
  for each row execute function public.lane100_assign_no();

-- Numbers are permanent once given.
create or replace function public.lane100_freeze_no() returns trigger
language plpgsql as $$
begin
  if new.supporter_no is distinct from old.supporter_no then
    raise exception 'supporter numbers cannot be changed';
  end if;
  return new;
end $$;
create or replace trigger lane100_freeze_no before update on public.lane100_members
  for each row execute function public.lane100_freeze_no();

alter table public.lane100_members enable row level security;
revoke all on public.lane100_members from anon, authenticated;
revoke all on function public.lane100_assign_no() from public, anon, authenticated;
