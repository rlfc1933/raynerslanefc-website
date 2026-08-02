-- ════════════════════════════════════════════════════════════════════════════
-- OPTIONAL MOBILE NUMBER, AND A SEPARATE WHATSAPP PERMISSION.
--
-- THE RULE THIS FILE ENFORCES, STATED ONCE
-- ----------------------------------------
-- Holding somebody's phone number is not permission to message them. Those are
-- two decisions made at two moments, and the second one is the one that can be
-- withdrawn. So they are two tables, not two columns on one row — because a
-- column is easy to read as "we have the number, therefore we may use it", and
-- a separate consent record with its own timestamps and wording version is not.
--
-- WHAT THIS RELEASE DELIBERATELY DOES NOT DO
-- ------------------------------------------
-- There is no SMS verification provider. So a number a supporter types is
-- 'provided_unverified' and stays that way. Calling it verified because it
-- looks like a phone number would be a lie the club would later act on.
--
-- Nothing here sends a WhatsApp message, creates a group, uploads a contact or
-- calls an API. It records a permission for a service that has not launched.
-- ════════════════════════════════════════════════════════════════════════════

-- ── THE NUMBER ──────────────────────────────────────────────────────────────
create table if not exists public.fan_contact_numbers (
  member_id       bigint primary key references public.fan_members(id) on delete cascade,

  -- What they typed, kept because a supporter recognises their own formatting
  -- and staff reading it back to them should see what they wrote.
  raw_input       text,
  -- The comparable form. E.164 is what any future provider will want.
  e164            text,
  country         text,

  status          text not null default 'provided_unverified'
    check (status in ('not_provided','provided_unverified','verified','invalid','removed')),

  added_at        timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  removed_at      timestamptz
);

-- DELIBERATELY NOT UNIQUE. A husband and wife, a parent and teenager, two
-- brothers who share a phone — these are real supporters, and refusing the
-- second one would be a bug that looks like a policy. Duplicates are surfaced
-- to staff as a note, never merged automatically.
create index if not exists fan_contact_numbers_e164_idx
  on public.fan_contact_numbers (e164) where e164 is not null and status <> 'removed';

comment on table public.fan_contact_numbers is
  'Optional supporter mobile. Never unique — families legitimately share a phone. Never verified without a verification provider.';

-- ── THE PERMISSION ──────────────────────────────────────────────────────────
create table if not exists public.fan_whatsapp_consent (
  member_id       bigint primary key references public.fan_members(id) on delete cascade,

  opted_in        boolean not null default false,
  consented_at    timestamptz,
  withdrawn_at    timestamptz,

  -- Exactly what they agreed to, so it can be shown back to them.
  wording_version text,
  consent_source  text,

  -- The consent is for a NUMBER, not for a person in the abstract. If the
  -- number changes, the permission has to be looked at again — carrying it
  -- across silently would mean messaging a phone nobody agreed to.
  number_e164     text,

  -- Set when the club must not contact them regardless of the flags above:
  -- a complaint, a bounce, a withdrawal we want to honour permanently.
  suppressed      boolean not null default false,
  suppressed_at   timestamptz,
  suppressed_reason text,

  updated_at      timestamptz not null default now()
);

comment on table public.fan_whatsapp_consent is
  'Permission to message, separate from holding a number. Bound to the number consented for. Withdrawable, suppressible, never assumed.';

-- ── WHO ACTUALLY COUNTS TOWARDS THE 50 ──────────────────────────────────────
-- A view, so the portal, the health check and any future export all read the
-- same definition. Counting "everyone with a mobile number" would overstate it
-- by including people who never agreed to anything.
create or replace view public.fan_whatsapp_eligible as
  select m.id            as member_id,
         m.first_name,
         m.last_name,
         m.membership_number,
         n.e164,
         c.consented_at,
         c.wording_version,
         m.signup_source
    from public.fan_members m
    join public.fan_contact_numbers n on n.member_id = m.id
    join public.fan_whatsapp_consent c on c.member_id = m.id
   where m.membership_status = 'active'
     and c.opted_in is true
     and c.withdrawn_at is null
     and c.suppressed is false
     and n.status in ('provided_unverified','verified')
     and n.e164 is not null;

comment on view public.fan_whatsapp_eligible is
  'The ONE definition of who counts towards the 50. Counting every stored mobile number would include people who never agreed to anything.';

-- ── SUPPORTER INTERESTS ─────────────────────────────────────────────────────
-- Chosen BY the supporter, from a fixed list. Not inferred, not scored, and
-- not a place for staff opinions — those go in notes, with a name against them.
create table if not exists public.fan_interests (
  member_id   bigint not null references public.fan_members(id) on delete cascade,
  interest    text not null check (interest in
    ('volunteering','sponsorship','away_travel','matchday_help','youth_football',
     'social_events','photography','commentary')),
  added_at    timestamptz not null default now(),
  primary key (member_id, interest)
);

-- ── STAFF NOTES, WITH A NAME AND A TIME AGAINST EVERY ONE ───────────────────
create table if not exists public.fan_member_notes (
  id          bigint generated always as identity primary key,
  member_id   bigint not null references public.fan_members(id) on delete cascade,
  body        text not null check (length(btrim(body)) between 1 and 1000),
  author      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  edited_by   text,
  -- Kept rather than overwritten, so an edit cannot quietly rewrite what was
  -- said about a supporter.
  previous_body text
);
create index if not exists fan_member_notes_member_idx
  on public.fan_member_notes (member_id, created_at desc);

comment on table public.fan_member_notes is
  'Relationship notes only — what helps the club support this supporter. Every note carries an author and a timestamp, and edits keep the previous text.';

