-- ════════════════════════════════════════════════════════════════════════
-- RAYNERS LANE FC — form submissions capture
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL → New query → Run).
--
-- One table for every public form (trials, volunteers, sponsors, contact,
-- membership). Locked down: NO anon/authenticated access — every read and write
-- goes through a Netlify Function using the service_role key (server-side only).
--
-- ⚠️ UK GDPR: the trials form collects special-category HEALTH data (age +
-- previous injuries) and applicants can be children. That data lives ONLY here.
-- Retention: purge trial records after 24 months (staff can Delete in the portal
-- Records tab; a scheduled purge can be added later). Never copy this data into
-- any committed file, data/*.json, or public endpoint.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  type           text not null check (type in ('trial','volunteer','sponsor','contact','membership','other')),
  name           text,
  email          text,
  phone          text,
  payload        jsonb not null default '{}'::jsonb,   -- all remaining form fields
  status         text not null default 'new'
                 check (status in ('new','contacted','in_progress','trialled','signed','declined','archived')),
  staff_notes    text,
  handled_by     text,
  read_at        timestamptz,
  source_page    text,
  user_agent     text,
  consent        boolean not null default false,
  guardian_name  text,
  guardian_email text,
  is_minor       boolean not null default false
);

create index if not exists submissions_type_created_idx on public.submissions (type, created_at desc);
create index if not exists submissions_status_idx        on public.submissions (status);

-- LOCK IT DOWN — service_role only.
alter table public.submissions enable row level security;
-- Deliberately NO policies for anon/authenticated: they can read and write NOTHING.
-- The service_role key bypasses RLS and is used ONLY inside Netlify Functions
-- (submit-form.js to write, list-submissions.js to read). Never add an anon
-- insert policy "for convenience" — all writes go through the function so we keep
-- control of validation, the honeypot, and rate limiting.
