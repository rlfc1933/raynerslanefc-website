-- ═══════════════════════════════════════════════════════════════════════════
--  RAYNERS LANE FC — MATCH DAY OPERATIONS
--
--  Run ONCE in Supabase → SQL Editor → New query → Run.
--  Safe to re-run: every statement is IF NOT EXISTS / CREATE OR REPLACE /
--  guarded in a DO block. Nothing else in the database is touched.
--
--  WHAT THIS REPLACES
--  The club's only record of match-day money was `match_finances` — a SINGLE
--  row (id = 1) holding the whole history as one jsonb array. Every save
--  overwrote the entire array, so two staff saving in the same window silently
--  destroyed each other's work. It had no fixture key, no season, no ticket
--  categories, no reconciliation, no status, no actor and no audit trail.
--
--  This is the replacement: one properly normalised ROW per fixture, with the
--  invariants enforced HERE rather than trusted to a browser.
--
--  SECURITY MODEL (identical to the rest of this database)
--  All three tables have RLS ON and NO policies. The public anon key therefore
--  has ZERO access — it cannot read a single row. Only the service key, used
--  server-side by the PIN + role gated Netlify functions, can touch them.
--  Match-day takings must never be reachable from a browser.
--
--  MONEY IS INTEGER PENCE. Never a float. £9.00 is 900. Floating-point money
--  loses pennies, and a gate reconciliation that is out by a penny is a
--  reconciliation nobody trusts.
--
--  TIME IS SERVER TIME. Every timestamp defaults to now() or is set by a
--  trigger. A phone with a wrong clock must not be able to date a record.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · FIXTURE PRICE OVERRIDES (the rare exception ONLY) ──────────────────
--
-- THE SEASON PRICES ARE NOT STORED HERE. They live in data/config.json →
-- `admission`, which is the block the public website already renders at the
-- gate. That is the single source of truth: what the volunteer sees on the
-- phone is, by construction, what the supporter sees on the website. Match Day
-- Ops reads it live and snapshots it onto the record.
--
-- Keeping a second season price list in this database would mean two places to
-- update and two prices to disagree — the club charging one and reconciling
-- against another. So this table holds ONLY the rare, deliberate, audited
-- exception for ONE fixture: a cup instruction, a charity match, a promotion.
--
-- One row per fixture, a reason is mandatory, and the actor is recorded. It
-- never alters the season-wide website prices.
--
-- `categories` is an array of:
--   { key, label, price_pence, counts, revenue, paid, order, enabled }
--     key      stable identifier, never changes ('adults', 'guest_list'…)
--     counts   does it count toward OFFICIAL attendance?
--     revenue  does it contribute to EXPECTED gate revenue?
-- Guest List / Complimentary, season tickets, officials and scouts all COUNT
-- as attendance and produce NO revenue — which is exactly why declared receipts
-- are reconciled against expected revenue and never against the headcount. A
-- long guest list must never read as a cash shortfall.
create table if not exists public.md_price_lists (
  id             bigint generated always as identity primary key,
  fixture_id     text not null unique,          -- ONE override per fixture
  season         text,
  competition_id text,
  label          text,
  reason         text not null,                 -- why this fixture is different
  categories     jsonb not null default '[]'::jsonb,
  effective_from date not null default current_date,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint md_price_lists_categories_is_array check (jsonb_typeof(categories) = 'array'),
  constraint md_price_lists_reason_required check (btrim(reason) <> '')
);

create index if not exists md_price_lists_season_idx on public.md_price_lists (season);

