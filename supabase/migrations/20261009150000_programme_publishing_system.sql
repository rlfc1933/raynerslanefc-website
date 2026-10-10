-- ════════════════════════════════════════════════════════════════════════════
-- THE MATCHDAY PROGRAMME PUBLISHING SYSTEM (October 2026)
--
-- Two-stage editions, auditable revisions, editorial sections that survive a
-- data refresh, team-sheet revisions, approved sponsor placements, publication
-- events, source snapshots/discrepancies and the provider request budget.
--
-- Additive and idempotent: every statement can run twice. Nothing existing is
-- dropped except the state CHECK, which is replaced by a superset.
--
-- PUBLIC READ IS UNCHANGED. The editions/versions read policies from
-- 20260803120000_programme_recovery.sql still decide what the public may see.
-- Every new table below has RLS ON and NO policy, so only the service role
-- (Netlify functions) can touch it.
-- ════════════════════════════════════════════════════════════════════════════

-- ── editions: the two-stage model and the audit columns ─────────────────────
alter table public.programme_editions
  -- 'matchday'      prepared before the match
  -- 'retrospective' reconstructed afterwards from verified match records, and
  --                 labelled "Archive Edition — Reconstructed from verified
  --                 match records" wherever it is shown
  add column if not exists edition_kind text not null default 'matchday'
    check (edition_kind in ('matchday','retrospective')),
  -- Team-sheet availability is modelled SEPARATELY from publication: a
  -- published edition can legitimately have no confirmed line-ups.
  add column if not exists teams_status text not null default 'pending'
    check (teams_status in ('pending','partial','confirmed','not_applicable')),
  add column if not exists teams_confirmed_at timestamptz,
  -- Stage A approval. A named human approves the editorial edition; the engine
  -- publishes it on matchday morning. Narrow pre-approval for evergreen content
  -- lives in programme_sections.preapproved.
  add column if not exists editorial_approved_by text,
  add column if not exists editorial_approved_at timestamptz,
  add column if not exists editorial_approved_hash text,
  -- Unpublishing is a decision with a reason, never a delete.
  add column if not exists unpublished_at timestamptz,
  add column if not exists unpublished_by text,
  add column if not exists unpublished_reason text,
  -- Postponement keeps whatever was published and says so.
  add column if not exists fixture_postponed_at timestamptz,
  add column if not exists superseded_by_fixture text,
  add column if not exists edition_number int,
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz,
  add column if not exists retry_count int not null default 0;

alter table public.programme_editions
  drop constraint if exists programme_editions_state_check;
alter table public.programme_editions
  add constraint programme_editions_state_check
  check (state in ('draft_hidden','waiting_for_matchday','waiting_for_lineups',
                   'ready_to_publish','published_matchday','published_late',
                   'full_time_current','archived','withheld',
                   'published_recovery','retrospective_candidate',
                   -- added here
                   'not_required','awaiting_fixture_confirmation','ready_for_review',
                   'approved','postponed','cancelled','publication_error'));

-- One edition number per season, assigned once.
create unique index if not exists programme_editions_number_uq
  on public.programme_editions (season, edition_number) where edition_number is not null;

-- ── versions: stage, revision reason and an idempotency hash ────────────────
alter table public.programme_versions
  add column if not exists stage text
    check (stage is null or stage in ('editorial','teams_partial','teams_confirmed',
                                      'full_time','retrospective','rollback','correction')),
  add column if not exists content_hash text,
  add column if not exists revision_reason text,
  add column if not exists restored_from_version int;
-- The same content twice is the same revision: a retried job, a double click
-- or a provider repeating itself never makes a second one.
create unique index if not exists programme_versions_hash_uq
  on public.programme_versions (edition_id, content_hash) where content_hash is not null;

