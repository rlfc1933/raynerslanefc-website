# Fan Zone membership and programme access — how it actually works

**Verified at production SHA `00b3bb5`, 2 August 2026.**
This document records what the code *does*, not what it was designed to do. Where the
two differ, the difference is stated.

Every claim carries a classification:

- **PROVEN IN CODE** — traced through the source at this SHA.
- **PROVEN IN PRODUCTION** — observed on the live site or the live database.
- **TESTED BUT NOT RUN END TO END IN PRODUCTION** — unit tests pass; no real supporter has done it.
- **NOT CURRENTLY BUILT** — described in a previous report or in a comment, but absent from the code.

---

## 1. The headline

The server-side gate is correct and closed. The client-side key is missing.

`programme-data` refuses to send a programme payload to anyone who does not present a
Supabase token that resolves to an `active` row in `fan_members`. That is enforced on
the server, verified against Supabase on every request, and cannot be defeated from the
browser. **PROVEN IN CODE and PROVEN IN PRODUCTION.**

But `programme.html`, `programmes.html`, `fixtures.html` and `index.html` load
`js/fan-session.js` **without** loading the Supabase JavaScript library or
`js/supabase-config.js`. `fan-session.js` therefore constructs no Supabase client,
never obtains a token, and sends every request anonymously.

The result: **no supporter can currently read a complete programme, and no
`fan_members` row can currently be created by any code path.** **PROVEN IN PRODUCTION.**

---

## 2. Where entitlement is decided

`netlify/functions/programme-data.js` → `FAN.context(event)` in
`netlify/functions/lib/fan/members.js`.

```
tokenFrom(event)            Authorization: Bearer <token>, or null
  → userFromToken(token)    GET {SUPABASE_URL}/auth/v1/user, 8s timeout
                            Not decoded locally. Supabase is asked, every request.
  → byAuthUser(user.id)     fan_members WHERE auth_user_id = <uuid>
  → canReadProgrammes()     member.membership_status === 'active'
```

**PROVEN IN CODE** (`lib/fan/members.js:200-206`, `:148-150`).

Entitlement is **not** derived from: the `fans` table, a Lane Card number, a membership
number, an email match, a cookie, or any client-supplied field. `context()` does not
call `ensure()` — it only looks up. A signed-in supporter with no `fan_members` row is
`entitled: false`.

### Order of checks in `programme-data.js`

1. Edition looked up with `state=in.(published_matchday,published_late,full_time_current,archived,published_recovery)`
2. Not found → **404**
3. Published version looked up → not found → **404**
4. *Then* the membership gate

So a draft, a withheld edition or a not-yet-published edition returns 404 to
**everybody, members included**. Membership is not a way in. **PROVEN IN CODE**, and
**PROVEN IN PRODUCTION** — the Hilltop draft returns HTTP 404 both with and without a
token.

---

## 3. What a non-member receives

HTTP 200 with `locked: true` and:

| Field | Content |
|---|---|
| `reason` | `not_signed_in` \| `membership_incomplete` \| `membership_<status>` |
| `edition` | fixtureId, slug, state, season, kickoffAt, venue, publishedAt, afterFullTime |
| `cover` | the cover section only — teams, crests, competition, date |
| `finalMatch` | teams and score, once the match has finished |

No articles, no line-ups, no league table, no sponsor pages, no legal footer, no
`programme` object at all. The payload is never sent and then hidden — it is never sent.

Headers: `Cache-Control: private, no-store, max-age=0` and `Vary: Authorization`, so no
CDN or shared cache can serve one supporter's response to another.

**PROVEN IN PRODUCTION** — tested with no token, a garbage token, a well-formed but
forged JWT, and an empty bearer. All four returned `locked: true`, `reason:
not_signed_in`, and no payload.

---

## 4. How a supporter is supposed to become a member

`ensure()` in `lib/fan/members.js` is the only function that creates a `fan_members`
row. It is reachable only through `netlify/functions/fan-member.js`, actions `join` or
`me`. `fan-member.js` is called only by `LaneFan.refresh()` and `LaneFan.join()` in
`js/fan-session.js`.

`LaneFan.refresh()` has exactly one caller in the entire site:
`js/programme-library.js:179` (the programmes page).
`LaneFan.join()` has **no callers at all**. **PROVEN IN CODE.**

