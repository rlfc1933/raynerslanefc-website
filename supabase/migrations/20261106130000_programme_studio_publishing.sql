-- Programme Studio: an approved edition may publish from a chosen time
-- (or immediately) instead of only on matchday morning.
--
-- Additive and nullable: existing editions keep the matchday-morning rule
-- (lib/programme/lifecycle.js reads this column only when it is set).
-- Corrections after publication (lib/programme/lifecycle.js): a publisher
-- approves a correction; the engine writes a NEW version labelled 'correction'
-- when the approved words differ from those last published.
--
-- Rollback:
--   alter table programme_editions drop column if exists publish_not_before,
--     drop column if exists published_editorial_hash,
--     drop column if exists correction_approved_at,
--     drop column if exists correction_approved_by;
alter table public.programme_editions
  add column if not exists publish_not_before timestamptz,
  add column if not exists published_editorial_hash text,
  add column if not exists correction_approved_at timestamptz,
  add column if not exists correction_approved_by text;

comment on column public.programme_editions.publish_not_before is
  'Set by programme-admin approve_editorial(publishAt). Null = publish on matchday morning.';
