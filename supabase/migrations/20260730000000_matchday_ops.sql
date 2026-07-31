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


-- ── 1 · PRICE LISTS ────────────────────────────────────────────────────────
-- Season-level admission pricing with controlled per-competition overrides.
-- Prices are NOT hardcoded onto each fixture: a record points at the list that
-- applied, and SNAPSHOTS the categories it actually used when it is submitted.
--
-- competition_id NULL  = the season default (the standard league price list)
-- competition_id set   = an override for that competition (cup, friendly…)
--
-- `categories` is an array of objects, each:
--   { key, label, price_pence, counts, revenue, order, enabled }
--     key      stable identifier, never changes ('adults', 'u16'…)
--     label    what a volunteer reads on the phone
--     counts   does it count toward OFFICIAL attendance?
--     revenue  does it contribute to EXPECTED gate revenue?
-- A complimentary or season-ticket admission counts as attendance but produces
-- no gate cash — which is exactly why declared receipts are reconciled against
-- expected revenue and never against the headcount.
create table if not exists public.md_price_lists (
  id             bigint generated always as identity primary key,
  season         text not null,
  competition_id text,
  label          text,
  categories     jsonb not null default '[]'::jsonb,
  effective_from date not null default current_date,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint md_price_lists_categories_is_array check (jsonb_typeof(categories) = 'array')
);

-- One list per (season, competition, effective date). A NULL competition_id is
-- the season default; two partial indexes are needed because NULL never equals
-- NULL in a plain unique constraint, which would let duplicate defaults in.
create unique index if not exists md_price_lists_default_uq
  on public.md_price_lists (season, effective_from)
  where competition_id is null;

create unique index if not exists md_price_lists_override_uq
  on public.md_price_lists (season, competition_id, effective_from)
  where competition_id is not null;

create index if not exists md_price_lists_season_idx
  on public.md_price_lists (season, effective_from desc);


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


-- ── 7 · SEED THE DEFAULT PRICE LIST ────────────────────────────────────────
-- Seeded from data/config.json's `admission` block, which is what the public
-- site already shows at the gate: General £9, Concessions £6, U16 £2, U10 free.
-- Categories that walk through the gate but pay nothing on the day
-- (complimentary, season ticket, officials, scouts) count toward attendance
-- and contribute nothing to expected revenue.
--
-- Staff edit this in the portal afterwards; this only stops the first match of
-- the season starting from an empty list.
insert into public.md_price_lists (season, competition_id, label, categories, effective_from, created_by)
select '2026-27', null, 'Standard admission 2026-27', $json$[
  {"key":"adults",       "label":"Adults",           "price_pence":900,"counts":true,"revenue":true, "order":1, "enabled":true},
  {"key":"concessions",  "label":"Concessions",      "price_pence":600,"counts":true,"revenue":true, "order":2, "enabled":true},
  {"key":"seniors",      "label":"Senior citizens",  "price_pence":600,"counts":true,"revenue":true, "order":3, "enabled":true},
  {"key":"students",     "label":"Students",         "price_pence":600,"counts":true,"revenue":true, "order":4, "enabled":true},
  {"key":"u16",          "label":"Under 16s",        "price_pence":200,"counts":true,"revenue":true, "order":5, "enabled":true},
  {"key":"u10",          "label":"Under 10s",        "price_pence":0,  "counts":true,"revenue":false,"order":6, "enabled":true},
  {"key":"complimentary","label":"Complimentary",    "price_pence":0,  "counts":true,"revenue":false,"order":7, "enabled":true},
  {"key":"season_ticket","label":"Season ticket",    "price_pence":0,  "counts":true,"revenue":false,"order":8, "enabled":true},
  {"key":"officials",    "label":"Match officials",  "price_pence":0,  "counts":true,"revenue":false,"order":9, "enabled":true},
  {"key":"scouts",       "label":"Scouts",           "price_pence":0,  "counts":true,"revenue":false,"order":10,"enabled":true},
  {"key":"away",         "label":"Away supporters",  "price_pence":900,"counts":true,"revenue":true, "order":11,"enabled":true},
  {"key":"other",        "label":"Other",            "price_pence":0,  "counts":true,"revenue":false,"order":12,"enabled":true}
]$json$::jsonb, date '2026-07-01', 'migration'
where not exists (
  select 1 from public.md_price_lists
  where season = '2026-27' and competition_id is null
);


-- ── DONE ───────────────────────────────────────────────────────────────────
-- Additive only. No table is dropped, no column is dropped, no data is
-- deleted, and match_finances is deliberately left completely untouched — the
-- old ledger remains readable until its migration has been verified (Stage 9).
