-- ════════════════════════════════════════════════════════════════════════════
-- FAN ZONE COMPLETION — the journey, not just the lock.
--
-- The previous release built a correct gate in front of a door nobody could
-- reach. The server refused non-members properly; no supporter could become a
-- member, so the correct answer was always "no". This migration supplies the
-- parts the journey was missing, and makes the two silent failure modes that
-- caused it impossible rather than merely fixed:
--
--   1. Membership creation was four separate writes across two files. Any one
--      could fail and leave a half-supporter. It is now ONE function, one
--      transaction, callable only by the service role.
--
--   2. Membership numbers were `1000 + random()*9000`, with no unique index
--      and no retry. Two supporters could hold one number and nothing would
--      have noticed. Numbers now come from a sequence, skip anything already
--      taken, and the database refuses a duplicate.
--
-- IDENTITY RULE, stated once and enforced everywhere below: a legacy Lane Card
-- is linked ONLY by proven identity — the auth user id, or a verified email.
-- Never by name, town, photo, similar username or a guessed number. Anything
-- that cannot be proven becomes a review item for a human, because a wrongly
-- merged supporter is far worse than an unmerged one.
-- ════════════════════════════════════════════════════════════════════════════

-- ── fans: give it a verified-email column so a recreated account can be found
-- Nullable on purpose. It is a MATCHING key, populated only from a verified
-- auth email — never typed in, never trusted from a browser.
alter table public.fans add column if not exists email_normalised text;
create unique index if not exists fans_email_normalised_idx
  on public.fans (email_normalised) where email_normalised is not null;

comment on column public.fans.email_normalised is
  'Verified auth email, lower-cased. Matching key only, written server-side from auth.users. Never user-supplied.';

-- ── fan_members: the explicit link to the Lane Card profile
alter table public.fan_members add column if not exists fan_id uuid references public.fans(id);
create index if not exists fan_members_fan_id_idx on public.fan_members (fan_id);

-- One Lane Card cannot back two memberships.
create unique index if not exists fan_members_fan_id_unique_idx
  on public.fan_members (fan_id) where fan_id is not null;

-- ── MEMBERSHIP NUMBER INTEGRITY ─────────────────────────────────────────────
-- The random allocator is gone. A sequence cannot hand the same value to two
-- concurrent signups; the skip-loop protects the legacy numbers already issued
-- in fans.lane_no, which were themselves random and go up to 4500 today.
create sequence if not exists public.fan_membership_number_seq start with 1000;

create or replace function public.fan_next_membership_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n bigint;
  v_candidate text;
  v_guard int := 0;
begin
  loop
    v_guard := v_guard + 1;
    if v_guard > 100000 then
      raise exception 'membership number space exhausted';
    end if;
    v_n := nextval('public.fan_membership_number_seq');
    -- Four digits while they last, then five. Deterministic, never re-formatted.
    v_candidate := lpad(v_n::text, 4, '0');
    exit when not exists (select 1 from public.fan_members where membership_number = v_candidate)
          and not exists (select 1 from public.fans where lane_no::text = v_candidate);
  end loop;
  return v_candidate;
end;
$$;

comment on function public.fan_next_membership_number() is
  'Collision-proof Lane number allocator. Sequence-backed, skips every number already issued in fans.lane_no or fan_members.membership_number.';

-- The constraint the previous release was missing. Partial, so historical
-- nulls (there are none, but the column is nullable) do not block it.
create unique index if not exists fan_members_number_unique_idx
  on public.fan_members (membership_number) where membership_number is not null;

-- ── SIGNUP INTENT ───────────────────────────────────────────────────────────
-- What the supporter told us BEFORE they proved the email is theirs.
--
-- It lives here rather than in the magic-link URL because a return URL is
-- readable, shareable, loggable and editable. A nonce is none of those things.
-- Bound to the email at creation, checked against the VERIFIED email at use,
-- single-use, and expiring.
create table if not exists public.fan_signup_intents (
  id                bigint generated always as identity primary key,
  nonce             text not null unique,
  email_normalised  text not null,
  first_name        text,
  last_name         text,
  return_path       text,          -- validated same-origin path, never a URL
  signup_source     text,
  fixture_id        text,
  programme_id      bigint,
  marketing         boolean,       -- null = they made no choice; never assumed
  terms_version     text,
  privacy_version   text,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '2 hours',
  consumed_at       timestamptz
);
create index if not exists fan_signup_intents_email_idx
  on public.fan_signup_intents (email_normalised) where consumed_at is null;
create index if not exists fan_signup_intents_expiry_idx
  on public.fan_signup_intents (expires_at) where consumed_at is null;

comment on table public.fan_signup_intents is
  'Pre-verification signup details, referenced by an opaque nonce. Bound to the email, single-use, expires in 2 hours. Never contains a token.';