So membership creation depends entirely on a signed-in supporter loading
`programmes.html`. And on `programmes.html` the Supabase client is null, so `refresh()`
exits at its first line after `accessToken()` returns null.

**Live check on `https://raynerslanefc.co.uk/programmes.html`:**

```
supabaseLib      : "undefined"
supabaseConfig   : "undefined"
LaneFan.available: false
state.loaded     : true      ← refresh() ran
state.entitled   : false     ← and returned immediately, no network call
```

**PROVEN IN PRODUCTION.**

### Dependency matrix

| Page | loads `fan-session.js` | loads `supabase-config.js` | loads Supabase library | can hold a session |
|---|---|---|---|---|
| `fan-zone.html` | yes | yes | yes | **yes** |
| `index.html` | yes | yes | **no** | no |
| `match-centre.html` | yes | yes | **no** | no |
| `programme.html` | yes | **no** | **no** | no |
| `programmes.html` | yes | **no** | **no** | no |
| `fixtures.html` | yes | **no** | **no** | no |

**PROVEN IN CODE**; the `programme.html` and `programmes.html` rows also **PROVEN IN
PRODUCTION**.

---

## 5. The magic-link journey

**NOT CURRENTLY BUILT.**

`js/fan-session.js` exports `sendMagicLink()`, `join()`, `rememberReturn()` and
`takeReturn()`. A repository-wide search for callers outside that file returns nothing.
No page renders an email field that calls `sendMagicLink`. Nothing calls `takeReturn()`,
so nothing ever returns a supporter to the programme they came from.

The programme gate links to `fan-zone.html?join=1&return=<path>`. `fan-zone.html` and
`js/fan-zone.js` contain no reading of `location.search`, no `URLSearchParams`, and no
handling of `join`, `signin`, `return` or `welcome`. The parameters are received and
discarded. **PROVEN IN CODE.**

What `fan-zone.html` actually offers is the pre-existing Lane Card sign-up:
`SB.auth.signUp({ email, password })` and `SB.auth.signInWithPassword(...)`
(`js/fan-zone.js:130`, `:152`) — email and password, not a magic link.

**Correction to the previous implementation report.** That report stated reconciliation
happens "on the supporter's next sign-in". It does not. Signing in on `fan-zone.html`
touches `auth.users` and `fans` only. `js/fan-zone.js` contains zero references to
`fan_members` and zero references to `LaneFan`. Reconciliation would only ever run on
`programmes.html`, and there it cannot run at all.

---

## 6. Reconciliation, as written

When `ensure()` *does* run, it deduplicates in this order (**PROVEN IN CODE**,
**TESTED BUT NOT RUN END TO END IN PRODUCTION**):

1. `fan_members WHERE auth_user_id = <uuid>` — found, use it.
2. `fan_members WHERE email_normalised = lower(trim(auth.email))` — found, PATCH
   `auth_user_id` onto the existing row. **Claim, never duplicate.** Their joined date,
   membership number and history come with it.
3. Otherwise create, carrying the Lane Card number across:
   `SELECT lane_no, name FROM fans WHERE id = <auth uuid>`.
4. On create: write `fan_activity('account_created')`, then PATCH
   `fan_newsletter_contacts.converted_member_id` for the same normalised email.

`unique (auth_user_id)` and `unique (email_normalised)` on `fan_members` make a
duplicate a database error rather than a possibility.

### Two defects in this path

**(a) `fans` cannot be matched by email.** Step 3 looks up `fans` by `id`, which works
only because `fans.id` *is* the auth user id. The production `fans` table has columns
`id, username, name, town, since, meaning, photo, lane_no, created_at` — **there is no
email column**. So a supporter whose auth user was recreated would keep their
`fan_members` row (step 2) but silently lose their Lane Card number. **PROVEN IN
PRODUCTION** (schema read from the live database).

**(b) `membership_number` has no uniqueness protection.** `membershipNumber()` returns
`String(1000 + Math.floor(Math.random() * 9000))` — a random four-digit number. The
column has no unique constraint and there is no retry-on-collision loop. (The older
`fans.lane_no` path in `js/fan-zone.js:138-140` *does* retry on collision; this one does
not.) With 9,000 possible values, collisions become likely at a few dozen members.
**PROVEN IN CODE.**

---

## 7. What is stored about a supporter

