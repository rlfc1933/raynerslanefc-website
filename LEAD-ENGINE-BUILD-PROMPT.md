# Rayners Lane FC — Lead Engine + Fan System build brief for Claude Code

You built this site (static HTML on Netlify; bespoke `admin.html` writes `data/*.json` via `save-data.js`; a Supabase `fans` table powers fan accounts; Netlify functions are the backend). We are turning it into a proper lead-generation + membership engine **without migrating off this stack** and at **£0 cost (free tiers only)**.

Read this whole brief first, then work in phases. After each phase, give me a one-line changelog and stop for a quick check. Don't introduce paid SaaS. Don't reintroduce overlapping CRMs. Keep all secrets in Netlify environment variables behind functions — never in client JS.

---

## THE ONE RULE: one source of truth per job

- **HubSpot (Free tier) = the LEAD & DEAL CRM.** Sponsors, players/trialists, volunteers. It gives us free forms, contact records, deal pipelines, live chat and basic email — out of the box, £0.
- **Supabase = the FAN MEMBERSHIP system.** Accounts, Lane numbers, match-day attendance/hearts. It's already built; we finish and clarify it. HubSpot is bad at consumer membership cards, so fans stay in Supabase.
- **Netlify Functions = the glue.** They hold the API keys server-side and move data between the site, HubSpot and Supabase.
- **One bridge only:** when a new fan account is created in Supabase, also create/update them as a HubSpot contact tagged `Fan`, so marketing has a single list. No other duplication anywhere.

Do **not** add Jetpack CRM, UpiCRM, WP ERP, Groundhogg, MailPoet, Tawk.to, or WordPress. HubSpot Free already covers CRM + forms + chat + email; adding more tools recreates the mess we're avoiding.

---

## PHASE 0 — Clean up and clarify the existing fan system (do this first; it's the root of the confusion)

The current membership flow has three overlapping mechanisms and a fake check-in. Fix the clarity before building on top.

1. **Make Supabase the single, obvious backend.**
   - Confirm/handle the env vars that make the admin able to *see* members: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (used by `list-members.js`). If they're missing, the admin Fan Club shows nothing even though signups exist — add a clear "Supabase not configured" banner in admin instead of a silent empty list, and document the two vars in `SETUP-GUIDE.md`.
   - In `js/fan-zone.js`, the old Netlify-Forms `fan-signup` form is hidden whenever Supabase is on (`initFanZone`, ~line 277). Remove that dead form and its markup entirely so there is exactly **one** way to join (Supabase account).
   - In `admin.html`, remove the duplicate "sign-up list" view fed by `list-fans.js` (Netlify Forms), and delete `netlify/functions/list-fans.js`. Keep **only** the Supabase-backed "Fan Club" view (`list-members.js`). One list, clearly labelled, showing name / username / email / town / Lane number / joined date / total hearts.

2. **Kill the fake check-in.** `checkInToday()` in `fan-zone.js` writes `f.attended`, which nothing ever reads (official hearts come only from attendance data). Remove `checkInToday` and any button that calls it, so fans aren't misled. Real check-in is rebuilt properly in Phase 1.

3. **Document the data model** in a short `FAN-SYSTEM.md`: how an account is created, what a Lane number is, how hearts are awarded, and which env vars are required.

**Acceptance:** One sign-up path (Supabase). One admin fan list that actually shows members (or a clear "not configured" message). No dead forms, no fake buttons.

---

## PHASE 1 — Real match-day scanning (the missing spine)

Today the membership card draws a QR (`RLFC LANE-<no> <name>`) but **nothing reads it** — staff must manually type Lane numbers into admin to award hearts. Build the actual scan loop.

1. **New Supabase table `attendance`:** columns `lane_no (text)`, `match_date (date)`, `home (bool)`, `scanned_at (timestamptz default now())`, with a unique constraint on `(lane_no, match_date)` so a fan can't double-count. Service-role access only.

2. **Staff scanner page `scan.html`** (PIN-gated, mobile-first, add to the admin PWA):
   - Uses `html5-qrcode` (MIT licence, free, from cdnjs) to open the **phone camera** and decode the Lane QR.
   - On a successful scan, extracts the Lane number and POSTs `{pin, lane_no, match_date, home}` to a new function `check-in.js`. `match_date`/`home` come from the current `data/matchday.json` (or a manual selector at the top of the page).
   - Shows instant feedback: "✓ Lane #1234 — Sukh — heart #7" or "already scanned today", plus a running count of fans checked in for this match.
   - Include a **manual entry box** on the same page (type a Lane number) for fans without a phone — same endpoint.

3. **New function `check-in.js`:** PIN-gated; inserts a row into the Supabase `attendance` table (idempotent on the unique constraint); returns the fan's new total. Instant, no GitHub commit, no rebuild.

4. **Fan card reads hearts live from Supabase.** Update `fan-zone.js` so `totalGames`/`homeGames`/streak count rows in the `attendance` table for the fan's `lane_no` (when Supabase is on), instead of `data/attendance.json`. Keep the JSON path as a fallback for device mode. The fan sees their heart appear on next refresh — no manual typing anywhere.

5. **Admin:** replace the manual "type Lane numbers" attendance editor with a live read of the `attendance` table per match (count + list), keeping a manual add/remove as a fallback. Optionally a "export to attendance.json" button if any public stat still needs it.

