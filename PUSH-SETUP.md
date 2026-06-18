# Match Alerts (push notifications) — one-time setup

Fans who install **The Lane** app and tap **"Enable Match Alerts"** on the home page
get push notifications you send from **admin → Match Day → Send a Match Alert**.

The code is all in place. To switch it on, do this once (≈5 minutes):

## 1. Generate the club's push keys (VAPID)

On any computer with Node installed, run:

```bash
npx web-push generate-vapid-keys
```

It prints a **Public Key** and a **Private Key**. Keep them handy.

## 2. Add them to Netlify

Netlify → your site → **Site configuration → Environment variables → Add**:

| Key | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY`  | the Public Key from step 1 |
| `VAPID_PRIVATE_KEY` | the Private Key from step 1 (keep secret) |

`SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are already set (they power the Fan Club member list) — push reuses them.

## 3. Create the subscriptions table in Supabase

Supabase → your project → **SQL Editor → New query**, paste and run:

```sql
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  subscription jsonb not null,
  created_at timestamptz default now()
);
```

(Service-role access only — no public RLS policy needed, since only the
server functions touch it with the secret key.)

## 4. Deploy

Push/redeploy. Netlify installs `web-push` automatically from `package.json`.
Nothing else changes about the static site.

## 5. Use it

- **Fans:** open the site → "Never Miss a Kick-Off" → **Enable Match Alerts**.
  On iPhone they must **Add to Home Screen first**, open the app, then enable.
- **Staff:** admin → **Match Day** → **Send a Match Alert** → headline + message → Send.
  Use it sparingly: kick-off, goals, full-time, big news.

## How it works (files)

- `netlify/functions/push-key.js` — serves the public key to the browser.
- `netlify/functions/push-subscribe.js` — stores a fan's subscription in Supabase.
- `netlify/functions/push-send.js` — PIN-gated; sends to everyone, prunes dead devices.
- `sw.js` — shows the notification (`push` + `notificationclick`).
- `js/components.js` — `laneEnableAlerts()` opt-in flow on the home page.

Until the keys are set, everything degrades gracefully: the fan button says
"alerts aren't switched on yet" and the admin send button says "Push isn't set up yet".