```
fan_members
  id, auth_user_id (unique, FK auth.users ON DELETE CASCADE),
  email_normalised (unique), first_name, last_name, display_name,
  membership_number, membership_status
    ∈ {active, pending_verification, suspended, deleted},
  joined_at, signup_source, signup_fixture_id, signup_programme_id,
  last_active_at, privacy_version, terms_version, created_at, updated_at

fan_marketing_preferences
  member_id (PK, FK → fan_members ON DELETE CASCADE),
  email_marketing bool default false,
  email_marketing_consented_at, email_marketing_withdrawn_at,
  consent_wording_version, consent_source, updated_at

fan_activity
  id, member_id (FK ON DELETE CASCADE),
  activity_type ∈ {account_created, programme_opened, match_checked_in,
                   loyalty_reward_earned, profile_updated, marketing_changed},
  fixture_id, programme_id, activity_at, source, metadata jsonb, created_at

fan_newsletter_contacts
  id, email_normalised (unique), first_name, last_name,
  consent_wording_version, consent_source, consented_at, withdrawn_at,
  converted_member_id (FK → fan_members), created_at
```

Anonymised example row:

```
id: 41 | auth_user_id: 8f3c…-… | email_normalised: supporter@example.com
first_name: A | last_name: N | membership_number: 4218 | membership_status: active
joined_at: 2026-08-02T09:14:22Z | signup_source: programme:fwp-578225
```

### Row-level security

All four tables have RLS enabled. **PROVEN IN CODE**, and RLS on `fans` **PROVEN IN
PRODUCTION** (policies `fans read own`, `fans insert own`, `fans update own`, all keyed
on `auth.uid() = id`).

| Table | Policy | Effect |
|---|---|---|
| `fan_members` | `for select using (auth.uid() = auth_user_id)` | own record only |
| `fan_marketing_preferences` | select via `exists (… m.auth_user_id = auth.uid())` | own record only |
| `fan_activity` | select via `exists (… m.auth_user_id = auth.uid())` | own record only |
| `fan_newsletter_contacts` | **no policy at all** | service key only |

There is no public read policy on any of them. There are no INSERT/UPDATE/DELETE
policies either — every write goes through a Netlify function using the service key,
after that function has verified the token itself.

---

## 8. Activity recording

`programme_opened` is written in `programme-data.js` **after** the entitlement check
passes, inside `if (gate.member)`. A locked response records nothing — logged-out
attempts are not logged. **PROVEN IN CODE.**

Duplicate suppression is a database guarantee, not application logic:

```sql
create unique index fan_activity_programme_daily_idx
  on public.fan_activity (member_id, programme_id,
                          ((activity_at at time zone 'UTC')::date))
  where activity_type = 'programme_opened';
```

One row per member per edition per day. `record()` swallows the resulting unique
violation deliberately — a second read of the same programme is correct behaviour, not
an error worth failing a page load over. The call is fire-and-forget (`.catch(…)`), so
a database problem cannot stop a member reading their programme.

Production `fan_activity` row count: **0**. **PROVEN IN PRODUCTION.**

This is a narrow, purposeful record — account created, programme opened, match checked
into. It is not a click log and there is no general-purpose surveillance table.

Not built: any supporter-facing view of this history, and any committee-facing report
over it. `fan-member.js` returns the last 30 `programme_opened` rows in its `me`
response, but no page renders them. **NOT CURRENTLY BUILT.**

---

## 9. Marketing consent

Separate table, separate decision, separate timestamps for grant and withdrawal, and a
recorded wording version (`marketing-2026-08`).

`fan-member.js:71` writes a preference **only** when `action === 'join'` *and*
`typeof body.marketing === 'boolean'` — never inferred from the act of joining.
`canReadProgrammes()` does not consult it, so refusing marketing cannot cost a supporter
their programme access. **PROVEN IN CODE.**

Because `join` has no caller (§5), `action` is always `me` in practice, so no marketing
row and no `signup_source` attribution is ever written. Production
`fan_marketing_preferences` row count: **0**. **PROVEN IN PRODUCTION.**

The footer newsletter form is **not** wired into `fan_newsletter_contacts`. Production
row count: **0**. **NOT CURRENTLY BUILT.**

---

## 10. Cookies and consent

`js/consent.js` sets Google Consent Mode v2 to `denied` for `analytics_storage`,
`ad_storage`, `ad_user_data` and `ad_personalization` **before** any Google code could
execute, and injects the GA script only after an explicit accept. Decline stores the
decision, keeps consent denied, loads nothing, and expires any `_ga*` / `_gid` / `_gat`
cookie this origin is able to expire. **PROVEN IN CODE.**