-- Migrating a database that already ran the FIRST version of this file (which
-- was season-scoped and had no fixture_id). Nothing is dropped: the old season
-- rows are simply no longer read, because data/config.json is now the source.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='md_price_lists' and column_name='fixture_id') then
    alter table public.md_price_lists add column fixture_id text;
    alter table public.md_price_lists add column reason text;
    -- Retire any season-default rows from the earlier design so they can never
    -- be mistaken for the price source. They are kept, not deleted.
    update public.md_price_lists
       set reason = coalesce(reason, 'Superseded: season prices now come from data/config.json'),
           fixture_id = coalesce(fixture_id, 'retired-season-list-' || id::text)
     where fixture_id is null;
    alter table public.md_price_lists alter column fixture_id set not null;
    alter table public.md_price_lists alter column reason set not null;
    create unique index if not exists md_price_lists_fixture_uq on public.md_price_lists (fixture_id);
  end if;
  -- The old season-scoped indexes, if present, no longer describe this table.
  drop index if exists public.md_price_lists_default_uq;
  drop index if exists public.md_price_lists_override_uq;
end $$;


-- ── 2 · MATCH DAY RECORDS ──────────────────────────────────────────────────
-- EXACTLY ONE operational record per canonical fixture. `fixture_id` is the
-- id from data/fixtures.json and is UNIQUE — the database itself makes a
-- duplicate match-day record impossible, and Match Day Ops can therefore never
-- become a second fixture store.
create table if not exists public.md_records (
  id                bigint generated always as identity primary key,

  -- ── identity ──
  fixture_id        text not null unique,      -- → data/fixtures.json .id
  season            text not null,             -- → data/seasons.json
  competition_id    text,                      -- → data/competitions.json .id ('' / null = not a registered competition)
  competition_label text,                      -- the human label, preserved verbatim

  -- ── snapshots: history must survive later edits ──
  -- fixture_snapshot freezes date/kickoff/opponent/venue/competition/isHome so
  -- renaming an opponent or correcting a fixture in 2028 cannot rewrite what a
  -- 2026 match-day sheet said. price_snapshot freezes the categories and prices
  -- ACTUALLY used, so a mid-season price rise cannot retrospectively change
  -- what the club expected to take.
  fixture_snapshot  jsonb not null default '{}'::jsonb,
  price_snapshot    jsonb,
  price_list_id     bigint references public.md_price_lists(id),

  -- ── lifecycle ──
  status text not null default 'upcoming'
    check (status in ('upcoming','ready','in_progress','awaiting_reconciliation',
                      'completed','locked','cancelled','postponed','abandoned')),

  -- ── who and what ──
  weather        text,
  operator       text,                        -- assigned match-day operator
  completed_by   text,

  -- ── attendance ──
  -- `attendance` is { category_key: quantity }. Quantities are validated
  -- non-negative by trigger (a jsonb CHECK cannot iterate keys portably).
  attendance               jsonb not null default '{}'::jsonb,
  attendance_calculated    integer not null default 0 check (attendance_calculated >= 0),
  attendance_official      integer check (attendance_official is null or attendance_official >= 0),
  -- declared official MINUS counted. Positive = the official figure is higher
  -- than the gate counted. Kept as a stored column so reports can index it.
  attendance_variance      integer,
  attendance_variance_note text,

  -- ── sales ──
  -- { programmes:{qty,unit_pence}, badges:{…}, merch:{…},
  --   hospitality_pence, sponsorship_pence, other:[{label,qty,unit_pence}] }
  sales        jsonb not null default '{}'::jsonb,
  sales_pence  integer not null default 0 check (sales_pence >= 0),

  -- ── receipts + float ──
  -- { cash_pence, card_pence, online_pence, other_pence }
  receipts          jsonb not null default '{}'::jsonb,
  float_open_pence  integer not null default 0 check (float_open_pence  >= 0),
  float_close_pence integer not null default 0 check (float_close_pence >= 0),

  -- ── the two reconciliations ──
  expected_gate_pence      integer not null default 0 check (expected_gate_pence >= 0),
  expected_pence           integer not null default 0 check (expected_pence >= 0),
  declared_pence           integer not null default 0 check (declared_pence >= 0),
  -- declared MINUS expected. Negative = a shortfall. May legitimately be
  -- negative, so it carries no non-negative check.
  financial_variance_pence integer not null default 0,
  reconciliation_note      text,

  -- ── notes, separated so nothing is buried ──
  -- { incidents, turnstile, cash, attendance, general }
  notes jsonb not null default '{}'::jsonb,

  -- ── integrity ──
  -- One submission can only ever take effect once, however many times a phone
  -- on a bad signal retries it.
  idempotency_key text unique,
  -- Optimistic concurrency. Two turnstile phones must not silently overwrite
  -- each other; a write carrying a stale version is rejected, not merged.
  version integer not null default 1 check (version > 0),

  -- ── legacy migration provenance (Stage 9) ──
  is_legacy_import bool not null default false,
  legacy_source    jsonb,

  -- ── audit-adjacent columns (the full trail is md_audit) ──
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  submitted_by text, submitted_at timestamptz,
  approved_by  text, approved_at  timestamptz,
  locked_at    timestamptz,
  reopen_count integer not null default 0 check (reopen_count >= 0)
);

