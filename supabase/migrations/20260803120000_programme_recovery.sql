-- MISSED-PUBLICATION RECOVERY.
--
-- Supporters got no programme for Rayners Lane v Wallingford & Crowmarsh, and
-- the engine reported the edition as "waiting for matchday" — for a matchday
-- that had already been and gone. It could only publish ON the day, so any
-- fixture whose day passed without publication waited for ever, for a date in
-- the past.
--
-- Recovery publishes it late and says so. It never backdates: published_at is
-- always the real moment, because a backdated timestamp would be the club
-- claiming supporters had something on the day that they did not.

alter table public.programme_editions
  -- 'automatic'         the normal path, on matchday
  -- 'recovery'          the moment was missed; published inside the window
  -- 'retrospective'     published long after, by a named human
  add column if not exists publication_source_detail text
    check (publication_source_detail is null or publication_source_detail in
           ('automatic','recovery','retrospective')),
  add column if not exists recovery_reason text,
  add column if not exists published_after_full_time bool not null default false,
  add column if not exists fulltime_enriched_at timestamptz,
  -- Outside the recovery window a person authorises, and is named for it. A
  -- timer must never quietly manufacture a history the club never had.
  add column if not exists retrospective_authorised_by text,
  add column if not exists retrospective_authorised_at timestamptz,
  add column if not exists retrospective_note text,
  -- WHO stopped this edition. Set only by a person.
  --
  -- decide() used to treat withheld_reason as "a human said no" — but the sync
  -- writes that field whenever it withholds for an ordinary technical reason.
  -- The first automatic withhold therefore latched the edition shut for ever.
  -- A machine's reason for waiting is not a person's decision to stop.
  add column if not exists withheld_by text;

-- Clear the latch on any edition an automatic run shut. Nothing here was ever
-- stopped by a person, so nothing loses a human decision.
update public.programme_editions
   set withheld_reason = null
 where withheld_reason is not null;

-- The two new states.
alter table public.programme_editions
  drop constraint if exists programme_editions_state_check;
alter table public.programme_editions
  add constraint programme_editions_state_check
  check (state in ('draft_hidden','waiting_for_matchday','waiting_for_lineups',
                   'ready_to_publish','published_matchday','published_late',
                   'full_time_current','archived','withheld',
                   'published_recovery','retrospective_candidate'));

-- A recovered edition is as public as any other. It IS published — the only
-- difference is when, and that difference is stated on the edition itself
-- rather than hidden.
drop policy if exists programme_editions_public_read on public.programme_editions;
create policy programme_editions_public_read on public.programme_editions
  for select using (state in ('published_matchday','published_late',
                              'full_time_current','archived','published_recovery'));

-- A retrospective candidate is NOT public. It is a proposal awaiting a human,
-- and an unapproved proposal is not part of the club's record.

comment on column public.programme_editions.published_after_full_time is
  'True when the edition first became available after the final whistle. Shown to readers.';
comment on column public.programme_editions.retrospective_authorised_by is
  'Who authorised publishing an edition for a match played outside the recovery window.';

-- The versions policy has to move with the editions policy, or a recovered
-- edition would be listed and then refuse to open — the worst of both.
drop policy if exists programme_versions_public_read on public.programme_versions;
create policy programme_versions_public_read on public.programme_versions
  for select using (
    published_at is not null
    and exists (
      select 1 from public.programme_editions e
      where e.id = programme_versions.edition_id
        and e.state in ('published_matchday','published_late','full_time_current',
                        'archived','published_recovery')
    )
  );
