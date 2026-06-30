# Rayners Lane FC — Complete Setup & Deployment Guide

## What You've Got

A full 6-page professional website built for deployment on your existing
One.com hosting. Static HTML/CSS/JS — no servers needed, no build steps.

**Pages:**
- `index.html` — Homepage (hero, news, countdown, ground map)
- `fixtures.html` — Fixtures + iOS/Android calendar sync
- `squad.html` — Live squad from Google Sheets
- `programme.html` — Match day programme
- `about.html` — Club history, chairman, manager, ground
- `contact.html` — Contact form + social links

---

## 1. DEPLOYING TO ONE.COM (15 minutes)

### Upload via One.com File Manager

1. Log in to **one.com** → **Web Hosting** → **File Manager**
2. Navigate to your `public_html` folder (this is your website root)
3. Upload ALL files maintaining the folder structure:
   ```
   public_html/
   ├── index.html
   ├── fixtures.html
   ├── squad.html
   ├── programme.html
   ├── about.html
   ├── contact.html
   ├── css/
   │   └── style.css
   └── js/
       ├── components.js
       ├── main.js
       └── squad.js
   ```
4. If you already have files there, back them up first.
5. Visit your domain — the new site is live.

### Alternative: FTP Upload

Use **FileZilla** (free):
- Host: `ftp.raynerslanefc.co.uk` (or your FTP hostname from one.com)
- Username/Password: from your one.com control panel → FTP accounts
- Upload the entire folder to `public_html/`

---

## 2. SQUAD LIST — MANAGER UPDATE SYSTEM

This is the magic bit. The manager updates a Google Sheet on their phone,
and the squad page updates automatically. Zero developer involvement.

### Step A — Create the Google Sheet (Developer does this once)