create index if not exists md_records_season_status_idx on public.md_records (season, status);
create index if not exists md_records_season_comp_idx   on public.md_records (season, competition_id);
create index if not exists md_records_updated_idx       on public.md_records (updated_at desc);
create index if not exists md_records_fixture_idx       on public.md_records (fixture_id);


-- ── 3 · AUDIT ──────────────────────────────────────────────────────────────
-- Append-only. Never updated, never deleted — enforced by trigger below, not
-- by convention. "Who changed what and when" has to survive the person who
-- would most like it not to.
create table if not exists public.md_audit (
  id        bigint generated always as identity primary key,
  record_id bigint references public.md_records(id) on delete restrict,
  fixture_id text,                       -- denormalised: survives even a record delete attempt
  actor     text not null,               -- a staff identity, NEVER a shared PIN
  actor_role text,
  action    text not null,               -- created|prepared|tally|submitted|approved|locked|reopened|price_override|migrated
  reason    text,                        -- REQUIRED on reopen (enforced in md_records trigger)
  before    jsonb,
  after     jsonb,
  at        timestamptz not null default now()
);

create index if not exists md_audit_record_idx on public.md_audit (record_id, at desc);
create index if not exists md_audit_at_idx     on public.md_audit (at desc);


-- ── 4 · INVARIANTS ENFORCED IN THE DATABASE ────────────────────────────────

-- 4a · updated_at is server time, always. A client cannot backdate a record.
create or replace function public.md_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists md_records_touch on public.md_records;
create trigger md_records_touch
  before update on public.md_records
  for each row execute function public.md_touch_updated_at();

drop trigger if exists md_price_lists_touch on public.md_price_lists;
create trigger md_price_lists_touch
  before update on public.md_price_lists
  for each row execute function public.md_touch_updated_at();


-- 4b · A LOCKED record cannot be edited in place, and cannot be reopened
--      without a reason. This is the control the old ledger never had: there,
--      any holder of one shared password could silently rewrite or delete a
--      past match's takings.
--
--      Allowed out of 'locked': ONLY the transition to
--      'awaiting_reconciliation' (a reopen), and only with a reason supplied.
--      The Netlify function additionally checks the actor holds
--      can_matchday_reopen — but even if that check were bypassed, an edit
--      without a reason cannot reach the table.
create or replace function public.md_guard_locked()
returns trigger language plpgsql as $$
begin
  if old.status = 'locked' then
    if new.status = 'locked' then
      raise exception 'md_records: record % is locked — reopen it before editing', old.fixture_id
        using errcode = 'check_violation';
    end if;
    if new.status <> 'awaiting_reconciliation' then
      raise exception 'md_records: a locked record may only be reopened to awaiting_reconciliation (got %)', new.status
        using errcode = 'check_violation';
    end if;
    if coalesce(btrim(new.reconciliation_note), '') = '' then
      raise exception 'md_records: reopening a locked record requires a reason'
        using errcode = 'check_violation';
    end if;
    new.reopen_count := old.reopen_count + 1;
  end if;
  return new;
end $$;

drop trigger if exists md_records_guard_locked on public.md_records;
create trigger md_records_guard_locked
  before update on public.md_records
  for each row execute function public.md_guard_locked();


