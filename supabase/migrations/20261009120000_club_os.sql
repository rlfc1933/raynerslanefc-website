-- ════════════════════════════════════════════════════════════════════════
--  CLUB OS — the records behind Staff HQ's commercial, funding, compliance,
--  communications, coaching, task and reward workflows.
--
--  Five tables, deliberately few. Every workflow (a sponsorship opportunity,
--  a grant, a compliance item, a comms draft, a fulfilment step, an invoice, a
--  coaching session, a plain task) is a row in hq_items with a `kind`, a
--  `stage` and an owner — so "what needs attention, who owns it, what is
--  overdue" is ONE query, not fourteen. The stage machines live in
--  netlify/functions/lib/club-os.js and are re-checked here with CHECKs.
--
--  Privacy: RLS on, no policies → only the service role (Netlify functions)
--  can read or write. None of this is ever published to /data or the repo.
--  Idempotent: safe to run twice.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- Organisations: sponsors, prospects, funders, community partners.
create table if not exists hq_orgs (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (length(trim(name)) between 1 and 200),
  name_key           text generated always as (lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g'))) stored,
  kind               text not null default 'business'
                     check (kind in ('business','funder','community','school','charity','other')),
  relationship       text not null default 'prospect'
                     check (relationship in ('prospect','sponsor','former_sponsor','partner','funder','other')),
  website            text,
  website_host       text,
  sector             text,
  town               text,
  legal_form         text not null default 'unknown'
                     check (legal_form in ('limited_company','llp','plc','sole_trader','partnership','charity','public_body','unknown')),
  companies_house_no text check (companies_house_no is null or companies_house_no ~ '^[A-Z0-9]{8}$'),
  contact_name       text,
  contact_email      text,
  contact_phone      text,
  -- UK GDPR / PECR: what the club may do with this contact. Sending is refused
  -- in code unless this is one of the contactable states AND not suppressed.
  permission         text not null default 'research_only'
                     check (permission in ('research_only','corporate_lawful_basis','express_consent',
                                           'existing_relationship','legal_review','opted_out','do_not_contact')),
  permission_note    text,
  source_url         text,
  verified_at        date,
  score              int check (score is null or score between 0 and 100),
  score_breakdown    jsonb,
  public_listing     boolean not null default false,   -- shown on the website ONLY when true (club-approved)
  notes              text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- Duplicate detection: one record per business name, and per website host.
create unique index if not exists hq_orgs_name_key_uq on hq_orgs (name_key);
create unique index if not exists hq_orgs_host_uq on hq_orgs (website_host) where website_host is not null;

-- Persistent suppression list (objections, withdrawals). Checked before any send.
create table if not exists hq_suppression (
  value      text primary key check (value = lower(value)),   -- an email address or @domain
  reason     text not null,
  added_by   text,
  added_at   timestamptz not null default now()
);

-- Every workflow record.
create table if not exists hq_items (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('task','opportunity','fulfilment','invoice','outreach',
                                                'grant','compliance','comms','analysis','enquiry')),
  title           text not null check (length(trim(title)) between 1 and 300),
  stage           text not null,
  owner           text,                      -- a person's name; required by code before work starts
  due_date        date,
  next_action     text,
  org_id          uuid references hq_orgs(id) on delete restrict,
  parent_id       uuid references hq_items(id) on delete restrict,
  value_pence     bigint check (value_pence is null or value_pence >= 0),     -- agreed / invoiced / awarded
  estimate_pence  bigint check (estimate_pence is null or estimate_pence >= 0), -- estimated (never mixed with actuals)
  paid_pence      bigint not null default 0 check (paid_pence >= 0),
  in_kind         boolean not null default false,
  data            jsonb not null default '{}'::jsonb,
  source          text,                       -- 'website-form', 'radar', 'manual', 'fixture:<id>' …
  source_ref      text,                       -- e.g. the submissions.id that created it
  idempotency_key text unique,                -- a retry or double-click can never create a second row
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz,
  constraint hq_items_paid_le_value check (kind <> 'invoice' or value_pence is null or paid_pence <= value_pence),
  constraint hq_items_stage_ck check (
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
    (kind = 'analysis'    and stage in ('open','reviewed','shared'))
  )
);
create index if not exists hq_items_kind_stage on hq_items (kind, stage);
create index if not exists hq_items_due on hq_items (due_date) where closed_at is null;
create index if not exists hq_items_parent on hq_items (parent_id);
create index if not exists hq_items_org on hq_items (org_id);
-- One invoice number, once.
create unique index if not exists hq_items_invoice_no_uq on hq_items ((data->>'invoice_no')) where kind = 'invoice';

-- Loyalty rewards: a reward for a member in a season can be redeemed ONCE.
create table if not exists hq_redemptions (
  id          uuid primary key default gen_random_uuid(),
  lane_no     text not null,
  reward_key  text not null,
  season      text not null,
  visits_at_redemption int not null check (visits_at_redemption >= 0),
  redeemed_by text not null,
  fixture_id  text,
  note        text,
  redeemed_at timestamptz not null default now(),
  unique (lane_no, reward_key, season)
);

-- Who did what, when, to which record. Append-only from the functions.
create table if not exists hq_audit (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      text not null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  note       text
);
create index if not exists hq_audit_entity on hq_audit (entity, entity_id);

-- updated_at maintenance
create or replace function hq_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create or replace trigger hq_orgs_touch before update on hq_orgs for each row execute function hq_touch();
create or replace trigger hq_items_touch before update on hq_items for each row execute function hq_touch();

-- The audit log cannot be rewritten.
create or replace function hq_audit_immutable() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'hq_audit is append-only'; end $$;
create or replace trigger hq_audit_no_update before update or delete on hq_audit for each row execute function hq_audit_immutable();

alter table hq_orgs        enable row level security;
alter table hq_suppression enable row level security;
alter table hq_items       enable row level security;
alter table hq_redemptions enable row level security;
alter table hq_audit       enable row level security;
revoke all on hq_orgs, hq_suppression, hq_items, hq_redemptions, hq_audit from anon, authenticated;