`functionality_storage` and `security_storage` stay `granted` — that is what login and
the consent record itself run on.

Supabase authentication does not use cookies. The session is held in `localStorage`
under an `sb-*-auth-token` key, and the consent decision under `rlfc_consent_v2`.
Declining analytics therefore cannot sign a supporter out, and clearing analytics
cookies cannot touch the session.

`js/consent.js` is loaded on 25 of 33 HTML pages. The eight without it are `admin.html`,
`scan.html`, `programme-print.html`, `fan-zone-guide.html`, `staff-guide.html`,
`The-Lane-Portal-Guide.html`, `playermanager1933.html` and `lane-app-prototype.html`.
Those pages carry no analytics either, so nothing is measured without consent — but the
banner is also absent there. **PROVEN IN CODE.**

---

## 11. What the pages show, and what they should show

`js/match-centre.js:252` chooses its wording from
`window.LaneFan.state.entitled`. `match-centre.html` never calls `refresh()`, and has no
Supabase library, so `entitled` is permanently `false`. Every visitor — member or not —
sees **"Unlock today's programme — free"**. **PROVEN IN CODE.**

`js/programme-reader.js:240` reads `LaneFan.state.member` to decide whether to show the
"Already a member? Sign in" button. `programme.html` never calls `refresh()`, so the
button always shows. Harmless, but it is not reflecting reality.

`js/programme-reader.js:351` uses `LaneFan.authedFetch`, which is correct — but with a
null client it degrades to plain `fetch` with no Authorization header. The page cannot
tell the difference between "not signed in" and "cannot read the session".

---

## 11a. Lane Card ownership — which table wins

The Lane Card number exists in three places, and they are not the same thing.

| Where | What it is | Authority |
|---|---|---|
| `localStorage` (browser) | `js/fan-zone.js:87` — `Math.abs(hash) % 9000 + 1000` from the supporter's own details | first to exist; device-local; lost if storage is cleared |
| `fans.lane_no` | written at sign-up with a retry loop on collision (`js/fan-zone.js:138-140`) | **authoritative for the Lane Card** |
| `fan_members.membership_number` | copied from `fans.lane_no` when `ensure()` creates the member; otherwise a fresh random four digits | authoritative for **membership**, derived from `fans` |

So `fans` owns the Lane Card, `fan_members` owns membership. When both exist for the
same supporter they hold the same number, because `ensure()` copies rather than
generates. A supporter who reaches `fan_members` without ever having a `fans` row gets a
different, unrelated number — and that is the path with no collision protection (§6b).

Authority for everything else:

| Fact | Authoritative source |
|---|---|
| Authentication identity | `auth.users` |
| Current email | `auth.users` (`fan_members.email_normalised` is a matching key, not a contact address) |
| Name | `fans.name` for the Lane Card; `fan_members.first_name/last_name` for membership. **Duplicated, and nothing reconciles them.** |
| Membership status | `fan_members.membership_status` |
| Lane Card number | `fans.lane_no` |
| Signup source | `fan_members.signup_source` |
| Programme access | `fan_members.membership_status` only |
| Marketing consent | `fan_marketing_preferences` only |
| Programme history | `fan_activity` |
| Match check-ins | `attendance` (the older table, keyed on `lane_no`) — **not** `fan_activity` |
| Loyalty / rewards | computed in the browser from `attendance` + `data/fan-attendance.json`; not stored |

---

## 11b. The current supporter profile

Backend capability and visible experience are not the same thing. Classified per item:

| Item | Status |
|---|---|
| Name | **built and visible** — Fan Zone Lane Card |
| Lane Card number | **built and visible** — Fan Zone Lane Card, with QR |
| Digital Lane Card | **built and visible** |
| Date joined | **built and visible** (from `fans.joined` / localStorage) |
| Loyalty progress and rewards | **built and visible** — ladder, streak, next reward |
| Membership number (`fan_members`) | **stored but not visible** — and currently never created |
| Programme history | **stored but not visible** — `fan-member.js` returns the last 30 opens; no page renders them |
| Match check-ins | **partially built** — visible on the Lane Card via `attendance`, but not written to `fan_activity` |
| Marketing preference | **stored but not visible** — no UI reads or writes it |
| Account settings | **not built** |
| Sign-out control | **partially built** — `js/fan-zone.js` has its own sign-out; `LaneFan.signOut()` has no caller |

