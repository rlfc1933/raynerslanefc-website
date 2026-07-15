# Claude Code — Don't just remove Pitchero: OWN every touchpoint it served

Repo: `rlfc1933/raynerslanefc-website` (static HTML on Netlify, vanilla JS). Pitchero links were removed — good. **This is the follow-up: for every function Pitchero provided, make sure the club owns a genuinely BETTER native equivalent, wired to our own pages, emails and feeds.** Nothing is a dead-end delete; everything becomes an upgrade. Atomic commits. Never fabricate; use only real club info below.

## Real club assets to use (verified)
- **Role emails** (`data/emails.json`): `chairman@`, `info@`, `matchday@`, `media@`, `secretary@raynerslanefc.co.uk`.
- **Pages that already exist:** `contact.html` (form + emails), `volunteer.html` ("Get Involved" / vacancies), `trials.html`, `investment.html` (sponsorship), `membership.html`, `fan-zone.html`, `news.html`, `fixtures.html`, `squad.html`, `policies.html`.
- **Data:** `news.json`, `fixtures.json`, `squad.json`/`players.json`.
- **No own RSS feed yet** — build one.

---

## TASK 1 — Publish OUR OWN feed (replaces Pitchero's `/rss.xml`)
Pitchero gave a subscribable feed; we lost it. Build **`netlify/functions/rss.js`** serving a valid **RSS 2.0** feed at `/.netlify/functions/rss` (and a rewrite to `/rss.xml`) generated from **`news.json`** (latest articles: title, link to the native article, pubDate, description, image) — and optionally a second feed of **fixtures/results** from `fixtures.json`.
- Add `<link rel="alternate" type="application/rss+xml" title="Rayners Lane FC News" href="/rss.xml">` to the site `<head>` (via `components.js`).
- Link it in the footer ("Subscribe / RSS").
- Now fans, apps, aggregators and AI crawlers can subscribe to us directly — an upgrade on Pitchero, owned by us.

## TASK 2 — Route every contact/enquiry to the RIGHT club email (utilise emails.json)
Wherever Pitchero used to catch a contact, make sure there's a clear owned path to the correct address:
| Purpose | Route to |
|---|---|
| General enquiries | `info@raynerslanefc.co.uk` |
| Media / press | `media@raynerslanefc.co.uk` |
| Match day / fixtures | `matchday@raynerslanefc.co.uk` |
| Club secretary / official | `secretary@raynerslanefc.co.uk` |
| Commercial / sponsorship | `chairman@` (via the `investment.html` sponsor-enquiry form — keep the existing HubSpot/Resend flow) |
| Trials / players | `trials.html` form (keep existing) → confirmation to `info@` |
| Volunteer / vacancies | `volunteer.html` → express-interest routes to `info@` |
- On `contact.html`, present all role emails clearly (from `emails.json`) with a one-line "what each is for", so nobody's ever left without a route. Keep the contact form.
- Every page's primary CTA points to its correct owned destination (page or email) — no orphan buttons.

## TASK 3 — "Official Channels" block (replaces "find us on Pitchero")
Add a small, reusable **"Official Rayners Lane FC channels"** module (via `components.js`, e.g. footer + contact page): **this website** (the official platform), the real socials (X, Instagram, YouTube, Facebook), **The Lane app**, the **newsletter/updates signup**, and the **RSS feed**. This is the ownership statement — we don't point fans to a rented Pitchero page; we point them to channels we own. (This doubles as the sponsor/innovation message.)

## TASK 4 — Newsletter / updates capture (Pitchero used to capture emails)
Ensure there's an owned **"Get club updates" email signup** on the homepage + contact page (reuse the existing membership/fan-zone capture / Netlify Forms / Supabase — don't build a new system). So we grow our OWN audience list instead of feeding Pitchero's.

## TASK 5 — Confirm each former Pitchero destination now has a strong native home
| Pitchero used to provide | Our owned replacement | Make sure it's… |
|---|---|---|
| Club home page | `index.html` | the hero/official platform |
| Fixtures & results | `fixtures.html` (43 fixtures + results) | complete, with crests + venues |
| Squad | `squad.html` from `squad.json` | real squad + photos, no embed |
| News | `news.html` + `news.json` + **our RSS** | native articles, no dead links |
| News: trials | `trials.html` | live, routes correctly |
| News: sponsorship | `investment.html` | live, sponsor enquiry works |
| News: vacancies | `volunteer.html` | live, express-interest works |
| Privacy policy | `policies.html` | our own policy |
| RSS feed | **new `rss.js`** (Task 1) | subscribable |
| Contact | `contact.html` + role emails | every purpose routed |

## TASK 6 — Sweep + verify
- `grep -ri pitchero` on shipped files (html/js/json/xml) = **zero**.
- **No orphan/dead links** anywhere; every former Pitchero link now resolves to a live owned destination.
- The RSS feed validates; emails are correct; the Official Channels block renders site-wide.
- Health check: JSON valid, JS parses, key pages render, nothing regresses.

---

## Acceptance criteria
1. A working **owned RSS feed** at `/rss.xml`, discoverable via `<head>` + footer, generated from our news.
2. Every contact route points to the **correct club email/page** (per Task 2); `contact.html` lists all role emails with their purpose.
3. An **"Official Channels"** block (site + socials + app + newsletter + RSS) replaces any "official Pitchero" framing.
4. A newsletter/updates signup captures to **our own** list.
5. Every former Pitchero destination has a live, strong native equivalent; zero Pitchero references; zero dead links; health check passes.

## Final report
Map each former Pitchero destination → its owned replacement, confirm the RSS feed URL, list the email routes wired, and confirm zero Pitchero references and zero dead links remain.