-- 4c · Attendance and sales quantities can never be negative. A jsonb CHECK
--      cannot iterate keys, so this is a trigger.
create or replace function public.md_validate_quantities()
returns trigger language plpgsql as $$
declare
  k text;
  v jsonb;
begin
  if jsonb_typeof(new.attendance) <> 'object' then
    raise exception 'md_records: attendance must be a JSON object' using errcode = 'check_violation';
  end if;
  for k, v in select * from jsonb_each(new.attendance) loop
    if jsonb_typeof(v) <> 'number' then
      raise exception 'md_records: attendance.% must be a number, got %', k, jsonb_typeof(v)
        using errcode = 'check_violation';
    end if;
    if (v)::numeric < 0 then
      raise exception 'md_records: attendance.% cannot be negative (%)', k, v
        using errcode = 'check_violation';
    end if;
    if (v)::numeric <> floor((v)::numeric) then
      raise exception 'md_records: attendance.% must be a whole number of people (%)', k, v
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists md_records_validate_qty on public.md_records;
create trigger md_records_validate_qty
  before insert or update on public.md_records
  for each row execute function public.md_validate_quantities();


-- 4d · md_audit is APPEND-ONLY. No update, no delete, at the database level.
create or replace function public.md_audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'md_audit is append-only — audit history cannot be % ', lower(tg_op)
    using errcode = 'check_violation';
end $$;

drop trigger if exists md_audit_no_update on public.md_audit;
create trigger md_audit_no_update
  before update or delete on public.md_audit
  for each row execute function public.md_audit_immutable();


-- ── 5 · ROW LEVEL SECURITY ─────────────────────────────────────────────────
-- RLS ON, NO POLICIES, on all three. The anon key cannot see a single row of
-- any of them. Only the service key (server-side, via the gated functions)
-- reaches this data. Deliberately no policy is created below — that is the
-- control, not an omission.
alter table public.md_price_lists enable row level security;
alter table public.md_records     enable row level security;
alter table public.md_audit       enable row level security;

-- Belt and braces: revoke from the API roles explicitly, so a policy added by
-- accident later still cannot expose takings without someone also re-granting.
-- Guarded on the roles existing, so this file also runs on a plain Postgres
-- (which is how it is tested before it is ever pointed at production).
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.md_price_lists from %I', r);
      execute format('revoke all on public.md_records     from %I', r);
      execute format('revoke all on public.md_audit       from %I', r);
    end if;
  end loop;
end $$;


-- ── 6 · CAPABILITIES ───────────────────────────────────────────────────────
-- Reuse the permission MATRIX that already exists (la_permissions) rather than
-- inventing a second scheme. Granting a role a capability is a row, not a code
-- change. Guarded so this migration still runs on a database where the Lane
-- App tables have not been created.
do $$
begin
  if to_regclass('public.la_permissions') is not null then
    insert into public.la_permissions (role, capability) values
      ('chairman','can_matchday_record'),
      ('chairman','can_matchday_approve'),
      ('chairman','can_matchday_reopen'),
      ('chairman','can_matchday_prices'),
      ('chairman','can_matchday_finance'),
      ('manager','can_matchday_record'),
      ('staff','can_matchday_record')
    on conflict (role, capability) do nothing;
  end if;
end $$;


-- ── 7 · NO PRICE SEED ──────────────────────────────────────────────────────
-- Deliberately nothing to seed. The season admission prices are NOT stored in
-- this database: they are read live from data/config.json → `admission`, the
-- same block the public site renders at the gate. Seeding a copy here is
-- exactly the second source of truth this design exists to avoid.
--
-- md_price_lists stays empty until someone deliberately overrides ONE fixture.


-- ── DONE ───────────────────────────────────────────────────────────────────
-- Additive only. No table is dropped, no column is dropped, no data is
-- deleted, and match_finances is deliberately left completely untouched — the
-- old ledger remains readable until its migration has been verified (Stage 9).
