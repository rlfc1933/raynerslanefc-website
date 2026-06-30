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
  - [ ] `SUPABASE_SERVICE_KEY` = Supabase → Settings → API → **service_role** secret
- [ ] Trigger deploy.
- [ ] **Test:** admin → Fan Club shows members (not the "not configured" banner); set a match live + tap +1 → homepage scoreboard updates in ~12s; open `scan.html` on a phone, scan a member card → heart appears.

## C. Email (Resend, optional, ~10 min)
- [ ] Create a free **Resend** account; **verify the raynerslanefc.co.uk domain** (add the SPF/DKIM/DMARC DNS records it gives you).
- [ ] `RESEND_API_KEY` in Netlify. → Fan welcome + sponsor/trial alert emails start sending.

## D. Push match alerts (optional, ~10 min)
- [ ] Run `npx web-push generate-vapid-keys`.
- [ ] `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` in Netlify; create the `push_subscriptions` table (see `PUSH-SETUP.md`).
- [ ] The hidden "Enable Match Alerts" button appears automatically once keys are set.

## E. HubSpot lead CRM (sponsors / players / volunteers / fans, ~20 min)
Full steps in **SETUP-GUIDE.md §12**. Short version:
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
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | fans, scoreboard, attendance |
| `RESEND_API_KEY` | welcome + alert emails |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | push alerts |
| `HUBSPOT_TOKEN` | lead CRM |
| `HUBSPOT_SPONSOR_PIPELINE`, `HUBSPOT_SPONSOR_STAGE` | sponsor deals |
| `HUBSPOT_PLAYER_PIPELINE`, `HUBSPOT_PLAYER_STAGE` | player-trial deals + Trialists view |

In-code config (top of `js/components.js`): `LANE_WHATSAPP`, `LANE_HS_CHAT`.
