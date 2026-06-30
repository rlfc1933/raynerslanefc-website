# Rayners Lane FC — Go-Live Checklist

Everything is built and deployed. The site is **live and safe right now** — the
items below switch on the advanced features. Do them in order. Each is independent;
nothing breaks if you skip one.

---

## A. Lock the gate (2 min) — do this first
- [ ] **Netlify → Site configuration → Environment variables → Add** `ADMIN_PIN` = a new secret PIN (not the repo default `19332026`). Use it to log into admin + the scanner.
- [ ] Click **Deploys → Trigger deploy** after adding any env var.

## B. Fan members + real-time scoreboard + gate scanner (Supabase, ~5 min)
- [ ] **Supabase → SQL Editor → New query →** paste **all of `supabase-schema.sql`** → **Run**. (Creates `live_match` + `attendance`.)
- [ ] **Netlify env vars → Add:**
  - [ ] `SUPABASE_URL` = `https://rewkixywfgsyqinfbggv.supabase.co`
  - [ ] `SUPABASE_SECRET_KEY` = your Supabase **secret** key (`sb_secret_…`). *(The code also accepts `SUPABASE_SERVICE_KEY` if you ever use the classic key — either name works.)*
- [ ] Trigger deploy.
- [ ] **Test:** admin → Fan Club shows members (not the "not configured" banner); set a match live + tap +1 → homepage scoreboard updates in ~12s; open `scan.html` on a phone, scan a member card → heart appears.

> **What works WITHOUT another deploy** (just run the SQL above): the admin fan
> list, the homepage scoreboard display, fan hearts and the admin live-attendance
> read — these use the public key that's already deployed. Only the **writes**
> (the gate scanner + instant score push) need `SUPABASE_SECRET_KEY`, which takes
> one Netlify build. So spend your last build setting `SUPABASE_SECRET_KEY` +
> `ADMIN_PIN` together.

## C. Email (Resend, optional, ~10 min)
- [ ] Create a free **Resend** account; **verify the raynerslanefc.co.uk domain** (add the SPF/DKIM/DMARC DNS records it gives you).
- [ ] `RESEND_API_KEY` in Netlify. → Fan welcome + sponsor/trial alert emails start sending.

## D. Push match alerts (optional, ~10 min)
- [ ] Run `npx web-push generate-vapid-keys`.
- [ ] `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` in Netlify; create the `push_subscriptions` table (see `PUSH-SETUP.md`).
- [ ] The hidden "Enable Match Alerts" button appears automatically once keys are set.

## E. CRM — OPTIONAL / SKIP (you've decided to forget HubSpot)
**You don't need this to go live.** Every lead form (sponsor, trials, volunteer)
already captures to the club **by email** (Resend) + Netlify Forms — no CRM
required. The HubSpot code is dormant (no token) and harmless. A self-hosted
open-source CRM (Twenty / EspoCRM / etc.) is a **separate project** — those are
full apps that run on their own server (Docker/VPS + Postgres); they can't live
inside this static site, so that's a future build, not part of go-live.

_If you ever do want HubSpot instead, the steps are in **SETUP-GUIDE.md §12**:_
- [ ] Free HubSpot account → **Private App** (scopes: contacts + deals read/write) → `HUBSPOT_TOKEN` in Netlify.
- [ ] *(Optional)* Create contact properties `lead_source`, `lead_type`, `age_group`.
- [ ] Create **two pipelines** (Sponsor Deals; Player Trials) → copy pipeline + first-stage ids → set `HUBSPOT_SPONSOR_PIPELINE/STAGE` + `HUBSPOT_PLAYER_PIPELINE/STAGE`.
- [ ] **Test:** submit the sponsor form → HubSpot contact + Sponsor deal; submit a trial → admin → Trialists shows it.

## F. Engagement widgets (optional, edit `js/components.js` top)
- [ ] `LANE_WHATSAPP` = your number (digits only, e.g. `447700900000`) → floating WhatsApp button.
- [ ] `LANE_HS_CHAT` = your HubSpot tracking-code `src` → live chat site-wide.

## G. Fill the tank (content — the biggest visible win)
Admin shows a **🚦 Season Setup** card listing what's empty. In priority order:
- [ ] **Fixtures** (admin → Fixtures) → powers homepage next-match, countdown, results.
- [ ] **Squad + player profiles** (admin → Squad).
- [ ] Gallery photos, then publish one matchday programme.

---

### Environment variables — one-glance list
| Var | For |
|---|---|
| `ADMIN_PIN` | admin + scanner + all functions (set a new one) |
| `GITHUB_TOKEN` | admin saves → site (already set) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | fans, scoreboard, attendance (writes). Reads use the public key already in the site |
| `RESEND_API_KEY` | welcome + alert emails |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | push alerts |
| `HUBSPOT_TOKEN` | lead CRM |
| `HUBSPOT_SPONSOR_PIPELINE`, `HUBSPOT_SPONSOR_STAGE` | sponsor deals |
| `HUBSPOT_PLAYER_PIPELINE`, `HUBSPOT_PLAYER_STAGE` | player-trial deals + Trialists view |

In-code config (top of `js/components.js`): `LANE_WHATSAPP`, `LANE_HS_CHAT`.
