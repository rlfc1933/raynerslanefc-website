-- Squad states for the "Squad changes to review" queue (squad-review.js).
-- NOT APPLIED automatically. Until this runs, "On loan" and "Needs review" are
-- refused with a plain message and nothing changes; everything else works.
--
-- Additive only: the existing values keep their meaning, no row is rewritten.
-- Rollback: re-create the previous constraint (listed below) after moving any
-- on_loan / needs_review rows back to 'active'.
--   check (status in ('pending','active','injured','released','left'))
alter table public.la_players drop constraint if exists la_players_status_check;
alter table public.la_players
  add constraint la_players_status_check
  check (status in ('pending','active','injured','released','left','on_loan','needs_review'));
