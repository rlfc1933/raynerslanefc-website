-- ════════════════════════════════════════════════════════════════════════
--  ASSET STUDIO — asset library, compositions, revisions, exports,
--  publication records and sponsor-logo versions.
--
--  Service role only (netlify/functions/studio-assets.js). Nothing here is
--  readable by anon or authenticated clients. Idempotent: safe to re-run.
--  Depends on hq_audit (20261009120000_club_os.sql).
--
--  Promises the database enforces, not just the code:
--    • an approved revision's document can never be changed or deleted;
--    • revision numbers are unique per graphic (two saves cannot both be "3");
--    • a sponsor has at most one CURRENT logo version;
--    • export and publication records are append-only.
-- ════════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- Uploaded assets. Repository assets are listed in js/studio/library-seed.json
-- and are not duplicated here.
create table if not exists studio_assets (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text not null check (category in ('identity','player','team','matchday','crest','sponsor','ground','heritage','template','publication')),
  src           text not null,                 -- data: URL for uploads (≤ 2.5 MB, enforced by the function)
  w             int  not null check (w > 0),
  h             int  not null check (h > 0),
  format        text,
  bytes         int,
  source        text not null default 'upload',
  rights_holder text not null,
  licence       text not null,
  approval      text not null default 'needs_review' check (approval in ('needs_review','approved','rejected','retired')),
  version       int  not null default 1,
  related       jsonb not null default '{}'::jsonb,   -- { fixture, player, sponsor, opponent }
  channel       text,
  usage         text,
  subject       jsonb,
  expires_at    date,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  approved_by   text,
  approved_at   timestamptz
);
create index if not exists studio_assets_category on studio_assets (category, approval);

-- Sponsor logos, versioned. Version 1 of each repository sponsor lives in the
-- seed; uploads continue the numbering.
create table if not exists studio_sponsor_logos (
  id           uuid primary key default gen_random_uuid(),
  sponsor_key  text not null,
  version      int  not null check (version >= 1),
  colour       text not null,
  white        text,
  ground       text not null default 'light' check (ground in ('light','dark')),   -- the background the artwork was drawn for
  w            int  not null check (w > 0),
  h            int  not null check (h > 0),
  ar           numeric(10,4) not null,
  approval     text not null default 'needs_review' check (approval in ('needs_review','approved','rejected','retired')),
  current      boolean not null default false,
  note         text,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  approved_by  text,
  approved_at  timestamptz,
  retired_at   timestamptz,
  unique (sponsor_key, version)
);
create unique index if not exists studio_sponsor_logos_one_current on studio_sponsor_logos (sponsor_key) where current;

create table if not exists studio_compositions (
  id             uuid primary key default gen_random_uuid(),
  template       text not null,
  title          text not null,
  state          text not null default 'draft' check (state in ('draft','review','approved','exported','published','archived')),
  fixture_id     text,
  sponsor_key    text,
  head_rev       int  not null default 1,
  approved_rev   int,
  last_export_at timestamptz,
  created_by     text not null,
  updated_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  archived_at    timestamptz
);
create index if not exists studio_compositions_fixture on studio_compositions (fixture_id);
create index if not exists studio_compositions_sponsor on studio_compositions (sponsor_key);
create index if not exists studio_compositions_updated on studio_compositions (updated_at desc);

create table if not exists studio_revisions (
  id              uuid primary key default gen_random_uuid(),
  composition_id  uuid not null references studio_compositions(id) on delete restrict,
  rev             int  not null check (rev >= 1),
  doc             jsonb not null,
  state           text not null default 'draft' check (state in ('draft','approved')),
  created_by      text not null,
  created_at      timestamptz not null default now(),
  approved_by     text,
  approved_at     timestamptz,
  unique (composition_id, rev)
);

create table if not exists studio_exports (
  id              uuid primary key default gen_random_uuid(),
  composition_id  uuid not null references studio_compositions(id) on delete restrict,
  rev             int  not null,
  format          text not null,
  kind            text not null check (kind in ('png','jpeg','pdf','zip')),
  w               int,
  h               int,
  bytes           int  not null check (bytes > 0),
  sha256          text,
  filename        text not null,
  proof           boolean not null default false,
  thumb           text,
  exported_by     text not null,
  exported_at     timestamptz not null default now()
);
create index if not exists studio_exports_comp on studio_exports (composition_id, exported_at desc);

create table if not exists studio_publications (
  id              uuid primary key default gen_random_uuid(),
  composition_id  uuid not null references studio_compositions(id) on delete restrict,
  rev             int,
  channel         text not null,
  url             text not null check (url ~ '^https?://'),
  note            text,
  recorded_by     text not null,
  recorded_at     timestamptz not null default now()
);

-- updated_at maintenance (hq_touch is defined by the Club OS migration; define
-- it here too so this file can be applied on its own).
create or replace function hq_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create or replace trigger studio_assets_touch before update on studio_assets for each row execute function hq_touch();
create or replace trigger studio_compositions_touch before update on studio_compositions for each row execute function hq_touch();

-- An approved revision is a record of what the club signed off. Its document
-- cannot change and the row cannot be deleted; a correction is a new revision.
create or replace function studio_revision_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'studio revisions are never deleted'; end if;
  if old.state = 'approved' and (new.doc is distinct from old.doc or new.rev <> old.rev or new.composition_id <> old.composition_id) then
    raise exception 'an approved revision cannot be changed — save a new revision';
  end if;
  if new.doc is distinct from old.doc then
    raise exception 'a revision''s document is fixed once saved — save a new revision';
  end if;
  return new;
end $$;
create or replace trigger studio_revisions_guard before update or delete on studio_revisions for each row execute function studio_revision_guard();

create or replace function studio_append_only() returns trigger language plpgsql set search_path = public as $$
begin raise exception '% is append-only', tg_table_name; end $$;
create or replace trigger studio_exports_append_only before update or delete on studio_exports for each row execute function studio_append_only();
create or replace trigger studio_publications_append_only before update or delete on studio_publications for each row execute function studio_append_only();

alter table studio_assets        enable row level security;
alter table studio_sponsor_logos enable row level security;
alter table studio_compositions  enable row level security;
alter table studio_revisions     enable row level security;
alter table studio_exports       enable row level security;
alter table studio_publications  enable row level security;
revoke all on studio_assets, studio_sponsor_logos, studio_compositions, studio_revisions, studio_exports, studio_publications from anon, authenticated;