**Acceptance:** Fan opens their card → a staffer scans the QR on their own phone → the fan's heart count increases on refresh and the admin shows the live count. No manual typing required for the normal path.

---

## PHASE 2 — HubSpot lead capture (sponsors, players, volunteers)

1. **Set up HubSpot Free** (one portal). Create a **Private App** with CRM scopes and put its token in Netlify as `HUBSPOT_TOKEN`. Never ship it client-side.

2. **Keep the site's bespoke forms** (don't embed HubSpot's ugly default forms — it breaks the design). Instead, build **one function `hs-lead.js`** that receives a form payload from any of our forms and creates/updates a HubSpot **contact** + a **deal** in the correct pipeline, server-side. Our existing sponsor form and the new player/volunteer forms all POST to it.

3. **Contact properties / tags:** `lead_source` (sponsor | player | volunteer | fan), `lead_type`, `age_group` (players), `company` (sponsors), plus standard name/email/phone. Tag every contact by source.

4. **Two deal pipelines:**
   - **Sponsor Deals:** New → Contacted → Proposal Sent → Negotiation → Won / Lost. Mirror the stages already in `data/sponsor-crm.json` so the admin Sponsor Hub and HubSpot agree.
   - **Player Trials:** Enquiry → Invited to Trial → Trialed → Signed / Released.

5. **Wire the existing sponsor enquiry form** (currently emails via `submission-created.js`) to also call `hs-lead.js` so every sponsor enquiry becomes a tracked deal, not just an email. Keep the email alert too.

**Acceptance:** Submitting the sponsor form creates a HubSpot contact + a Sponsor deal in "New". Nothing breaks visually. Token stays server-side.

---

## PHASE 3 — Player sign-up portal (no academy — first-team trials & registration)

1. **New page `trials.html`** (or a section on an existing page) styled to match the site: a trial/registration form — name, date of birth (derive an age bracket, flag if under 18 and require a parent/guardian name + contact), preferred position, current club, contact email/phone, availability.

2. POSTs to `hs-lead.js` → HubSpot contact tagged `lead_source=player` + a deal in the **Player Trials** pipeline at "Enquiry".

3. **Admin "Trialists" view:** a new PIN-gated function `list-leads.js` reads open Player-Trials deals from HubSpot so staff see applicants inside the admin without logging into HubSpot. Show name, position, age bracket, date, stage.

**Acceptance:** A trial signup appears as a HubSpot Player-Trials deal and is visible in the admin Trialists view within seconds.

---

## PHASE 4 — Automation & engagement (free-tier only)

1. **Email:** Use HubSpot's free email for a **sponsor follow-up** and a **trial follow-up** sequence (note the free-tier limit ≈ 2,000 marketing emails/month and that advanced multi-step workflows may need a paid tier — keep within free; a single simple follow-up per pipeline is fine). **Keep the existing Resend welcome email for fans** — don't double-send; fans live in Supabase, not HubSpot email.

2. **Live chat:** add HubSpot's free live-chat widget snippet to key pages (home, investment/sponsor, trials, contact) via `js/components.js`. This replaces any need for Tawk.to — one tool.

3. **WhatsApp:** add a click-to-chat `wa.me` button (footer + contact page). Totally free, no SaaS.

4. **Social:** be realistic — free auto-posting tools are weak and flaky. Don't install FS Poster. Instead leave a documented manual step (draft with the club's tools, post by hand). I'll handle social drafting separately.

**Acceptance:** Live chat appears on key pages; sponsor and trial leads receive one automated follow-up; fan welcome email still works once.

---

## PHASE 5 — Analytics (free)

1. Add **Google Analytics 4** (free) *or* **Cloudflare Web Analytics** (free, privacy-friendly, no cookie banner — preferred) site-wide via `js/components.js`.
2. Track form submissions (sponsor, trials, fan signup) as conversion events so we can see which pages pull leads.

**Acceptance:** Pageviews and form-submit events show up in the analytics dashboard.

---

## Secrets / env vars to set in Netlify (list them in SETUP-GUIDE.md)
- `HUBSPOT_TOKEN` — HubSpot private-app token (Phases 2–4)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — admin/scanner server reads (Phases 0–1)
- `RESEND_API_KEY` — fan welcome email (already)
- `ADMIN_PIN` — set it so the repo default (`19332026`) isn't the live gate; PIN-gate `scan.html` and all new functions
- (Supabase anon URL/key already in `js/supabase-config.js` for the client — that's fine, it's a public key)

## Guardrails
- £0 only. HubSpot Free, Supabase Free, Netlify Free, Cloudflare/GA Free. Flag immediately if any step would require a paid tier so we can choose a free alternative.
- One CRM for leads (HubSpot), one for fans (Supabase). No third store.
- All API tokens behind Netlify functions. The only client-side key is the Supabase anon key (safe by design).
- Preserve the existing visual design and the `pushToGitHub` / `save-data.js` contract.

## Final test plan (run end-to-end after Phase 3, then again after 5)
1. Fan signs up → appears in admin Fan Club → also appears in HubSpot tagged `Fan`.
2. Staffer scans the fan's QR on match day → fan's hearts increase → admin shows live count.
3. Sponsor submits enquiry → HubSpot Sponsor deal in "New" + email alert + one follow-up queued.
4. Player submits trial form → HubSpot Player-Trials deal + visible in admin Trialists view.
5. Live chat + analytics events fire on key pages.
Give me a changelog grouped by phase, and a list of every env var I still need to set.