**The exact experience after a programme sign-in today: there isn't one.** There is no
post-login destination, no confirmation, and no return to the programme. `fan-zone.html`
is the only signed-in surface, and it shows the Lane Card built from `fans` and
localStorage — it does not mention programmes at all.

`fan_members` is a membership register with a working API. It is **not** a dashboard, and
no supporter-facing dashboard exists.

---

## 12. Flow diagrams — as built, not as designed

### A. Logged-out visitor opens a published programme — WORKS AS INTENDED

```
Visitor → GET /programme.html?id=fwp-578225
          fan-session.js loads; window.supabase undefined → SB = null
          LaneFan.available = false
programme-reader.js
       → LaneFan.authedFetch('/.netlify/functions/programme-data?id=…')
          accessToken() → null → NO Authorization header
Netlify   programme-data.js
       →  edition state in public list?           yes
       →  published version exists?               yes
       →  FAN.context(event)
            tokenFrom() → null
            userFromToken(null) → null
            { user: null, member: null, entitled: false }
       →  200 { locked:true, reason:'not_signed_in', edition, cover, finalMatch }
          Cache-Control: private, no-store   Vary: Authorization
Browser   renders the join gate: cover, teams, crests, final score,
          "The programme is free. The Lane family gets the key."
          NO articles, NO line-ups, NO table, NO legal footer.
```

**PROVEN IN PRODUCTION.**

### B. Existing Fan Zone member opens the same programme — BROKEN

```
Member    already signed in on fan-zone.html
          session sits in localStorage under the site origin
        → GET /programme.html?id=fwp-578225
          fan-session.js loads
          ✗ js/supabase-config.js  NOT on this page  → RLFC_SUPABASE undefined
          ✗ @supabase/supabase-js  NOT on this page  → window.supabase undefined
          ⇒ SB = null, LaneFan.available = false
        → LaneFan.authedFetch(...)
            accessToken() → catch/null → NO Authorization header
Netlify   sees an anonymous request, exactly as in flow A
        → 200 { locked:true, reason:'not_signed_in', … }
Browser   shows the SAME join gate to an existing member.

  Even if the token DID reach the server, the member has no fan_members row
  (see flow C), so context() would return entitled:false and reason would be
  'membership_incomplete'. Two independent blocks, either one sufficient.
```

**PROVEN IN PRODUCTION** — live page state confirms `LaneFan.available === false`, and
the live database holds 1 auth user and 0 `fan_members` rows.

### C. New supporter joins from the programme gate — BREAKS AT STEP 3

```
1  Visitor clicks "Join Fan Zone — free"
        → fan-zone.html?join=1&return=%2Fprogramme.html%3Fid%3Dfwp-578225
2  fan-zone.html loads. It has the Supabase library and config, so sign-up works.
   ✗ Neither the page nor js/fan-zone.js reads location.search.
     join=1 and return= are DISCARDED. No join panel opens, no return is stored.
3  Supporter finds the Lane Card sign-up unaided and completes it:
        SB.auth.signUp({ email, password })
        INSERT fans (id = auth uid, username, name, town, since, lane_no)
        HubSpot lead fired
   ✗ js/fan-zone.js contains ZERO references to fan_members and ZERO to LaneFan.
     NO membership row is created. NO reconciliation runs.
4  Nothing navigates them back. takeReturn() is never called by any page.
5  Supporter returns to the programme themselves.
        → flow B → the join gate again.

   The ONLY code path that would create fan_members is
   LaneFan.refresh() on programmes.html → fan-member.js{action:'me'} → ensure().
   On programmes.html, SB is null, so refresh() returns before the fetch.
   ⇒ fan_members can never be created. Production count: 0.
```

**PROVEN IN PRODUCTION.**

### D. Visitor declines cookies — WORKS AS INTENDED

```
Page load  js/consent.js runs before anything Google could execute
           gtag('consent','default', { analytics_storage:'denied',
                ad_storage:'denied', ad_user_data:'denied',
                ad_personalization:'denied',
                functionality_storage:'granted', security_storage:'granted' })
           No GA script tag is in the HTML. Nothing is fetched.
Visitor  → clicks Decline
           localStorage.rlfc_consent_v2 = { analytics:false, essential:true,
                                            decidedAt, source, version:2 }
           gtag('consent','update', { analytics_storage:'denied', … })
           loadAnalytics() NOT called
           clearAnalyticsCookies() expires _ga*/_gid/_gat on this origin
           event 'lane:consent' dispatched
Result     zero googletagmanager requests, no dataLayer measurement, no _ga cookie
Session    UNAFFECTED — Supabase auth lives in localStorage, not cookies.
           Declining analytics cannot sign anybody out.
Every later page load: analyticsAllowed() false → nothing loads. Persistent.
```

