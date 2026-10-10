-- A fixture first seen after it was played (a re-arranged match re-issued by
-- the provider under a new id) has a date but no recorded kick-off time. It is
-- stored at midday London with this flag false, so no screen presents a guessed
-- time as fact. Additive and idempotent.
alter table public.football_fixtures
  add column if not exists kickoff_time_confirmed boolean not null default true;

comment on column public.football_fixtures.kickoff_time_confirmed is
  'false when only the date is known (kick-off stored as 12:00 Europe/London placeholder)';
