-- The programme's legal footer, stored WITH the edition.
--
-- FA Standardised Rules 2.15 (FA Handbook 2025-26, section 27; mandatory at
-- Steps 1-6, and Rayners Lane are Step 5) requires the club's legal name, form
-- and any identifier to appear "within the Club's official matchday programme".
--
-- It is stored per version rather than resolved at read time for the same
-- reason as the crests: an archived edition must show the footer that was
-- current when it was published, not today's.
alter table public.programme_versions
  add column if not exists legal_footer jsonb;

comment on column public.programme_versions.legal_footer is
  'FA Standardised Rules 2.15 identity block, captured at publication. Immutable with the version.';