-- ── EXPORT AUDIT ────────────────────────────────────────────────────────────
-- An export of supporter contact details is the single most sensitive thing
-- this system can do, so it leaves a row behind whether or not anyone looks.
create table if not exists public.fan_export_audit (
  id          bigint generated always as identity primary key,
  exported_by text not null,
  reason      text not null check (length(btrim(reason)) between 3 and 500),
  scope       text not null,
  row_count   int not null,
  created_at  timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.fan_contact_numbers   enable row level security;
alter table public.fan_whatsapp_consent  enable row level security;
alter table public.fan_interests         enable row level security;
alter table public.fan_member_notes      enable row level security;
alter table public.fan_export_audit      enable row level security;

-- A supporter may read their own number, their own permission and their own
-- interests. Notes and the export audit are club records: no policy at all,
-- so only the service key can read them.
drop policy if exists fan_numbers_self on public.fan_contact_numbers;
create policy fan_numbers_self on public.fan_contact_numbers
  for select using (exists (select 1 from public.fan_members m
    where m.id = fan_contact_numbers.member_id and m.auth_user_id = auth.uid()));

drop policy if exists fan_whatsapp_self on public.fan_whatsapp_consent;
create policy fan_whatsapp_self on public.fan_whatsapp_consent
  for select using (exists (select 1 from public.fan_members m
    where m.id = fan_whatsapp_consent.member_id and m.auth_user_id = auth.uid()));

drop policy if exists fan_interests_self on public.fan_interests;
create policy fan_interests_self on public.fan_interests
  for select using (exists (select 1 from public.fan_members m
    where m.id = fan_interests.member_id and m.auth_user_id = auth.uid()));

-- The eligibility view reads member tables; keep it off the public API.
revoke all on public.fan_whatsapp_eligible from anon, authenticated;

-- ── SETTING A NUMBER AND A PERMISSION, TOGETHER AND CORRECTLY ───────────────
-- One function, because the interesting rule is a relationship BETWEEN the two:
-- changing the number must invalidate a permission given for the old one.
create or replace function public.fan_set_contact(
  p_member_id   bigint,
  p_raw         text,
  p_e164        text,
  p_country     text,
  p_whatsapp    boolean default null,
  p_wording     text default null,
  p_source      text default 'account'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_e164 text;
  v_number   public.fan_contact_numbers%rowtype;
  v_consent  public.fan_whatsapp_consent%rowtype;
  v_removing boolean := (coalesce(btrim(p_e164), '') = '');
begin
  if p_member_id is null then raise exception 'member required'; end if;

  select e164 into v_old_e164 from public.fan_contact_numbers where member_id = p_member_id;

  insert into public.fan_contact_numbers (member_id, raw_input, e164, country, status, updated_at, removed_at)
  values (p_member_id,
          nullif(btrim(coalesce(p_raw, '')), ''),
          nullif(btrim(coalesce(p_e164, '')), ''),
          nullif(btrim(coalesce(p_country, '')), ''),
          case when v_removing then 'removed' else 'provided_unverified' end,
          now(),
          case when v_removing then now() end)
  on conflict (member_id) do update set
    raw_input  = excluded.raw_input,
    e164       = excluded.e164,
    country    = excluded.country,
    -- Never promoted to 'verified' here. There is no verification provider,
    -- and a number that looks valid is not a number somebody answered.
    status     = excluded.status,
    updated_at = now(),
    removed_at = excluded.removed_at
  returning * into v_number;

  -- The number changed, or was removed, and a permission exists for the old
  -- one. Withdraw it. Consent travels with a number, not with a person.
  if v_old_e164 is distinct from v_number.e164 then
    update public.fan_whatsapp_consent
       set opted_in = false,
           withdrawn_at = coalesce(withdrawn_at, now()),
           updated_at = now()
     where member_id = p_member_id
       and opted_in is true
       and number_e164 is distinct from v_number.e164;
  end if;

  if p_whatsapp is not null then
    if p_whatsapp and v_number.e164 is null then
      raise exception 'cannot opt in to WhatsApp without a mobile number';
    end if;
    insert into public.fan_whatsapp_consent (
      member_id, opted_in, consented_at, withdrawn_at,
      wording_version, consent_source, number_e164, updated_at)
    values (p_member_id, p_whatsapp,
            case when p_whatsapp then now() end,
            case when not p_whatsapp then now() end,
            p_wording, p_source, v_number.e164, now())
    on conflict (member_id) do update set
      opted_in        = excluded.opted_in,
      consented_at    = case when excluded.opted_in then now()
                             else public.fan_whatsapp_consent.consented_at end,
      withdrawn_at    = case when not excluded.opted_in then now() else null end,
      wording_version = excluded.wording_version,
      consent_source  = excluded.consent_source,
      number_e164     = excluded.number_e164,
      updated_at      = now()
    returning * into v_consent;
  else
    select * into v_consent from public.fan_whatsapp_consent where member_id = p_member_id;
  end if;

  return jsonb_build_object(
    'mobile', jsonb_build_object(
      'status', v_number.status,
      'e164', v_number.e164,
      'country', v_number.country),
    'whatsapp', jsonb_build_object(
      'optedIn', coalesce(v_consent.opted_in, false),
      'consentedAt', v_consent.consented_at,
      'withdrawnAt', v_consent.withdrawn_at,
      'suppressed', coalesce(v_consent.suppressed, false))
  );
end;
$$;

revoke all on function public.fan_set_contact from public, anon, authenticated;

comment on function public.fan_set_contact is
  'Sets a supporter mobile and, separately, their WhatsApp permission. Changing the number withdraws a permission given for the previous one.';
