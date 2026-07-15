# Mobile Navigation — Audit + Fix Brief (for Claude Code)

Repo: `rlfc1933/raynerslanefc-website` (static HTML, no build step, vanilla JS). The nav + footer are injected by **`js/components.js`** (`buildNav`), styled in **`css/style.css`**. This is a **targeted mobile navigation fix** — do not restructure pages or desktop.

---

## PART 1 — THE AUDIT (what's actually wrong, verified in the code)

**How it works now:**
- Desktop: a sticky top bar (`.nav`) shows 12 links (Home, News, Fixtures, The Squad, Programme, Gallery, History, Membership, Fan Zone, Volunteer, The Club, Contact).
- Mobile (≤900px): `.nav__links{display:none}` **hides all 12 top links, and there is NO hamburger** (the old burger was removed and never replaced — see comment in `components.js`). A fixed bottom tab bar (`.bnav`) appears instead.

**The problems (why people get lost):**
1. **The bottom bar is a dead end.** It has 5 items — Home, News, Fixtures, Squad, and **"More"** — but **"More" just navigates to `about.html`** (`bottomLinks` in `components.js:136`). It does **not** open a menu.
2. **~11 pages are unreachable from mobile navigation:** Programme, Gallery, History, Membership, Fan Zone, Volunteer, The Club, Contact, plus Shop, Sponsorship (investment), Trials. With the top links hidden and no hamburger, a phone user has **no way to reach them** from the nav.
3. **No hamburger / no menu affordance.** The top bar on mobile is just a brand strip. Nothing signals "there's more here," so the site feels tiny and people can't find things.
4. **Breakpoint conflict:** `.nav__links{display:none}` is declared in **both** `@media(max-width:768px)` and `@media(max-width:900px)`; `.bnav` activates at ≤900. Inconsistent — unify on one breakpoint.
5. Minor: dead references to the old burger; the bottom bar's "More" is never shown as active when you're on a non-primary page.

**What's already GOOD (keep it):** the bottom bar is correctly `position:fixed; bottom:0; z-index:9999`, has a yellow top border, `env(safe-area-inset-bottom)` padding, `body{padding-bottom:72px}`, 56px tap targets, and icon+label items. The pattern is right — it's just incomplete.

## PART 2 — THE CORRECT LAYOUT (the design decision)
Keep the **fixed bottom tab bar** (it's the right mobile pattern) but make it a real hub, and give a second way in from the top:

```
 TOP BAR (sticky):   [crest] Rayners Lane FC ............ [Install] [☰ Menu]
 ...page content... (padded so nothing hides behind the bottom bar)
 BOTTOM BAR (fixed): [Home] [News] [Fixtures] [Squad] [☰ More]
                                                          └─ opens FULL MENU sheet
 FULL MENU SHEET (slides up / full-screen), grouped, links to EVERY page:
   MATCHDAY   → Fixtures · Results · Programme · The Squad · Gallery
   THE CLUB   → About/The Club · History · News · Contact
   GET INVOLVED → Membership · Fan Zone · Volunteer · Player Trials
   COMMERCIAL → Sponsorship · Club Shop
   + Install app · social links
```
Two discoverable paths to everything (top ☰ and bottom "More"), both opening the **same** menu sheet. Nobody can get stranded.

---

## PART 3 — THE PROMPT (build this)

### 1. Add a full navigation menu sheet (the core fix)
In `js/components.js` / `css/style.css`, build a **mobile menu overlay** that lists **every** page, grouped as above. It should:
- Slide up from the bottom (or full-screen), dark on-brand background (`--black`/`--dark`), yellow section labels (`--yellow`), Bebas/Barlow type, a scrim behind it, and a clear **✕ close**.
- Include **every** nav destination the desktop has, plus Shop, Sponsorship, Trials, Membership, Fan Zone, Volunteer, Contact — grouped with small uppercase headers.
- Highlight the **current page**.
- Be accessible: open/close via button, close on scrim tap, **Esc** and the Android back gesture, focus-trap while open, `aria-hidden`/`aria-expanded`, 44px+ targets, scrollable, respect `env(safe-area-inset-bottom)`.

### 2. Rewire the bottom bar "More" to OPEN the sheet (not navigate)
- Change the `More` item so it **opens the menu sheet** instead of linking to `about.html` (make it a `<button>` or `href="#"` with `onclick`). 
- Show "More" as **active** whenever the current page isn't one of Home/News/Fixtures/Squad.
- Keep the 4 primary tabs (Home, News, Fixtures, Squad) as-is — good primary destinations.

### 3. Add a matching ☰ menu button to the TOP bar on mobile
- On ≤900px, replace the vanished links with a visible **☰ Menu** button in `.nav__actions` that opens the **same** sheet. Keep the Install button. So the top bar reads: crest + name … [Install] [☰].
- Remove the dead hamburger CSS/JS remnants; build this cleanly.

### 4. Tidy the breakpoints & spacing
- Unify the mobile breakpoint (use **≤900px** consistently); remove the duplicate `.nav__links{display:none}` conflict between the 768 and 900 queries.
- Verify `body`/content has enough `padding-bottom` (bar height + safe-area) so **no content or footer hides behind the fixed bar**, on every page (check the longest pages and the footer).
- Ensure the bottom bar and the sheet sit above everything except modals (z-index sane), and don't collide with the WhatsApp float button (`position:fixed;right:16px;bottom:16px` — nudge it up above the bar on mobile so they don't overlap).

## Hard rules
- **Vanilla JS + CSS only, no build step, no framework.** It's injected by `components.js` on every page — the fix must work site-wide from that one place.
- **Brand lock:** `--yellow #FFD100`, `--black`, Bebas/Barlow, crest `img/badge.png`. Match the existing look.
- Don't change desktop nav behaviour or any page content. Atomic commits. No secrets.

## Acceptance criteria
1. On a phone, **every page is reachable** from the nav — via the bottom "More" sheet and the top ☰, both opening the same full menu.
2. Tapping **"More" opens a menu**, it does **not** jump to the About page.
3. The menu lists all pages grouped, highlights the current one, closes on ✕/scrim/Esc/back, traps focus, and is thumb-reachable with 44px+ targets.
4. No content or footer is hidden behind the fixed bar on any page; the WhatsApp button doesn't overlap the bar.
5. One consistent mobile breakpoint; dead burger code removed; desktop unchanged.
6. It looks and feels like The Lane — dark, yellow accents, Bebas headers.