-- ── NOTIFICATION OUTBOX ─────────────────────────────────────────────────────
-- The club learns about a new supporter through a durable row, not through a
-- fetch() that happened to succeed. If Resend is down, or unconfigured, or the
-- sender domain is not yet verified, the supporter still becomes a member and
-- the club is still told — later.
create table if not exists public.fan_notification_outbox (
  id            bigint generated always as identity primary key,
  event_type    text not null check (event_type in ('member_new','member_linked')),
  member_id     bigint not null references public.fan_members(id) on delete cascade,
  destination   text not null,
  dedupe_key    text not null unique,
  payload       jsonb not null,
  status        text not null default 'pending'
                  check (status in ('pending','sent','failed','abandoned')),
  attempts      int not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  provider_id   text,
  last_error    text
);
create index if not exists fan_outbox_due_idx
  on public.fan_notification_outbox (next_attempt_at)
  where status = 'pending';

comment on table public.fan_notification_outbox is
  'One durable event per membership milestone. dedupe_key makes repeated ensure() calls send exactly one email.';

-- ── IDENTITY REVIEW ─────────────────────────────────────────────────────────
-- Where an unprovable match goes to wait for a person. It exists so the code
-- never has to choose between guessing and blocking the supporter.
create table if not exists public.fan_identity_reviews (
  id            bigint generated always as identity primary key,
  member_id     bigint references public.fan_members(id) on delete cascade,
  candidate_fan_id uuid references public.fans(id),
  reason        text not null,
  detail        jsonb,
  status        text not null default 'open' check (status in ('open','linked','dismissed')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   text
);
create index if not exists fan_identity_reviews_open_idx
  on public.fan_identity_reviews (created_at) where status = 'open';

-- ── THE ONE MEMBERSHIP FUNCTION ─────────────────────────────────────────────
-- Everything that must happen together, happening together. A caller cannot
-- create half a supporter, because there is no longer a sequence of calls in
-- which to fail halfway.
--
-- The notification is queued INSIDE the transaction (a row, not a send) and
-- delivered outside it, so a mail failure can never roll back a membership.
create or replace function public.fan_ensure_membership(
  p_auth_user_id   uuid,
  p_email          text,
  p_first_name     text default null,
  p_last_name      text default null,
  p_source         text default null,
  p_fixture_id     text default null,
  p_programme_id   bigint default null,
  p_marketing      boolean default null,
  p_terms_version  text default null,
  p_privacy_version text default null,
  p_marketing_wording text default null,
  p_destination    text default 'info@raynerslanefc.co.uk'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text := lower(btrim(coalesce(p_email, '')));
  v_member    public.fan_members%rowtype;
  v_fan       public.fans%rowtype;
  v_number    text;
  v_created   boolean := false;
  v_linked    boolean := false;
  v_event     text;
  v_display   text;
begin
  if p_auth_user_id is null then
    raise exception 'fan_ensure_membership requires a verified auth user';
  end if;

  -- (1) Already a member on this auth user. The common case, and the cheapest.
  select * into v_member from public.fan_members where auth_user_id = p_auth_user_id;

  -- (2) Same person, different auth row. Claim it — never make a second.
  --     FOR UPDATE so two concurrent callbacks cannot both claim it.
  if v_member.id is null and v_email <> '' then
    select * into v_member from public.fan_members
      where email_normalised = v_email for update;
    if v_member.id is not null then
      update public.fan_members
         set auth_user_id = p_auth_user_id,
             last_active_at = now(),
             updated_at = now()
       where id = v_member.id
      returning * into v_member;
      v_linked := true;
    end if;
  end if;

  -- (3) New membership. Find a legacy Lane Card ONLY by proven identity.
  if v_member.id is null then
    -- fans.id IS the auth user id for anyone who signed up through Fan Zone.
    select * into v_fan from public.fans where id = p_auth_user_id;
    -- Otherwise a verified email match, which is why the column now exists.
    if v_fan.id is null and v_email <> '' then
      select * into v_fan from public.fans where email_normalised = v_email;
    end if;

    if v_fan.id is not null and coalesce(btrim(v_fan.lane_no::text), '') <> '' then
      -- Their number is theirs. It does not change because our schema did.
      v_number := btrim(v_fan.lane_no::text);
      v_linked := true;
    else
      v_number := public.fan_next_membership_number();
    end if;

    v_display := nullif(btrim(concat_ws(' ', p_first_name, p_last_name)), '');
    if v_display is null and v_fan.id is not null then
      v_display := nullif(btrim(v_fan.name), '');
    end if;

    insert into public.fan_members (
      auth_user_id, fan_id, email_normalised,
      first_name, last_name, display_name,
      membership_number, membership_status,
      signup_source, signup_fixture_id, signup_programme_id,
      last_active_at, terms_version, privacy_version
    ) values (
      p_auth_user_id, v_fan.id, v_email,
      p_first_name, p_last_name, v_display,
      v_number, 'active',
      p_source, p_fixture_id, p_programme_id,
      now(), p_terms_version, p_privacy_version
    )
    returning * into v_member;
    v_created := true;

    -- Keep the matching key on the Lane Card too, so the next lookup is direct.
    if v_fan.id is not null and v_email <> '' and v_fan.email_normalised is distinct from v_email then
      update public.fans set email_normalised = v_email where id = v_fan.id;
    end if;

    insert into public.fan_activity (member_id, activity_type, fixture_id, programme_id, source)
    values (v_member.id, 'account_created', p_fixture_id, p_programme_id, p_source);

    -- A newsletter contact who has now joined is the same supporter. Their
    -- original consent timestamp and wording stay exactly as recorded.
    if v_email <> '' then
      update public.fan_newsletter_contacts
         set converted_member_id = v_member.id
       where email_normalised = v_email and converted_member_id is null;
    end if;
  else
    update public.fan_members
       set last_active_at = now(), updated_at = now(),
           fan_id = coalesce(fan_id, (select id from public.fans where id = p_auth_user_id)),
           first_name = coalesce(first_name, p_first_name),
           last_name  = coalesce(last_name,  p_last_name),
           display_name = coalesce(display_name, nullif(btrim(concat_ws(' ', p_first_name, p_last_name)), ''))
     where id = v_member.id
    returning * into v_member;
  end if;

  -- (4) Marketing: written ONLY when a choice was actually made. Joining is
  --     not consent, and null is not "no" recorded — it is no answer.
  if p_marketing is not null then
    insert into public.fan_marketing_preferences (
      member_id, email_marketing, consent_wording_version, consent_source,
      email_marketing_consented_at, email_marketing_withdrawn_at, updated_at
    ) values (
      v_member.id, p_marketing, p_marketing_wording, coalesce(p_source, 'join'),
      case when p_marketing then now() end,
      case when not p_marketing then now() end,
      now()
    )
    on conflict (member_id) do update set
      email_marketing = excluded.email_marketing,
      consent_wording_version = excluded.consent_wording_version,
      consent_source = excluded.consent_source,
      email_marketing_consented_at = case when excluded.email_marketing
        then now() else public.fan_marketing_preferences.email_marketing_consented_at end,
      email_marketing_withdrawn_at = case when not excluded.email_marketing
        then now() else public.fan_marketing_preferences.email_marketing_withdrawn_at end,
      updated_at = now();
  end if;

  -- (5) Tell the club — once. A long-standing supporter who has finally linked
  --     their account is NOT a new member, and saying so would be a small lie
  --     the committee would notice on the first email.
  if v_created then
    v_event := case when v_linked then 'member_linked' else 'member_new' end;
    insert into public.fan_notification_outbox (event_type, member_id, destination, dedupe_key, payload)
    values (
      v_event, v_member.id, p_destination,
      v_event || ':' || v_member.id::text,
      jsonb_build_object(
        'firstName', v_member.first_name,
        'lastName', v_member.last_name,
        'displayName', v_member.display_name,
        'email', v_member.email_normalised,
        'membershipNumber', v_member.membership_number,
        'joinedAt', v_member.joined_at,
        'source', v_member.signup_source,
        'fixtureId', v_member.signup_fixture_id,
        'marketing', (select email_marketing from public.fan_marketing_preferences
                       where member_id = v_member.id),
        'linkedExisting', v_linked
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return jsonb_build_object(
    'member', to_jsonb(v_member),
    'created', v_created,
    'linkedExisting', v_linked
  );
end;
$$;

comment on function public.fan_ensure_membership is
  'The only way a fan_members row is created. One transaction: member, Lane Card link, number, marketing, attribution, activity, notification event.';

-- Only the service role may run it. It takes an auth user id as an argument,
-- so letting a browser call it would let a browser name somebody else.
revoke all on function public.fan_ensure_membership from public, anon, authenticated;
revoke all on function public.fan_next_membership_number() from public, anon, authenticated;

-- ── RLS on the new tables ───────────────────────────────────────────────────
-- No policies at all on any of them: intents, outbox and reviews are club
-- machinery, and only the service key touches them. RLS on with no policy is a
-- closed door, which is the correct default for a table nobody should read.
alter table public.fan_signup_intents enable row level security;
alter table public.fan_notification_outbox enable row level security;
alter table public.fan_identity_reviews enable row level security;

-- ── BACKFILL ────────────────────────────────────────────────────────────────
-- Give every existing Fan Zone supporter their verified email, taken from
-- auth.users where the ids already correspond. This is the proven relationship
-- (fans.id = auth.users.id), not a guess.
update public.fans f
   set email_normalised = lower(btrim(u.email))
  from auth.users u
 where u.id = f.id
   and u.email is not null
   and f.email_normalised is distinct from lower(btrim(u.email));

-- Deliberately NOT backfilling fan_members here. Membership is created when a
-- supporter signs in and is recognised, so their joined date is real and the
-- club notification fires at a moment that actually happened. Manufacturing
-- memberships for people who have not returned would put a date on a record
-- that nothing occurred on.
