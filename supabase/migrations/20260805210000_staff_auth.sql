-- ════════════════════════════════════════════════════════════════════════════
-- STAFF AUTHENTICATION — accounts, invitations and the one-time bootstrap.
--
-- WHY THIS EXISTS
-- ---------------
-- The staff account system was built on Netlify Blobs (getStore('rlfc-staff')).
-- In production that store has never worked: every call returns
--
--     The environment has not been configured to use Netlify Blobs
--
-- so no account, invitation or setup token could ever be persisted. The portal
-- looked finished and had no data store underneath it — which is why the only
-- working way in has been the shared committee password.
--
-- Supabase already holds the club's other server-side data and already has a
-- working service-key path (lib/lane.js). Using it removes a dependency that
-- has never functioned rather than adding a new one.
--
-- WHY A DEDICATED TABLE AND NOT la_app_users
-- ------------------------------------------
-- la_app_users is the LANE APP population: player/public signups, lowercase
-- roles, a 4-10 digit numeric code. Staff are a different population with a
-- different credential, different roles and vastly different authority. Mixing
-- a privileged committee login into the same table as public signups means one
-- mistaken policy, one wrong join or one careless `select *` exposes staff
-- credentials to a public-facing code path. They stay separate.
--
-- NOTHING HERE IS READABLE FROM A BROWSER
-- ---------------------------------------
-- RLS is enabled with NO policies at all. That is deliberate and is the
-- strongest possible setting: with RLS on and no policy, PostgREST returns an
-- empty set to the anon key for reads and refuses writes. Only the service key
-- (server-side, in Netlify Functions) bypasses RLS. A password hash must never
-- be reachable with a key that ships to a browser.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ACCOUNTS ────────────────────────────────────────────────────────────────
create table if not exists public.la_staff_users (
  username              text primary key,
  display_name          text,
  club_title            text,
  role                  text not null,
  -- 'setup_required' → exists, no password, cannot sign in
  -- 'active'         → has a password
  -- 'disabled'       → refused before the password is even considered
  status                text not null default 'setup_required'
                          check (status in ('setup_required','active','disabled')),
  pass_hash             text,
  must_change_password  boolean not null default false,
  disabled              boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            text,
  last_login_at         timestamptz
);

-- Usernames are matched case-insensitively everywhere. Storing them lower-case
-- is enforced rather than assumed, so 'Pete' and 'pete' can never become two
-- accounts with different powers.
alter table public.la_staff_users
  drop constraint if exists la_staff_users_username_lower;
alter table public.la_staff_users
  add constraint la_staff_users_username_lower check (username = lower(username));

-- An account cannot be 'active' without something to check a password against.
alter table public.la_staff_users
  drop constraint if exists la_staff_users_active_needs_hash;
alter table public.la_staff_users
  add constraint la_staff_users_active_needs_hash
  check (status <> 'active' or pass_hash is not null);

create index if not exists la_staff_users_status_idx on public.la_staff_users (status);
create index if not exists la_staff_users_role_idx   on public.la_staff_users (role);

-- ── INVITATIONS ─────────────────────────────────────────────────────────────
-- Only the HASH of the token is stored. The raw token is returned exactly once,
-- to the administrator who created it, and exists nowhere afterwards.
create table if not exists public.la_staff_invitations (
  id            text primary key,
  username      text not null references public.la_staff_users(username) on delete cascade,
  token_hash    text not null,
  status        text not null default 'pending'
                  check (status in ('pending','used','revoked','expired')),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  created_by    text,
  used_at       timestamptz,
  revoked_at    timestamptz,
  revoked_by    text,
  revoked_reason text
);

-- Finding an invitation by its hash is the hot path on redemption.
create unique index if not exists la_staff_invitations_token_idx
  on public.la_staff_invitations (token_hash);
create index if not exists la_staff_invitations_username_idx
  on public.la_staff_invitations (username, status);

-- AT MOST ONE LIVE INVITATION PER PERSON. Without this, "send them a new link"
-- quietly leaves two working ways in — the old one keeps working because
-- nobody thought to cancel it.
create unique index if not exists la_staff_invitations_one_pending
  on public.la_staff_invitations (username)
  where status = 'pending';

-- ── BOOTSTRAP STATE ─────────────────────────────────────────────────────────
-- A single row recording that the first-Chairman setup has been consumed. It is
-- a table rather than a flag on an account because the question it answers is
-- "has this one-time route been used", which must stay true even if the account
-- it created is later renamed, disabled or removed.
create table if not exists public.la_staff_bootstrap (
  id            boolean primary key default true check (id),   -- exactly one row
  consumed_at   timestamptz,
  consumed_by   text,
  consumed_note text
);
insert into public.la_staff_bootstrap (id) values (true) on conflict (id) do nothing;

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- Enabled with NO policies. With RLS on and no policy, the anon key reads an
-- empty set and cannot write. Only the service key — which lives in Netlify
-- environment variables and never reaches a browser — bypasses it.
alter table public.la_staff_users       enable row level security;
alter table public.la_staff_invitations enable row level security;
alter table public.la_staff_bootstrap   enable row level security;

-- Belt and braces: even if a policy were added by mistake later, the anon and
-- authenticated roles have no table privileges to exercise.
revoke all on public.la_staff_users       from anon, authenticated;
revoke all on public.la_staff_invitations from anon, authenticated;
revoke all on public.la_staff_bootstrap   from anon, authenticated;

-- ── updated_at ──────────────────────────────────────────────────────────────
create or replace function public.la_staff_touch() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists la_staff_users_touch on public.la_staff_users;
create trigger la_staff_users_touch before update on public.la_staff_users
  for each row execute function public.la_staff_touch();

-- ── THE EIGHT COMMITTEE ACCOUNTS ────────────────────────────────────────────
-- Created WITHOUT passwords, in 'setup_required'. This grants nothing: the
-- login path compares a hash against pass_hash, and a null hash can never
-- match, so none of these can sign in until its holder sets a password through
-- a one-time link. What this does is make people's names appear on the sign-in
-- screen so they can be invited.
insert into public.la_staff_users (username, display_name, club_title, role, status, created_by) values
  ('pete',    'Pete Singh',         'Chairman',                   'Chairman',          'setup_required', 'migration'),
  ('nigel',   'Nigel Hanlon',       'Vice Chairman',              'V Chairman',        'setup_required', 'migration'),
  ('gary',    'Gary Pitt',          'Team Manager',               'Team Manager',      'setup_required', 'migration'),
  ('jenny',   'Jenny Pitt',         'Secretary',                  'Club Secretary',    'setup_required', 'migration'),
  ('russell', 'Russell Nugent',     'Sponsorship and Commercial', 'Sponsorship',       'setup_required', 'migration'),
  ('darren',  'Darren Nugent',      'Programme Editor',           'Programme Editor',  'setup_required', 'migration'),
  ('smallz',  'Smallz',             'Social and Media',           'Marketing/Media',   'setup_required', 'migration'),
  ('dev',     'DEV — Sukh Banwait', 'Full Developer Access',      'System Maintainer', 'setup_required', 'migration')
on conflict (username) do nothing;
