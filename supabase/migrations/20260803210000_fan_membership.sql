-- FAN ZONE AS THE CLUB'S SUPPORTER IDENTITY.
--
-- One supporter, one record. Before this there were three places a supporter
-- could exist — the `fans` profile, a HubSpot lead fired from signup, and the
-- footer newsletter form — with nothing joining them. The same person joining
-- twice became two people, and their loyalty history split between them.
--
-- `fans` stays exactly as it is. It holds the Lane Card the supporters already
-- have, and rewriting it would put existing membership numbers at risk. This
-- sits alongside it, keyed on the same auth user, and carries the things the
-- Lane Card was never designed to hold: consent, attribution, and activity.

create table if not exists public.fan_members (
  id                bigint generated always as identity primary key,
  auth_user_id      uuid not null references auth.users(id) on delete cascade,
  -- The join key for deduplication. Lower-cased and trimmed so "A@B.com" and
  -- "a@b.com " are one supporter, which is what made duplicates possible.
  email_normalised  text not null,
  first_name        text,
  last_name         text,
  display_name      text,
  -- Carried over from fans.lane_no where one already exists, so nobody's
  -- membership number changes underneath them.
  membership_number text,
  membership_status text not null default 'active'
    check (membership_status in ('active','pending_verification','suspended','deleted')),
  joined_at         timestamptz not null default now(),
  -- HOW they joined. 'programme:fwp-578225' is the answer to "did the
  -- Wallingford edition actually bring anybody in".
  signup_source     text,
  signup_fixture_id text,
  signup_programme_id bigint,
  last_active_at    timestamptz,
  privacy_version   text,
  terms_version     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (auth_user_id),
  unique (email_normalised)
);
create index if not exists fan_members_status_idx on public.fan_members (membership_status);
create index if not exists fan_members_source_idx on public.fan_members (signup_source);

-- Membership and marketing are different questions with different answers.
-- Kept in its own table so a consent record is never a side effect of editing
-- a profile, and so withdrawal is a row that persists rather than a flag flip
-- that erases the fact consent was ever given.
create table if not exists public.fan_marketing_preferences (
  member_id         bigint primary key references public.fan_members(id) on delete cascade,
  email_marketing   bool not null default false,
  email_marketing_consented_at  timestamptz,
  email_marketing_withdrawn_at  timestamptz,
  -- WHICH WORDS they agreed to. "They opted in" is not evidence; the sentence
  -- they were shown is.
  consent_wording_version text,
  consent_source    text,
  updated_at        timestamptz not null default now()
);

-- Meaningful supporter actions, not a surveillance log.
-- No clicks, no scrolling, no mouse movement, no page views. Only the events
-- that power a service the supporter can see: their programme history, their
-- check-ins, their Lane Card.
create table if not exists public.fan_activity (
  id            bigint generated always as identity primary key,
  member_id     bigint not null references public.fan_members(id) on delete cascade,
  activity_type text not null
    check (activity_type in ('account_created','programme_opened','match_checked_in',
                             'loyalty_reward_earned','profile_updated','marketing_changed')),
  fixture_id    text,
  programme_id  bigint,
  activity_at   timestamptz not null default now(),
  source        text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists fan_activity_member_idx on public.fan_activity (member_id, activity_at desc);
create index if not exists fan_activity_type_idx on public.fan_activity (activity_type, activity_at desc);
-- One programme_opened row per member per edition per day. Reading an edition
-- four times in an afternoon is one supporter enjoying it, not four events.
--
-- The day is pinned to UTC explicitly. `activity_at::date` on a timestamptz is
-- NOT immutable — it depends on the session's TimeZone setting — and Postgres
-- refuses it in an index. Naming the zone makes it deterministic.
create unique index if not exists fan_activity_programme_daily_idx
  on public.fan_activity (member_id, programme_id, ((activity_at at time zone 'UTC')::date))
  where activity_type = 'programme_opened';

-- Newsletter-only contacts: somebody who wants club email but has not joined.
-- Linked by normalised email so that if they later join Fan Zone the two
-- become one supporter rather than two.
create table if not exists public.fan_newsletter_contacts (
  id                bigint generated always as identity primary key,
  email_normalised  text not null unique,
  first_name        text,
  last_name         text,
  consent_wording_version text,
  consent_source    text,
  consented_at      timestamptz not null default now(),
  withdrawn_at      timestamptz,
  -- Set when this contact becomes a full member, so it is never counted twice.
  converted_member_id bigint references public.fan_members(id),
  created_at        timestamptz not null default now()
);

-- ── touch triggers ─────────────────────────────────────────────────────────
create or replace function public.fan_touch() returns trigger as $$
begin new.updated_at := now(); return new; end; $$ language plpgsql;
drop trigger if exists fan_members_touch on public.fan_members;
create trigger fan_members_touch before update on public.fan_members
  for each row execute function public.fan_touch();
drop trigger if exists fan_marketing_touch on public.fan_marketing_preferences;
create trigger fan_marketing_touch before update on public.fan_marketing_preferences
  for each row execute function public.fan_touch();

-- ── ROW LEVEL SECURITY ─────────────────────────────────────────────────────
alter table public.fan_members enable row level security;
alter table public.fan_marketing_preferences enable row level security;
alter table public.fan_activity enable row level security;
alter table public.fan_newsletter_contacts enable row level security;

-- A supporter may read their own record and nobody else's. There is no public
-- read policy on any of these: a supporter list readable with the anon key
-- would be the club's membership handed to anyone who opened the network tab.
drop policy if exists fan_members_self on public.fan_members;
create policy fan_members_self on public.fan_members
  for select using (auth.uid() = auth_user_id);

drop policy if exists fan_marketing_self on public.fan_marketing_preferences;
create policy fan_marketing_self on public.fan_marketing_preferences
  for select using (exists (
    select 1 from public.fan_members m
    where m.id = fan_marketing_preferences.member_id and m.auth_user_id = auth.uid()));

drop policy if exists fan_activity_self on public.fan_activity;
create policy fan_activity_self on public.fan_activity
  for select using (exists (
    select 1 from public.fan_members m
    where m.id = fan_activity.member_id and m.auth_user_id = auth.uid()));

-- Newsletter contacts: no policy at all. Only the service key may read them.

comment on table public.fan_members is
  'One supporter, one record. Joined to auth.users; Lane Card details stay in fans.';
comment on column public.fan_members.signup_source is
  'How they joined, e.g. programme:fwp-578225. Answers whether an edition brought anybody in.';
comment on table public.fan_activity is
  'Meaningful supporter actions only. Not a click log.';