**PROVEN IN CODE.** Automated check: `npm run consent`.

---

## 13. Production state at the time of verification

Read from the live database. Counts only — no supporter records were read, exported or
altered.

```
auth.users                    1
fans                          1
fan_members                   0
fan_marketing_preferences     0
fan_activity                  0
fan_newsletter_contacts       0
```

The one existing Fan Zone supporter has no `fan_members` row and is therefore not
entitled to read programmes. **PROVEN IN PRODUCTION.**

---

## 14. Defects, in the order they must be fixed

1. **Missing Supabase client on the programme pages.** Add `js/supabase-config.js` and
   the Supabase library to `programme.html`, `programmes.html`, `fixtures.html` and
   `index.html`. Without this nothing else in this list matters. *Blocking.*
2. **`fan-zone.html` ignores `join`, `signin`, `return` and `welcome`.** The gate's own
   call to action leads to a page that discards it. *Blocking for the join journey.*
3. **No reconciliation on sign-in.** `js/fan-zone.js` should call `LaneFan.refresh()`
   after a successful `signUp` / `signInWithPassword`, so membership is created where
   supporters actually sign in rather than only on the programmes page. *Blocking.*
4. **No return-to-programme.** `takeReturn()` has no caller. *High.*
5. **`membership_number` collisions.** Random four digits, no unique constraint, no
   retry. *High — add the constraint before there are members, not after.*
6. **`match-centre.html` always says "Unlock".** *Medium — cosmetic once 1 and 3 land,
   because `refresh()` will then be reachable.*
7. **`ensure()` cannot find a Lane Card by email.** `fans` has no email column. *Low —
   only bites if an auth user is recreated.*
8. **Magic link, supporter dashboard, footer newsletter capture, committee reporting.**
   Not built. *Backlog, not defects.*

Nothing in this list weakens the gate. Every failure here fails **closed**: the programme
stays locked. There is no path by which a non-member obtains programme content.

---

## 15. Troubleshooting

**"A supporter says they are signed in but the programme still asks them to join."**
Expected, today, for everyone. Ask them to run `window.LaneFan.available` in the browser
console on the programme page. `false` means the page cannot read the session — defect 1.
Once that is fixed, `false` there would mean the script failed to load.

**"They can sign in on Fan Zone but not read a programme."**
Check whether a `fan_members` row exists for their auth user id. If it does not, they
have an account but no membership — defect 3. There is no admin screen for this; it is a
database lookup.

**"They used to be a member and now they are not."**
`ensure()` matches on the normalised email. If their email changed in `auth.users`,
step 2 of reconciliation will not find their old row and step 3 will create a second
membership. `unique (email_normalised)` will reject it, and `ensure()` returns null →
`fan-member.js` answers `could not create the membership`. That is the symptom to look
for.

**"Two supporters have the same membership number."**
Possible and unprotected — see §6b. `fans.lane_no` retries on collision;
`fan_members.membership_number` does not.

**"The programme says it is not available."**
That is a 404 from the edition lookup, not the membership gate. The edition is a draft,
withheld, or has no published version. Membership is irrelevant to it.

**"Declining cookies signed me out."**
Cannot happen. The session is in `localStorage`, not a cookie, and
`clearAnalyticsCookies()` only touches names matching `_ga*`, `_gid`, `_gat`.

---

## 16. How to re-verify

```
npm test                        # 550 tests, includes tests/fan-access.test.js
npm run consent                 # real headless Chrome; asserts nothing loads before accept
npm run smoke  -- <url>         # public-surface smoke checks
```

Manual, from any browser console on a public page:

```js
// Should be false on any page that cannot hold a session:
window.LaneFan && window.LaneFan.available
```

Anonymous gate check, safe to run at any time:

```
curl -s 'https://raynerslanefc.co.uk/.netlify/functions/programme-data?id=fwp-578225' \
  | head -c 200
# expect: {"ok":true,"locked":true,"reason":"not_signed_in", …
```
