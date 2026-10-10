-- ════════════════════════════════════════════════════════════════════════
--  BACK THE LANE / RUN THE LANE — the records behind prospect import, the
--  sponsor journey's fixture slots, verified home attendance, volunteering,
--  private proposals, Future of the Lane research and the confidential
--  operating-cost model.
--
--  Builds on 20261009120000_club_os.sql (hq_items stays the one workflow
--  table; four new kinds). Privacy: RLS on, no policies, anon/authenticated
--  revoked → only the service role (Netlify functions) can read or write.
--  Idempotent: safe to run twice.
-- ════════════════════════════════════════════════════════════════════════

-- ── hq_items: four new kinds and their stages ────────────────────────────
alter table hq_items drop constraint if exists hq_items_kind_check;
alter table hq_items add constraint hq_items_kind_check check (kind in ('task','opportunity','fulfilment','invoice','outreach',
  'grant','compliance','comms','analysis','enquiry','volunteer_role','volunteer_offer','proposal','research'));
alter table hq_items drop constraint if exists hq_items_stage_ck;
alter table hq_items add constraint hq_items_stage_ck check (
  (kind = 'task'        and stage in ('open','in_progress','blocked','done','cancelled')) or
  (kind = 'enquiry'     and stage in ('new','acknowledged','assigned','answered','closed')) or
  (kind = 'opportunity' and stage in ('research','qualified','contact_approved','contacted','responded',
                                      'meeting','proposal','negotiation','won','lost','not_interested')) or
  (kind = 'fulfilment'  and stage in ('todo','done','not_applicable')) or
  (kind = 'invoice'     and stage in ('draft','approved','issued','part_paid','paid','overdue','void')) or
  (kind = 'outreach'    and stage in ('draft','approved','sent','replied','no_reply','withdrawn')) or
  (kind = 'grant'       and stage in ('discovered','eligibility_review','eligible','ineligible','uncertain',
                                      'preparing','awaiting_approval','submitted','awarded','declined')) or
  (kind = 'compliance'  and stage in ('not_started','in_progress','complete','overdue','not_applicable')) or
  (kind = 'comms'       and stage in ('draft','review','approved','scheduled','published','withdrawn')) or
  (kind = 'analysis'    and stage in ('open','reviewed','shared')) or
  (kind = 'volunteer_role'  and stage in ('draft','approved','open','filled','closed')) or
  (kind = 'volunteer_offer' and stage in ('new','contacted','approved','assigned','delivered','recognised','declined','withdrawn')) or
  (kind = 'proposal'    and stage in ('draft','review','approved','declined','parked')) or
  (kind = 'research'    and stage in ('open','reviewed','archived'))
);

-- ── Prospect import staging ──────────────────────────────────────────────
create table if not exists hq_import_batches (
  id            uuid primary key default gen_random_uuid(),
  filename      text,
  source_label  text not null check (length(trim(source_label)) > 0),   -- where the list came from
  content_hash  text not null unique,                                    -- the same file twice stages once
  uploaded_by   text not null,
  rows_total    int not null default 0 check (rows_total >= 0),
  rows_staged   int not null default 0 check (rows_staged >= 0),
  rows_skipped  int not null default 0 check (rows_skipped >= 0),
  summary       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
alter table hq_orgs add column if not exists import_batch_id uuid references hq_import_batches(id) on delete restrict;
alter table hq_orgs add column if not exists source_label text;
-- An imported address is unusable until a person re-checks it and records the date.
alter table hq_orgs add column if not exists email_checked_at date;
create index if not exists hq_orgs_import_batch on hq_orgs (import_batch_id);

-- ── Per-fixture sponsor slots: never oversold ────────────────────────────
-- One match-ball and one matchday sponsor per home fixture (registry id).
-- The unique key makes a double booking impossible, even from two phones.
create table if not exists hq_fixture_slots (
  id             uuid primary key default gen_random_uuid(),
  fixture_id     text not null,
  slot           text not null check (slot in ('matchball','matchday')),
  opportunity_id uuid not null unique references hq_items(id) on delete restrict,
  held_by        text not null,
  status         text not null default 'held' check (status in ('held','confirmed')),
  created_at     timestamptz not null default now(),
  unique (fixture_id, slot)
);

-- ── Verified home attendance, one figure per home fixture ────────────────
create table if not exists hq_attendance (
  id           uuid primary key default gen_random_uuid(),
  fixture_id   text not null unique,              -- registry fixture id
  match_date   date not null,                     -- Europe/London date of kick-off
  opponent     text,
  headcount    int not null check (headcount between 0 and 5000),
  method       text not null check (method in ('turnstile count','manual headcount','clicker count','match day ops')),
  recorded_by  text not null,
  verified_by  text,
  verified_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint hq_attendance_second_person check (verified_by is null or lower(trim(verified_by)) <> lower(trim(recorded_by)))
);
create index if not exists hq_attendance_date on hq_attendance (match_date desc);
create or replace trigger hq_attendance_touch before update on hq_attendance for each row execute function hq_touch();

-- ── Confidential operating-cost model ────────────────────────────────────
-- Entered only through the finance actions, which require a signed staff
-- token with finance rights on a personal password. Cash, pledged and
-- in-kind are separate columns of meaning, never summed together.
create table if not exists hq_finance_lines (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('income','cost','cash_balance','liability')),
  category     text not null,
  label        text not null check (length(trim(label)) between 1 and 200),
  amount_pence bigint not null check (amount_pence >= 0),
  frequency    text check (frequency is null or frequency in ('monthly','per_home_match','annual','one_off')),
  basis        text not null check (basis in ('actual','budget','estimate')),
  receipt      text check (receipt is null or receipt in ('cash','pledged','in_kind')),
  fixed        boolean not null default false,
  repeatable   boolean not null default false,
  as_of        date,
  evidence     text,
  entered_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  archived_by  text,
  constraint hq_finance_income_receipt check (kind <> 'income' or receipt is not null),
  constraint hq_finance_actual_evidence check (basis <> 'actual' or (evidence is not null and length(trim(evidence)) > 0))
);
create or replace trigger hq_finance_touch before update on hq_finance_lines for each row execute function hq_touch();

alter table hq_import_batches enable row level security;
alter table hq_fixture_slots  enable row level security;
alter table hq_attendance     enable row level security;
alter table hq_finance_lines  enable row level security;
revoke all on hq_import_batches, hq_fixture_slots, hq_attendance, hq_finance_lines from anon, authenticated;