1. Go to [sheets.google.com](https://sheets.google.com) → New Sheet
2. Name it: **Rayners Lane FC — Squad 2026-27**
3. Set up Row 1 as headers EXACTLY like this:

   | Squad_No | Full_Name | Position | Apps | Goals | Cards | Bio |
   |----------|-----------|----------|------|-------|-------|-----|
   | 1 | Joe Smith | Goalkeeper | 0 | 0 | 0 | |
   | 2 | Mike Jones | Defender | 0 | 0 | 0 | |

   **Position must be one of:** `Goalkeeper`, `Defender`, `Midfielder`, `Forward`

4. Add all current players (or "TBC" rows as placeholders)

### Step B — Publish the Sheet (Developer does this once)

1. In the sheet: **File → Share → Publish to the web**
2. Select: `Entire Document` → `CSV` → click **Publish**
3. Copy the URL shown (looks like: `https://docs.google.com/spreadsheets/d/XXX/pub?output=csv`)

### Step C — Connect to the Website (Developer does this once)

1. Open `js/squad.js`
2. Find line: `const SQUAD_SHEET_URL = 'YOUR_GOOGLE_SHEET_PUBLISHED_CSV_URL_HERE';`
3. Replace the placeholder with your copied URL
4. Save and re-upload `js/squad.js` to one.com

### Manager's Weekly Routine

**Every time there's a squad change:**
1. Open the Google Sheet (bookmark it, or use Google Sheets app)
2. Update player names, positions, appearances, goals
3. **That's it.** The website updates within minutes automatically.

**To add a new signing:**
- Add a new row with their squad number, name, and position

**To remove a player:**
- Delete their row OR clear the row (leave blank)

---

## 3. PROGRAMME UPDATES — MANAGER SYSTEM

### Google Sheet for Programme Content

Create a second sheet: **Rayners Lane FC — Programme**

Headers:
| Match_Date | Opposition | Venue | Competition | Chairman_Notes | Manager_Notes | Squad_1_to_11 | Subs | Opposition_Notes |
|------------|-----------|-------|-------------|----------------|---------------|---------------|------|-----------------|

Then connect it to `programme.html` using the same CSV approach above.
(Your developer can wire this up in about 30 minutes using the same
pattern as `squad.js`.)

### Simplest Option: Google Form for Manager

Create a **Google Form** with:
- Today's date
- Opposition name
- Manager's notes (long text)
- Squad selection (11 names + subs)
- Opposition preview

Responses go to a Google Sheet → site reads it automatically.
Manager fills in the form on their phone before each match.

---

## 4. FIXTURES CALENDAR SYNC

The site already links to your existing `.ics` file on the club website.
When fixtures are confirmed:

**Option A — Keep using your existing .ics file**
- Upload an updated `rayners_lane_fixtures_full.ics` to one.com
- Anyone subscribed gets updates automatically

**Option B — Generate from Google Sheets (recommended)**
A simple Google Apps Script can auto-generate an `.ics` file from a
fixtures spreadsheet and save it to your hosting. Ask your developer.

**Option C — Use FA Full-Time feed**
The FA's Full-Time system generates an `.ics` feed for your club.
Contact your league secretary for the URL, then update `fixtures.html`.

---

## 5. MATCH ALERTS / PUSH NOTIFICATIONS

### Free Setup with OneSignal

OneSignal gives you professional web push notifications for free.

1. Sign up at [onesignal.com](https://onesignal.com) — free account
2. Create a new app → Web Push → enter `raynerslanefc.co.uk`
3. They give you an **App ID**
4. Open `js/main.js` and find the commented OneSignal section
5. Uncomment it and replace `YOUR_ONESIGNAL_APP_ID` with your ID
6. Add the OneSignal script tag to each HTML file's `<head>`:
   ```html
   <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
   ```

**Manager sending an alert:**
1. Log in to onesignal.com
2. New Push Notification → write message (e.g. "KO in 2 hours — come down!")
3. Send to All Subscribers
4. Everyone who clicked "Enable Alerts" gets it on their phone

---

## 6. SMART APP OPTIONS FOR THE MANAGER

You're already on **Pitchero** — use it to its full potential.

### Option A: Pitchero Manager App (BEST — You Already Have It)

The **Pitchero Manager App** (iOS + Android, free) lets Gary Pitt:
- Mark player availability (✓/✗ before each game)
- Select the team and fill in squad numbers
- Post match results instantly
- Send push notifications to supporters
- Add news posts after games

**Connect to this website:**
The Pitchero club page (`pitchero.com/clubs/raynerslanefc`) has embeddable
widgets for fixtures and results. You can iframe these into your site pages
to pull in live Pitchero data.

Pitchero Fixtures widget embed code (add to fixtures.html):
```html
<iframe src="https://www.pitchero.com/clubs/raynerslanefc/matches/embed"
  width="100%" height="600" frameborder="0" style="border:none"></iframe>
```

### Option B: Google Sheets (Squad / Programme — Described Above)

Simplest for content a developer isn't managing. Gary uses Google Sheets
app on his phone. One link, one bookmark, done.

### Option C: Airtable (More Powerful)

Airtable is a friendlier Google Sheets. Free tier works well.
- Create a base with Squad and Fixtures tables
- Manager uses the Airtable app (iOS/Android) to update
- Website reads from Airtable API
- Slightly more setup but very polished interface

Setup: `airtable.com` → developer creates base, manager gets app invite.

### Option D: Spond (Availability)

**Spond** (free, iOS/Android) is excellent for:
- Pre-match availability (players confirm yes/no)
- Team announcements
- Group messaging
- Event management (training, matches)

Not directly connected to the website, but saves Gary time.

---

## 7. CONTACT FORM

The contact form uses **Formspree** (free tier: 50 submissions/month).

1. Sign up at [formspree.io](https://formspree.io)
2. Create a form → copy your Form ID
3. In `contact.html`, find:
   `action="https://formspree.io/f/YOUR_FORM_ID"`
4. Replace `YOUR_FORM_ID` with your real ID
5. Submissions go to your email

Alternative: Replace the form with a mailto link or use Pitchero's
built-in contact form (`pitchero.com/clubs/raynerslanefc/contact`).

---

## 8. NEXT MATCH COUNTDOWN

The countdown on the homepage is configured in `js/main.js`:

```javascript
const NEXT_MATCH = {
  homeTeam:   'Rayners Lane FC',
  awayTeam:   'Harefield United',        // ← Update this
  date:       '2026-08-15T15:00:00',     // ← Update this (ISO format)
  competition:'CCL Premier Div North',   // ← Update this
  venue:      'Tithe Farm Social Club',
  isHome:     true,
};
```

Change these values, save, re-upload `js/main.js` to one.com. Done.

**Automation option:** Connect this to a Google Sheet too — same approach
as the squad. Developer can wire it up so the club admin updates a sheet
and the countdown changes automatically.

---

## 9. IMAGES — HOW TO ADD THEM

The site uses CSS gradients as placeholders. To add real photos:

**News card images:**
Upload photos to one.com file manager → `img/` folder
Then in `index.html`, replace the placeholder divs:
```html
<!-- Replace this: -->
<div class="news-card__img-placeholder">...</div>

<!-- With this: -->
<img src="img/your-photo.jpg" alt="Description" style="width:100%;height:100%;object-fit:cover">
```

**Player photos (squad page):**
Add a `Photo_URL` column to the squad Google Sheet.
The developer can update `squad.js` to display the photo in the card.
Players can WhatsApp photos to the club and they get uploaded to one.com.

**Club crest:**
Replace the "RL" text crest in `components.js` with:
```html
<img src="img/crest.png" alt="Rayners Lane FC" style="width:100%;height:100%;border-radius:50%;object-fit:cover">
```

---

## 10. QUICK REFERENCE — FILES TO UPDATE

| What | File | How often |
|------|------|-----------|
| Next match details | `js/main.js` — NEXT_MATCH object | Before each fixture |
| Squad list | Google Sheet (connected to `squad.js`) | When signings happen |
| News | Add to `index.html` news grid | After big news |
| Programme notes | Google Sheet (manager fills in) | Before each home game |
| Fixtures | `.ics` file on one.com OR FA Full-Time | When schedule releases |

---

## 11. ENVIRONMENT VARIABLES (Netlify → Site configuration → Environment variables)

All secrets live here — **never** in the website code. Set them in Netlify and redeploy.

| Variable | Used by | Purpose | Required? |
|----------|---------|---------|-----------|
| `SUPABASE_URL` | `list-members.js`, `check-in.js` | Your Supabase project URL (`https://xxxx.supabase.co`) so admin/scanner can read fan members + attendance server-side | **Yes** — admin Fan Club shows "Supabase not configured" without it |
| `SUPABASE_SERVICE_KEY` | `list-members.js`, `check-in.js` | The Supabase **service_role** secret (Settings → API). SECRET — gives full read access | **Yes** (same as above) |
| `ADMIN_PIN` | every PIN-gated function | Replaces the repo default `19332026` as the real gate. Set a new one and use it to log in | **Strongly recommended** |
| `GITHUB_TOKEN` | `save-data.js` | Lets admin saves commit `data/*.json` to GitHub (auto-deploy) | Yes (already set) |
| `RESEND_API_KEY` | `submission-created.js` | Fan welcome email + sponsor alert email | Optional |
| `HUBSPOT_TOKEN` | `hs-lead.js`, `list-leads.js` | HubSpot private-app token for lead/deal CRM | Phases 2–4 |

> The Supabase **anon (publishable) key** in `js/supabase-config.js` is a *public* browser key — safe to ship. It is NOT the service key. Only the service key is secret.

---

## Support

Any issues with the site, contact your developer.
For Pitchero issues: help.pitchero.com
For one.com issues: support.one.com
For OneSignal: documentation.onesignal.com

**Good luck for 2026-27. Come on the Greens. 💛💚**