-- ── editorial sections: manual work a data refresh must never erase ─────────
create table if not exists public.programme_sections (
  id            bigint generated always as identity primary key,
  edition_id    bigint references public.programme_editions(id) on delete cascade,
  -- null edition_id = an evergreen block (club history, ground rules) reused
  -- by every edition once approved.
  section_key   text not null,
  title         text,
  body          text,
  data          jsonb,
  source        text not null default 'manual' check (source in ('manual','evergreen','provider','generated')),
  -- Chairman's notes need a named approver; generated copy is never attributed.
  byline        text,
  approved_by   text,
  approved_at   timestamptz,
  preapproved   bool not null default false,
  locked        bool not null default true,
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists programme_sections_edition_key_uq
  on public.programme_sections (coalesce(edition_id, 0), section_key);

create table if not exists public.programme_section_revisions (
  id          bigint generated always as identity primary key,
  section_id  bigint not null references public.programme_sections(id) on delete cascade,
  body        text,
  data        jsonb,
  changed_by  text,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ── team sheets: every confirmed sheet, revisioned by content ───────────────
create table if not exists public.programme_team_sheets (
  id               bigint generated always as identity primary key,
  edition_id       bigint not null references public.programme_editions(id) on delete cascade,
  side             text not null check (side in ('home','away')),
  status           text not null check (status in ('confirmed','rejected')),
  players          jsonb not null,
  source           text not null default 'fwp',
  source_updated_at timestamptz,
  content_hash     text not null,
  -- A human correction ("correct a name") is a new revision, never an edit.
  corrected_by     text,
  correction_note  text,
  validation_errors jsonb,
  created_at       timestamptz not null default now(),
  unique (edition_id, side, content_hash)
);

-- ── sponsor placements: only approved commercial records ever render ────────
create table if not exists public.programme_sponsor_placements (
  id              bigint generated always as identity primary key,
  -- null edition_id + a season = a season-long programme partner
  edition_id      bigint references public.programme_editions(id) on delete cascade,
  season          text,
  sponsor_name    text not null,
  placement_kind  text not null check (placement_kind in
    ('full_page','half_page','quarter_page','title_sponsor','match_sponsor','match_ball','directory')),
  approval_status text not null default 'proposed'
    check (approval_status in ('proposed','approved','withdrawn')),
  approved_by     text,
  approved_at     timestamptz,
  artwork_path    text,
  artwork_width   int,
  artwork_height  int,
  website         text,
  copy_text       text,
  -- The HQ commercial record this obligation came from, when there is one.
  hq_item_id      text,
  starts_on       date,
  ends_on         date,
  fulfilled_at    timestamptz,
  fulfilment_evidence jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists programme_sponsor_placements_edition_idx
  on public.programme_sponsor_placements (edition_id, approval_status);

-- ── publication events: the audited transitions ─────────────────────────────
create table if not exists public.programme_publication_events (
  id              bigint generated always as identity primary key,
  edition_id      bigint references public.programme_editions(id) on delete cascade,
  event_type      text not null,
  from_state      text,
  to_state        text,
  version         int,
  actor           text not null default 'programme-sync',
  reason          text,
  detail          jsonb,
  -- A retried job writes the same key and is refused by the index.
  idempotency_key text,
  created_at      timestamptz not null default now()
);
create unique index if not exists programme_publication_events_idem_uq
  on public.programme_publication_events (idempotency_key) where idempotency_key is not null;
create index if not exists programme_publication_events_edition_idx
  on public.programme_publication_events (edition_id, created_at desc);

-- ── sources: snapshots, and disagreements kept with BOTH values ─────────────
create table if not exists public.programme_source_snapshots (
  id            bigint generated always as identity primary key,
  provider      text not null,           -- 'fwp_api', 'registry', 'fa_fulltime_manual', 'club'
  endpoint      text,
  fixture_key   text,
  payload       jsonb,
  payload_hash  text,
  fetched_at    timestamptz not null default now(),
  unique (provider, endpoint, payload_hash)
);

create table if not exists public.programme_source_discrepancies (
  id            bigint generated always as identity primary key,
  fixture_key   text not null,
  field         text not null,
  source_a      text not null,
  value_a       text,
  source_b      text not null,
  value_b       text,
  status        text not null default 'open' check (status in ('open','resolved','accepted')),
  resolution    text,
  resolved_by   text,
  evidence_url  text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (fixture_key, field, source_a, source_b, value_a, value_b)
);

-- ── provider budget: FWP allows ten requests a minute, shared by every job ──
create table if not exists public.programme_provider_requests (
  id          bigint generated always as identity primary key,
  provider    text not null,
  endpoint    text not null,
  status      int,
  ok          bool,
  requested_at timestamptz not null default now()
);
create index if not exists programme_provider_requests_recent_idx
  on public.programme_provider_requests (provider, requested_at desc);

-- ── RLS: on everywhere, no policies → service role only ─────────────────────
alter table public.programme_sections             enable row level security;
alter table public.programme_section_revisions    enable row level security;
alter table public.programme_team_sheets          enable row level security;
alter table public.programme_sponsor_placements   enable row level security;
alter table public.programme_publication_events   enable row level security;
alter table public.programme_source_snapshots     enable row level security;
alter table public.programme_source_discrepancies enable row level security;
alter table public.programme_provider_requests    enable row level security;

drop trigger if exists programme_sections_touch on public.programme_sections;
create trigger programme_sections_touch before update on public.programme_sections
  for each row execute function public.programme_touch();
drop trigger if exists programme_sponsor_placements_touch on public.programme_sponsor_placements;
create trigger programme_sponsor_placements_touch before update on public.programme_sponsor_placements
  for each row execute function public.programme_touch();

comment on column public.programme_editions.edition_kind is
  'retrospective = reconstructed after the match from verified records; always labelled as such.';
comment on column public.programme_editions.teams_status is
  'Team-sheet availability, independent of publication state.';
